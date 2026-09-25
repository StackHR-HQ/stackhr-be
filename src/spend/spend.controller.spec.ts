import { Test, TestingModule } from '@nestjs/testing';
import { SpendController } from './spend.controller';
import { SpendService } from './spend.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';

describe('SpendController', () => {
  let controller: SpendController;
  let serviceMock: any;

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
      submitExpense: jest.fn(),
      attachReceipt: jest.fn(),
      getExpenses: jest.fn(),
      submitSalaryAdvance: jest.fn(),
      getSalaryAdvances: jest.fn(),
      getReimbursements: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpendController],
      providers: [
        {
          provide: SpendService,
          useValue: serviceMock,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SpendController>(SpendController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate submitExpense to service', async () => {
    const dto = { category: 'Travel', amount: 25000 };
    serviceMock.submitExpense.mockResolvedValue({ message: 'Submitted' });

    const result = await controller.submitExpense(mockUser, dto);

    expect(serviceMock.submitExpense).toHaveBeenCalledWith(mockUser, dto);
    expect(result.message).toBe('Submitted');
  });

  it('should delegate attachReceipt to service', async () => {
    const dto = { receiptUrl: 'https://example.com/receipt.png' };
    serviceMock.attachReceipt.mockResolvedValue({ message: 'Attached' });

    const result = await controller.attachReceipt(mockUser, 'exp-123', dto);

    expect(serviceMock.attachReceipt).toHaveBeenCalledWith(
      mockUser,
      'exp-123',
      dto,
    );
    expect(result.message).toBe('Attached');
  });

  it('should delegate getExpenses to service', async () => {
    serviceMock.getExpenses.mockResolvedValue({ expenses: [] });

    const result = await controller.getExpenses(mockUser);

    expect(serviceMock.getExpenses).toHaveBeenCalledWith(mockUser);
    expect(result.expenses).toEqual([]);
  });

  it('should delegate submitSalaryAdvance to service', async () => {
    const dto = { amount: 100000, repaymentMonths: 2 };
    serviceMock.submitSalaryAdvance.mockResolvedValue({ message: 'Submitted' });

    const result = await controller.submitSalaryAdvance(mockUser, dto);

    expect(serviceMock.submitSalaryAdvance).toHaveBeenCalledWith(mockUser, dto);
    expect(result.message).toBe('Submitted');
  });

  it('should delegate getSalaryAdvances to service', async () => {
    serviceMock.getSalaryAdvances.mockResolvedValue({ advances: [] });

    const result = await controller.getSalaryAdvances(mockUser);

    expect(serviceMock.getSalaryAdvances).toHaveBeenCalledWith(mockUser);
    expect(result.advances).toEqual([]);
  });

  it('should delegate getReimbursements to service', async () => {
    serviceMock.getReimbursements.mockResolvedValue({ reimbursements: [] });

    const result = await controller.getReimbursements(mockUser);

    expect(serviceMock.getReimbursements).toHaveBeenCalledWith(mockUser);
    expect(result.reimbursements).toEqual([]);
  });
});
