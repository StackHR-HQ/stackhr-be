import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from './email.service';
import {
  APPROVAL_EVENTS,
  ApprovalDecidedEvent,
} from '../approvals/events/approval-decided.event';
import { approvalDecisionEmail } from './email-templates';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent(APPROVAL_EVENTS.DECIDED)
  async handleApprovalDecided(event: ApprovalDecidedEvent): Promise<void> {
    try {
      const requester = await this.prisma.user.findUnique({
        where: { id: event.requesterId },
        select: { email: true, name: true },
      });

      if (!requester?.email) {
        return;
      }

      const emailContent = approvalDecisionEmail({
        requesterName: requester.name ?? 'there',
        requestType: event.type,
        status: event.status,
        rejectionReason: event.rejectionReason,
        approvalRequestId: event.approvalRequestId,
      });

      await this.emailService.send({
        to: requester.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
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
