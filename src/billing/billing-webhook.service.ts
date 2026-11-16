import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { deserializeTerms } from './billing-catalog';
import { bachsAmountToKobo } from './domain/pricing';
import { transition } from './domain/state-machine';
import type { SubscriptionStatus } from './domain/entitlements';
import { invoiceIdFromReference } from './invoices.service';
import type { BachsWebhookEvent } from './bachs/bachs.types';

const PROVIDER = 'bachs';

/**
 * Applies Bachs payment events to StackHR invoices/subscriptions. Webhooks are
 * the only source of truth for payment (never the checkout redirect).
 * Delivery is at-least-once, so every handler is idempotent.
 */
@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(event: BachsWebhookEvent): Promise<{ duplicate: boolean }> {
    const record = await this.record(event);
    if (!record) return { duplicate: true };

    try {
      await this.dispatch(event);
      await this.prisma.billingWebhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), error: null },
      });
      return { duplicate: false };
    } catch (error: any) {
      // Leave processedAt null so Bachs' retry (we return 5xx) reprocesses it.
      await this.prisma.billingWebhookEvent.update({
        where: { id: record.id },
        data: { error: String(error?.message ?? error).slice(0, 1000) },
      });
      throw error;
    }
  }

  /** Returns the event row to process, or null if it was already processed. */
  private async record(event: BachsWebhookEvent) {
    const existing = await this.prisma.billingWebhookEvent.findUnique({
      where: { provider_eventId: { provider: PROVIDER, eventId: event.id } },
    });
    if (existing?.processedAt) return null;
    if (existing) return existing;

    try {
      return await this.prisma.billingWebhookEvent.create({
        data: {
          provider: PROVIDER,
          eventId: event.id,
          type: event.type,
          payload: event as any,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') return null; // concurrent delivery
      throw error;
    }
  }

  private async dispatch(event: BachsWebhookEvent) {
    switch (event.type) {
      case 'collection.succeeded':
        return this.onCollectionSucceeded(event.data);
      case 'collection.underpaid':
        return this.onCollectionUnderpaid(event.data);
      case 'collection.failed':
        return this.onCollectionFailed(event.data);
      case 'payment_method.saved':
        return this.onPaymentMethodSaved(event.data);
      case 'checkout.expired':
        return this.onCheckoutExpired(event.data);
      default:
        // checkout.completed etc.: collection.* is the payment signal we act on.
        this.logger.debug(`Ignoring Bachs event ${event.type}`);
    }
  }

  private findInvoice(data: Record<string, any>) {
    const byReference =
      invoiceIdFromReference(data.reference) ??
      data.meta?.invoiceId ??
      data.metadata?.invoiceId ??
      null;
    const or: any[] = [];
    if (data.checkout_id) or.push({ bachsCheckoutId: data.checkout_id });
    if (byReference) or.push({ id: byReference });
    if (or.length === 0) return Promise.resolve(null);

    return this.prisma.billingInvoice.findFirst({
      where: { OR: or },
      include: { subscription: true },
    });
  }

  private async onCollectionSucceeded(data: Record<string, any>) {
    const invoice = await this.findInvoice(data);
    if (!invoice) {
      this.logger.warn(
        `collection.succeeded with no matching invoice (checkout=${data.checkout_id}, reference=${data.reference})`,
      );
      return;
    }
    if (invoice.status === 'PAID') return;

    const paidKobo = this.paidAmountKobo(data);
    if (data.currency !== 'NGN' || paidKobo < invoice.totalKobo) {
      await this.recordShortfall(invoice, data, paidKobo);
      return;
    }

    await this.prisma.$transaction(async (tx: any) => {
      const claimed = await tx.billingInvoice.updateMany({
        where: { id: invoice.id, status: 'OPEN' },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          bachsChargeId: data.payment_id ?? data.charge_id ?? null,
          lastFailureReason: null,
        },
      });
      if (claimed.count === 0) return; // already applied by a concurrent delivery

      const sub = invoice.subscription;
      const next = transition(
        {
          status: sub.status as SubscriptionStatus,
          graceEndsAt: sub.graceEndsAt,
        },
        { type: 'INVOICE_PAID' },
      );

      const update: Record<string, unknown> = { ...next };
      if (invoice.targetPlanCode) update.planCode = invoice.targetPlanCode;
      if (invoice.targetBillingCycle)
        update.billingCycle = invoice.targetBillingCycle;
      if (invoice.targetTerms) {
        const terms = deserializeTerms(invoice.targetTerms);
        update.includedEmployees = terms.includedEmployees;
        update.baseFeeKobo = terms.baseFeeKobo;
        update.overageRateKobo = terms.overageRateKobo;
        update.maxOverageEmployees = terms.maxOverageEmployees;
      }
      if (invoice.kind === 'INITIAL' || invoice.kind === 'RENEWAL') {
        update.currentPeriodStart = invoice.periodStart;
        update.currentPeriodEnd = invoice.periodEnd;
      }
      if (invoice.kind === 'INITIAL') {
        update.cancelAtPeriodEnd = false;
        update.pendingPlanCode = null;
        update.pendingBillingCycle = null;
      }
      if (invoice.kind === 'UPGRADE_PRORATION') {
        // Paying to upgrade signals the business is staying.
        update.pendingPlanCode = null;
        update.cancelAtPeriodEnd = false;
      }
      if (
        invoice.billedEmployeeCount !== null &&
        invoice.billedEmployeeCount !== undefined
      ) {
        update.billedEmployeeCount = invoice.billedEmployeeCount;
      }

      await tx.subscription.update({ where: { id: sub.id }, data: update });
      const planCode = invoice.targetPlanCode ?? sub.planCode;
      await tx.auditEvent.create({
        data: {
          organizationId: invoice.organizationId,
          actorUserId: 'system',
          action: 'billing.invoice_paid',
          targetType: 'billing_invoice',
          targetId: invoice.id,
          description: `Invoice ${invoice.number} paid; subscription ${planCode} is ${next.status}`,
          changes: {
            invoiceKind: invoice.kind,
            amountKobo: invoice.totalKobo.toString(),
            planCode,
            status: next.status,
          },
        },
      });
    });
  }

  private async onCollectionUnderpaid(data: Record<string, any>) {
    const invoice = await this.findInvoice(data);
    if (!invoice || invoice.status !== 'OPEN') return;
    await this.recordShortfall(invoice, data, this.paidAmountKobo(data));
  }

  private async onCollectionFailed(data: Record<string, any>) {
    const invoice = await this.findInvoice(data);
    if (!invoice || invoice.status !== 'OPEN') return;
    await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        failedAttempts: { increment: 1 },
        lastFailureReason: String(
          data.message ?? data.failure_reason ?? data.status ?? 'failed',
        ).slice(0, 500),
      },
    });
  }

  private async onPaymentMethodSaved(data: Record<string, any>) {
    const customerId =
      data.customer_id ??
      (typeof data.customer === 'string' ? data.customer : data.customer?.id);
    if (!customerId || !data.payment_method_id) return;
    const sub = await this.prisma.subscription.findFirst({
      where: { bachsCustomerId: customerId },
    });
    if (!sub) return;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { bachsPaymentMethodId: data.payment_method_id },
    });
  }

  private async onCheckoutExpired(data: Record<string, any>) {
    if (!data.checkout_id) return;
    await this.prisma.billingInvoice.updateMany({
      where: { bachsCheckoutId: data.checkout_id, status: 'OPEN' },
      data: { bachsCheckoutUrl: null, bachsCheckoutExpiresAt: new Date() },
    });
  }

  private paidAmountKobo(data: Record<string, any>): bigint {
    const raw = data.amount_paid ?? data.amount;
    try {
      return raw ? bachsAmountToKobo(String(raw)) : 0n;
    } catch {
      return 0n;
    }
  }

  private async recordShortfall(
    invoice: { id: string; number: string; totalKobo: bigint },
    data: Record<string, any>,
    paidKobo: bigint,
  ) {
    const reason =
      data.currency !== 'NGN'
        ? `Paid in unexpected currency ${data.currency}`
        : `Underpaid: received ${paidKobo} of ${invoice.totalKobo} kobo`;
    this.logger.warn(`Invoice ${invoice.number}: ${reason} (needs review)`);
    await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: { lastFailureReason: reason },
    });
  }
}
