import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import {
  TenantPrismaService,
  type TenantClient,
} from '../tenant/tenant-prisma.service';
import type { DepartmentDto } from './dto/department.dto';

// Mirrors the database's normalized unique index so callers get a 409, not a 500.
const normalizeDepartmentName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Shared create/update rules; `departmentId` is the department being updated. */
async function assertValidDepartment(
  client: TenantClient,
  organizationId: string,
  input: DepartmentDto,
  departmentId?: string,
): Promise<void> {
  const existingDepartments = await client.department.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  if (
    existingDepartments.some(
      (department) =>
        department.id !== departmentId &&
        normalizeDepartmentName(department.name) ===
          normalizeDepartmentName(input.name),
    )
  ) {
    throw new ConflictException({
      code: 'CONFLICT',
      message: 'A department with this name already exists',
    });
  }

  const members = await client.employee.findMany({
    where: { organizationId, id: { in: input.memberIds } },
    select: { id: true },
  });
  if (members.length !== input.memberIds.length) {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Every member must be an employee of this organization',
      fields: { memberIds: 'Unknown employee' },
    });
  }
  if (input.headEmployeeId && !input.memberIds.includes(input.headEmployeeId)) {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'The department head must be one of its members',
      fields: { headEmployeeId: 'Head must be a member' },
    });
  }
}

function toDepartment(
  department: { id: string; name: string; headEmployeeId: string | null },
  memberIds: string[],
) {
  return {
    id: department.id,
    name: department.name,
    headEmployeeId: department.headEmployeeId ?? '',
    memberIds,
  };
}

@Injectable()
export class PeopleOrganizationService {
  constructor(private readonly tenant: TenantPrismaService) {}

  listDepartments(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const departments = await client.department.findMany({
        where: { organizationId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      return departments.map((department) => ({
        id: department.id,
        name: department.name,
        headEmployeeId: department.headEmployeeId ?? '',
      }));
    });
  }

  createDepartment(user: AuthenticatedUser, input: DepartmentDto) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      await assertValidDepartment(client, organizationId, input);

      const department = await client.department.create({
        data: {
          organizationId,
          name: input.name,
          headEmployeeId: input.headEmployeeId ?? null,
        },
      });
      // Membership is each employee's departmentId, never a separate list.
      await client.employee.updateMany({
        where: { organizationId, id: { in: input.memberIds } },
        data: { departmentId: department.id },
      });
      await this.recordDepartmentAudit(client, organizationId, user.id, {
        department,
        action: 'created',
        movedInIds: input.memberIds,
        movedOutIds: [],
      });
      return toDepartment(department, input.memberIds);
    });
  }

  /** Renames and atomically replaces the head and the full membership. */
  updateDepartment(
    user: AuthenticatedUser,
    departmentId: string,
    input: DepartmentDto,
  ) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const existing = await client.department.findFirst({
        where: { id: departmentId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Department was not found');
      }
      await assertValidDepartment(client, organizationId, input, departmentId);

      const department = await client.department.update({
        where: { id: departmentId },
        data: {
          name: input.name,
          headEmployeeId: input.headEmployeeId ?? null,
        },
      });

      const currentMembers = await client.employee.findMany({
        where: { organizationId, departmentId },
        select: { id: true },
      });
      const currentIds = currentMembers.map((member) => member.id);
      const removedIds = currentIds.filter(
        (id) => !input.memberIds.includes(id),
      );
      if (removedIds.length) {
        await client.employee.updateMany({
          where: { organizationId, id: { in: removedIds } },
          data: { departmentId: null },
        });
      }
      await client.employee.updateMany({
        where: { organizationId, id: { in: input.memberIds } },
        data: { departmentId },
      });
      await this.recordDepartmentAudit(client, organizationId, user.id, {
        department,
        action: 'updated',
        movedInIds: input.memberIds.filter((id) => !currentIds.includes(id)),
        movedOutIds: removedIds,
      });
      return toDepartment(department, input.memberIds);
    });
  }

  deleteDepartment(user: AuthenticatedUser, departmentId: string) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const existing = await client.department.findFirst({
        where: { id: departmentId, organizationId },
      });
      if (!existing) {
        throw new NotFoundException('Department was not found');
      }
      const assignedEmployees = await client.employee.count({
        where: { organizationId, departmentId },
      });
      if (assignedEmployees > 0) {
        throw new ConflictException({
          code: 'CONFLICT',
          message:
            'Reassign or unassign the employees in this department before deleting it',
        });
      }
      await client.department.delete({ where: { id: departmentId } });
      await this.recordDepartmentAudit(client, organizationId, user.id, {
        department: existing,
        action: 'deleted',
        movedInIds: [],
        movedOutIds: [],
      });
    });
  }

  /**
   * One department-level event, plus an event on each employee whose
   * department changed so the move shows in their own activity history.
   */
  private async recordDepartmentAudit(
    client: TenantClient,
    organizationId: string,
    actorUserId: string,
    change: {
      department: { id: string; name: string };
      action: 'created' | 'updated' | 'deleted';
      movedInIds: string[];
      movedOutIds: string[];
    },
  ): Promise<void> {
    const { department, action, movedInIds, movedOutIds } = change;
    const createdAt = new Date();

    await client.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        action: `department.${action}`,
        targetType: 'department',
        targetId: department.id,
        employeeId: null,
        description: `Department ${department.name} ${action}`,
        changes: {
          changedFields:
            action === 'deleted' ? [] : ['name', 'headEmployeeId', 'memberIds'],
        },
        createdAt,
      },
    });

    const moves = [
      ...movedInIds.map((id) => ({ id, verb: 'Moved to' })),
      ...movedOutIds.map((id) => ({ id, verb: 'Removed from' })),
    ];
    for (const move of moves) {
      await client.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          action: 'employee.department_changed',
          targetType: 'employee',
          targetId: move.id,
          employeeId: move.id,
          description: `${move.verb} ${department.name}`,
          changes: { changedFields: ['employment.departmentId'] },
          createdAt,
        },
      });
    }
  }

  listTeams(user: AuthenticatedUser) {
    const organizationId = requirePeopleOrganization(user);
    return this.tenant.run(organizationId, async (client) => {
      const [teams, members] = await Promise.all([
        client.team.findMany({
          where: { organizationId },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        client.teamMember.findMany({
          where: { organizationId },
          orderBy: [{ employeeId: 'asc' }],
        }),
      ]);
      return teams.map((team) => ({
        id: team.id,
        name: team.name,
        description: team.description,
        leadEmployeeId: team.leadEmployeeId ?? '',
        memberIds: members
          .filter((member) => member.teamId === team.id)
          .map((member) => member.employeeId),
      }));
    });
  }
}
