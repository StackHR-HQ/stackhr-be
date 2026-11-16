import { Test, TestingModule } from '@nestjs/testing';
import { PayrollListener } from './payroll.listener';
import { PrismaService } from '../database/prisma.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';
import { EntitlementsService } from '../billing/entitlements.service';
import { PlanUpgradeRequiredException } from '../billing/plan-upgrade-required.exception';

describe('PayrollListener', () => {
  let listener: PayrollListener;
  let prisma: any;
  let entitlements: { assertFeature: jest.Mock };

  beforeEach(async () => {
    entitlements = { assertFeature: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      payrollRun: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payslip: {
        createMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((promises: any[]) => Promise.all(promises)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollListener,
        { provide: PrismaService, useValue: prisma },
        { provide: EntitlementsService, useValue: entitlements },
      ],
    }).compile();

    listener = module.get<PayrollListener>(PayrollListener);
  });

  it('generates no payslips and leaves the run unapproved when the plan excludes payroll', async () => {
    entitlements.assertFeature.mockRejectedValue(
      new PlanUpgradeRequiredException('Payroll is not included', {
        feature: 'payroll',
        currentPlan: 'FREE',
        requiredPlan: 'STARTER',
      }),
    );
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-100',
      organizationId: 'org-1',
      title: 'September payroll',
      status: 'PENDING_APPROVAL',
      items: [{ employeeId: 'emp-1', grossSalary: 100, netSalary: 90 }],
    });

    await listener.handleApprovalDecided({
      approvalRequestId: 'app-pay-1',
      organizationId: 'org-1',
      type: 'PAYROLL',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'payroll_run',
      subjectId: 'run-100',
      status: 'APPROVED',
      rejectionReason: null,
    });

    expect(entitlements.assertFeature).toHaveBeenCalledWith('org-1', 'payroll');
    expect(prisma.payslip.createMany).not.toHaveBeenCalled();
    expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        action: 'payroll_run.blocked_by_plan',
        targetId: 'run-100',
      }),
    });
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
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'payroll_run.rejected',
        }),
      }),
    );
  });

  it('should skip processing if payroll run is already APPROVED', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-pay-3',
      organizationId: 'org-1',
      type: 'PAYROLL',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'payroll_run',
      subjectId: 'run-300',
      status: 'APPROVED',
      rejectionReason: null,
    };

    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-300',
      status: 'APPROVED',
      items: [],
    });

    await listener.handleApprovalDecided(event);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payslip.createMany).not.toHaveBeenCalled();
  });

  it('should skip processing if payslips already exist for the payroll run', async () => {
    const event: ApprovalDecidedEvent = {
      approvalRequestId: 'app-pay-4',
      organizationId: 'org-1',
      type: 'PAYROLL',
      requesterId: 'user-1',
      approverId: 'user-2',
      subjectTable: 'payroll_run',
      subjectId: 'run-400',
      status: 'APPROVED',
      rejectionReason: null,
    };

    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run-400',
      status: 'PENDING_APPROVAL',
      items: [{ employeeId: 'emp-1' }],
    });
    prisma.payslip.count.mockResolvedValue(1);

    await listener.handleApprovalDecided(event);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payslip.createMany).not.toHaveBeenCalled();
  });
});
