import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { EmailService } from '../../notifications/email.service';
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
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { UpdateEmployeeDto } from './dto/update-employee.dto';
import {
  createInvitationToken,
  INVITATION_TTL_MS,
  invitationEmail,
  invitationLink,
} from './employee-invitations';

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
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly emailService: EmailService,
  ) {}

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

  createEmployee(user: AuthenticatedUser, input: CreateEmployeeDto) {
    const organizationId = requirePeopleOrganization(user);
    const { personal, employment, compensation } = input;

    return this.tenant
      .run(organizationId, async (client) => {
        if (employment.departmentId) {
          const department = await client.department.findFirst({
            where: { id: employment.departmentId, organizationId },
          });
          if (!department) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_ERROR',
              message: 'Department was not found in this organization',
              fields: { departmentId: 'Unknown department' },
            });
          }
        }

        if (employment.managerId) {
          const manager = await client.employee.findFirst({
            where: { id: employment.managerId, organizationId },
          });
          if (!manager) {
            throw new UnprocessableEntityException({
              code: 'VALIDATION_ERROR',
              message: 'Manager was not found in this organization',
              fields: { managerId: 'Unknown manager' },
            });
          }
        }

        const employee = await client.employee.create({
          data: {
            organizationId,
            firstName: personal.firstName,
            lastName: personal.lastName,
            fullName: `${personal.firstName} ${personal.lastName}`,
            email: personal.workEmail.toLowerCase(),
            phone: personal.phone ?? null,
            // The department sync trigger fills the name from departmentId.
            department: '',
            departmentId: employment.departmentId ?? null,
            managerId: employment.managerId ?? null,
            jobTitle: employment.jobTitle,
            employmentType: employment.employmentType,
            startDate: new Date(`${employment.startDate}T00:00:00.000Z`),
            workLocation: employment.workLocation ?? '',
            annualSalaryMinor: BigInt(compensation.annualSalaryMinor),
            currency: compensation.currency,
            payFrequency: compensation.payFrequency,
            status: 'PENDING_INVITATION',
          },
        });

        // The hire's starting salary is the first compensation history entry.
        await client.compensationHistory.create({
          data: {
            organizationId,
            employeeId: employee.id,
            annualSalaryMinor: employee.annualSalaryMinor,
            currency: employee.currency,
            payFrequency: employee.payFrequency,
            effectiveDate: employee.startDate,
            changedByUserId: user.id,
          },
        });

        // Field names only: compensation and contact values stay out of audit history.
        await client.auditEvent.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'employee.created',
            targetType: 'employee',
            targetId: employee.id,
            employeeId: employee.id,
            description: `${employee.fullName} was added as ${employee.jobTitle}`,
            changes: {
              changedFields: ['personal', 'employment', 'compensation'],
            },
            createdAt: new Date(),
          },
        });

        if (!input.sendInvitation) {
          return { summary: toEmployeeSummary(employee), invitation: null };
        }

        const { token, tokenHash } = createInvitationToken();
        const invitation = await client.invitation.create({
          data: {
            organizationId,
            employeeId: employee.id,
            email: employee.email,
            role: 'EMPLOYEE',
            status: 'pending',
            tokenHash,
            inviterId: user.id,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
        });
        return {
          summary: toEmployeeSummary(employee),
          invitation: { id: invitation.id, token, tokenHash },
        };
      })
      .then(async ({ summary, invitation }) => {
        if (!invitation) return summary;
        const status = await this.deliverInvitation(
          organizationId,
          summary,
          invitation,
        );
        return { ...summary, invitation: { status } };
      });
  }

  // Runs after the employee transaction commits, so a slow or failing email
  // provider neither holds the transaction open nor rolls back the new record.
  private async deliverInvitation(
    organizationId: string,
    employee: EmployeeSummary,
    invitation: { id: string; token: string; tokenHash: string },
  ): Promise<'SENT' | 'FAILED'> {
    try {
      await this.emailService.send({
        to: employee.email,
        ...invitationEmail(employee.fullName, invitationLink(invitation.token)),
        // Keyed per token: retries of one send dedupe, a resend with a new token does not.
        idempotencyKey: `employee-invitation:${invitation.id}:${invitation.tokenHash.slice(0, 16)}`,
      });
    } catch {
      return 'FAILED';
    }

    await this.tenant.run(organizationId, (client) =>
      client.invitation.update({
        where: { id: invitation.id },
        data: { sendCount: { increment: 1 }, lastSentAt: new Date() },
      }),
    );
    return 'SENT';
  }

  updateEmployee(
    user: AuthenticatedUser,
    employeeId: string,
    input: UpdateEmployeeDto,
  ) {
    const organizationId = requirePeopleOrganization(user);
    const { employment } = input;

    return this.tenant.run(organizationId, async (client) => {
      const existing = await client.employee.findFirst({
        where: { id: employeeId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Employee was not found');
      }

      if (employment?.managerId) {
        const invalidManager = (message: string) =>
          new UnprocessableEntityException({
            code: 'VALIDATION_ERROR',
            message,
            fields: { 'employment.managerId': message },
          });
        if (employment.managerId === employeeId) {
          throw invalidManager('An employee cannot be their own manager');
        }
        // Walk up from the proposed manager; reaching this employee means a cycle.
        const visited = new Set<string>();
        let currentId: string | null = employment.managerId;
        while (currentId && !visited.has(currentId)) {
          if (currentId === employeeId) {
            throw invalidManager(
              'This manager change would create a reporting cycle',
            );
          }
          visited.add(currentId);
          const current: { id: string; managerId: string | null } | null =
            await client.employee.findFirst({
              where: { id: currentId, organizationId },
              select: { id: true, managerId: true },
            });
          if (!current && currentId === employment.managerId) {
            throw invalidManager('Manager was not found in this organization');
          }
          currentId = current?.managerId ?? null;
        }
      }

      const { personal } = input;
      const firstName = personal?.firstName ?? existing.firstName;
      const lastName = personal?.lastName ?? existing.lastName;
      const contact = personal?.emergencyContact;

      const employee = await client.employee.update({
        where: { id: employeeId },
        data: {
          ...(personal
            ? {
                firstName,
                lastName,
                fullName: `${firstName} ${lastName}`.trim(),
              }
            : {}),
          ...(personal?.phone !== undefined ? { phone: personal.phone } : {}),
          ...(personal?.dateOfBirth !== undefined
            ? {
                dateOfBirth: new Date(`${personal.dateOfBirth}T00:00:00.000Z`),
              }
            : {}),
          ...(personal?.gender !== undefined
            ? { gender: personal.gender }
            : {}),
          ...(personal?.maritalStatus !== undefined
            ? { maritalStatus: personal.maritalStatus }
            : {}),
          ...(personal?.nationality !== undefined
            ? { nationality: personal.nationality }
            : {}),
          ...(personal?.address !== undefined
            ? { address: personal.address }
            : {}),
          ...(contact
            ? {
                emergencyContactName: contact.name,
                emergencyContactRelationship: contact.relationship,
                emergencyContactPhone: contact.phone,
              }
            : {}),
          ...(input.payment
            ? {
                bankName: input.payment.bankName,
                bankAccountLast4: input.payment.accountLast4,
              }
            : {}),
          ...(employment?.jobTitle !== undefined
            ? { jobTitle: employment.jobTitle }
            : {}),
          ...(employment?.workLocation !== undefined
            ? { workLocation: employment.workLocation }
            : {}),
          ...(employment?.managerId !== undefined
            ? { managerId: employment.managerId }
            : {}),
          ...(input.compensation
            ? {
                annualSalaryMinor: BigInt(input.compensation.annualSalaryMinor),
                currency: input.compensation.currency,
                payFrequency: input.compensation.payFrequency,
              }
            : {}),
        },
      });

      if (input.compensation) {
        await client.compensationHistory.create({
          data: {
            organizationId,
            employeeId,
            annualSalaryMinor: BigInt(input.compensation.annualSalaryMinor),
            currency: input.compensation.currency,
            payFrequency: input.compensation.payFrequency,
            effectiveDate: new Date(
              `${input.compensation.effectiveDate}T00:00:00.000Z`,
            ),
            changedByUserId: user.id,
          },
        });
      }

      const changedSections = (
        ['personal', 'employment', 'compensation', 'payment'] as const
      ).filter((section) => input[section] !== undefined);
      if (changedSections.length) {
        // Section and field names only: salary and personal values stay out of history.
        await client.auditEvent.create({
          data: {
            organizationId,
            actorUserId: user.id,
            action: 'employee.updated',
            targetType: 'employee',
            targetId: employeeId,
            employeeId,
            description: `${employee.fullName}: ${changedSections.join(' and ')} updated`,
            changes: {
              changedFields: changedSections.flatMap((section) =>
                Object.keys(input[section] ?? {}).map(
                  (field) => `${section}.${field}`,
                ),
              ),
            },
            createdAt: new Date(),
          },
        });
      }

      return toEmployeeSummary(employee);
    });
  }

  resendInvitation(user: AuthenticatedUser, employeeId: string) {
    const organizationId = requirePeopleOrganization(user);

    return this.tenant
      .run(organizationId, async (client) => {
        const employee = await client.employee.findFirst({
          where: { id: employeeId, organizationId },
        });
        if (!employee) {
          throw new NotFoundException('Employee was not found');
        }
        if (employee.userId) {
          throw new HttpException(
            {
              code: 'CONFLICT',
              message: 'This employee has already joined StackHR',
            },
            HttpStatus.CONFLICT,
          );
        }

        // A resend rotates the token, so any earlier link stops working.
        const { token, tokenHash } = createInvitationToken();
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
        const pending = await client.invitation.findFirst({
          where: { organizationId, employeeId, status: 'pending' },
        });

        // Limits: one send per minute and five per rolling day per employee.
        const now = Date.now();
        const lastSentAt = pending?.lastSentAt?.getTime();
        const sentWithinDay =
          lastSentAt !== undefined && now - lastSentAt < 24 * 60 * 60 * 1000;
        const tooSoon =
          lastSentAt !== undefined && now - lastSentAt < 60 * 1000;
        if (tooSoon || (sentWithinDay && (pending?.sendCount ?? 0) >= 5)) {
          throw new HttpException(
            {
              code: 'RATE_LIMITED',
              message: tooSoon
                ? 'An invitation was sent less than a minute ago'
                : 'The daily invitation limit for this employee was reached',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const invitation = pending
          ? await client.invitation.update({
              where: { id: pending.id },
              data: {
                tokenHash,
                expiresAt,
                ...(sentWithinDay ? {} : { sendCount: 0 }),
              },
            })
          : await client.invitation.create({
              data: {
                organizationId,
                employeeId,
                email: employee.email,
                role: 'EMPLOYEE',
                status: 'pending',
                tokenHash,
                inviterId: user.id,
                expiresAt,
              },
            });

        return {
          summary: toEmployeeSummary(employee),
          invitation: { id: invitation.id, token, tokenHash },
        };
      })
      .then(async ({ summary, invitation }) => ({
        status: await this.deliverInvitation(
          organizationId,
          summary,
          invitation,
        ),
      }));
  }

  listCompensationHistory(user: AuthenticatedUser, employeeId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const entries = await client.compensationHistory.findMany({
        where: { organizationId, employeeId },
        orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }],
      });
      return entries.map((entry) => ({
        id: entry.id,
        effectiveDate: toDateOnly(entry.effectiveDate),
        annualSalaryMinor: Number(entry.annualSalaryMinor),
        currency: entry.currency,
        payFrequency: entry.payFrequency,
      }));
    });
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
      const [leaveTypes, balances, requests, documents, activity] =
        await Promise.all([
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
          // Existing contract: monthly amount in major units.
          salary: Number(employee.annualSalaryMinor / 1200n),
          annualSalaryMinor: Number(employee.annualSalaryMinor),
          currency: employee.currency,
          payFrequency: toPayFrequency(employee.payFrequency),
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
