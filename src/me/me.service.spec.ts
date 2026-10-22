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
      organization: {
        findUnique: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        update: jest.fn(),
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
      compensationRecord: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      compensationHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      auditEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      document: {
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

    it('should return employee profile with compensation details and bankAccountLast4 fallback', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        email: 'jane@acme.com',
        fullName: 'Jane Doe',
        accountNumber: '1234567890',
        bankAccountLast4: null,
        annualSalaryMinor: 360000000n,
      });
      prismaMock.compensationRecord.findFirst.mockResolvedValue({
        basicSalary: 300000,
        housingAllowance: 50000,
        transportAllowance: 20000,
        otherAllowances: 10000,
        effectiveFrom: new Date('2026-01-01'),
      });

      const result = await service.getProfile(mockUser);

      expect(result.profile.bankAccountLast4).toBe('7890');
      expect(result.profile.compensation).toEqual({
        annualSalaryMinor: 360000000,
        currency: 'NGN',
        payFrequency: 'MONTHLY',
        basicSalary: 300000,
        housingAllowance: 50000,
        transportAllowance: 20000,
        otherAllowances: 10000,
        effectiveFrom: '2026-01-01',
      });
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
      prismaMock.leaveBalance.findMany.mockResolvedValue([
        {
          id: 'bal-1',
          leaveTypeId: 'lt-1',
          usedDays: 5,
          leaveType: { id: 'lt-1', name: 'Annual' },
        },
      ]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);

      const result = await service.getLeaveBalances(mockUser);

      expect(result.leaveBalances).toHaveLength(1);
      expect(result.leaveBalances[0].usedDays).toBe(5);
      expect(result.leaveBalances[0].upcomingDays).toBe(0);
      expect(result.leaveBalances[0].approvedFutureDays).toBe(0);
    });
  });

  describe('getLeaveRequests', () => {
    it('should return leave requests with days overridden by totalDays', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'lr-1',
          days: 1, // legacy column default
          totalDays: 20, // the correct computed value
          status: 'APPROVED',
          leaveType: { id: 'lt-1', name: 'Annual Paid Leave' },
        },
      ]);

      const result = await service.getLeaveRequests(mockUser);

      expect(result.leaveRequests).toHaveLength(1);
      expect(result.leaveRequests[0].days).toBe(20); // overridden
      expect(result.leaveRequests[0].totalDays).toBe(20); // also present
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

  describe('updateProfile', () => {
    it('should update employee profile with provided dto fields and return updated profile', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
        email: mockUser.email,
        firstName: 'Old',
        lastName: 'Name',
      });
      prismaMock.employee.update.mockResolvedValue({} as any);

      const dto = {
        firstName: 'New',
        phone: '+2348000000000',
      };

      const result = await service.updateProfile(mockUser, dto);

      expect(prismaMock.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-100' },
        data: {
          firstName: 'New',
          phone: '+2348000000000',
        },
      });
      expect(result).toHaveProperty('profile');
    });

    it('should derive bankAccountLast4 and create PROFILE_UPDATED audit event when accountNumber is updated', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
        email: mockUser.email,
        firstName: 'Jane',
        lastName: 'Doe',
      });
      prismaMock.employee.update.mockResolvedValue({} as any);

      const dto = {
        accountNumber: '0123456789',
      };

      await service.updateProfile(mockUser, dto);

      expect(prismaMock.employee.update).toHaveBeenCalledWith({
        where: { id: 'emp-100' },
        data: {
          accountNumber: '0123456789',
          bankAccountLast4: '6789',
        },
      });

      expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-123',
          actorUserId: mockUser.id,
          action: 'PROFILE_UPDATED',
          employeeId: 'emp-100',
        }),
      });
    });
  });

  describe('getCompensationHistory', () => {
    it('should return compensation history for current employee', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.compensationRecord.findMany.mockResolvedValue([
        { id: 'cr-1', employeeId: 'emp-100', baseSalary: 500000 },
      ]);
      prismaMock.compensationHistory.findMany.mockResolvedValue([
        {
          id: 'ch-1',
          employeeId: 'emp-100',
          previousSalary: 400000,
          newSalary: 500000,
        },
      ]);

      const result = await service.getCompensationHistory(mockUser);

      expect(result.records).toHaveLength(1);
      expect(result.history).toHaveLength(1);
    });
  });

  describe('getNotifications', () => {
    it('should return user notifications', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.auditEvent.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          subjectEmployeeId: 'emp-100',
          action: 'LEAVE_APPROVED',
        },
      ]);

      const result = await service.getNotifications(mockUser);

      expect(result.notifications).toHaveLength(1);
    });
  });

  describe('getDocuments', () => {
    it('should return documents for current employee', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.document.findMany.mockResolvedValue([
        { id: 'doc-1', employeeId: 'emp-100', title: 'Passport' },
      ]);

      const result = await service.getDocuments(mockUser);

      expect(result.documents).toHaveLength(1);
    });
  });

  describe('getActivity', () => {
    it('should return user activity logs', async () => {
      prismaMock.employee.findFirst.mockResolvedValue({
        id: 'emp-100',
        organizationId: 'org-123',
      });
      prismaMock.auditEvent.findMany.mockResolvedValue([
        { id: 'audit-1', subjectId: 'emp-100', action: 'LOGIN' },
      ]);

      const result = await service.getActivity(mockUser);

      expect(result.activity).toHaveLength(1);
    });
  });
});
