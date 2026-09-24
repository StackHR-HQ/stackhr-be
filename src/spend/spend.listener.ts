import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  APPROVAL_EVENTS,
  ApprovalDecidedEvent,
} from '../approvals/events/approval-decided.event';

@Injectable()
export class SpendListener {
  private readonly logger = new Logger(SpendListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(APPROVAL_EVENTS.DECIDED)
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (
      event.type !== 'EXPENSE' &&
      event.type !== 'SALARY_ADVANCE' &&
      event.subjectTable !== 'expense' &&
      event.subjectTable !== 'salary_advance'
    ) {
      return;
    }

    const subjectId = event.subjectId;
    if (!subjectId) {
      this.logger.warn(
        `Approval decided event ${event.approvalRequestId} missing subjectId`,
      );
      return;
    }

    if (event.type === 'EXPENSE' || event.subjectTable === 'expense') {
      await this.handleExpenseApproval(event, subjectId);
    } else if (
      event.type === 'SALARY_ADVANCE' ||
      event.subjectTable === 'salary_advance'
    ) {
      await this.handleSalaryAdvanceApproval(event, subjectId);
    }
  }

  private async handleExpenseApproval(
    event: ApprovalDecidedEvent,
    expenseId: string,
  ): Promise<void> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) {
      this.logger.warn(`Expense claim ${expenseId} not found`);
      return;
    }

    if (event.status === 'APPROVED') {
      await this.prisma.$transaction([
        this.prisma.expense.update({
          where: { id: expenseId },
          data: { status: 'APPROVED' },
        }),
        this.prisma.reimbursement.create({
          data: {
            id: randomUUID(),
            organizationId: expense.organizationId,
            employeeId: expense.employeeId,
            expenseId: expense.id,
            amount: expense.amount,
            currency: expense.currency,
            status: 'PENDING',
          },
        }),
      ]);

      this.logger.log(
        `Expense claim ${expenseId} approved. Generated pending reimbursement.`,
      );
    } else if (event.status === 'REJECTED') {
      await this.prisma.expense.update({
        where: { id: expenseId },
        data: { status: 'REJECTED' },
      });

      this.logger.log(`Expense claim ${expenseId} marked as rejected.`);
    }
  }

  private async handleSalaryAdvanceApproval(
    event: ApprovalDecidedEvent,
    advanceId: string,
  ): Promise<void> {
    const advance = await this.prisma.salaryAdvance.findUnique({
      where: { id: advanceId },
    });

    if (!advance) {
      this.logger.warn(`Salary advance ${advanceId} not found`);
      return;
    }

    if (event.status === 'APPROVED') {
      await this.prisma.salaryAdvance.update({
        where: { id: advanceId },
        data: { status: 'APPROVED' },
      });

      this.logger.log(`Salary advance ${advanceId} approved.`);
    } else if (event.status === 'REJECTED') {
      await this.prisma.salaryAdvance.update({
        where: { id: advanceId },
        data: { status: 'REJECTED' },
      });

      this.logger.log(`Salary advance ${advanceId} marked as rejected.`);
    }
  }
}
