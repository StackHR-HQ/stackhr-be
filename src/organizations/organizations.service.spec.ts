import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      organization: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
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
});
