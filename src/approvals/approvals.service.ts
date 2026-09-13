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
import { ApprovalDecidedEvent } from './events/approval-decided.event';

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

    const [items, total] = await Promise.all([
      this.prisma.approvalRequest.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

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
      'approval.decided',
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
