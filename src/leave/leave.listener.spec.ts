import { Test, TestingModule } from '@nestjs/testing';
import { LeaveListener } from './leave.listener';
import { PrismaService } from '../database/prisma.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

describe('LeaveListener', () => {
  let listener: LeaveListener;
  let prismaMock: {
    leaveRequest: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    leaveBalance: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      leaveRequest: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      leaveBalance: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveListener,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    listener = module.get<LeaveListener>(LeaveListener);
  });

  it('should update leave request and deduct balance when approved', async () => {
    const mockRequest = {
      id: 'lr-1',
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      totalDays: 5,
    };
    const mockBalance = {
      id: 'lb-1',
      allocatedDays: 20,
      usedDays: 0,
      pendingDays: 5,
      remainingDays: 15,
    };

    prismaMock.leaveRequest.findUnique.mockResolvedValue(mockRequest);
    prismaMock.leaveBalance.findFirst.mockResolvedValue(mockBalance);

    const event = new ApprovalDecidedEvent(
      'appr-1',
      'org-123',
      'LEAVE',
      'user-1',
      'admin-1',
      'APPROVED',
      null,
      'leave_request',
      'lr-1',
    );

    await listener.handleApprovalDecided(event);

    expect(prismaMock.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: 'lr-1' },
      data: { status: 'APPROVED' },
    });
    expect(prismaMock.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: 'lb-1' },
      data: {
        pendingDays: 0,
        usedDays: 5,
        remainingDays: 15,
      },
    });
  });

  it('should release pending days back to remaining balance when rejected', async () => {
    const mockRequest = {
      id: 'lr-1',
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      totalDays: 5,
    };
    const mockBalance = {
      id: 'lb-1',
      allocatedDays: 20,
      usedDays: 0,
      pendingDays: 5,
      remainingDays: 15,
    };

    prismaMock.leaveRequest.findUnique.mockResolvedValue(mockRequest);
    prismaMock.leaveBalance.findFirst.mockResolvedValue(mockBalance);

    const event = new ApprovalDecidedEvent(
      'appr-1',
      'org-123',
      'LEAVE',
      'user-1',
      'admin-1',
      'REJECTED',
      'Work deadline conflict',
      'leave_request',
      'lr-1',
    );

    await listener.handleApprovalDecided(event);

    expect(prismaMock.leaveRequest.update).toHaveBeenCalledWith({
      where: { id: 'lr-1' },
      data: { status: 'REJECTED' },
    });
    expect(prismaMock.leaveBalance.update).toHaveBeenCalledWith({
      where: { id: 'lb-1' },
      data: {
        pendingDays: 0,
        remainingDays: 20,
      },
    });
  });
});
