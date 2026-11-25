import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let mockService: Record<string, jest.Mock>;

  const adminUser: AuthenticatedUser = {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_ADMIN,
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    mockService = {
      getCurrent: jest.fn(),
      updateCurrent: jest.fn(),
      listMembers: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      listRoles: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: mockService },
        AuthGuard,
        { provide: AuthService, useValue: {} },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates updateCurrent including address and rcNumber', async () => {
    const dto = {
      name: 'Acme',
      address: '12 Marina, Lagos',
      rcNumber: 'RC-123456',
      pensionEmployeeRateOverride: 0.08,
    };
    await controller.updateCurrent(adminUser, dto);
    expect(mockService.updateCurrent).toHaveBeenCalledWith(adminUser, dto);
  });

  it('delegates listMembers', async () => {
    await controller.listMembers(adminUser);
    expect(mockService.listMembers).toHaveBeenCalledWith(adminUser);
  });

  it('delegates updateMemberRole', async () => {
    const dto = { role: USER_ROLES.MANAGER };
    await controller.updateMemberRole(adminUser, 'member-2', dto);
    expect(mockService.updateMemberRole).toHaveBeenCalledWith(
      adminUser,
      'member-2',
      dto,
    );
  });

  it('delegates removeMember', async () => {
    await controller.removeMember(adminUser, 'member-2');
    expect(mockService.removeMember).toHaveBeenCalledWith(
      adminUser,
      'member-2',
    );
  });

  it('delegates listRoles', () => {
    controller.listRoles();
    expect(mockService.listRoles).toHaveBeenCalled();
  });
});
