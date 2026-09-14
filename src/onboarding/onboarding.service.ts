import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

// Matches the employee_names migration backfill: the last word is the family name.
function splitFullName(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  return words.length < 2
    ? { firstName: words[0] ?? '', lastName: '' }
    : {
        firstName: words.slice(0, -1).join(' '),
        lastName: words[words.length - 1],
      };
}

export interface CompanyInfoInput {
  companyName: string;
  industry: string;
  companySize: string;
  currency?: string;
  payrollFrequency?: string;
  taxId?: string;
  logo?: string;
  logoDataUrl?: string;
}

export interface EmployeeInput {
  id?: string;
  managerName?: string;
  managerEmail?: string;
  fullName: string;
  email: string;
  department: string;
  jobTitle: string;
  employmentType: string;
  salary: number;
  startDate: string;
  managerId?: string;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async updateCompanyInfo(
    user: AuthenticatedUser,
    input: CompanyInfoInput,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const organizationId = this.requireOrganization(user);
    const companyName = this.requiredString(input.companyName, 'companyName');
    const industry = this.requiredString(input.industry, 'industry');
    const companySize = this.requiredString(input.companySize, 'companySize');
    const currency = this.validateChoice(
      input.currency ?? 'NGN',
      ['NGN', 'USD', 'GHS', 'KES', 'ZAR', 'GBP', 'EUR'],
      'currency',
    );
    const payrollFrequency = this.validateChoice(
      (input.payrollFrequency ?? 'MONTHLY')
        .trim()
        .toUpperCase()
        .replace(/[\s_-]+/g, ''),
      ['MONTHLY', 'BIWEEKLY', 'WEEKLY'],
      'payrollFrequency',
    );

    const organization = await db.organization.update({
      where: { id: organizationId },
      data: {
        name: companyName,
        industry,
        companySize,
        currency,
        payrollFrequency,
        taxId: this.optionalString(input.taxId),
        logo: this.normalizeLogo(input),
      },
    });

    return {
      organization,
      onboarding: await this.getStatus(user, db),
    };
  }

  async addEmployee(user: AuthenticatedUser, input: EmployeeInput) {
    return this.prisma.$transaction(async (db) => {
      const employees = await this.createEmployees(user, [input], db);
      return {
        employee: employees[0],
        onboarding: await this.getStatus(user, db),
      };
    });
  }

  async complete(
    user: AuthenticatedUser,
    companyInfo: CompanyInfoInput,
    employees: EmployeeInput[],
  ) {
    this.requireOrganization(user);
    if (!employees.length || employees.length > 1000) {
      throw new BadRequestException(
        'employees must contain between 1 and 1000 rows',
      );
    }
    return this.prisma.$transaction(
      async (db) => {
        const { organization } = await this.updateCompanyInfo(
          user,
          companyInfo,
          db,
        );
        const created = await this.createEmployees(user, employees, db);
        return {
          organization,
          employees: created,
          onboarding: await this.getStatus(user, db),
        };
      },
      { timeout: 30000 },
    );
  }

  async getStatus(
    user: AuthenticatedUser,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const organizationId = this.requireOrganization(user);
    const [organization, employeeCount] = await Promise.all([
      db.organization.findUnique({ where: { id: organizationId } }),
      db.employee.count({ where: { organizationId } }),
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
    const rows = this.parseCsv(csv).map((row) => ({
      fullName: row.fullName,
      email: row.email,
      department: row.department,
      jobTitle: row.jobTitle,
      employmentType: row.employmentType,
      salary: Number(row.salary),
      startDate: row.startDate,
      managerEmail: row.managerEmail,
      managerName: row.managerName,
    }));
    return this.prisma.$transaction(
      async (db) => ({
        employees: await this.createEmployees(user, rows, db),
        onboarding: await this.getStatus(user, db),
      }),
      { timeout: 30000 },
    );
  }

  private async createEmployees(
    user: AuthenticatedUser,
    inputs: EmployeeInput[],
    db: Prisma.TransactionClient,
  ) {
    const organizationId = this.requireOrganization(user);
    if (!inputs.length || inputs.length > 1000)
      throw new BadRequestException(
        'employees must contain between 1 and 1000 rows',
      );
    const rows = inputs.map((input) => ({
      ...this.normalizeEmployeeInput(input),
      localId: this.optionalString(input.id),
      managerName: this.optionalString(input.managerName),
      managerEmail: this.optionalString(input.managerEmail)?.toLowerCase(),
    }));
    const emails = rows.map((row) => row.email);
    const localIds = rows.flatMap((row) => (row.localId ? [row.localId] : []));
    if (new Set(emails).size !== emails.length)
      throw new ConflictException('Duplicate employee emails');
    if (new Set(localIds).size !== localIds.length)
      throw new BadRequestException('Duplicate employee draft IDs');
    const existing = await db.employee.findMany({
      where: { organizationId },
      select: { id: true, email: true, fullName: true, managerId: true },
    });
    if (existing.some((employee) => emails.includes(employee.email)))
      throw new ConflictException('An employee with this email already exists');
    if (existing.some((employee) => localIds.includes(employee.id)))
      throw new BadRequestException(
        'Draft IDs must not collide with existing employee IDs',
      );

    // Postgres assigns IDs on insert, so drafts are keyed by their email (unique
    // within the submission) until then; existing employees by persisted ID.
    const draftKey = (email: string) => `draft:${email}`;
    const candidates = [
      ...existing.map((employee) => ({
        key: employee.id,
        email: employee.email,
        fullName: employee.fullName,
      })),
      ...rows.map((row) => ({
        key: draftKey(row.email),
        email: row.email,
        fullName: row.fullName,
      })),
    ];
    const byLocalId = new Map(
      rows
        .filter((row) => row.localId)
        .map((row) => [row.localId!, draftKey(row.email)]),
    );
    const managers = new Map<string, string | null>(
      existing.map((employee) => [employee.id, employee.managerId]),
    );
    const managerKeys = rows.map((row) => {
      const key = draftKey(row.email);
      let managerKey: string | undefined;
      if (row.managerId) {
        managerKey =
          byLocalId.get(row.managerId) ??
          existing.find((employee) => employee.id === row.managerId)?.id;
        if (!managerKey)
          throw new BadRequestException(
            'managerId must identify an employee in this organization or submission',
          );
      } else if (row.managerEmail) {
        managerKey = candidates.find(
          (candidate) => candidate.email === row.managerEmail,
        )?.key;
        if (!managerKey)
          throw new BadRequestException(
            `Unknown managerEmail: ${row.managerEmail}`,
          );
      } else if (row.managerName) {
        const matches = candidates.filter(
          (candidate) =>
            candidate.fullName.toLowerCase() === row.managerName!.toLowerCase(),
        );
        if (matches.length !== 1)
          throw new BadRequestException(
            `managerName must match exactly one employee: ${row.managerName}`,
          );
        managerKey = matches[0].key;
      }
      if (managerKey === key)
        throw new BadRequestException(
          'An employee cannot be their own manager',
        );
      managers.set(key, managerKey ?? null);
      return managerKey;
    });
    for (const row of rows) {
      const visited = new Set<string>();
      let current: string | null | undefined = draftKey(row.email);
      while (current) {
        if (visited.has(current))
          throw new BadRequestException(
            'Employee manager relationships must not contain a cycle',
          );
        visited.add(current);
        current = managers.get(current);
      }
    }

    // Insert every draft before linking managers, including managers later in the list.
    let created: Array<{ id: string; email: string }>;
    try {
      created = await db.employee.createManyAndReturn({
        data: rows.map((row) => ({
          organizationId,
          ...splitFullName(row.fullName),
          fullName: row.fullName,
          email: row.email,
          department: row.department,
          jobTitle: row.jobTitle,
          employmentType: row.employmentType,
          // Onboarding collects a monthly amount in major units.
          annualSalaryMinor: BigInt(row.salary) * 1200n,
          startDate: row.startDate,
        })),
        select: { id: true, email: true },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An employee with this email already exists',
        );
      }
      throw error;
    }
    const idByKey = new Map(
      created.map((employee) => [draftKey(employee.email), employee.id]),
    );
    const persistedId = (key: string) => idByKey.get(key) ?? key;
    for (const [index, row] of rows.entries()) {
      const managerKey = managerKeys[index];
      if (managerKey)
        await db.employee.update({
          where: { id: persistedId(draftKey(row.email)) },
          data: { managerId: persistedId(managerKey) },
        });
    }
    const employees = await db.employee.findMany({
      where: {
        organizationId,
        id: { in: created.map((employee) => employee.id) },
      },
      orderBy: { createdAt: 'asc' },
    });
    // BigInt is not JSON-serializable; match the people API's salary contract.
    return employees.map((employee) => ({
      ...employee,
      salary: Math.trunc(Number(employee.annualSalaryMinor) / 1200),
      annualSalaryMinor: Number(employee.annualSalaryMinor),
    }));
  }

  private normalizeLogo(input: CompanyInfoInput): string | undefined {
    const dataUrl = this.optionalString(input.logoDataUrl);
    if (!dataUrl) return this.optionalString(input.logo);
    const match =
      /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        dataUrl,
      );
    if (
      !match ||
      Buffer.from(match[1], 'base64').toString('base64') !== match[1]
    ) {
      throw new BadRequestException(
        'logoDataUrl must be a base64 image data URL',
      );
    }
    if (Buffer.byteLength(match[1], 'base64') > 2 * 1024 * 1024)
      throw new BadRequestException('Company logo must be at most 2 MiB');
    return dataUrl;
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
      throw new ForbiddenException(
        'A business administrator session is required',
      );
    }
    return user.organizationId;
  }

  private normalizeEmployeeInput(input: EmployeeInput) {
    const salary = Number(input.salary);
    if (!Number.isSafeInteger(salary) || salary <= 0 || salary > 2147483647) {
      throw new BadRequestException(
        'salary must be a positive whole number no greater than 2147483647',
      );
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
      employmentType: this.validateChoice(
        this.requiredString(input.employmentType, 'employmentType')
          .toUpperCase()
          .replace(/[\s-]+/g, '_'),
        ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'],
        'employmentType',
      ),
      salary,
      startDate: parsedStartDate,
      managerId: this.optionalString(input.managerId),
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
      manager: 'managerName',
      managername: 'managerName',
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
