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
      event.type !== 'REIMBURSEMENT' &&
      event.type !== 'SALARY_ADVANCE' &&
      event.subjectTable !== 'expense' &&
      event.subjectTable !== 'reimbursement' &&
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

    if (
      event.subjectTable === 'reimbursement' ||
      event.type === 'REIMBURSEMENT'
    ) {
      await this.handleReimbursementApproval(event, subjectId);
    } else if (event.subjectTable === 'expense' || event.type === 'EXPENSE') {
      await this.handleExpenseApproval(event, subjectId);
    } else if (
      event.subjectTable === 'salary_advance' ||
      event.type === 'SALARY_ADVANCE'
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

    if (expense.status === 'APPROVED' || expense.status === 'REJECTED') {
      this.logger.warn(
        `Expense claim ${expenseId} already has terminal status "${expense.status}". Skipping duplicate processing.`,
      );
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
            description: expense.description,
            status: 'APPROVED',
          },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'EXPENSE_APPROVED',
            targetType: 'expense',
            targetId: expenseId,
            employeeId: expense.employeeId,
            description: `Expense claim for ${expense.currency} ${expense.amount} was approved`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(
        `Expense claim ${expenseId} approved. Generated approved reimbursement ready for payout.`,
      );
    } else if (event.status === 'REJECTED') {
      await this.prisma.$transaction([
        this.prisma.expense.update({
          where: { id: expenseId },
          data: { status: 'REJECTED' },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'EXPENSE_REJECTED',
            targetType: 'expense',
            targetId: expenseId,
            employeeId: expense.employeeId,
            description: `Expense claim for ${expense.currency} ${expense.amount} was rejected`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`Expense claim ${expenseId} marked as rejected.`);
    }
  }

  private async handleReimbursementApproval(
    event: ApprovalDecidedEvent,
    reimbursementId: string,
  ): Promise<void> {
    const reimbursement = await this.prisma.reimbursement.findUnique({
      where: { id: reimbursementId },
    });

    if (!reimbursement) {
      this.logger.warn(`Reimbursement claim ${reimbursementId} not found`);
      return;
    }

    if (
      reimbursement.status === 'APPROVED' ||
      reimbursement.status === 'REJECTED' ||
      reimbursement.status === 'PAID'
    ) {
      this.logger.warn(
        `Reimbursement claim ${reimbursementId} already has status "${reimbursement.status}". Skipping duplicate processing.`,
      );
      return;
    }

    if (event.status === 'APPROVED') {
      await this.prisma.$transaction([
        this.prisma.reimbursement.update({
          where: { id: reimbursementId },
          data: { status: 'APPROVED' },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'REIMBURSEMENT_APPROVED',
            targetType: 'reimbursement',
            targetId: reimbursementId,
            employeeId: reimbursement.employeeId,
            description: `Reimbursement claim for ${reimbursement.currency} ${reimbursement.amount} was approved`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`Reimbursement claim ${reimbursementId} approved.`);
    } else if (event.status === 'REJECTED') {
      await this.prisma.$transaction([
        this.prisma.reimbursement.update({
          where: { id: reimbursementId },
          data: { status: 'REJECTED' },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'REIMBURSEMENT_REJECTED',
            targetType: 'reimbursement',
            targetId: reimbursementId,
            employeeId: reimbursement.employeeId,
            description: `Reimbursement claim for ${reimbursement.currency} ${reimbursement.amount} was rejected`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(
        `Reimbursement claim ${reimbursementId} marked as rejected.`,
      );
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

    if (advance.status === 'APPROVED' || advance.status === 'REJECTED') {
      this.logger.warn(
        `Salary advance ${advanceId} already has terminal status "${advance.status}". Skipping duplicate processing.`,
      );
      return;
    }

    if (event.status === 'APPROVED') {
      await this.prisma.$transaction([
        this.prisma.salaryAdvance.update({
          where: { id: advanceId },
          data: { status: 'APPROVED' },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'SALARY_ADVANCE_APPROVED',
            targetType: 'salary_advance',
            targetId: advanceId,
            employeeId: advance.employeeId,
            description: `Salary advance of ${advance.amount} was approved`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`Salary advance ${advanceId} approved.`);
    } else if (event.status === 'REJECTED') {
      await this.prisma.$transaction([
        this.prisma.salaryAdvance.update({
          where: { id: advanceId },
          data: { status: 'REJECTED' },
        }),
        this.prisma.auditEvent.create({
          data: {
            organizationId: event.organizationId,
            actorUserId: event.approverId,
            action: 'SALARY_ADVANCE_REJECTED',
            targetType: 'salary_advance',
            targetId: advanceId,
            employeeId: advance.employeeId,
            description: `Salary advance of ${advance.amount} was rejected`,
            createdAt: new Date(),
          },
        }),
      ]);

      this.logger.log(`Salary advance ${advanceId} marked as rejected.`);
    }
  }
}
