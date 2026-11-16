import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { runBypassingTenantContext } from '../database/tenant-context';
import {
  BILLABLE_STATUSES,
  FREE_PLAN_CODE,
  addCycle,
  termsFromPlan,
} from './billing-catalog';
import {
  BillingCycle,
  CommercialTerms,
  MONTHS_IN_CYCLE,
  koboToBachsAmount,
  priceForPeriod,
} from './domain/pricing';
import {
  InvoicesService,
  checkoutReference,
  isAutoChargeEnabled,
} from './invoices.service';
import { BachsClient } from './bachs/bachs.client';
import { transition } from './domain/state-machine';
import { BillingNotifier } from './billing-notifier.service';

/** Renewal invoices go out this long before the period ends (due at period end). */
export const RENEWAL_LEAD_DAYS = 7;
/** How long a saved-card charge gets to settle before the invoice counts as overdue. */
export const AUTO_CHARGE_SETTLE_MS = 24 * 60 * 60 * 1000;
/** Overage true-up invoices are payable within this many days. */
export const OVERAGE_PAYMENT_TERMS_DAYS = 7;
/** One reminder goes out this many days into the grace period. */
export const GRACE_REMINDER_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type SubscriptionRow = {
  id: string;
  organizationId: string;
  planCode: string;
  status: string;
  billingCycle: string;
  includedEmployees: number;
  baseFeeKobo: bigint;
  overageRateKobo: bigint;
  maxOverageEmployees: number;
  customTerms: boolean;
  billedEmployeeCount: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  pendingPlanCode: string | null;
  pendingBillingCycle: string | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: Date | null;
  bachsCustomerId: string | null;
  bachsPaymentMethodId: string | null;
};

/**
 * The billing clock. Every step is idempotent and takes `now`, so it is safe
 * to run hourly and to re-run after a failure.
 */
@Injectable()
export class BillingCycleService {
  private readonly logger = new Logger(BillingCycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly notifier: BillingNotifier,
    private readonly bachs: BachsClient,
  ) {}

  /** Issue next-period invoices for paid subscriptions ending within the lead window. */
  issueRenewals(now: Date) {
    return runBypassingTenantContext(async () => {
      const horizon = new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY_MS);
      const due: SubscriptionRow[] = await this.prisma.subscription.findMany({
        where: {
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          cancelAtPeriodEnd: false,
          currentPeriodEnd: { lte: horizon },
        },
      });

      let issued = 0;
      for (const sub of due) {
        try {
          if (await this.issueRenewal(sub, horizon)) issued += 1;
        } catch (error: any) {
          this.logger.error(
            `Renewal for subscription ${sub.id} failed: ${error?.message ?? error}`,
          );
        }
      }
      return { issued };
    });
  }

  private async issueRenewal(sub: SubscriptionRow, horizon: Date) {
    const periodStart = sub.currentPeriodEnd;
    if (
      !periodStart ||
      sub.cancelAtPeriodEnd ||
      !['ACTIVE', 'PAST_DUE'].includes(sub.status) ||
      periodStart > horizon
    ) {
      return false;
    }

    const already = await this.prisma.billingInvoice.findFirst({
      where: {
        subscriptionId: sub.id,
        kind: 'RENEWAL',
        periodStart,
        status: { not: 'VOID' },
      },
    });
    if (already) return false;

    const cycle = (sub.pendingBillingCycle ?? sub.billingCycle) as BillingCycle;
    const planCode = sub.pendingPlanCode ?? sub.planCode;
    const terms = await this.renewalTerms(sub, planCode, cycle);
    const billable = await this.prisma.employee.count({
      where: {
        organizationId: sub.organizationId,
        status: { in: BILLABLE_STATUSES },
      },
    });
    const quote = priceForPeriod(terms, cycle, billable);

    const invoice = await this.invoices.issue({
      subscription: sub,
      kind: 'RENEWAL',
      periodStart,
      periodEnd: addCycle(periodStart, cycle),
      dueAt: periodStart,
      lines: quote.lines,
      totalKobo: quote.totalKobo,
      targetPlanCode: planCode,
      targetBillingCycle: cycle,
      targetTerms: terms,
      billedEmployeeCount: billable,
    });
    await this.notifier.invoiceIssued(invoice);
    return true;
  }

  /**
   * Renewals keep the subscription's agreed terms (catalog price changes never
   * silently reprice a customer); a scheduled plan or cycle change takes the
   * catalog terms of the new plan/cycle.
   */
  private async renewalTerms(
    sub: SubscriptionRow,
    planCode: string,
    cycle: BillingCycle,
  ): Promise<CommercialTerms> {
    const changing =
      planCode !== sub.planCode || cycle !== (sub.billingCycle as BillingCycle);
    if (!changing || sub.customTerms) {
      return {
        includedEmployees: sub.includedEmployees,
        baseFeeKobo: sub.baseFeeKobo,
        overageRateKobo: sub.overageRateKobo,
        maxOverageEmployees: sub.maxOverageEmployees,
      };
    }
    const plan = await this.prisma.billingPlan.findUnique({
      where: { code: planCode },
    });
    if (!plan) throw new Error(`Plan ${planCode} missing from catalog`);
    return termsFromPlan(plan, cycle);
  }

  /** Period-end housekeeping: cancellations, overdue invoices, grace expiry. */
  processPeriodEnds(now: Date) {
    return runBypassingTenantContext(async () => {
      const cancelled = await this.endCancelledSubscriptions(now);
      const overdue = await this.processOverdueInvoices(now);
      return { cancelled, ...overdue };
    });
  }

  private async endCancelledSubscriptions(now: Date) {
    const ending: SubscriptionRow[] = await this.prisma.subscription.findMany({
      where: { cancelAtPeriodEnd: true, currentPeriodEnd: { lte: now } },
    });
    if (ending.length === 0) return 0;

    const free = await this.prisma.billingPlan.findUnique({
      where: { code: FREE_PLAN_CODE },
    });
    if (!free) throw new Error('FREE plan missing from billing catalog');

    let count = 0;
    for (const sub of ending) {
      if (!sub.currentPeriodEnd || sub.currentPeriodEnd > now) continue;
      await this.prisma.$transaction(async (tx: any) => {
        await tx.billingInvoice.updateMany({
          where: {
            subscriptionId: sub.id,
            status: 'OPEN',
            kind: { in: ['RENEWAL', 'OVERAGE_TRUEUP'] },
          },
          data: { status: 'VOID' },
        });
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            planCode: FREE_PLAN_CODE,
            status: 'FREE',
            billingCycle: 'MONTHLY',
            includedEmployees: free.includedEmployees,
            baseFeeKobo: 0n,
            overageRateKobo: 0n,
            maxOverageEmployees: free.maxOverageEmployees,
            customTerms: false,
            billedEmployeeCount: 0,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            pendingPlanCode: null,
            pendingBillingCycle: null,
            cancelAtPeriodEnd: false,
            graceEndsAt: null,
          },
        });
      });
      count += 1;
    }
    return count;
  }

  /**
   * Renewal/overage invoices past due put the subscription into PAST_DUE
   * (grace keeps features on). Checkout-style invoices (INITIAL, upgrades) are
   * excluded: an abandoned upgrade must never put anyone into arrears.
   */
  private async processOverdueInvoices(now: Date) {
    const invoices = await this.prisma.billingInvoice.findMany({
      where: {
        status: 'OPEN',
        kind: { in: ['RENEWAL', 'OVERAGE_TRUEUP'] },
        dueAt: { lte: now },
      },
      include: { subscription: true },
      orderBy: { dueAt: 'asc' },
    });

    let markedPastDue = 0;
    let restricted = 0;
    let reminded = 0;
    const restrictedSubs = new Set<string>();
    for (const invoice of invoices) {
      const sub = invoice.subscription as SubscriptionRow;
      try {
        if (await this.autoChargePending(invoice, sub, now)) continue;

        if (sub.status === 'ACTIVE' && invoice.remindersSent === 0) {
          const next = transition(
            {
              status: sub.status,
              graceEndsAt: sub.graceEndsAt,
            },
            { type: 'INVOICE_OVERDUE', dueAt: invoice.dueAt },
          );
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: next.status, graceEndsAt: next.graceEndsAt },
          });
          await this.prisma.billingInvoice.update({
            where: { id: invoice.id },
            data: { remindersSent: 1 },
          });
          sub.status = next.status;
          sub.graceEndsAt = next.graceEndsAt;
          await this.notifier.overdue(invoice, next.graceEndsAt!);
          markedPastDue += 1;
        } else if (sub.status === 'PAST_DUE' && !restrictedSubs.has(sub.id)) {
          const next = transition(
            { status: 'PAST_DUE', graceEndsAt: sub.graceEndsAt },
            { type: 'GRACE_CHECK', now },
          );
          if (next.status === 'RESTRICTED') {
            await this.prisma.subscription.update({
              where: { id: sub.id },
              data: { status: 'RESTRICTED' },
            });
            restrictedSubs.add(sub.id);
            await this.notifier.restricted(sub.organizationId);
            restricted += 1;
          } else if (
            invoice.remindersSent === 1 &&
            now.getTime() >=
              invoice.dueAt.getTime() + GRACE_REMINDER_AFTER_DAYS * DAY_MS
          ) {
            await this.prisma.billingInvoice.update({
              where: { id: invoice.id },
              data: { remindersSent: 2 },
            });
            await this.notifier.overdue(invoice, sub.graceEndsAt!);
            reminded += 1;
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Overdue handling for invoice ${invoice.id} failed: ${error?.message ?? error}`,
        );
      }
    }
    return { markedPastDue, reminded, restricted };
  }

  /**
   * With auto-charge on and a saved card, charge once on the due date and give
   * the webhook time to settle it. Returns true while the invoice should not
   * yet be treated as overdue.
   */
  private async autoChargePending(
    invoice: {
      id: string;
      number: string;
      totalKobo: bigint;
      failedAttempts: number;
      lastChargeAttemptAt: Date | null;
    },
    sub: SubscriptionRow,
    now: Date,
  ): Promise<boolean> {
    if (invoice.lastChargeAttemptAt) {
      return (
        now.getTime() - invoice.lastChargeAttemptAt.getTime() <
        AUTO_CHARGE_SETTLE_MS
      );
    }
    if (
      !isAutoChargeEnabled() ||
      sub.status !== 'ACTIVE' ||
      !sub.bachsCustomerId ||
      !sub.bachsPaymentMethodId
    ) {
      return false;
    }

    await this.prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: { lastChargeAttemptAt: now },
    });
    try {
      await this.bachs.chargeSavedCard({
        customerId: sub.bachsCustomerId,
        paymentMethodId: sub.bachsPaymentMethodId,
        amount: koboToBachsAmount(invoice.totalKobo),
        reference: checkoutReference(invoice.id),
        idempotencyKey: `stackhr-autocharge-${invoice.id}-${(invoice.failedAttempts ?? 0) + 1}`,
        description: `StackHR invoice ${invoice.number}`,
      });
    } catch (error: any) {
      // Recorded attempt stands: the invoice falls through to normal dunning after the settle window.
      this.logger.warn(
        `Auto-charge for invoice ${invoice.id} failed to start: ${error?.message ?? error}`,
      );
    }
    return true;
  }

  /**
   * Mid-period growth beyond the allowance (and beyond what was already billed)
   * is billed pro rata for the rest of the period. Growth past the hard cap is
   * already blocked at employee creation.
   */
  issueOverageTrueUps(now: Date) {
    return runBypassingTenantContext(async () => {
      const subs: SubscriptionRow[] = await this.prisma.subscription.findMany({
        where: { status: 'ACTIVE', currentPeriodEnd: { gt: now } },
      });
      let issued = 0;
      for (const sub of subs) {
        try {
          if (await this.issueOverageTrueUp(sub, now)) issued += 1;
        } catch (error: any) {
          this.logger.error(
            `Overage true-up for subscription ${sub.id} failed: ${error?.message ?? error}`,
          );
        }
      }
      return { issued };
    });
  }

  private async issueOverageTrueUp(sub: SubscriptionRow, now: Date) {
    if (
      sub.status !== 'ACTIVE' ||
      !sub.currentPeriodStart ||
      !sub.currentPeriodEnd ||
      sub.currentPeriodEnd <= now ||
      sub.overageRateKobo <= 0n
    ) {
      return false;
    }

    const active = await this.prisma.employee.count({
      where: {
        organizationId: sub.organizationId,
        status: { in: BILLABLE_STATUSES },
      },
    });
    const alreadyCovered = Math.max(
      sub.billedEmployeeCount,
      sub.includedEmployees,
    );
    const extra = active - alreadyCovered;
    if (extra <= 0) return false;

    const open = await this.prisma.billingInvoice.findFirst({
      where: { subscriptionId: sub.id, kind: 'OVERAGE_TRUEUP', status: 'OPEN' },
    });
    if (open) return false;

    const totalDays = Math.round(
      (sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()) /
        DAY_MS,
    );
    const remainingDays = Math.ceil(
      (sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS,
    );
    const months = MONTHS_IN_CYCLE[sub.billingCycle as BillingCycle];
    const unitForPeriod = sub.overageRateKobo * BigInt(months);
    const amountKobo =
      (BigInt(extra) * unitForPeriod * BigInt(remainingDays)) /
      BigInt(totalDays);
    if (amountKobo <= 0n) return false;

    const invoice = await this.invoices.issue({
      subscription: sub,
      kind: 'OVERAGE_TRUEUP',
      periodStart: now,
      periodEnd: sub.currentPeriodEnd,
      dueAt: new Date(now.getTime() + OVERAGE_PAYMENT_TERMS_DAYS * DAY_MS),
      lines: [
        {
          code: 'OVERAGE',
          description: `${extra} employee(s) above the included allowance for ${remainingDays} of ${totalDays} days`,
          quantity: extra,
          unitAmountKobo:
            (unitForPeriod * BigInt(remainingDays)) / BigInt(totalDays),
          amountKobo,
        },
      ],
      totalKobo: amountKobo,
      billedEmployeeCount: active,
    });
    await this.notifier.invoiceIssued(invoice);
    return true;
  }
}
