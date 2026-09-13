import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ApprovalsService } from '../approvals/approvals.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

import { LeaveQueryDto } from './dto/leave-query.dto';

@Injectable()
export class LeaveService {
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

  async createLeaveType(user: AuthenticatedUser, dto: CreateLeaveTypeDto) {
    const orgId = this.checkOrgContext(user);

    const existing = await this.prisma.leaveType.findFirst({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Leave type "${dto.name}" already exists in the organization`,
      );
    }

    const leaveType = await this.prisma.leaveType.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: dto.name,
        description: dto.description ?? null,
        daysPerYear: dto.daysPerYear,
        paid: dto.paid ?? true,
        requiresApproval: dto.requiresApproval ?? true,
      },
    });

    // Automatically allocate initial leave balance to all active employees in organization
    const activeEmployees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const emp of activeEmployees) {
      await this.prisma.leaveBalance.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          employeeId: emp.id,
          leaveTypeId: leaveType.id,
          allocatedDays: dto.daysPerYear,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: dto.daysPerYear,
        },
      });
    }

    return { leaveType };
  }

  async getLeaveTypes(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const leaveTypes = await this.prisma.leaveType.findMany({
      orderBy: { name: 'asc' },
    });
    return { leaveTypes };
  }

  async getLeaveBalances(user: AuthenticatedUser) {
    this.checkOrgContext(user);

    // Find employee linked to user email or ID
    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });

    if (!employee) {
      const balances = await this.prisma.leaveBalance.findMany({
        include: {
          leaveType: true,
          employee: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });
      return { balances };
    }

    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: employee.id },
      include: {
        leaveType: true,
      },
    });

    return { employeeId: employee.id, balances };
  }

  async submitLeaveRequest(
    user: AuthenticatedUser,
    dto: CreateLeaveRequestDto,
  ) {
    const orgId = this.checkOrgContext(user);

    const employee = await this.prisma.employee.findFirst({
      where: { email: user.email },
    });

    if (!employee) {
      throw new NotFoundException(
        'An active employee record associated with your account was not found',
      );
    }

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: dto.leaveTypeId },
    });

    if (!leaveType) {
      throw new NotFoundException(
        `Leave type with ID "${dto.leaveTypeId}" not found`,
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date format');
    }

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be prior to start date');
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    let balance = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
      },
    });

    if (!balance) {
      // Auto-initialize balance if missing
      balance = await this.prisma.leaveBalance.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          allocatedDays: leaveType.daysPerYear,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: leaveType.daysPerYear,
        },
      });
    }

    if (balance.remainingDays < totalDays) {
      throw new BadRequestException(
        `Insufficient leave balance. Remaining: ${balance.remainingDays} days, Requested: ${totalDays} days`,
      );
    }

    const leaveRequest = await this.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        totalDays,
        reason: dto.reason ?? null,
        status: leaveType.requiresApproval ? 'PENDING' : 'APPROVED',
      },
    });

    // Update leave balance pending/used days
    if (leaveType.requiresApproval) {
      const newPendingDays = balance.pendingDays + totalDays;
      const newRemainingDays =
        balance.allocatedDays - (balance.usedDays + newPendingDays);

      await this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: newPendingDays,
          remainingDays: newRemainingDays,
        },
      });

      // Submit through generic Approvals Engine (ADR-003)
      const approvalResult = await this.approvalsService.submitRequest(user, {
        type: 'LEAVE',
        subjectTable: 'leave_request',
        subjectId: leaveRequest.id,
        amountSnapshot: totalDays,
      });

      return {
        message: 'Leave request submitted and routed for approval',
        leaveRequest,
        approvalRequest: approvalResult.approvalRequest,
      };
    } else {
      const newUsedDays = balance.usedDays + totalDays;
      const newRemainingDays =
        balance.allocatedDays - (newUsedDays + balance.pendingDays);

      await this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedDays: newUsedDays,
          remainingDays: newRemainingDays,
        },
      });

      return {
        message: 'Leave request submitted and auto-approved',
        leaveRequest,
      };
    }
  }

  async getLeaveHistory(user: AuthenticatedUser, query: LeaveQueryDto) {
    this.checkOrgContext(user);
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.leaveTypeId) {
      where.leaveTypeId = query.leaveTypeId;
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    } else {
      // If regular employee, default filter to employee's own requests
      const employee = await this.prisma.employee.findFirst({
        where: { email: user.email },
      });
      if (employee) {
        where.employeeId = employee.id;
      }
    }

    const [requests, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          leaveType: {
            select: { id: true, name: true, paid: true },
          },
          employee: {
            select: { id: true, fullName: true, email: true, department: true },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: requests,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async getLeaveRequestDetails(user: AuthenticatedUser, id: string) {
    this.checkOrgContext(user);
    const leaveRequest = await this.prisma.leaveRequest.findFirst({
      where: { id },
      include: {
        leaveType: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            department: true,
            jobTitle: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      throw new NotFoundException(`Leave request with ID "${id}" not found`);
    }

    return { leaveRequest };
  }
}
