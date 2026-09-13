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
}
