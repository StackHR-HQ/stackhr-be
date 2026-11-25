import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { SendWaitlistLaunchEmailDto } from './dto/send-waitlist-launch-email.dto';
import { EmailService } from '../notifications/email.service';
import {
  waitlistConfirmationEmail,
  waitlistLaunchEmail,
} from '../notifications/email-templates';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async joinWaitlist(dto: JoinWaitlistDto) {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { businessEmail: dto.businessEmail },
    });

    if (existing) {
      this.logger.log(
        `Duplicate waitlist entry submission for: ${dto.businessEmail}`,
      );
      // Return existing entry gracefully to provide idempotent response
      return {
        id: existing.id,
        name: existing.name,
        position: existing.position,
        businessName: existing.businessName,
        businessEmail: existing.businessEmail,
        alreadyJoined: true,
        createdAt: existing.createdAt,
      };
    }

    const entry = await this.prisma.waitlistEntry.create({
      data: {
        name: dto.name,
        position: dto.position,
        businessName: dto.businessName,
        businessEmail: dto.businessEmail,
      },
    });

    this.logger.log(
      `New waitlist entry created: ${entry.id} (${dto.businessEmail})`,
    );

    const emailContent = waitlistConfirmationEmail(dto.name);
    void this.emailService
      .send({
        to: dto.businessEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      })
      .then(() => {
        this.logger.log(
          `Waitlist confirmation email sent to: ${dto.businessEmail}`,
        );
      })
      .catch((error: any) => {
        this.logger.error(
          `Failed to send waitlist confirmation email to ${dto.businessEmail}: ${error?.message ?? error}`,
        );
      });

    // Subscribe the user to the SendByte marketing list (fire-and-forget)
    void this.emailService
      .subscribeToList({
        email: dto.businessEmail,
        name: dto.name,
        attributes: {
          position: dto.position,
          businessName: dto.businessName,
          source: 'waitlist',
        },
      })
      .then(() => {
        this.logger.log(
          `Waitlist subscriber added to SendByte list: ${dto.businessEmail}`,
        );
      })
      .catch((error: any) => {
        this.logger.error(
          `Failed to subscribe ${dto.businessEmail} to SendByte list: ${error?.message ?? error}`,
        );
      });

    return {
      id: entry.id,
      name: entry.name,
      position: entry.position,
      businessName: entry.businessName,
      businessEmail: entry.businessEmail,
      alreadyJoined: false,
      createdAt: entry.createdAt,
    };
  }

  async getWaitlistEntries() {
    return this.prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingWaitlistEntries() {
    const [entries, users] = await Promise.all([
      this.prisma.waitlistEntry.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findMany({
        select: { email: true },
      }),
    ]);

    const signedUpEmails = new Set(
      users.map((u) => u.email.trim().toLowerCase()),
    );

    return entries.filter(
      (entry) => !signedUpEmails.has(entry.businessEmail.trim().toLowerCase()),
    );
  }

  async sendLaunchEmails(dto: SendWaitlistLaunchEmailDto = {}) {
    const appBase = (
      process.env.STACKHR_APP_URL ?? 'https://app.stackhr.app'
    ).replace(/\/+$/, '');
    const signupUrl = dto.signupUrl ?? `${appBase}/signup`;

    if (dto.testEmail) {
      const content = waitlistLaunchEmail({
        fullName: 'Mubarak Test',
        businessName: 'StackHR Demo',
        signupUrl,
        subject: dto.subject,
        customMessage: dto.customMessage,
      });
      await this.emailService.send({
        to: dto.testEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      return {
        dryRun: false,
        testMode: true,
        totalPending: 1,
        sentCount: 1,
        failedCount: 0,
        recipients: [
          {
            email: dto.testEmail,
            name: 'Mubarak Test',
            businessName: 'StackHR Demo',
          },
        ],
        failures: [],
      };
    }

    const pending = await this.getPendingWaitlistEntries();
    const recipients = pending.map((entry) => ({
      id: entry.id,
      email: entry.businessEmail,
      name: entry.name,
      businessName: entry.businessName,
    }));

    if (dto.dryRun) {
      return {
        dryRun: true,
        testMode: false,
        totalPending: recipients.length,
        sentCount: 0,
        failedCount: 0,
        recipients,
        failures: [],
      };
    }

    let sentCount = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const entry of pending) {
      const content = waitlistLaunchEmail({
        fullName: entry.name,
        businessName: entry.businessName,
        signupUrl,
        subject: dto.subject,
        customMessage: dto.customMessage,
      });

      try {
        await this.emailService.send({
          to: entry.businessEmail,
          subject: content.subject,
          html: content.html,
          text: content.text,
          idempotencyKey: `waitlist-launch-${entry.id}`,
        });
        sentCount += 1;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown email error';
        this.logger.error(
          `Failed to send launch email to ${entry.businessEmail}: ${message}`,
        );
        failures.push({ email: entry.businessEmail, error: message });
      }
    }

    return {
      dryRun: false,
      testMode: false,
      totalPending: pending.length,
      sentCount,
      failedCount: failures.length,
      recipients,
      failures,
    };
  }
}
