import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeaveService } from './leave.service';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('LeaveService', () => {
  let service: LeaveService;
  let prismaMock: {
    leaveType: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    leaveBalance: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    leaveRequest: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    approvalRequest: {
      updateMany: jest.Mock;
    };
    employee: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let approvalsServiceMock: {
    submitRequest: jest.Mock;
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin Owner',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  beforeEach(async () => {
    prismaMock = {
      leaveType: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      leaveBalance: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      leaveRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      approvalRequest: {
        updateMany: jest.fn(),
      },
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((promises: any[]) => Promise.all(promises)),
    };

    approvalsServiceMock = {
      submitRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveService,
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

    service = module.get<LeaveService>(LeaveService);
  });

  describe('createLeaveType', () => {
    it('should create a leave type and initialize balance for active employees', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue(null);
      prismaMock.leaveType.create.mockResolvedValue({
        id: 'lt-1',
        name: 'Annual Leave',
        daysPerYear: 20,
      });
      prismaMock.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
      prismaMock.leaveBalance.create.mockResolvedValue({});

      const result = await service.createLeaveType(mockAdminUser, {
        name: 'Annual Leave',
        daysPerYear: 20,
      });

      expect(result.leaveType.name).toBe('Annual Leave');
      expect(prismaMock.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allocatedDays: 20,
            remainingDays: 20,
          }),
        }),
      );
    });

    it('should throw ConflictException if leave type name exists', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue({ id: 'lt-existing' });

      await expect(
        service.createLeaveType(mockAdminUser, {
          name: 'Annual Leave',
          daysPerYear: 20,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submitLeaveRequest', () => {
    it('should submit leave request and route through Approvals Engine', async () => {
      const mockEmployee = { id: 'emp-1', email: 'admin@acme.com' };
      const mockLeaveType = {
        id: 'lt-1',
        name: 'Annual Leave',
        daysPerYear: 20,
        requiresApproval: true,
      };
      const mockBalance = {
        id: 'lb-1',
        allocatedDays: 20,
        usedDays: 0,
        pendingDays: 0,
        remainingDays: 20,
      };

      prismaMock.employee.findFirst.mockResolvedValue(mockEmployee);
      prismaMock.leaveType.findFirst.mockResolvedValue(mockLeaveType);
      prismaMock.leaveBalance.findFirst.mockResolvedValue(mockBalance);
      prismaMock.leaveRequest.create.mockResolvedValue({
        id: 'lr-1',
        status: 'PENDING',
        totalDays: 5,
      });
      prismaMock.leaveBalance.update.mockResolvedValue({
        ...mockBalance,
        pendingDays: 5,
        remainingDays: 15,
      });
      approvalsServiceMock.submitRequest.mockResolvedValue({
        approvalRequest: { id: 'appr-1', status: 'PENDING' },
      });

      const result = await service.submitLeaveRequest(mockAdminUser, {
        leaveTypeId: 'lt-1',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        reason: 'Vacation',
      });

      expect(result.message).toContain('routed for approval');
      expect(result.approvalRequest?.id).toBe('appr-1');
      expect(approvalsServiceMock.submitRequest).toHaveBeenCalledWith(
        mockAdminUser,
        expect.objectContaining({
          type: 'LEAVE',
          subjectTable: 'leave_request',
          subjectId: 'lr-1',
        }),
      );
    });

    it('should throw BadRequestException if remaining leave balance is insufficient', async () => {
      const mockEmployee = { id: 'emp-1', email: 'admin@acme.com' };
      const mockLeaveType = {
        id: 'lt-1',
        name: 'Annual Leave',
        daysPerYear: 20,
      };
      const mockBalance = {
        id: 'lb-1',
        allocatedDays: 20,
        usedDays: 18,
        pendingDays: 0,
        remainingDays: 2,
      };

      prismaMock.employee.findFirst.mockResolvedValue(mockEmployee);
      prismaMock.leaveType.findFirst.mockResolvedValue(mockLeaveType);
      prismaMock.leaveBalance.findFirst.mockResolvedValue(mockBalance);

      await expect(
        service.submitLeaveRequest(mockAdminUser, {
          leaveTypeId: 'lt-1',
          startDate: '2026-10-01',
          endDate: '2026-10-05',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getLeaveHistory', () => {
    it('should return paginated leave history data and metadata', async () => {
      const mockHistory = [{ id: 'lr-1', status: 'APPROVED', totalDays: 3 }];
      prismaMock.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
      prismaMock.leaveRequest.findMany.mockResolvedValue(mockHistory);
      prismaMock.leaveRequest.count.mockResolvedValue(1);

      const result = await service.getLeaveHistory(mockAdminUser, {
        page: 1,
        limit: 10,
        status: 'APPROVED',
      });

      expect(result.data).toEqual(mockHistory);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('getLeaveRequestDetails', () => {
    it('should return details for single leave request', async () => {
      const mockReq = { id: 'lr-1', status: 'APPROVED', totalDays: 3 };
      prismaMock.leaveRequest.findFirst.mockResolvedValue(mockReq);

      const result = await service.getLeaveRequestDetails(
        mockAdminUser,
        'lr-1',
      );

      expect(result.leaveRequest).toEqual(mockReq);
    });

    it('should throw NotFoundException if leave request not found', async () => {
      prismaMock.leaveRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.getLeaveRequestDetails(mockAdminUser, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLeaveType', () => {
    it('should update leave type fields', async () => {
      prismaMock.leaveType.findFirst
        .mockResolvedValueOnce({
          id: 'lt-1',
          name: 'Old Name',
          organizationId: 'org-123',
        })
        .mockResolvedValueOnce(null); // name conflict check
      prismaMock.leaveType.update.mockResolvedValue({
        id: 'lt-1',
        name: 'New Name',
      });

      const result = await service.updateLeaveType(mockAdminUser, 'lt-1', {
        name: 'New Name',
      });
      expect(result.leaveType.name).toBe('New Name');
    });

    it('should throw NotFoundException if leave type does not exist', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue(null);
      await expect(
        service.updateLeaveType(mockAdminUser, 'invalid-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelLeaveRequest', () => {
    it('should cancel a pending leave request and reduce pendingDays', async () => {
      const mockReq = {
        id: 'lr-1',
        organizationId: 'org-123',
        status: 'PENDING',
        totalDays: 5,
        employeeId: 'emp-1',
        leaveTypeId: 'lt-1',
      };
      const mockBal = {
        id: 'lb-1',
        pendingDays: 5,
        allocatedDays: 20,
        usedDays: 0,
        remainingDays: 20,
      };

      prismaMock.leaveRequest.findFirst.mockResolvedValue(mockReq);
      prismaMock.leaveBalance.findFirst.mockResolvedValue(mockBal);
      prismaMock.leaveBalance.update.mockResolvedValue({} as any);
      prismaMock.approvalRequest.updateMany.mockResolvedValue({
        count: 1,
      } as any);
      prismaMock.leaveRequest.update.mockResolvedValue({
        ...mockReq,
        status: 'CANCELLED',
      });

      const result = await service.cancelLeaveRequest(mockAdminUser, 'lr-1');

      expect(result.leaveRequest.status).toBe('CANCELLED');
      expect(prismaMock.leaveBalance.update).toHaveBeenCalledWith({
        where: { id: 'lb-1' },
        data: { pendingDays: 0 },
      });
    });

    it('should throw BadRequestException if request is already cancelled', async () => {
      prismaMock.leaveRequest.findFirst.mockResolvedValue({
        id: 'lr-1',
        status: 'CANCELLED',
      });
      await expect(
        service.cancelLeaveRequest(mockAdminUser, 'lr-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteLeaveType', () => {
    it('should successfully delete leave type and associated balances when no requests exist', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue({
        id: 'lt-1',
        name: 'Sick Leave',
        organizationId: 'org-123',
        _count: { leaveRequests: 0 },
      });
      prismaMock.leaveBalance.deleteMany.mockResolvedValue({ count: 5 });
      prismaMock.leaveType.delete.mockResolvedValue({ id: 'lt-1' });

      const result = await service.deleteLeaveType(mockAdminUser, 'lt-1');
      expect(result.message).toContain('was successfully deleted');
      expect(prismaMock.leaveBalance.deleteMany).toHaveBeenCalledWith({
        where: { leaveTypeId: 'lt-1', organizationId: 'org-123' },
      });
      expect(prismaMock.leaveType.delete).toHaveBeenCalledWith({
        where: { id: 'lt-1' },
      });
    });

    it('should throw BadRequestException if leave requests are associated with the leave type', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue({
        id: 'lt-1',
        name: 'Sick Leave',
        organizationId: 'org-123',
        _count: { leaveRequests: 2 },
      });

      await expect(
        service.deleteLeaveType(mockAdminUser, 'lt-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if leave type not found', async () => {
      prismaMock.leaveType.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteLeaveType(mockAdminUser, 'lt-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
