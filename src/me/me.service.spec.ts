import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MeService } from './me.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('MeService', () => {
  let service: MeService;
  let prismaMock: any;

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
      employee: {
        findFirst: jest.fn(),
      },
      payslip: {
        findMany: jest.fn(),
      },
      leaveBalance: {
        findMany: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn(),
      },
      expense: {
        findMany: jest.fn(),
      },
      salaryAdvance: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<MeService>(MeService);
  });

  describe('getProfile', () => {
    it('should return employee profile for current user', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        email: 'jane@acme.com',
        fullName: 'Jane Doe',
      });

      const result = await service.getProfile(mockUser);

      expect(result.profile.id).toBe('emp-100');
    });

    it('should throw NotFoundException if employee record is not found', async () => {
      prismaMock.employee.findFirst.mockResolvedValue(null);

      await expect(service.getProfile(mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPayslips', () => {
    it('should return payslips for current user employee record', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.payslip.findMany.mockResolvedValue([{ id: 'pay-1' }]);

      const result = await service.getPayslips(mockUser);

      expect(result.payslips).toHaveLength(1);
    });
  });

  describe('getLeaveBalances', () => {
    it('should return leave balances for current user', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.leaveBalance.findMany.mockResolvedValue([{ id: 'bal-1' }]);

      const result = await service.getLeaveBalances(mockUser);

      expect(result.leaveBalances).toHaveLength(1);
    });
  });

  describe('getExpenses', () => {
    it('should return expenses for current user', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.expense.findMany.mockResolvedValue([{ id: 'exp-1' }]);

      const result = await service.getExpenses(mockUser);

      expect(result.expenses).toHaveLength(1);
    });
  });
});
