import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { USER_ROLES } from '../auth/auth.constants';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ApprovalQueryDto } from './dto/approval-query.dto';
import {
  APPROVAL_EVENTS,
  ApprovalDecidedEvent,
} from './events/approval-decided.event';
import type { ApprovalRequest } from '../../generated/prisma/client';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async submitRequest(user: AuthenticatedUser, dto: CreateApprovalRequestDto) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }

    const created = await this.prisma.approvalRequest.create({
      data: {
        id: randomUUID(),
        organizationId: user.organizationId,
        type: dto.type,
        subjectTable: dto.subjectTable,
        subjectId: dto.subjectId,
        requesterId: user.id,
        status: 'PENDING',
        amountSnapshot: dto.amountSnapshot ?? null,
        metadata: dto.metadata ?? null,
        stage: 1,
        submittedAt: new Date(),
      },
    });

    return { approvalRequest: created };
  }

  async getChainConfig(user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { metadata: true },
    });

    let config = {
      defaultStages: 1,
      types: ['LEAVE', 'EXPENSE', 'REIMBURSEMENT', 'SALARY_ADVANCE', 'PAYROLL'],
    };

    if (organization?.metadata) {
      try {
        const parsed = JSON.parse(organization.metadata);
        if (parsed.approvalConfig) {
          config = parsed.approvalConfig;
        }
      } catch {
        // Fallback to single-stage
      }
    }

    return { approvalConfig: config };
  }

  async listRequests(user: AuthenticatedUser, query: ApprovalQueryDto) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      organizationId: user.organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.type) {
      where.type = query.type;
    }

    const isElevatedRole = (
      [
        USER_ROLES.BUSINESS_OWNER,
        USER_ROLES.BUSINESS_ADMIN,
        USER_ROLES.HR_ADMIN,
        USER_ROLES.MANAGER,
      ] as string[]
    ).includes(user.role);

    if (!isElevatedRole) {
      where.requesterId = user.id;
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    const items = await this.enrichApprovalRequests(
      user.organizationId,
      rawItems,
    );

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async enrichApprovalRequests(
    orgId: string,
    items: ApprovalRequest[],
  ) {
    if (items.length === 0) {
      return [];
    }

    const userIds = new Set<string>();
    for (const item of items) {
      if (item.requesterId) userIds.add(item.requesterId);
      if (item.approverId) userIds.add(item.approverId);
    }

    const userIdList = Array.from(userIds);

    const leaveIds: string[] = [];
    const expenseIds: string[] = [];
    const reimbursementIds: string[] = [];
    const advanceIds: string[] = [];
    const payrollIds: string[] = [];

    for (const item of items) {
      if (!item.subjectId) continue;
      switch (item.subjectTable) {
        case 'leave_request':
          leaveIds.push(item.subjectId);
          break;
        case 'expense':
          expenseIds.push(item.subjectId);
          break;
        case 'reimbursement':
          reimbursementIds.push(item.subjectId);
          break;
        case 'salary_advance':
          advanceIds.push(item.subjectId);
          break;
        case 'payroll_run':
          payrollIds.push(item.subjectId);
          break;
      }
    }

    const users =
      userIdList.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIdList } },
            select: { id: true, name: true, email: true },
          })
        : [];

    const employees =
      userIdList.length > 0
        ? await this.prisma.employee.findMany({
            where: { organizationId: orgId, userId: { in: userIdList } },
            select: { userId: true, fullName: true },
          })
        : [];

    const leaveRequests =
      leaveIds.length > 0
        ? await this.prisma.leaveRequest.findMany({
            where: { id: { in: leaveIds } },
            include: { leaveType: true },
          })
        : [];

    const expenses =
      expenseIds.length > 0
        ? await this.prisma.expense.findMany({
            where: { id: { in: expenseIds } },
          })
        : [];

    const reimbursements =
      reimbursementIds.length > 0
        ? await this.prisma.reimbursement.findMany({
            where: { id: { in: reimbursementIds } },
            include: { expense: true },
          })
        : [];

    const salaryAdvances =
      advanceIds.length > 0
        ? await this.prisma.salaryAdvance.findMany({
            where: { id: { in: advanceIds } },
          })
        : [];

    const payrollRuns =
      payrollIds.length > 0
        ? await this.prisma.payrollRun.findMany({
            where: { id: { in: payrollIds } },
          })
        : [];

    const userMap = new Map<string, (typeof users)[number]>(
      users.map((u) => [u.id, u]),
    );
    const employeeMap = new Map<string, (typeof employees)[number]>(
      employees
        .filter((e): e is typeof e & { userId: string } => Boolean(e.userId))
        .map((e) => [e.userId, e]),
    );

    const resolveUserInfo = (id: string | null) => {
      if (!id) return null;
      const emp = employeeMap.get(id);
      const usr = userMap.get(id);
      const fullName = emp?.fullName ?? usr?.name ?? 'Unknown';
      return { id, fullName };
    };

    const leaveMap = new Map<string, (typeof leaveRequests)[number]>(
      leaveRequests.map((l) => [l.id, l]),
    );
    const expenseMap = new Map<string, (typeof expenses)[number]>(
      expenses.map((e) => [e.id, e]),
    );
    const reimbursementMap = new Map<string, (typeof reimbursements)[number]>(
      reimbursements.map((r) => [r.id, r]),
    );
    const advanceMap = new Map<string, (typeof salaryAdvances)[number]>(
      salaryAdvances.map((a) => [a.id, a]),
    );
    const payrollMap = new Map<string, (typeof payrollRuns)[number]>(
      payrollRuns.map((p) => [p.id, p]),
    );

    return items.map((item) => {
      const requester = resolveUserInfo(item.requesterId);
      const approver = resolveUserInfo(item.approverId);

      let unit = 'CURRENCY';
      let currency: string | null = 'NGN';
      let subjectSummary: Record<string, any> | null = null;

      switch (item.subjectTable) {
        case 'leave_request': {
          unit = 'DAYS';
          currency = null;
          const leave = leaveMap.get(item.subjectId);
          if (leave) {
            subjectSummary = {
              leaveType: leave.leaveType?.name ?? 'Leave',
              startDate: leave.startDate,
              endDate: leave.endDate,
              totalDays: leave.totalDays,
              reason: leave.reason,
            };
          }
          break;
        }
        case 'expense': {
          unit = 'CURRENCY';
          const exp = expenseMap.get(item.subjectId);
          if (exp) {
            currency = exp.currency ?? 'NGN';
            subjectSummary = {
              category: exp.category,
              description: exp.description,
              amount: exp.amount,
              currency: exp.currency ?? 'NGN',
              receiptUrl: exp.receiptUrl,
            };
          }
          break;
        }
        case 'reimbursement': {
          unit = 'CURRENCY';
          const reimb = reimbursementMap.get(item.subjectId);
          if (reimb) {
            currency = reimb.currency ?? 'NGN';
            subjectSummary = {
              amount: reimb.amount,
              currency: reimb.currency ?? 'NGN',
              category: reimb.expense?.category,
              description: reimb.expense?.description,
            };
          }
          break;
        }
        case 'salary_advance': {
          unit = 'CURRENCY';
          currency = 'NGN';
          const adv = advanceMap.get(item.subjectId);
          if (adv) {
            subjectSummary = {
              amount: adv.amount,
              currency: 'NGN',
              reason: adv.reason,
              repaymentMonths: adv.repaymentMonths,
              monthlyDeduction: adv.monthlyDeduction,
            };
          }
          break;
        }
        case 'payroll_run': {
          unit = 'CURRENCY';
          currency = 'NGN';
          const pay = payrollMap.get(item.subjectId);
          if (pay) {
            subjectSummary = {
              title: pay.title,
              periodMonth: pay.periodMonth,
              periodYear: pay.periodYear,
              totalGross: pay.totalGross,
              totalNet: pay.totalNet,
            };
          }
          break;
        }
      }

      return {
        ...item,
        requester,
        approver,
        unit,
        currency,
        subjectSummary,
      };
    });
  }

  async decideRequest(
    user: AuthenticatedUser,
    id: string,
    dto: DecideApprovalDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }

    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Approval request has already been decided (${approval.status})`,
      );
    }

    if (approval.requesterId === user.id) {
      throw new ForbiddenException(
        'You cannot approve or reject your own request',
      );
    }

    const isAuthorizedRole = (
      [
        USER_ROLES.BUSINESS_OWNER,
        USER_ROLES.BUSINESS_ADMIN,
        USER_ROLES.HR_ADMIN,
        USER_ROLES.MANAGER,
      ] as string[]
    ).includes(user.role);

    if (!isAuthorizedRole) {
      throw new ForbiddenException(
        'You do not have permission to decide approval requests',
      );
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: dto.status,
        approverId: user.id,
        decidedAt: new Date(),
        rejectionReason:
          dto.status === 'REJECTED' ? (dto.rejectionReason ?? null) : null,
      },
    });

    this.eventEmitter.emit(
      APPROVAL_EVENTS.DECIDED,
      new ApprovalDecidedEvent(
        updated.id,
        updated.organizationId,
        updated.type,
        updated.requesterId,
        user.id,
        dto.status,
        updated.rejectionReason,
        updated.subjectTable,
        updated.subjectId,
      ),
    );

    return { approvalRequest: updated };
  }

  async cancelRequest(user: AuthenticatedUser, id: string) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }

    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id, organizationId: user.organizationId },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found');
    }

    if (approval.requesterId !== user.id) {
      throw new ForbiddenException(
        'Only the requester can cancel this approval request',
      );
    }

    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Only pending approval requests can be cancelled (${approval.status})`,
      );
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        decidedAt: new Date(),
      },
    });

    return { approvalRequest: updated };
  }
}
