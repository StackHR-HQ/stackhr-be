import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import {
  avatarInitials,
  formatDateRange,
  toDateOnly,
} from '../common/people-mappers';
import {
  TenantClient,
  TenantPrismaService,
} from '../tenant/tenant-prisma.service';

export interface LeaveRequestWithEmployee {
  id: string;
  employeeId: string;
  employeeName: string;
  avatarInitials: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

function parseDecision(value: unknown): 'APPROVED' | 'REJECTED' {
  if (value === 'approved') return 'APPROVED';
  if (value === 'rejected') return 'REJECTED';
  const message = 'status must be approved or rejected';
  throw new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message,
    fields: { status: message },
  });
}

@Injectable()
export class PeopleLeaveService {
  constructor(private readonly tenant: TenantPrismaService) {}

  listRequests(user: AuthenticatedUser): Promise<LeaveRequestWithEmployee[]> {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [requests, lookups] = await Promise.all([
        client.leaveRequest.findMany({
          where: { organizationId },
          orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        }),
        loadLookups(client, organizationId),
      ]);
      return requests.map((request) => toLeaveRequestView(request, lookups));
    });
  }

  listTypes(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const types = await client.leaveType.findMany({
        where: { organizationId },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
      return types.map((type) => ({
        id: type.id,
        name: type.name,
        defaultDays: type.defaultDays,
        paid: type.paid,
        tone: type.tone,
        description: type.description,
      }));
    });
  }

  listPolicies(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const policies = await client.leavePolicy.findMany({
        where: { organizationId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      return policies.map((policy) => ({
        id: policy.id,
        title: policy.title,
        description: policy.description,
      }));
    });
  }

  decideRequest(
    user: AuthenticatedUser,
    requestId: string,
    input: { status: unknown },
  ): Promise<LeaveRequestWithEmployee> {
    const organizationId = requirePeopleOrganization(user);
    const status = parseDecision(input.status);
    return this.tenant.run(organizationId, async (client) => {
      const request = await client.leaveRequest.findFirst({
        where: { id: requestId, organizationId },
      });
      if (!request) {
        throw new NotFoundException('Leave request was not found');
      }

      // Users are not yet linked to employees, so identity is matched by email.
      const employee = await client.employee.findFirst({
        where: { id: request.employeeId, organizationId },
      });
      if (employee?.email.toLowerCase() === user.email.toLowerCase()) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'You cannot decide your own leave request',
        });
      }

      // Conditional on PENDING so concurrent decisions cannot both apply.
      const { count } = await client.leaveRequest.updateMany({
        where: { id: request.id, organizationId, status: 'PENDING' },
        data: {
          status,
          decidedByUserId: user.id,
          decidedAt: new Date(),
        },
      });

      if (count === 0) {
        const current = await client.leaveRequest.findFirstOrThrow({
          where: { id: request.id, organizationId },
        });
        // An identical retry returns the existing result; nothing is re-charged.
        if (current.status !== status) {
          throw new ConflictException({
            code: 'CONFLICT',
            message: `Leave request was already ${current.status.toLowerCase()}`,
          });
        }
      } else {
        if (status === 'APPROVED') {
          await this.chargeBalance(client, organizationId, request);
        }
        await this.recordDecision(
          client,
          organizationId,
          user,
          request,
          status,
        );
      }

      const updated = await client.leaveRequest.findFirstOrThrow({
        where: { id: request.id, organizationId },
      });
      return toLeaveRequestView(
        updated,
        await loadLookups(client, organizationId),
      );
    });
  }

  private async recordDecision(
    client: TenantClient,
    organizationId: string,
    user: AuthenticatedUser,
    request: {
      id: string;
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      endDate: Date;
    },
    status: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    const leaveType = await client.leaveType.findFirst({
      where: { id: request.leaveTypeId, organizationId },
    });
    const range = formatDateRange(request.startDate, request.endDate);
    await client.auditEvent.create({
      data: {
        id: randomUUID(),
        organizationId,
        actorUserId: user.id,
        action: `leave_request.${status.toLowerCase()}`,
        targetType: 'leave_request',
        targetId: request.id,
        employeeId: request.employeeId,
        description: `${leaveType?.name ?? 'Leave'} request for ${range} ${status.toLowerCase()}`,
        changes: { status: { from: 'PENDING', to: status } },
        createdAt: new Date(),
      },
    });
  }

  private async chargeBalance(
    client: TenantClient,
    organizationId: string,
    request: {
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      days: number;
    },
  ): Promise<void> {
    const leaveType = await client.leaveType.findFirst({
      where: { id: request.leaveTypeId, organizationId },
    });
    const year = request.startDate.getUTCFullYear();
    // Atomic increment so approvals of different requests cannot lose updates.
    await client.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
      create: {
        id: randomUUID(),
        organizationId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
        totalDays: leaveType?.defaultDays ?? 0,
        usedDays: request.days,
      },
      update: { usedDays: { increment: request.days } },
    });
  }

  listBalances(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [employees, types, balances] = await Promise.all([
        client.employee.findMany({
          where: { organizationId },
          orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        }),
        client.leaveType.findMany({
          where: { organizationId },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
        }),
        client.leaveBalance.findMany({
          where: { organizationId, year: new Date().getUTCFullYear() },
        }),
      ]);

      const byEmployeeAndType = new Map(
        balances.map((balance) => [
          `${balance.employeeId}:${balance.leaveTypeId}`,
          balance,
        ]),
      );

      // Every row lists every type in catalog order: the table derives its
      // columns from the first row. Missing records show the type default.
      return employees.map((employee) => ({
        employeeId: employee.id,
        employeeName: employee.fullName,
        avatarInitials: avatarInitials(employee.fullName),
        balances: types.map((type) => {
          const balance = byEmployeeAndType.get(`${employee.id}:${type.id}`);
          return {
            type: type.name,
            totalDays: balance?.totalDays ?? type.defaultDays,
            usedDays: balance?.usedDays ?? 0,
          };
        }),
      }));
    });
  }
}

interface Lookups {
  employees: Map<string, { fullName: string }>;
  leaveTypes: Map<string, { name: string }>;
}

async function loadLookups(
  client: TenantClient,
  organizationId: string,
): Promise<Lookups> {
  const [employees, leaveTypes] = await Promise.all([
    client.employee.findMany({ where: { organizationId } }),
    client.leaveType.findMany({ where: { organizationId } }),
  ]);
  return {
    employees: new Map(employees.map((employee) => [employee.id, employee])),
    leaveTypes: new Map(leaveTypes.map((type) => [type.id, type])),
  };
}

function toLeaveRequestView(
  request: {
    id: string;
    employeeId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    days: number;
    status: string;
  },
  lookups: Lookups,
): LeaveRequestWithEmployee {
  const employeeName =
    lookups.employees.get(request.employeeId)?.fullName ?? '';
  return {
    id: request.id,
    employeeId: request.employeeId,
    employeeName,
    avatarInitials: avatarInitials(employeeName),
    type: lookups.leaveTypes.get(request.leaveTypeId)?.name ?? '',
    startDate: toDateOnly(request.startDate),
    endDate: toDateOnly(request.endDate),
    days: request.days,
    status: request.status.toLowerCase(),
  };
}
