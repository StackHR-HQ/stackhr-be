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

  async getProfile(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    return { profile: employee };
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
