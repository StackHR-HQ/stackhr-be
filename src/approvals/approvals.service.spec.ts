import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalsService } from './approvals.service';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let prismaMock: {
    approvalRequest: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
    };
    employee: {
      findMany: jest.Mock;
    };
    leaveRequest: {
      findMany: jest.Mock;
    };
    expense: {
      findMany: jest.Mock;
    };
    reimbursement: {
      findMany: jest.Mock;
    };
    salaryAdvance: {
      findMany: jest.Mock;
    };
    payrollRun: {
      findMany: jest.Mock;
    };
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-123',
  };

  const mockEmployeeUser: AuthenticatedUser = {
    id: 'user-employee-1',
    name: 'Employee User',
    email: 'emp@acme.com',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.EMPLOYEE,
    organizationId: 'org-123',
  };

  let eventEmitterMock: { emit: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      approvalRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reimbursement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryAdvance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      payrollRun: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
      ],
    }).compile();

    service = module.get<ApprovalsService>(ApprovalsService);
  });

  describe('submitRequest', () => {
    it('should create a pending approval request', async () => {
      const mockCreated = {
        id: 'appr-1',
        organizationId: 'org-123',
        type: 'LEAVE',
        subjectTable: 'leave_request',
        subjectId: 'leave-123',
        requesterId: 'user-employee-1',
        status: 'PENDING',
        stage: 1,
      };
      prismaMock.approvalRequest.create.mockResolvedValue(mockCreated);

      const result = await service.submitRequest(mockEmployeeUser, {
        type: 'LEAVE',
        subjectTable: 'leave_request',
        subjectId: 'leave-123',
        amountSnapshot: 5,
      });

      expect(prismaMock.approvalRequest.create).toHaveBeenCalledTimes(1);
      expect(result.approvalRequest).toEqual(mockCreated);
    });

    it('should throw BadRequestException if organization context is missing', async () => {
      const noOrgUser = { ...mockEmployeeUser, organizationId: null };
      await expect(
        service.submitRequest(noOrgUser, {
          type: 'LEAVE',
          subjectTable: 'leave_request',
          subjectId: 'leave-123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listRequests', () => {
    it('should list paginated requests for admin with enriched requester, approver, and subject details', async () => {
      prismaMock.approvalRequest.findMany.mockResolvedValue([
        {
          id: 'appr-1',
          type: 'LEAVE',
          subjectTable: 'leave_request',
          subjectId: 'leave-100',
          requesterId: 'user-employee-1',
          approverId: 'user-admin-1',
          amountSnapshot: 3,
        },
      ]);
      prismaMock.approvalRequest.count.mockResolvedValue(1);

      prismaMock.user.findMany.mockResolvedValue([
        { id: 'user-employee-1', name: 'Employee User', email: 'emp@acme.com' },
        { id: 'user-admin-1', name: 'Admin User', email: 'admin@acme.com' },
      ]);
      prismaMock.employee.findMany.mockResolvedValue([
        { userId: 'user-employee-1', fullName: 'Jane Doe' },
      ]);
      prismaMock.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-100',
          leaveType: { name: 'Annual Leave' },
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-03'),
          totalDays: 3,
          reason: 'Vacation',
        },
      ]);

      const result = await service.listRequests(mockAdminUser, {
        page: 1,
        limit: 10,
      });

      expect(result.items.length).toBe(1);
      expect(result.meta.total).toBe(1);
      const item = result.items[0];
      expect(item.requester).toEqual({
        id: 'user-employee-1',
        fullName: 'Jane Doe',
      });
      expect(item.approver).toEqual({
        id: 'user-admin-1',
        fullName: 'Admin User',
      });
      expect(item.unit).toBe('DAYS');
      expect(item.currency).toBeNull();
      expect(item.subjectSummary).toEqual({
        leaveType: 'Annual Leave',
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        totalDays: 3,
        reason: 'Vacation',
      });
      expect(prismaMock.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-123' }),
        }),
      );
    });

    it('should restrict employee role to their own requested items', async () => {
      prismaMock.approvalRequest.findMany.mockResolvedValue([]);
      prismaMock.approvalRequest.count.mockResolvedValue(0);

      await service.listRequests(mockEmployeeUser, {});

      expect(prismaMock.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-123',
            requesterId: 'user-employee-1',
          }),
        }),
      );
    });
  });

  describe('decideRequest', () => {
    it('should allow manager/admin to approve a request', async () => {
      const mockPending = {
        id: 'appr-1',
        organizationId: 'org-123',
        requesterId: 'user-employee-1', // different from admin
        status: 'PENDING',
      };
      prismaMock.approvalRequest.findFirst.mockResolvedValue(mockPending);
      prismaMock.approvalRequest.update.mockResolvedValue({
        ...mockPending,
        status: 'APPROVED',
        approverId: 'user-admin-1',
      });

      const result = await service.decideRequest(mockAdminUser, 'appr-1', {
        status: 'APPROVED',
      });

      expect(result.approvalRequest.status).toBe('APPROVED');
      expect(prismaMock.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
            approverId: 'user-admin-1',
          }),
        }),
      );
    });

    it('should forbid requester from approving their own request (maker-checker)', async () => {
      const mockPending = {
        id: 'appr-1',
        organizationId: 'org-123',
        requesterId: 'user-admin-1', // same as caller
        status: 'PENDING',
      };
      prismaMock.approvalRequest.findFirst.mockResolvedValue(mockPending);

      await expect(
        service.decideRequest(mockAdminUser, 'appr-1', {
          status: 'APPROVED',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is already decided', async () => {
      const mockDecided = {
        id: 'appr-1',
        organizationId: 'org-123',
        requesterId: 'user-employee-1',
        status: 'APPROVED',
      };
      prismaMock.approvalRequest.findFirst.mockResolvedValue(mockDecided);

      await expect(
        service.decideRequest(mockAdminUser, 'appr-1', {
          status: 'REJECTED',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelRequest', () => {
    it('should allow requester to cancel pending request', async () => {
      const mockPending = {
        id: 'appr-1',
        organizationId: 'org-123',
        requesterId: 'user-employee-1',
        status: 'PENDING',
      };
      prismaMock.approvalRequest.findFirst.mockResolvedValue(mockPending);
      prismaMock.approvalRequest.update.mockResolvedValue({
        ...mockPending,
        status: 'CANCELLED',
      });

      const result = await service.cancelRequest(mockEmployeeUser, 'appr-1');

      expect(result.approvalRequest.status).toBe('CANCELLED');
    });

    it('should forbid non-requester from cancelling request', async () => {
      const mockPending = {
        id: 'appr-1',
        organizationId: 'org-123',
        requesterId: 'other-user',
        status: 'PENDING',
      };
      prismaMock.approvalRequest.findFirst.mockResolvedValue(mockPending);

      await expect(
        service.cancelRequest(mockEmployeeUser, 'appr-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getChainConfig', () => {
    it('should return seeded single-stage approval config for organization', async () => {
      (prismaMock as any).organization = {
        findUnique: jest.fn().mockResolvedValue({
          metadata: JSON.stringify({
            approvalConfig: { defaultStages: 1, types: ['LEAVE', 'EXPENSE'] },
          }),
        }),
      };

      const result = await service.getChainConfig(mockAdminUser);

      expect(result.approvalConfig.defaultStages).toBe(1);
      expect(result.approvalConfig.types).toContain('LEAVE');
    });
  });
});
