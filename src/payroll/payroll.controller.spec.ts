import { Test, TestingModule } from '@nestjs/testing';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('PayrollController', () => {
  let controller: PayrollController;
  let serviceMock: {
    setCompensation: jest.Mock;
    getCompensationHistory: jest.Mock;
    createRun: jest.Mock;
    calculateRun: jest.Mock;
    submitRunForApproval: jest.Mock;
    fundingCheck: jest.Mock;
    executePayment: jest.Mock;
    reconcileRun: jest.Mock;
    getRuns: jest.Mock;
    getRunById: jest.Mock;
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_ADMIN,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    serviceMock = {
      setCompensation: jest.fn(),
      getCompensationHistory: jest.fn(),
      createRun: jest.fn(),
      calculateRun: jest.fn(),
      submitRunForApproval: jest.fn(),
      fundingCheck: jest.fn(),
      executePayment: jest.fn(),
      reconcileRun: jest.fn(),
      getRuns: jest.fn(),
      getRunById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollController],
      providers: [
        {
          provide: PayrollService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayrollController>(PayrollController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate setCompensation to service', async () => {
    const dto = {
      employeeId: '550e8400-e29b-41d4-a716-446655440000',
      basicSalary: 300000,
    };
    serviceMock.setCompensation.mockResolvedValue({ message: 'Success' });

    const result = await controller.setCompensation(mockAdminUser, dto);

    expect(serviceMock.setCompensation).toHaveBeenCalledWith(
      mockAdminUser,
      dto,
    );
    expect(result.message).toBe('Success');
  });

  it('should delegate createRun to service', async () => {
    const dto = { periodMonth: 9, periodYear: 2026 };
    serviceMock.createRun.mockResolvedValue({ message: 'Created' });

    const result = await controller.createRun(mockAdminUser, dto);

    expect(serviceMock.createRun).toHaveBeenCalledWith(mockAdminUser, dto);
    expect(result.message).toBe('Created');
  });

  it('should delegate calculateRun to service', async () => {
    serviceMock.calculateRun.mockResolvedValue({ message: 'Calculated' });

    const result = await controller.calculateRun(mockAdminUser, 'run-1');

    expect(serviceMock.calculateRun).toHaveBeenCalledWith(
      mockAdminUser,
      'run-1',
    );
    expect(result.message).toBe('Calculated');
  });

  it('should delegate submitRunForApproval to service', async () => {
    serviceMock.submitRunForApproval.mockResolvedValue({
      message: 'Submitted',
    });

    const result = await controller.submitRunForApproval(
      mockAdminUser,
      'run-1',
    );

    expect(serviceMock.submitRunForApproval).toHaveBeenCalledWith(
      mockAdminUser,
      'run-1',
    );
    expect(result.message).toBe('Submitted');
  });

  it('should delegate fundingCheck to service', async () => {
    const dto = { confirmed: true };
    serviceMock.fundingCheck.mockResolvedValue({ message: 'Passed' });

    const result = await controller.fundingCheck(mockAdminUser, 'run-1', dto);

    expect(serviceMock.fundingCheck).toHaveBeenCalledWith(
      mockAdminUser,
      'run-1',
      dto,
    );
    expect(result.message).toBe('Passed');
  });

  it('should delegate executePayment to service', async () => {
    serviceMock.executePayment.mockResolvedValue({ message: 'Executed' });

    const result = await controller.executePayment(mockAdminUser, 'run-1');

    expect(serviceMock.executePayment).toHaveBeenCalledWith(
      mockAdminUser,
      'run-1',
    );
    expect(result.message).toBe('Executed');
  });

  it('should delegate reconcileRun to service', async () => {
    serviceMock.reconcileRun.mockResolvedValue({ message: 'Reconciled' });

    const result = await controller.reconcileRun(mockAdminUser, 'run-1');

    expect(serviceMock.reconcileRun).toHaveBeenCalledWith(
      mockAdminUser,
      'run-1',
    );
    expect(result.message).toBe('Reconciled');
  });

  it('should delegate getRuns to service', async () => {
    serviceMock.getRuns.mockResolvedValue({ payrollRuns: [] });

    const result = await controller.getRuns(mockAdminUser);

    expect(serviceMock.getRuns).toHaveBeenCalledWith(mockAdminUser);
    expect(result.payrollRuns).toEqual([]);
  });

  it('should delegate getRunById to service', async () => {
    serviceMock.getRunById.mockResolvedValue({ payrollRun: { id: 'run-1' } });

    const result = await controller.getRunById(mockAdminUser, 'run-1');

    expect(serviceMock.getRunById).toHaveBeenCalledWith(mockAdminUser, 'run-1');
    expect(result.payrollRun.id).toBe('run-1');
  });
});
