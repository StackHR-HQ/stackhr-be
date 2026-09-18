import { Test, TestingModule } from '@nestjs/testing';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('MeController', () => {
  let controller: MeController;
  let serviceMock: {
    getProfile: jest.Mock;
    getPayslips: jest.Mock;
    getLeaveBalances: jest.Mock;
    getLeaveRequests: jest.Mock;
    getExpenses: jest.Mock;
    getSalaryAdvances: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-emp-1',
    name: 'Jane Doe',
    email: 'jane@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.EMPLOYEE,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    serviceMock = {
      getProfile: jest.fn(),
      getPayslips: jest.fn(),
      getLeaveBalances: jest.fn(),
      getLeaveRequests: jest.fn(),
      getExpenses: jest.fn(),
      getSalaryAdvances: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: MeService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MeController>(MeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getProfile to service', async () => {
    serviceMock.getProfile.mockResolvedValue({ profile: { id: 'emp-1' } });

    const result = await controller.getProfile(mockUser);

    expect(serviceMock.getProfile).toHaveBeenCalledWith(mockUser);
    expect(result.profile.id).toBe('emp-1');
  });

  it('should delegate getPayslips to service', async () => {
    serviceMock.getPayslips.mockResolvedValue({ payslips: [] });

    const result = await controller.getPayslips(mockUser);

    expect(serviceMock.getPayslips).toHaveBeenCalledWith(mockUser);
    expect(result.payslips).toEqual([]);
  });

  it('should delegate getLeaveBalances to service', async () => {
    serviceMock.getLeaveBalances.mockResolvedValue({ leaveBalances: [] });

    const result = await controller.getLeaveBalances(mockUser);

    expect(serviceMock.getLeaveBalances).toHaveBeenCalledWith(mockUser);
    expect(result.leaveBalances).toEqual([]);
  });

  it('should delegate getLeaveRequests to service', async () => {
    serviceMock.getLeaveRequests.mockResolvedValue({ leaveRequests: [] });

    const result = await controller.getLeaveRequests(mockUser);

    expect(serviceMock.getLeaveRequests).toHaveBeenCalledWith(mockUser);
    expect(result.leaveRequests).toEqual([]);
  });

  it('should delegate getExpenses to service', async () => {
    serviceMock.getExpenses.mockResolvedValue({ expenses: [] });

    const result = await controller.getExpenses(mockUser);

    expect(serviceMock.getExpenses).toHaveBeenCalledWith(mockUser);
    expect(result.expenses).toEqual([]);
  });

  it('should delegate getSalaryAdvances to service', async () => {
    serviceMock.getSalaryAdvances.mockResolvedValue({ salaryAdvances: [] });

    const result = await controller.getSalaryAdvances(mockUser);

    expect(serviceMock.getSalaryAdvances).toHaveBeenCalledWith(mockUser);
    expect(result.salaryAdvances).toEqual([]);
  });
});
