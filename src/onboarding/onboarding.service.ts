import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

interface CompanyInfoInput {
  companyName: string;
  industry: string;
  companySize: string;
  currency?: string;
  payrollFrequency?: string;
  taxId?: string;
  logo?: string;
}

interface EmployeeInput {
  fullName: string;
  email: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  salary: number;
  startDate: string;
  managerId?: string;
}

interface CsvEmployeeInput extends Omit<EmployeeInput, 'managerId'> {
  managerEmail?: string;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCompanyInfo(user: AuthenticatedUser, input: CompanyInfoInput) {
    const organizationId = this.requireOrganization(user);
    const companyName = this.requiredString(input.companyName, 'companyName');
    const industry = this.requiredString(input.industry, 'industry');
    const companySize = this.requiredString(input.companySize, 'companySize');
    const currency = this.validateChoice(
      input.currency ?? 'NGN',
      ['NGN', 'USD', 'GBP', 'EUR'],
      'currency',
    );
    const payrollFrequency = this.validateChoice(
      input.payrollFrequency ?? 'MONTHLY',
      ['MONTHLY', 'BIWEEKLY', 'WEEKLY'],
      'payrollFrequency',
    );

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: companyName,
        industry,
        companySize,
        currency,
        payrollFrequency,
        taxId: this.optionalString(input.taxId),
        logo: this.optionalString(input.logo),
      },
    });

    return {
      organization,
      onboarding: await this.getStatus(user),
    };
  }

  async addEmployee(user: AuthenticatedUser, input: EmployeeInput) {
    const organizationId = this.requireOrganization(user);
    const employee = this.normalizeEmployeeInput(input);

    if (employee.managerId) {
      const manager = await this.prisma.employee.findFirst({
        where: { id: employee.managerId, organizationId },
      });
      if (!manager) {
        throw new BadRequestException(
          'managerId must belong to this organization',
        );
      }
    }

    const existing = await this.prisma.employee.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email: employee.email,
        },
      },
    });
    if (existing) {
      throw new ConflictException('An employee with this email already exists');
    }

    const created = await this.prisma.employee.create({
      data: {
        id: randomUUID(),
        organizationId,
        fullName: employee.fullName,
        email: employee.email,
        department: employee.department,
        jobTitle: employee.jobTitle,
        employmentType: employee.employmentType,
        salaryAmount: employee.salary,
        startDate: employee.startDate,
        managerId: employee.managerId,
      },
    });

    return {
      employee: created,
      onboarding: await this.getStatus(user),
    };
  }

  async getStatus(user: AuthenticatedUser) {
    const organizationId = this.requireOrganization(user);
    const [organization, employeeCount] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.employee.count({ where: { organizationId } }),
    ]);

    if (!organization) {
      throw new NotFoundException('Organization was not found');
    }

    const companyInfoComplete = Boolean(
      organization.industry && organization.companySize,
    );

    return {
      organizationId,
      companyInfoComplete,
      employeeCount,
      employeesComplete: employeeCount > 0,
      complete: companyInfoComplete && employeeCount > 0,
      nextStep: !companyInfoComplete
        ? 'COMPANY_INFO'
        : employeeCount === 0
          ? 'FIRST_EMPLOYEE'
          : 'DASHBOARD',
    };
  }

  async importEmployees(user: AuthenticatedUser, csv: string) {
    const organizationId = this.requireOrganization(user);
    const rows = this.parseCsv(csv);
    if (!rows.length) {
      throw new BadRequestException(
        'csv must contain at least one employee row',
      );
    }

    const normalizedRows = rows.map((row) =>
      this.normalizeCsvEmployee({
        fullName: row.fullName,
        email: row.email,
        department: row.department,
        jobTitle: row.jobTitle,
        employmentType: row.employmentType,
        salary: Number(row.salary),
        startDate: row.startDate,
        managerEmail: row.managerEmail,
      }),
    );
    const emails = normalizedRows.map((row) => row.email);
    if (new Set(emails).size !== emails.length) {
      throw new ConflictException('CSV contains duplicate employee emails');
    }

    const existingEmployees = await this.prisma.employee.findMany({
      where: { organizationId, email: { in: emails } },
      select: { email: true },
    });
    if (existingEmployees.length) {
      throw new ConflictException(
        `Employees already exist: ${existingEmployees.map((employee) => employee.email).join(', ')}`,
      );
    }

    const createdEmployees = await this.prisma.$transaction(
      async (transaction) => {
        const createdIds: string[] = [];
        for (const row of normalizedRows) {
          const created = await transaction.employee.create({
            data: {
              id: randomUUID(),
              organizationId,
              fullName: row.fullName,
              email: row.email,
              department: row.department,
              jobTitle: row.jobTitle,
              employmentType: row.employmentType,
              salaryAmount: row.salary,
              startDate: row.startDate,
            },
          });
          createdIds.push(created.id);
        }

        const allEmployees = await transaction.employee.findMany({
          where: { organizationId },
          select: { id: true, email: true },
        });
        const employeeByEmail = new Map(
          allEmployees.map((employee) => [employee.email, employee.id]),
        );

        for (const [index, row] of normalizedRows.entries()) {
          if (row.managerEmail) {
            const managerId = employeeByEmail.get(row.managerEmail);
            if (!managerId) {
              throw new BadRequestException(
                `managerEmail does not match an employee: ${row.managerEmail}`,
              );
            }
            if (managerId === createdIds[index]) {
              throw new BadRequestException(
                'An employee cannot be their own manager',
              );
            }
            await transaction.employee.update({
              where: { id: createdIds[index] },
              data: { managerId },
            });
          }
        }

        return createdIds;
      },
    );

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: createdEmployees } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      employees,
      onboarding: await this.getStatus(user),
    };
  }

  private requireOrganization(user: AuthenticatedUser): string {
    const allowedRoles: string[] = [
      USER_ROLES.BUSINESS_OWNER,
      USER_ROLES.BUSINESS_ADMIN,
      USER_ROLES.HR_ADMIN,
    ];
    if (
      user.userType !== 'BUSINESS' ||
      !user.organizationId ||
      !allowedRoles.includes(user.role)
    ) {
      throw new BadRequestException(
        'A business administrator session is required',
      );
    }
    return user.organizationId;
  }

  private normalizeEmployeeInput(input: EmployeeInput) {
    const salary = Number(input.salary);
    if (!Number.isSafeInteger(salary) || salary <= 0) {
      throw new BadRequestException('salary must be a positive whole number');
    }

    const parsedStartDate = new Date(input.startDate);
    if (!input.startDate || Number.isNaN(parsedStartDate.getTime())) {
      throw new BadRequestException('startDate must be a valid date');
    }

    const email = this.requiredString(input.email, 'email').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new BadRequestException('A valid employee email is required');
    }

    return {
      fullName: this.requiredString(input.fullName, 'fullName'),
      email,
      department: this.requiredString(input.department, 'department'),
      jobTitle: this.requiredString(input.jobTitle, 'jobTitle'),
      employmentType: this.requiredString(
        input.employmentType,
        'employmentType',
      ),
      salary,
      startDate: parsedStartDate,
      managerId: this.optionalString(input.managerId),
    };
  }

  private normalizeCsvEmployee(input: CsvEmployeeInput) {
    const normalized = this.normalizeEmployeeInput(input);
    return {
      ...normalized,
      managerEmail: this.optionalString(input.managerEmail)?.toLowerCase(),
    };
  }

  private parseCsv(csv: string): Array<Record<string, string>> {
    if (!csv.trim()) {
      throw new BadRequestException('csv is required');
    }

    const lines = csv
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (lines.length < 2) {
      throw new BadRequestException(
        'csv must include a header and at least one row',
      );
    }

    const headers = this.parseCsvLine(lines[0]).map((header) =>
      this.canonicalCsvHeader(header),
    );
    const requiredHeaders = [
      'fullName',
      'email',
      'department',
      'jobTitle',
      'employmentType',
      'salary',
      'startDate',
    ];
    for (const header of requiredHeaders) {
      if (!headers.includes(header)) {
        throw new BadRequestException(`csv is missing the ${header} column`);
      }
    }

    return lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      return Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? '']),
      );
    });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let value = '';
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const nextCharacter = line[index + 1];
      if (character === '"' && insideQuotes && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = !insideQuotes;
      } else if (character === ',' && !insideQuotes) {
        values.push(value.trim());
        value = '';
      } else {
        value += character;
      }
    }
    values.push(value.trim());
    return values;
  }

  private canonicalCsvHeader(header: string): string {
    const normalized = header
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    const aliases: Record<string, string> = {
      fullname: 'fullName',
      email: 'email',
      department: 'department',
      jobtitle: 'jobTitle',
      employmenttype: 'employmentType',
      salary: 'salary',
      salaryamount: 'salary',
      startdate: 'startDate',
      manageremail: 'managerEmail',
    };
    return aliases[normalized] ?? header.trim();
  }

  private validateChoice(
    value: string,
    choices: string[],
    field: string,
  ): string {
    if (!choices.includes(value)) {
      throw new BadRequestException(
        `${field} must be one of: ${choices.join(', ')}`,
      );
    }
    return value;
  }

  private requiredString(value: string, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private optionalString(value?: string): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
