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
        throw new BadRequestException('managerId must belong to this organization');
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

  private requireOrganization(user: AuthenticatedUser): string {
    if (
      user.userType !== 'BUSINESS' ||
      !user.organizationId ||
      ![
        USER_ROLES.BUSINESS_OWNER,
        USER_ROLES.BUSINESS_ADMIN,
        USER_ROLES.HR_ADMIN,
      ].includes(user.role)
    ) {
      throw new BadRequestException('A business administrator session is required');
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
      employmentType: this.requiredString(input.employmentType, 'employmentType'),
      salary,
      startDate: parsedStartDate,
      managerId: this.optionalString(input.managerId),
    };
  }

  private validateChoice(value: string, choices: string[], field: string): string {
    if (!choices.includes(value)) {
      throw new BadRequestException(`${field} must be one of: ${choices.join(', ')}`);
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
