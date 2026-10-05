import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { AttachReceiptDto } from './dto/attach-receipt.dto';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';

@Injectable()
export class SpendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  private async getEmployeeForUser(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });
    if (!employee) {
      throw new NotFoundException(
        'An active employee record associated with your account was not found',
      );
    }
    return employee;
  }

  async submitExpense(user: AuthenticatedUser, dto: CreateExpenseDto) {
    const orgId = this.checkOrgContext(user);
    const employee = await this.getEmployeeForUser(user);

    const expense = await this.prisma.expense.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        employeeId: employee.id,
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency ?? 'NGN',
        description: dto.description ?? null,
        receiptUrl: dto.receiptUrl ?? null,
        status: 'PENDING',
      },
    });

    // Route through generic Approvals Engine (ADR-003)
    const approvalResult = await this.approvalsService.submitRequest(user, {
      type: 'EXPENSE',
      subjectTable: 'expense',
      subjectId: expense.id,
      amountSnapshot: dto.amount,
    });

    return {
      message: 'Expense submission recorded and routed for approval',
      expense,
      approvalRequest: approvalResult.approvalRequest,
    };
  }

  async attachReceipt(
    user: AuthenticatedUser,
    expenseId: string,
    dto: AttachReceiptDto,
  ) {
    const orgId = this.checkOrgContext(user);
    const expense = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        organizationId: orgId,
      },
    });

    if (!expense) {
      throw new NotFoundException(
        `Expense claim with ID ${expenseId} not found`,
      );
    }

    const updatedExpense = await this.prisma.expense.update({
      where: { id: expenseId },
      data: { receiptUrl: dto.receiptUrl },
    });

    return {
      message: 'Receipt URL attached to expense claim successfully',
      expense: updatedExpense,
    };
  }

  async submitSalaryAdvance(
    user: AuthenticatedUser,
    dto: CreateSalaryAdvanceDto,
  ) {
    const orgId = this.checkOrgContext(user);
    const employee = await this.getEmployeeForUser(user);

    const repaymentMonths = dto.repaymentMonths > 0 ? dto.repaymentMonths : 1;
    const monthlyDeduction = Math.ceil(dto.amount / repaymentMonths);

    const salaryAdvance = await this.prisma.salaryAdvance.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        employeeId: employee.id,
        amount: dto.amount,
        repaymentMonths,
        monthlyDeduction,
        reason: dto.reason ?? null,
        status: 'PENDING',
      },
    });

    // Route through generic Approvals Engine (ADR-003)
    const approvalResult = await this.approvalsService.submitRequest(user, {
      type: 'SALARY_ADVANCE',
      subjectTable: 'salary_advance',
      subjectId: salaryAdvance.id,
      amountSnapshot: dto.amount,
    });

    return {
      message: 'Salary advance request submitted and routed for approval',
      salaryAdvance,
      approvalRequest: approvalResult.approvalRequest,
    };
  }

  async getExpenses(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });

    const where: Record<string, string> = {};
    if (employee) {
      where.employeeId = employee.id;
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return { expenses };
  }

  async getSalaryAdvances(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });

    const where: Record<string, string> = {};
    if (employee) {
      where.employeeId = employee.id;
    }

    const advances = await this.prisma.salaryAdvance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return { advances };
  }

  async getReimbursements(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });

    const where: Record<string, string> = {};
    if (employee) {
      where.employeeId = employee.id;
    }

    const reimbursements = await this.prisma.reimbursement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true },
        },
        expense: true,
      },
    });

    return { reimbursements };
  }

  async createReimbursement(
    user: AuthenticatedUser,
    dto: CreateReimbursementDto,
  ) {
    const orgId = this.checkOrgContext(user);
    const employee = await this.getEmployeeForUser(user);

    const reimbursement = await this.prisma.reimbursement.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        employeeId: employee.id,
        expenseId: dto.expenseId ?? null,
        amount: dto.amount,
        currency: dto.currency ?? 'NGN',
        status: 'PENDING',
      },
    });

    const approvalResult = await this.approvalsService.submitRequest(user, {
      type: 'EXPENSE',
      subjectTable: 'reimbursement',
      subjectId: reimbursement.id,
      amountSnapshot: dto.amount,
    });

    return {
      message: 'Reimbursement claim submitted and routed for approval',
      reimbursement,
      approvalRequest: approvalResult.approvalRequest,
    };
  }

  async getReimbursementDetails(user: AuthenticatedUser, id: string) {
    const orgId = this.checkOrgContext(user);

    const reimbursement = await this.prisma.reimbursement.findFirst({
      where: { id, organizationId: orgId },
      include: {
        employee: {
          select: { id: true, fullName: true, email: true, department: true },
        },
        expense: true,
      },
    });

    if (!reimbursement) {
      throw new NotFoundException(
        'Reimbursement claim with ID ' + id + ' not found',
      );
    }

    return { reimbursement };
  }

  async cancelReimbursement(user: AuthenticatedUser, id: string) {
    const orgId = this.checkOrgContext(user);

    const reimbursement = await this.prisma.reimbursement.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!reimbursement) {
      throw new NotFoundException(
        'Reimbursement claim with ID ' + id + ' not found',
      );
    }

    if (reimbursement.status === 'CANCELLED') {
      throw new BadRequestException('Reimbursement claim is already cancelled');
    }

    if (reimbursement.status === 'PAID') {
      throw new BadRequestException('Cannot cancel a paid reimbursement claim');
    }

    await this.prisma.approvalRequest.updateMany({
      where: {
        subjectTable: 'reimbursement',
        subjectId: id,
        status: 'PENDING',
      },
      data: { status: 'CANCELLED' },
    });

    const updated = await this.prisma.reimbursement.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return { reimbursement: updated };
  }

  async getReimbursementsSummary(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);

    const [totalPending, totalApproved, totalPaid] = await Promise.all([
      this.prisma.reimbursement.aggregate({
        where: { organizationId: orgId, status: 'PENDING' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.reimbursement.aggregate({
        where: { organizationId: orgId, status: 'APPROVED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.reimbursement.aggregate({
        where: { organizationId: orgId, status: 'PAID' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      summary: {
        pending: {
          count: totalPending._count.id,
          amountMinor: totalPending._sum.amount ?? 0,
        },
        approved: {
          count: totalApproved._count.id,
          amountMinor: totalApproved._sum.amount ?? 0,
        },
        paid: {
          count: totalPaid._count.id,
          amountMinor: totalPaid._sum.amount ?? 0,
        },
      },
    };
  }

  async payReimbursement(user: AuthenticatedUser, id: string) {
    const orgId = this.checkOrgContext(user);

    const reimbursement = await this.prisma.reimbursement.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!reimbursement) {
      throw new NotFoundException(
        'Reimbursement claim with ID ' + id + ' not found',
      );
    }

    if (reimbursement.status === 'PAID') {
      throw new BadRequestException('Reimbursement claim is already paid');
    }

    const updated = await this.prisma.reimbursement.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    return { reimbursement: updated };
  }
}
