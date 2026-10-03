import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  private async getEmployeeForUser(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const employee = await this.prisma.employee.findFirst({
      where: {
        email: user.email,
        organizationId: orgId,
      },
      include: {
        manager: {
          select: { id: true, fullName: true, email: true, jobTitle: true },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(
        'An active employee record associated with your account was not found',
      );
    }
    return employee;
  }

  private calculateNextPayDate(now: Date = new Date()): string {
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    let payYear = year;
    let payMonth = month;

    if (date > 25) {
      payMonth += 1;
      if (payMonth > 11) {
        payMonth = 0;
        payYear += 1;
      }
    }

    const payDate = new Date(Date.UTC(payYear, payMonth, 25));
    return payDate.toISOString().split('T')[0];
  }

  async getProfile(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const nextPayDate = this.calculateNextPayDate();
    return {
      profile: {
        ...employee,
        annualSalaryMinor:
          employee.annualSalaryMinor !== undefined
            ? Number(employee.annualSalaryMinor)
            : undefined,
        employmentStatus: employee.status,
        workLocation: employee.workLocation ?? null,
        startDate: employee.startDate ? employee.startDate.toISOString() : null,
        nextPayDate,
      },
    };
  }

  async getPayslips(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const payslips = await this.prisma.payslip.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
    return { payslips };
  }

  async getLeaveBalances(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const balances = await this.prisma.leaveBalance.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      include: {
        leaveType: true,
      },
    });
    return { leaveBalances: balances };
  }

  async getLeaveRequests(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        leaveType: true,
      },
    });
    return { leaveRequests: requests };
  }

  async getExpenses(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const expenses = await this.prisma.expense.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { expenses };
  }

  async getSalaryAdvances(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const advances = await this.prisma.salaryAdvance.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { salaryAdvances: advances };
  }
}
