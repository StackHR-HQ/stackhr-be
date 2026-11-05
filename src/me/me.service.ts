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

    const [balances, approvedRequests, allLeaveTypes] = await Promise.all([
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
      this.prisma.leaveType
        ? this.prisma.leaveType.findMany({
            where: { organizationId: employee.organizationId },
          })
        : Promise.resolve([]),
    ]);

    const existingTypeIds = new Set(balances.map((b) => b.leaveTypeId));
    const missingTypes = allLeaveTypes.filter(
      (t) => !existingTypeIds.has(t.id),
    );

    if (missingTypes.length > 0) {
      const currentYear = new Date().getUTCFullYear();
      for (const mt of missingTypes) {
        const days = mt.daysPerYear ?? mt.defaultDays ?? 20;
        const newBal = await this.prisma.leaveBalance
          .create({
            data: {
              id: randomUUID(),
              organizationId: employee.organizationId,
              employeeId: employee.id,
              leaveTypeId: mt.id,
              year: currentYear,
              allocatedDays: days,
              totalDays: days,
              usedDays: 0,
              pendingDays: 0,
              remainingDays: days,
            },
            include: { leaveType: true },
          })
          .catch(() => null);
        if (newBal) {
          balances.push(newBal);
        }
      }
    }

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
      const totalDays =
        balance.totalDays && balance.totalDays > 0
          ? balance.totalDays
          : balance.allocatedDays && balance.allocatedDays > 0
            ? balance.allocatedDays
            : (balance.leaveType?.daysPerYear ??
              balance.leaveType?.defaultDays ??
              20);

      return {
        ...balance,
        totalDays,
        allocatedDays: totalDays,
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
    const formatted = expenses.map((e) => ({
      ...e,
      expenseDate:
        (e as any).expenseDate ??
        (e.createdAt
          ? new Date(e.createdAt).toISOString()
          : new Date().toISOString()),
      paymentMethod: (e as any).paymentMethod ?? 'BANK_TRANSFER',
    }));
    return { expenses: formatted };
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
    const formatted = advances.map((a) => ({
      ...a,
      currency: (a as any).currency ?? 'NGN',
    }));
    return {
      salaryAdvances: formatted,
      advances: formatted,
    };
  }

  async getCorporateCards(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const cards = await this.prisma.corporateCard.findMany({
      where: {
        employeeId: employee.id,
        organizationId: employee.organizationId,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { cards };
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
    const mappedDocuments = documents.map((doc) => ({
      ...doc,
      title: doc.name,
      fileUrl: `/v1/api/people/documents/${doc.id}/download`,
    }));
    return { documents: mappedDocuments };
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

  async getOnboarding(user: AuthenticatedUser) {
    const employee = await this.getEmployeeForUser(user);
    const organizationId = employee.organizationId;

    let assignment = await this.prisma.employeeOnboarding.findFirst({
      where: { employeeId: employee.id, organizationId },
    });

    if (!assignment && employee.departmentId) {
      const deptDefault =
        await this.prisma.onboardingTemplateDepartment.findFirst({
          where: { organizationId, departmentId: employee.departmentId },
        });
      if (deptDefault) {
        assignment = await this.prisma.employeeOnboarding.upsert({
          where: { employeeId: employee.id },
          create: {
            employeeId: employee.id,
            organizationId,
            templateId: deptDefault.templateId,
            assignedAt: new Date(),
          },
          update: {},
        });
      }
    }

    if (!assignment) {
      return {
        onboarding: {
          employeeId: employee.id,
          employeeName: employee.fullName,
          status: employee.status,
          templateId: null,
          templateName: null,
          completedItemIds: [],
          totalItems: 0,
          completedCount: 0,
          progressPercent: 0,
          items: [],
          checklist: [],
        },
      };
    }

    const [template, items, completions] = await Promise.all([
      this.prisma.onboardingTemplate.findFirst({
        where: { id: assignment.templateId, organizationId },
      }),
      this.prisma.onboardingChecklistItem.findMany({
        where: { organizationId, templateId: assignment.templateId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.onboardingItemCompletion.findMany({
        where: { organizationId, employeeId: employee.id },
        orderBy: [{ completedAt: 'asc' }, { itemId: 'asc' }],
      }),
    ]);

    const completedMap = new Map(
      completions.map((c) => [c.itemId, c.completedAt]),
    );
    const mappedItems = items.map((item) => ({
      id: item.id,
      label: item.label,
      title: item.label,
      stage: item.stage,
      position: item.position,
      completed: completedMap.has(item.id),
      completedAt: completedMap.get(item.id)?.toISOString() ?? null,
    }));

    const totalItems = mappedItems.length;
    const completedCount = mappedItems.filter((i) => i.completed).length;
    const progressPercent =
      totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

    return {
      onboarding: {
        employeeId: employee.id,
        employeeName: employee.fullName,
        status: employee.status,
        templateId: assignment.templateId,
        templateName: template?.name ?? null,
        completedItemIds: Array.from(completedMap.keys()),
        totalItems,
        completedCount,
        progressPercent,
        items: mappedItems,
        checklist: mappedItems,
      },
    };
  }

  async updateOnboardingItem(
    user: AuthenticatedUser,
    itemId: string,
    completed: boolean,
  ) {
    const employee = await this.getEmployeeForUser(user);
    const organizationId = employee.organizationId;

    const assignment = await this.prisma.employeeOnboarding.findFirst({
      where: { employeeId: employee.id, organizationId },
    });
    if (!assignment) {
      throw new NotFoundException(
        'No onboarding checklist is assigned to your profile',
      );
    }

    const item = await this.prisma.onboardingChecklistItem.findFirst({
      where: {
        id: itemId,
        organizationId,
        templateId: assignment.templateId,
      },
    });
    if (!item) {
      throw new NotFoundException(
        'Checklist item was not found on your onboarding template',
      );
    }

    const key = { employeeId_itemId: { employeeId: employee.id, itemId } };
    const existing = await this.prisma.onboardingItemCompletion.findUnique({
      where: key,
    });

    if (completed && !existing) {
      await this.prisma.onboardingItemCompletion.upsert({
        where: key,
        create: {
          organizationId,
          employeeId: employee.id,
          itemId,
          completedByUserId: user.id,
          completedAt: new Date(),
        },
        update: {},
      });
    } else if (!completed && existing) {
      await this.prisma.onboardingItemCompletion.deleteMany({
        where: { organizationId, employeeId: employee.id, itemId },
      });
    }

    if (completed !== Boolean(existing)) {
      await this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: completed
            ? 'onboarding_item.completed'
            : 'onboarding_item.reopened',
          targetType: 'onboarding_checklist_item',
          targetId: item.id,
          employeeId: employee.id,
          description: `Onboarding task "${item.label}" ${completed ? 'completed' : 'marked incomplete'}`,
          changes: { completed: { from: !completed, to: completed } },
          createdAt: new Date(),
        },
      });
    }

    return this.getOnboarding(user);
  }
}
