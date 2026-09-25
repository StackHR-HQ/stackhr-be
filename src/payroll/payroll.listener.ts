import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  APPROVAL_EVENTS,
  ApprovalDecidedEvent,
} from '../approvals/events/approval-decided.event';

@Injectable()
export class PayrollListener {
  private readonly logger = new Logger(PayrollListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(APPROVAL_EVENTS.DECIDED)
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.type !== 'PAYROLL' && event.subjectTable !== 'payroll_run') {
      return;
    }

    const runId = event.subjectId;
    if (!runId) {
      this.logger.warn(
        `Approval decided event ${event.approvalRequestId} missing subjectId`,
      );
      return;
    }

    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { items: true },
    });

    if (!run) {
      this.logger.warn(`Payroll run ${runId} not found`);
      return;
    }

    if (event.status === 'APPROVED') {
      const now = new Date();
      const payslipsData = run.items.map((item: any) => ({
        id: randomUUID(),
        organizationId: run.organizationId,
        payrollRunId: run.id,
        employeeId: item.employeeId,
        periodMonth: run.periodMonth,
        periodYear: run.periodYear,
        grossSalary: item.grossSalary,
        netSalary: item.netSalary,
        breakdownJson: JSON.stringify({
          basicSalary: item.basicSalary,
          housingAllowance: item.housingAllowance,
          transportAllowance: item.transportAllowance,
          otherAllowances: item.otherAllowances,
          grossSalary: item.grossSalary,
          taxDeduction: item.taxDeduction,
          pensionDeduction: item.pensionDeduction,
          otherDeductions: item.otherDeductions,
          netSalary: item.netSalary,
        }),
        generatedAt: now,
      }));

      await this.prisma.$transaction([
        this.prisma.payrollRun.update({
          where: { id: runId },
          data: { status: 'APPROVED', approvedAt: now },
        }),
        this.prisma.payslip.createMany({
          data: payslipsData,
        }),
      ]);

      this.logger.log(
        `Approved payroll run ${runId}. Generated ${payslipsData.length} payslips.`,
      );
    } else if (event.status === 'REJECTED') {
      await this.prisma.payrollRun.update({
        where: { id: runId },
        data: { status: 'REJECTED' },
      });

      this.logger.log(`Payroll run ${runId} marked as rejected.`);
    }
  }
}
