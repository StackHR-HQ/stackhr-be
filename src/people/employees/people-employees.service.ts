import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import {
  avatarInitials,
  formatFileSize,
  toDateOnly,
  toEmploymentStatus,
  toEmploymentType,
  toPayFrequency,
} from '../common/people-mappers';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

export interface EmployeeSummary {
  id: string;
  fullName: string;
  email: string;
  avatarInitials: string;
  jobTitle: string;
  departmentId: string;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  startDate: string;
}

export interface PaginatedEmployeeDirectory {
  items: EmployeeSummary[];
  page: number;
  pageSize: number;
  total: number;
}

interface EmployeeDirectoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  employmentStatus?: string;
  paginated: boolean;
}

const EMPLOYMENT_STATUSES = new Set([
  'active',
  'pending_invitation',
  'onboarding',
  'offboarding',
]);

@Injectable()
export class PeopleEmployeesService {
  constructor(private readonly tenant: TenantPrismaService) {}

  listEmployees(
    user: AuthenticatedUser,
    rawQuery: Record<string, unknown> = {},
  ): Promise<EmployeeSummary[] | PaginatedEmployeeDirectory> {
    const organizationId = requirePeopleOrganization(user);
    const query = this.parseDirectoryQuery(rawQuery);
    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      ...(query.employmentStatus
        ? { status: query.employmentStatus.toUpperCase() }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.tenant.run(organizationId, async (client) => {
      const employeeQuery: Prisma.EmployeeFindManyArgs = {
        where,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      };

      if (!query.paginated) {
        const employees = await client.employee.findMany(employeeQuery);
        return employees.map((employee) => toEmployeeSummary(employee));
      }

      const [employees, total] = await Promise.all([
        client.employee.findMany({
          ...employeeQuery,
          skip: (query.page! - 1) * query.pageSize!,
          take: query.pageSize!,
        }),
        client.employee.count({ where }),
      ]);
      return {
        items: employees.map((employee) => toEmployeeSummary(employee)),
        page: query.page!,
        pageSize: query.pageSize!,
        total,
      };
    });
  }

  private parseDirectoryQuery(
    rawQuery: Record<string, unknown>,
  ): EmployeeDirectoryQuery {
    const queryKeys = ['page', 'pageSize', 'search', 'employmentStatus'];
    const paginated = queryKeys.some((key) => rawQuery[key] !== undefined);
    if (!paginated) return { paginated: false };

    const page = this.parsePositiveInteger(rawQuery.page ?? '1', 'page', 1);
    const pageSize = this.parsePositiveInteger(
      rawQuery.pageSize ?? '25',
      'pageSize',
      100,
    );
    const search = this.parseOptionalString(rawQuery.search, 'search', 200);
    const employmentStatus = this.parseOptionalString(
      rawQuery.employmentStatus,
      'employmentStatus',
      32,
    )?.toLowerCase();

    if (employmentStatus && !EMPLOYMENT_STATUSES.has(employmentStatus)) {
      throw new BadRequestException(
        'employmentStatus must be one of: active, pending_invitation, onboarding, offboarding',
      );
    }

    return { page, pageSize, search, employmentStatus, paginated: true };
  }

  private parsePositiveInteger(
    value: unknown,
    field: string,
    maximum: number,
  ): number {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException(
        `${field} must be between 1 and ${maximum}`,
      );
    }
    return parsed;
  }

  private parseOptionalString(
    value: unknown,
    field: string,
    maximumLength: number,
  ): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string`);
    }
    const normalized = value.trim();
    if (normalized.length > maximumLength) {
      throw new BadRequestException(
        `${field} must be at most ${maximumLength} characters`,
      );
    }
    return normalized || undefined;
  }

  getEmployee(user: AuthenticatedUser, employeeId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const employee = await client.employee.findFirst({
        where: { id: employeeId, organizationId },
      });
      if (!employee) {
        throw new NotFoundException('Employee was not found');
      }

      const scope = { organizationId, employeeId };
      const [
        organization,
        leaveTypes,
        balances,
        requests,
        documents,
        activity,
      ] = await Promise.all([
        client.organization.findUnique({ where: { id: organizationId } }),
        client.leaveType.findMany({
          where: { organizationId },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
        }),
        client.leaveBalance.findMany({
          where: { ...scope, year: new Date().getUTCFullYear() },
        }),
        client.leaveRequest.findMany({
          where: scope,
          orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        }),
        client.document.findMany({
          where: { ...scope, scope: 'EMPLOYEE' },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        client.auditEvent.findMany({
          where: scope,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
      ]);

      const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));
      const typeOrder = new Map(
        leaveTypes.map((type, index) => [type.id, index]),
      );

      return {
        ...toEmployeeSummary(employee),
        workLocation: employee.workLocation,
        personalInfo: {
          dateOfBirth: employee.dateOfBirth
            ? toDateOnly(employee.dateOfBirth)
            : '',
          gender: employee.gender ?? '',
          maritalStatus: employee.maritalStatus ?? '',
          nationality: employee.nationality ?? '',
          phone: employee.phone ?? '',
          address: employee.address ?? '',
          emergencyContactName: employee.emergencyContactName ?? '',
          emergencyContactPhone: employee.emergencyContactPhone ?? '',
          emergencyContactRelationship:
            employee.emergencyContactRelationship ?? '',
        },
        compensation: {
          salary: employee.salaryAmount,
          currency: organization?.currency ?? '',
          payFrequency: toPayFrequency(organization?.payrollFrequency ?? ''),
          bankName: employee.bankName ?? '',
          bankAccountLast4: employee.bankAccountLast4 ?? '',
        },
        leaveBalance: balances
          .sort(
            (a, b) =>
              (typeOrder.get(a.leaveTypeId) ?? 0) -
              (typeOrder.get(b.leaveTypeId) ?? 0),
          )
          .map((balance) => ({
            type: typeNames.get(balance.leaveTypeId) ?? '',
            totalDays: balance.totalDays,
            usedDays: balance.usedDays,
          })),
        leaveRequests: requests.map((request) => ({
          id: request.id,
          type: typeNames.get(request.leaveTypeId) ?? '',
          startDate: toDateOnly(request.startDate),
          endDate: toDateOnly(request.endDate),
          days: request.days,
          status: request.status.toLowerCase(),
        })),
        documents: documents.map((document) => ({
          id: document.id,
          name: document.name,
          category: document.category,
          uploadedAt: toDateOnly(document.createdAt),
          fileSize: formatFileSize(document.sizeBytes),
        })),
        // Payroll and Spend own these records; they have no persisted models yet.
        payslips: [],
        expenses: [],
        salaryAdvances: [],
        activity: activity.map((event) => ({
          id: event.id,
          description: event.description,
          timestamp: event.createdAt.toISOString(),
        })),
      };
    });
  }
}

export function toEmployeeSummary(employee: {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string;
  departmentId: string | null;
  managerId: string | null;
  employmentType: string;
  status: string;
  startDate: Date;
}): EmployeeSummary {
  return {
    id: employee.id,
    fullName: employee.fullName,
    email: employee.email,
    avatarInitials: avatarInitials(employee.fullName),
    jobTitle: employee.jobTitle,
    departmentId: employee.departmentId ?? '',
    managerId: employee.managerId,
    employmentType: toEmploymentType(employee.employmentType),
    employmentStatus: toEmploymentStatus(employee.status),
    startDate: toDateOnly(employee.startDate),
  };
}
