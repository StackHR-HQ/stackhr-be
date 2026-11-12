import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  beforeEach(async () => {
    const mockService = {
      getCurrent: jest.fn(),
      updateCurrent: jest.fn(),
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

  it('delegates updateCurrent', async () => {
    const user: AuthenticatedUser = {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_ADMIN,
      organizationId: 'org-1',
    };
    const dto = { name: 'Acme', pensionEmployeeRateOverride: 0.08 };
    await controller.updateCurrent(user, dto);
    const service = (controller as any).organizationsService;
    expect(service.updateCurrent).toHaveBeenCalledWith(user, dto);
  });
});
