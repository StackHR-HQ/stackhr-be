import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

@Injectable()
export class LeaveListener {
  private readonly logger = new Logger(LeaveListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('approval.decided')
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    if (event.type !== 'LEAVE' && event.subjectTable !== 'leave_request') {
      return;
    }

    const leaveRequestId = event.subjectId;
    if (!leaveRequestId) {
      this.logger.warn(
        `Approval decided event ${event.approvalRequestId} missing subjectId`,
      );
      return;
    }

    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
    });

    if (!leaveRequest) {
      this.logger.warn(`Leave request ${leaveRequestId} not found`);
      return;
    }

    const balance = await this.prisma.leaveBalance.findFirst({
      where: {
        organizationId: event.organizationId,
        employeeId: leaveRequest.employeeId,
        leaveTypeId: leaveRequest.leaveTypeId,
      },
    });

    if (!balance) {
      this.logger.warn(
        `Leave balance for employee ${leaveRequest.employeeId} not found`,
      );
      return;
    }

    if (event.status === 'APPROVED') {
      const newPendingDays = Math.max(
        0,
        balance.pendingDays - leaveRequest.totalDays,
      );
      const newUsedDays = balance.usedDays + leaveRequest.totalDays;
      const newRemainingDays =
        balance.allocatedDays - (newUsedDays + newPendingDays);

      await Promise.all([
        this.prisma.leaveRequest.update({
          where: { id: leaveRequestId },
          data: { status: 'APPROVED' },
        }),
        this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: newPendingDays,
            usedDays: newUsedDays,
            remainingDays: newRemainingDays,
          },
        }),
      ]);

      this.logger.log(
        `Approved leave request ${leaveRequestId}. Transferred ${leaveRequest.totalDays} days to used.`,
      );
    } else if (event.status === 'REJECTED') {
      const newPendingDays = Math.max(
        0,
        balance.pendingDays - leaveRequest.totalDays,
      );
      const newRemainingDays =
        balance.allocatedDays - (balance.usedDays + newPendingDays);

      await Promise.all([
        this.prisma.leaveRequest.update({
          where: { id: leaveRequestId },
          data: { status: 'REJECTED' },
        }),
        this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: newPendingDays,
            remainingDays: newRemainingDays,
          },
        }),
      ]);

      this.logger.log(
        `Rejected leave request ${leaveRequestId}. Released ${leaveRequest.totalDays} pending days.`,
      );
    }
  }
}
