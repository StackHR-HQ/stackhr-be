import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('BillingController', () => {
  let controller: BillingController;
  let billingServiceMock: {
    getStatus: jest.Mock;
  };

  beforeEach(async () => {
    billingServiceMock = {
      getStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        {
          provide: BillingService,
          useValue: billingServiceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call billingService.getStatus', async () => {
    const mockUser: AuthenticatedUser = {
      id: 'usr-1',
      name: 'Test Owner',
      email: 'a@b.com',
      userType: USER_TYPES.BUSINESS,
      role: USER_ROLES.BUSINESS_OWNER,
      organizationId: 'org-123',
    };
    billingServiceMock.getStatus.mockResolvedValue({ status: 'TRIALING' });

    const result = await controller.getStatus(mockUser);

    expect(billingServiceMock.getStatus).toHaveBeenCalledWith(mockUser);
    expect(result).toEqual({ status: 'TRIALING' });
  });
});
