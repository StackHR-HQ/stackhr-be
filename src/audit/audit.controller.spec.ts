import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('AuditController', () => {
  let controller: AuditController;
  let auditServiceMock: { listForOrganization: jest.Mock };

  beforeEach(async () => {
    auditServiceMock = {
      listForOrganization: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: auditServiceMock },
        AuthGuard,
        { provide: AuthService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates list to AuditService.listForOrganization', async () => {
    const user: AuthenticatedUser = {
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@acme.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_ADMIN,
      organizationId: 'org-1',
    };
    const query = { page: 1, limit: 10, action: 'POST /employees' };
    await controller.list(user, query);
    expect(auditServiceMock.listForOrganization).toHaveBeenCalledWith(
      user,
      query,
    );
  });
});
