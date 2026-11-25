import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prismaMock: any;
  let authServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      tenantClient: {
        member: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        employee: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    };

    authServiceMock = {
      evictUserSessions: jest.fn(),
      revokeSessionsForUser: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should allow a MANAGER to fetch current organization', async () => {
    const mockOrg = { id: 'org-1', name: 'Acme Corp', slug: 'acme' };
    prismaMock.organization.findUnique.mockResolvedValue(mockOrg);

    const user: AuthenticatedUser = {
      id: 'mgr-1',
      name: 'Manager User',
      email: 'mgr@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.MANAGER,
      organizationId: 'org-1',
    };

    const result = await service.getCurrent(user);
    expect(result).toEqual(mockOrg);
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
    });
  });

  it('should allow an EMPLOYEE to fetch current organization', async () => {
    const mockOrg = { id: 'org-1', name: 'Acme Corp', slug: 'acme' };
    prismaMock.organization.findUnique.mockResolvedValue(mockOrg);

    const user: AuthenticatedUser = {
      id: 'emp-1',
      name: 'Employee User',
      email: 'emp@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.EMPLOYEE,
      organizationId: 'org-1',
    };

    const result = await service.getCurrent(user);
    expect(result).toEqual(mockOrg);
  });

  it('should throw ForbiddenException if organizationId is missing', async () => {
    const user: AuthenticatedUser = {
      id: 'mgr-1',
      name: 'Manager User',
      email: 'mgr@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.MANAGER,
      organizationId: null,
    };

    await expect(service.getCurrent(user)).rejects.toThrow(ForbiddenException);
  });

  describe('updateCurrent', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_ADMIN,
      organizationId: 'org-1',
    };

    it('should update organization settings and pension rates', async () => {
      const mockUpdated = {
        id: 'org-1',
        name: 'Acme Updated',
        pensionEmployeeRateOverride: 0.08,
        pensionEmployerRateOverride: 0.1,
      };
      prismaMock.organization.update.mockResolvedValue(mockUpdated);

      const result = await service.updateCurrent(adminUser, {
        name: 'Acme Updated',
        pensionEmployeeRateOverride: 0.08,
        pensionEmployerRateOverride: 0.1,
      });

      expect(result).toEqual(mockUpdated);
      expect(prismaMock.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          name: 'Acme Updated',
          pensionEmployeeRateOverride: 0.08,
          pensionEmployerRateOverride: 0.1,
          pensionBasisOverride: undefined,
        },
      });
    });

    it('should reject employee pension rate below statutory minimum of 8% (0.08)', async () => {
      await expect(
        service.updateCurrent(adminUser, {
          pensionEmployeeRateOverride: 0.05,
        }),
      ).rejects.toThrow(
        'Employee pension rate cannot be less than statutory minimum of 8% (0.08)',
      );
    });

    it('should reject employer pension rate below statutory minimum of 10% (0.10)', async () => {
      await expect(
        service.updateCurrent(adminUser, {
          pensionEmployerRateOverride: 0.08,
        }),
      ).rejects.toThrow(
        'Employer pension rate cannot be less than statutory minimum of 10% (0.10)',
      );
    });

    it('should throw ForbiddenException if user has no org context', async () => {
      const noOrgUser: AuthenticatedUser = {
        ...adminUser,
        organizationId: null,
      };

      await expect(
        service.updateCurrent(noOrgUser, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update address and rcNumber', async () => {
      prismaMock.organization.update.mockResolvedValue({
        id: 'org-1',
        address: '12 Marina, Lagos',
        rcNumber: 'RC-987654',
      });

      const result = await service.updateCurrent(adminUser, {
        address: '12 Marina, Lagos',
        rcNumber: 'RC-987654',
      });

      expect(result.address).toBe('12 Marina, Lagos');
      expect(result.rcNumber).toBe('RC-987654');
    });
  });

  describe('team & access', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_ADMIN,
      organizationId: 'org-1',
    };

    it('lists members with batched lastActiveAt and employee info', async () => {
      const lastActive = new Date('2026-11-24T10:00:00Z');
      prismaMock.tenantClient.member.findMany.mockResolvedValue([
        {
          id: 'mem-1',
          userId: 'user-1',
          role: USER_ROLES.MANAGER,
          createdAt: new Date('2026-10-01T00:00:00Z'),
          user: { id: 'user-1', name: 'Jane', email: 'jane@acme.com' },
        },
      ]);
      prismaMock.session.groupBy.mockResolvedValue([
        { userId: 'user-1', _max: { updatedAt: lastActive } },
      ]);
      prismaMock.tenantClient.employee.findMany.mockResolvedValue([
        { id: 'emp-1', userId: 'user-1', employeeNumber: 'EMP-001' },
      ]);

      const result = await service.listMembers(adminUser);
      expect(result).toHaveLength(1);
      expect(result[0].lastActiveAt).toEqual(lastActive);
      expect(result[0].employee?.id).toBe('emp-1');
    });

    it('promotes/demotes a member role and evicts session cache', async () => {
      prismaMock.tenantClient.member.findFirst.mockResolvedValue({
        id: 'mem-2',
        userId: 'user-2',
        role: USER_ROLES.EMPLOYEE,
      });
      prismaMock.organization.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });
      prismaMock.tenantClient.member.update.mockResolvedValue({
        id: 'mem-2',
        userId: 'user-2',
        role: USER_ROLES.MANAGER,
      });

      const result = await service.updateMemberRole(adminUser, 'mem-2', {
        role: USER_ROLES.MANAGER,
      });

      expect(result.role).toBe(USER_ROLES.MANAGER);
      expect(authServiceMock.evictUserSessions).toHaveBeenCalledWith('user-2');
    });

    it('blocks changing own role or owner role', async () => {
      prismaMock.tenantClient.member.findFirst.mockResolvedValue({
        id: 'mem-self',
        userId: 'admin-1',
        role: USER_ROLES.BUSINESS_ADMIN,
      });
      prismaMock.organization.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });

      await expect(
        service.updateMemberRole(adminUser, 'mem-self', {
          role: USER_ROLES.EMPLOYEE,
        }),
      ).rejects.toThrow(BadRequestException);

      prismaMock.tenantClient.member.findFirst.mockResolvedValue({
        id: 'mem-owner',
        userId: 'owner-1',
        role: USER_ROLES.BUSINESS_OWNER,
      });

      await expect(
        service.updateMemberRole(adminUser, 'mem-owner', {
          role: USER_ROLES.EMPLOYEE,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes member and revokes their sessions', async () => {
      prismaMock.tenantClient.member.findFirst.mockResolvedValue({
        id: 'mem-2',
        userId: 'user-2',
        role: USER_ROLES.EMPLOYEE,
      });
      prismaMock.organization.findUnique.mockResolvedValue({
        ownerId: 'owner-1',
      });

      const result = await service.removeMember(adminUser, 'mem-2');
      expect(result).toEqual({ success: true, removedMemberId: 'mem-2' });
      expect(authServiceMock.revokeSessionsForUser).toHaveBeenCalledWith(
        'user-2',
      );
    });

    it('returns the system role catalog', () => {
      const roles = service.listRoles();
      expect(roles.map((r) => r.role)).toContain(USER_ROLES.MANAGER);
    });
  });
});
