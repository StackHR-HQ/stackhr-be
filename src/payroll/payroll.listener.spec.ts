import { Test, TestingModule } from '@nestjs/testing';
import { PayrollListener } from './payroll.listener';
import { PrismaService } from '../database/prisma.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

describe('PayrollListener', () => {
  let listener: PayrollListener;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslip: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn((promises: any[]) => Promise.all(promises)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollListener,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get<PayrollListener>(PayrollListener);
  });

  it('should ignore non-payroll approval events', async () => {
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
    expect(prisma.payrollRun.findUnique).not.toHaveBeenCalled();
  });

  it('should update run status to APPROVED and generate payslips on approval', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-pay-1',
      organizationId: 'org-1',
      type: 'PAYROLL',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'payroll_run',
      subjectId: 'run-100',
      status: 'APPROVED',
      rejectionReason: null,
    };

    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-100',
      organizationId: 'org-1',
      periodMonth: 9,
      periodYear: 2026,
      items: [
        {
          employeeId: 'emp-1',
          basicSalary: 300000,
          housingAllowance: 100000,
          transportAllowance: 50000,
          otherAllowances: 0,
          grossSalary: 450000,
          taxDeduction: 0,
          pensionDeduction: 36000,
          otherDeductions: 0,
          netSalary: 414000,
        },
      ],
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.payrollRun.update).toHaveBeenCalledWith({
      where: { id: 'run-100' },
      data: { status: 'APPROVED', approvedAt: expect.any(Date) },
    });
    expect(prisma.payslip.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          organizationId: 'org-1',
          payrollRunId: 'run-100',
          employeeId: 'emp-1',
          periodMonth: 9,
          periodYear: 2026,
          grossSalary: 450000,
          netSalary: 414000,
        }),
      ]),
    });
  });

  it('should update run status to REJECTED when approval is rejected', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-pay-2',
      organizationId: 'org-1',
      type: 'PAYROLL',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'payroll_run',
      subjectId: 'run-200',
      status: 'REJECTED',
      rejectionReason: 'Invalid totals',
    };

    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-200',
      items: [],
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.payrollRun.update).toHaveBeenCalledWith({
      where: { id: 'run-200' },
      data: { status: 'REJECTED' },
    });
    expect(prisma.payslip.createMany).not.toHaveBeenCalled();
  });
});
