import { Test, TestingModule } from '@nestjs/testing';
import { SpendListener } from './spend.listener';
import { PrismaService } from '../database/prisma.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

describe('SpendListener', () => {
  let listener: SpendListener;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      expense: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      salaryAdvance: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      reimbursement: {
        create: jest.fn(),
      },
      $transaction: jest.fn((promises: any[]) => Promise.all(promises)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SpendListener, { provide: PrismaService, useValue: prisma }],
    }).compile();

    listener = module.get<SpendListener>(SpendListener);
  });

  it('should ignore non-spend approval events', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-1',
      organizationId: 'org-1',
      type: 'LEAVE',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'leave_request',
      subjectId: 'leave-1',
      status: 'APPROVED',
      rejectionReason: null,
    };

    await listener.handleApprovalDecided(event);
    expect(prisma.expense.findUnique).not.toHaveBeenCalled();
  });

  it('should update expense status to APPROVED and create reimbursement', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-exp-1',
      organizationId: 'org-1',
      type: 'EXPENSE',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'expense',
      subjectId: 'exp-123',
      status: 'APPROVED',
      rejectionReason: null,
    };

    prisma.expense.findUnique.mockResolvedValue({
      id: 'exp-123',
      organizationId: 'org-1',
      employeeId: 'emp-1',
      amount: 15000,
      currency: 'NGN',
      status: 'PENDING',
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.expense.update).toHaveBeenCalledWith({
      where: { id: 'exp-123' },
      data: { status: 'APPROVED' },
    });
    expect(prisma.reimbursement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          employeeId: 'emp-1',
          expenseId: 'exp-123',
          amount: 15000,
          currency: 'NGN',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('should update expense status to REJECTED when approval is rejected', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-exp-2',
      organizationId: 'org-1',
      type: 'EXPENSE',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'expense',
      subjectId: 'exp-456',
      status: 'REJECTED',
      rejectionReason: 'Invalid receipt',
    };

    prisma.expense.findUnique.mockResolvedValue({
      id: 'exp-456',
      organizationId: 'org-1',
      employeeId: 'emp-1',
      amount: 5000,
      currency: 'NGN',
      status: 'PENDING',
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.expense.update).toHaveBeenCalledWith({
      where: { id: 'exp-456' },
      data: { status: 'REJECTED' },
    });
    expect(prisma.reimbursement.create).not.toHaveBeenCalled();
  });

  it('should update salary advance status to APPROVED on approval', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-adv-1',
      organizationId: 'org-1',
      type: 'SALARY_ADVANCE',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'salary_advance',
      subjectId: 'adv-123',
      status: 'APPROVED',
      rejectionReason: null,
    };

    prisma.salaryAdvance.findUnique.mockResolvedValue({
      id: 'adv-123',
      organizationId: 'org-1',
      employeeId: 'emp-1',
      amount: 50000,
      status: 'PENDING',
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.salaryAdvance.update).toHaveBeenCalledWith({
      where: { id: 'adv-123' },
      data: { status: 'APPROVED' },
    });
  });
});
