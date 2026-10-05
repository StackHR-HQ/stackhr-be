import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateMeProfileDto } from './dto/update-me-profile.dto';

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

  private calculateNextPayDate(
    now: Date = new Date(),
    payDay: number = 25,
  ): string {
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();

    let payYear = year;
    let payMonth = month;

    if (date > payDay) {
      payMonth += 1;
      if (payMonth > 11) {
        payMonth = 0;
        payYear += 1;
      }
    }

    const payDate = new Date(Date.UTC(payYear, payMonth, payDay));
    return payDate.toISOString().split('T')[0];
  }

  async getProfile(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const org = user.organizationId
      ? await this.prisma.organization.findUnique({
          where: { id: user.organizationId },
          select: { payDate: true },
        })
      : null;
    const nextPayDate = this.calculateNextPayDate(
      new Date(),
      org?.payDate ?? 25,
    );
    const employeeData = { ...employee };
    delete (employeeData as any).invitationToken;
    return {
      profile: {
        ...employeeData,
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [balances, approvedRequests] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: {
          employeeId: employee.id,
          organizationId: employee.organizationId,
        },
        include: {
          leaveType: true,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId: employee.id,
          organizationId: employee.organizationId,
          status: 'APPROVED',
        },
        select: {
          leaveTypeId: true,
          startDate: true,
          totalDays: true,
        },
      }),
    ]);

    const upcomingByType = new Map<string, number>();
    for (const req of approvedRequests) {
      if (req.startDate > today) {
        upcomingByType.set(
          req.leaveTypeId,
          (upcomingByType.get(req.leaveTypeId) ?? 0) + req.totalDays,
        );
      }
    }

    const enrichedBalances = balances.map((balance) => {
      const upcomingDays = upcomingByType.get(balance.leaveTypeId) ?? 0;
      const actualUsedDays = Math.max(0, balance.usedDays - upcomingDays);
      return {
        ...balance,
        usedDays: actualUsedDays,
        upcomingDays,
      };
    });

    return { leaveBalances: enrichedBalances };
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
    return {
      leaveRequests: requests.map((r) => ({
        ...r,
        days: r.totalDays,
      })),
    };
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

  async updateProfile(user: AuthenticatedUser, dto: UpdateMeProfileDto) {
    const employee = await this.getEmployeeForUser(user);

    const dataToUpdate: Record<string, any> = {};
    for (const [key, val] of Object.entries(dto)) {
      if (val !== undefined) {
        if (key === 'dateOfBirth' && typeof val === 'string') {
          dataToUpdate[key] = new Date(val);
        } else {
          dataToUpdate[key] = val;
        }
      }
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: dataToUpdate,
      });
    }

    return this.getProfile(user);
  }
  async getCompensationHistory(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const [records, history] = await Promise.all([
      this.prisma.compensationRecord.findMany({
        where: {
          employeeId: employee.id,
          organizationId: employee.organizationId,
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.compensationHistory.findMany({
        where: {
          employeeId: employee.id,
          organizationId: employee.organizationId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { records, history };
  }

  async getNotifications(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const notifications = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: employee.organizationId,
        employeeId: employee.id,
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    return { notifications };
  }

  async getDocuments(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId: employee.organizationId,
        OR: [
          { scope: 'EMPLOYEE', employeeId: employee.id },
          { scope: 'ORGANIZATION', visibility: 'ALL_EMPLOYEES' },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return { documents };
  }

  async getActivity(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const activity = await this.prisma.auditEvent.findMany({
      where: {
        organizationId: employee.organizationId,
        employeeId: employee.id,
      },
      take: 30,
      orderBy: { createdAt: 'desc' },
    });
    return { activity };
  }
}
