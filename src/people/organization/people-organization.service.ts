import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { requirePeopleOrganization } from '../common/people-access';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

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
