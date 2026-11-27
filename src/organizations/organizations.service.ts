import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ORG_ROLE_CATALOG,
  USER_ROLES,
  USER_TYPES,
} from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

interface OrgMemberRow {
  id: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    banned: boolean | null;
    createdAt: Date;
  };
}

interface OrgEmployeeSummary {
  id: string;
  userId: string | null;
  employeeNumber: string | null;
  jobTitle: string | null;
  status: string;
}

interface EditableMemberRow {
  id: string;
  userId: string;
  role: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private requireBusinessOrgId(user: AuthenticatedUser): string {
    if (user.userType !== USER_TYPES.BUSINESS || !user.organizationId) {
      throw new ForbiddenException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  private async getEditableMember(
    organizationId: string,
    actor: AuthenticatedUser,
    memberId: string,
    actionLabel: string,
    targetRole?: string,
  ): Promise<EditableMemberRow> {
    const [member, organization] = await Promise.all([
      this.prisma.tenantClient.member.findFirst({
        where: { id: memberId },
      }) as Promise<EditableMemberRow | null>,
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { ownerId: true },
      }),
    ]);

    if (!member) {
      throw new NotFoundException('Team member not found');
    }
    if (member.userId === actor.id) {
      throw new BadRequestException(`You cannot ${actionLabel} yourself`);
    }
    if (
      member.role === USER_ROLES.BUSINESS_OWNER ||
      (organization?.ownerId && member.userId === organization.ownerId)
    ) {
      throw new ForbiddenException(`Cannot ${actionLabel} the business owner`);
    }

    const isActorOwner =
      actor.role === USER_ROLES.BUSINESS_OWNER ||
      (organization?.ownerId !== null &&
        organization?.ownerId !== undefined &&
        actor.id === organization.ownerId);

    if (
      !isActorOwner &&
      (member.role === USER_ROLES.BUSINESS_ADMIN ||
        targetRole === USER_ROLES.BUSINESS_ADMIN)
    ) {
      throw new ForbiddenException(
        'Only the business owner can manage business admins',
      );
    }

    return member;
  }

  async getCurrent(user: AuthenticatedUser) {
    const organizationId = this.requireBusinessOrgId(user);

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization was not found');
    }

    return organization;
  }

  async updateCurrent(user: AuthenticatedUser, dto: UpdateOrganizationDto) {
    const organizationId = this.requireBusinessOrgId(user);

    if (
      dto.pensionEmployeeRateOverride !== undefined &&
      dto.pensionEmployeeRateOverride !== null &&
      dto.pensionEmployeeRateOverride < 0.08
    ) {
      throw new BadRequestException(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    }
    if (
      dto.pensionEmployerRateOverride !== undefined &&
      dto.pensionEmployerRateOverride !== null &&
      dto.pensionEmployerRateOverride < 0.1
    ) {
      throw new BadRequestException(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    }

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...dto,
        pensionBasisOverride:
          dto.pensionBasisOverride !== undefined
            ? dto.pensionBasisOverride
              ? dto.pensionBasisOverride.trim().toUpperCase()
              : null
            : undefined,
      },
    });

    return organization;
  }

  async listMembers(user: AuthenticatedUser) {
    this.requireBusinessOrgId(user);

    const members = (await this.prisma.tenantClient.member.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            banned: true,
            createdAt: true,
          },
        },
      },
    })) as OrgMemberRow[];

    const userIds = Array.from(new Set(members.map((m) => m.userId)));
    const [lastSessions, employees] = await Promise.all([
      userIds.length > 0
        ? this.prisma.session.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _max: { updatedAt: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? (this.prisma.tenantClient.employee.findMany({
            where: { userId: { in: userIds } },
            select: {
              id: true,
              userId: true,
              employeeNumber: true,
              jobTitle: true,
              status: true,
            },
          }) as Promise<OrgEmployeeSummary[]>)
        : Promise.resolve([] as OrgEmployeeSummary[]),
    ]);

    const lastActiveMap = new Map<string, Date | null>(
      lastSessions.map((s) => [s.userId, s._max?.updatedAt ?? null] as const),
    );
    const employeeMap = new Map<string, OrgEmployeeSummary>();
    for (const emp of employees) {
      if (emp.userId) {
        employeeMap.set(emp.userId, emp);
      }
    }

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      lastActiveAt: lastActiveMap.get(member.userId) ?? null,
      user: member.user,
      employee: employeeMap.get(member.userId) ?? null,
    }));
  }

  async updateMemberRole(
    user: AuthenticatedUser,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const organizationId = this.requireBusinessOrgId(user);
    const member = await this.getEditableMember(
      organizationId,
      user,
      memberId,
      'change the role of',
      dto.role,
    );

    const updated = await this.prisma.tenantClient.member.update({
      where: { id: member.id },
      data: { role: dto.role },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    this.authService.evictUserSessions(member.userId);
    return updated;
  }

  async removeMember(user: AuthenticatedUser, memberId: string) {
    const organizationId = this.requireBusinessOrgId(user);
    const member = await this.getEditableMember(
      organizationId,
      user,
      memberId,
      'remove',
    );

    await this.prisma.tenantClient.member.delete({
      where: { id: member.id },
    });

    await this.authService.revokeUserSessionsForOrganization(
      member.userId,
      organizationId,
    );
    return { success: true, removedMemberId: member.id };
  }

  listRoles() {
    return ORG_ROLE_CATALOG;
  }
}
