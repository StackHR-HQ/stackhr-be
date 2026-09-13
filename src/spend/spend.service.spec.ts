import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpendService } from './spend.service';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('SpendService', () => {
  let service: SpendService;
  let prismaMock: any;
  let approvalsServiceMock: {
    submitRequest: jest.Mock;
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
    prismaMock = {
      expense: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      salaryAdvance: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      reimbursement: {
        findMany: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
      },
    };

    approvalsServiceMock = {
      submitRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: ApprovalsService,
          useValue: approvalsServiceMock,
        },
      ],
    }).compile();

    service = module.get<SpendService>(SpendService);
  });

  describe('submitExpense', () => {
    it('should create expense and route through Approvals Engine', async () => {
      const mockEmployee = { id: 'emp-1', email: 'jane@acme.com' };
      prismaMock.employee.findFirst.mockResolvedValue(mockEmployee);
      prismaMock.expense.create.mockResolvedValue({
        id: 'exp-1',
        amount: 25000,
        status: 'PENDING',
      });
      approvalsServiceMock.submitRequest.mockResolvedValue({
        approvalRequest: { id: 'appr-exp-1', status: 'PENDING' },
      });

      const result = await service.submitExpense(mockUser, {
        category: 'Travel',
        amount: 25000,
        description: 'Client visit cab fare',
      });

      expect(result.expense.id).toBe('exp-1');
      expect(approvalsServiceMock.submitRequest).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          type: 'EXPENSE',
          subjectTable: 'expense',
          subjectId: 'exp-1',
          amountSnapshot: 25000,
        }),
      );
    });

    it('should throw NotFoundException if employee record is missing', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.submitExpense(mockUser, { category: 'Travel', amount: 25000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachReceipt', () => {
    it('should update receiptUrl for an existing expense claim', async () => {
      prismaMock.expense.findFirst.mockResolvedValue({
        id: 'exp-1',
        organizationId: 'org-123',
      });
      prismaMock.expense.update.mockResolvedValue({
        id: 'exp-1',
        receiptUrl: 'https://example.com/receipt.pdf',
      });

      const result = await service.attachReceipt(mockUser, 'exp-1', {
        receiptUrl: 'https://example.com/receipt.pdf',
      });

      expect(result.expense.receiptUrl).toBe('https://example.com/receipt.pdf');
    });

    it('should throw NotFoundException if expense claim is not found', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(null);

      await expect(
        service.attachReceipt(mockUser, 'exp-invalid', {
          receiptUrl: 'https://example.com/receipt.pdf',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitSalaryAdvance', () => {
    it('should calculate monthly deduction, create advance, and route through Approvals Engine', async () => {
      const mockEmployee = { id: 'emp-1', email: 'jane@acme.com' };
      prismaMock.employee.findFirst.mockResolvedValue(mockEmployee);
      prismaMock.salaryAdvance.create.mockResolvedValue({
        id: 'adv-1',
        amount: 100000,
        repaymentMonths: 2,
        monthlyDeduction: 50000,
        status: 'PENDING',
      });
      approvalsServiceMock.submitRequest.mockResolvedValue({
        approvalRequest: { id: 'appr-adv-1', status: 'PENDING' },
      });

      const result = await service.submitSalaryAdvance(mockUser, {
        amount: 100000,
        repaymentMonths: 2,
        reason: 'Emergency medical bill',
      });

      expect(result.salaryAdvance.id).toBe('adv-1');
      expect(approvalsServiceMock.submitRequest).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          type: 'SALARY_ADVANCE',
          subjectTable: 'salary_advance',
          subjectId: 'adv-1',
          amountSnapshot: 100000,
        }),
      );
    });
  });

  describe('getExpenses', () => {
    it('should return expenses list', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
      prismaMock.expense.findMany.mockResolvedValue([{ id: 'exp-1' }]);

      const result = await service.getExpenses(mockUser);

      expect(result.expenses).toHaveLength(1);
    });
  });

  describe('getSalaryAdvances', () => {
    it('should return salary advances list', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
      prismaMock.salaryAdvance.findMany.mockResolvedValue([{ id: 'adv-1' }]);

      const result = await service.getSalaryAdvances(mockUser);

      expect(result.advances).toHaveLength(1);
    });
  });

  describe('getReimbursements', () => {
    it('should return reimbursements list', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
      prismaMock.reimbursement.findMany.mockResolvedValue([{ id: 'reimb-1' }]);

      const result = await service.getReimbursements(mockUser);

      expect(result.reimbursements).toHaveLength(1);
    });
  });
});
