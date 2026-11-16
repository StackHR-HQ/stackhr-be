import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { runBypassingTenantContext } from '../database/tenant-context';
import { EmailService } from '../notifications/email.service';
import { USER_ROLES } from '../auth/auth.constants';
import {
  TransactionalEmail,
  billingInvoiceEmail,
  billingOverdueEmail,
  billingPaymentFailedEmail,
  billingPaymentReceivedEmail,
  billingRestrictedEmail,
} from '../notifications/email-templates';

export interface NotifiableInvoice {
  id: string;
  organizationId: string;
  number: string;
  kind: string;
  totalKobo: bigint;
  dueAt: Date;
}

/**
 * Billing emails to the people who pay: the owner and every business admin.
 * Never throws — a failed email must not break billing.
 */
@Injectable()
export class BillingNotifier {
  private readonly logger = new Logger(BillingNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  invoiceIssued(invoice: NotifiableInvoice) {
    return this.deliver(invoice.organizationId, (orgName) =>
      billingInvoiceEmail(this.input(invoice, orgName)),
    );
  }

  paymentReceived(invoice: NotifiableInvoice) {
    return this.deliver(invoice.organizationId, (orgName) =>
      billingPaymentReceivedEmail(this.input(invoice, orgName)),
    );
  }

  paymentFailed(invoice: NotifiableInvoice, reason: string) {
    return this.deliver(invoice.organizationId, (orgName) =>
      billingPaymentFailedEmail({ ...this.input(invoice, orgName), reason }),
    );
  }

  overdue(invoice: NotifiableInvoice, graceEndsAt: Date) {
    return this.deliver(invoice.organizationId, (orgName) =>
      billingOverdueEmail({ ...this.input(invoice, orgName), graceEndsAt }),
    );
  }

  restricted(organizationId: string) {
    return this.deliver(organizationId, (organizationName) =>
      billingRestrictedEmail({ organizationName }),
    );
  }

  private input(invoice: NotifiableInvoice, organizationName: string) {
    return {
      organizationName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      kind: invoice.kind,
      totalKobo: invoice.totalKobo,
      dueAt: invoice.dueAt,
    };
  }

  private async deliver(
    organizationId: string,
    build: (organizationName: string) => TransactionalEmail,
  ): Promise<void> {
    try {
      const { organizationName, recipients } =
        await this.recipients(organizationId);
      if (recipients.length === 0) {
        this.logger.warn(
          `No billing recipients for organization ${organizationId}`,
        );
        return;
      }
      const message = build(organizationName);
      for (const to of recipients) {
        try {
          await this.email.send({ to, ...message });
        } catch (error: any) {
          this.logger.error(
            `Billing email "${message.subject}" to ${to} failed: ${error?.message ?? error}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Billing email for organization ${organizationId} failed: ${error?.message ?? error}`,
      );
    }
  }

  private recipients(organizationId: string) {
    return runBypassingTenantContext(async () => {
      const [org, admins] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          include: { owner: { select: { email: true, name: true } } },
        }),
        this.prisma.member.findMany({
          where: { organizationId, role: USER_ROLES.BUSINESS_ADMIN },
          include: { user: { select: { email: true, name: true } } },
        }),
      ]);
      const seen = new Set<string>();
      const recipients: string[] = [];
      for (const address of [
        org?.owner?.email,
        ...admins.map((m: any) => m.user?.email),
      ]) {
        const key = address?.trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          recipients.push(address!.trim());
        }
      }
      return { organizationName: org?.name ?? 'your organization', recipients };
    });
  }
}
