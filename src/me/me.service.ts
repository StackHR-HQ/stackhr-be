import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
    const [org, compRecord] = await Promise.all([
      user.organizationId
        ? this.prisma.organization.findUnique({
            where: { id: user.organizationId },
            select: { payDate: true },
          })
        : null,
      this.prisma.compensationRecord.findFirst({
        where: {
          employeeId: employee.id,
          organizationId: employee.organizationId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    const nextPayDate = this.calculateNextPayDate(
      new Date(),
      org?.payDate ?? 25,
    );
    const employeeData = { ...employee };
    delete (employeeData as any).invitationToken;

    const bankAccountLast4 =
      employee.bankAccountLast4 ??
      (employee.accountNumber
        ? String(employee.accountNumber).replace(/\D/g, '').slice(-4) || null
        : null);

    const basicSalary = compRecord
      ? compRecord.basicSalary
      : Math.trunc(Number(employee.annualSalaryMinor) / 1200);
    const housingAllowance = compRecord?.housingAllowance ?? 0;
    const transportAllowance = compRecord?.transportAllowance ?? 0;
    const otherAllowances = compRecord?.otherAllowances ?? 0;
    const effectiveFrom = compRecord?.effectiveFrom
      ? compRecord.effectiveFrom.toISOString().split('T')[0]
      : employee.startDate
        ? employee.startDate.toISOString().split('T')[0]
        : null;

    const compensation = {
      annualSalaryMinor:
        employee.annualSalaryMinor !== undefined
          ? Number(employee.annualSalaryMinor)
          : undefined,
      currency: employee.currency ?? 'NGN',
      payFrequency: employee.payFrequency ?? 'MONTHLY',
      basicSalary,
      housingAllowance,
      transportAllowance,
      otherAllowances,
      effectiveFrom,
    };

    return {
      profile: {
        ...employeeData,
        bankAccountLast4,
        annualSalaryMinor:
          employee.annualSalaryMinor !== undefined
            ? Number(employee.annualSalaryMinor)
            : undefined,
        employmentStatus: employee.status,
        workLocation: employee.workLocation ?? null,
        startDate: employee.startDate ? employee.startDate.toISOString() : null,
        nextPayDate,
        compensation,
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
        approvedFutureDays: upcomingDays,
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

    if (dto.accountNumber !== undefined) {
      if (dto.accountNumber) {
        const cleanDigits = String(dto.accountNumber).replace(/\D/g, '');
        dataToUpdate.bankAccountLast4 = cleanDigits.slice(-4) || null;
      } else {
        dataToUpdate.bankAccountLast4 = null;
      }
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: dataToUpdate,
      });

      await this.prisma.auditEvent.create({
        data: {
          organizationId: employee.organizationId,
          actorUserId: user.id,
          action: 'PROFILE_UPDATED',
          targetType: 'employee',
          targetId: employee.id,
          employeeId: employee.id,
          description: 'Profile information updated',
          changes: { updatedFields: Object.keys(dataToUpdate) },
        },
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

    if (records.length === 0 && employee.annualSalaryMinor > 0n) {
      const basicSalary = Math.trunc(Number(employee.annualSalaryMinor) / 1200);
      const effectiveFrom = employee.startDate ?? new Date();
      const defaultRecord = await this.prisma.compensationRecord.create({
        data: {
          id: randomUUID(),
          organizationId: employee.organizationId,
          employeeId: employee.id,
          effectiveFrom,
          basicSalary,
          housingAllowance: 0,
          transportAllowance: 0,
          otherAllowances: 0,
          currency: employee.currency ?? 'NGN',
          paymentFrequency: employee.payFrequency ?? 'MONTHLY',
        },
      });
      records.push(defaultRecord);

      if (history.length === 0) {
        const defaultHistory = await this.prisma.compensationHistory.create({
          data: {
            organizationId: employee.organizationId,
            employeeId: employee.id,
            annualSalaryMinor: employee.annualSalaryMinor,
            currency: employee.currency ?? 'NGN',
            payFrequency: employee.payFrequency ?? 'MONTHLY',
            effectiveDate: effectiveFrom,
            changedByUserId: user.id,
          },
        });
        history.push(defaultHistory);
      }
    }

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
