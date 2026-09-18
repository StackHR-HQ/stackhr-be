import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from './email.service';
import { ApprovalDecidedEvent } from '../approvals/events/approval-decided.event';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent('approval.decided')
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    try {
      const requester = await this.prisma.user.findUnique({
        where: { id: event.requesterId },
        select: { email: true, name: true },
      });

      if (!requester?.email) {
        return;
      }

      const isApproved = event.status === 'APPROVED';
      const statusText = isApproved ? 'Approved' : 'Rejected';
      const subject = `Your ${event.type} request has been ${statusText}`;
      const text = isApproved
        ? `Hello ${requester.name}, your ${event.type} request (${event.approvalRequestId}) has been approved.`
        : `Hello ${requester.name}, your ${event.type} request (${event.approvalRequestId}) was rejected.${event.rejectionReason ? ` Reason: ${event.rejectionReason}` : ''}`;

      await this.emailService.send({
        to: requester.email,
        subject,
        text,
        html: `<p>${text}</p>`,
        idempotencyKey: `approval-decided:${event.approvalRequestId}:${event.status}`,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send approval decision email notification',
        error,
      );
    }
  }
}
