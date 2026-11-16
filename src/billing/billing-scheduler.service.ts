import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { InvoicesService } from './invoices.service';
import {
  BILLABLE_STATUSES,
  FREE_PLAN_CODE,
  addCycle,
  termsFromPlan,
} from './billing-catalog';
import { BillingCycle, priceForPeriod } from './domain/pricing';
import { transition } from './domain/state-machine';
import type { SubscriptionStatus } from './domain/entitlements';

/** Poll interval: runs once an hour in production (disabled in tests). */
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;
/** Renewal invoices are issued 7 days ahead of period end. */
const RENEWAL_LEAD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private isShuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  onApplicationBootstrap() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.DISABLE_BILLING_SCHEDULER === 'true'
    ) {
      return;
    }
    this.logger.log('Starting Billing Lifecycle Background Scheduler');
    // Initial run delayed by 15s to allow bootstrap completion, then hourly.
    this.timer = setTimeout(() => {
      void this.runCycle();
      this.timer = setInterval(() => {
        void this.runCycle();
      }, SCHEDULER_INTERVAL_MS);
    }, 15000);
  }

  onApplicationShutdown() {
    this.logger.log('Stopping Billing Lifecycle Background Scheduler');
    this.isShuttingDown = true;
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Orchestrates the complete billing lifecycle for all organizations.
   * Can be invoked directly by tests or operator scripts.
   */
  async runCycle(now: Date = new Date()) {
    if (this.isProcessing || this.isShuttingDown) return;
    this.isProcessing = true;

    try {
      await this.checkOverdueInvoices(now);
      await this.checkGracePeriods(now);
      await this.checkPeriodExpirations(now);
      await this.issueRenewalInvoices(now);
    } catch (err: any) {
      this.logger.error(
        `Error running billing lifecycle cycle: ${err?.message ?? err}`,
        err?.stack,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 1. Overdue Check:
   * Finds ACTIVE subscriptions with an OPEN invoice past dueAt.
   * Moves status ACTIVE -> PAST_DUE with a 7-day grace period.
   */
  async checkOverdueInvoices(now: Date) {
    const overdueInvoices = await this.prisma.billingInvoice.findMany({
      where: {
        status: 'OPEN',
        dueAt: { lt: now },
        subscription: { status: 'ACTIVE' },
      },
      include: { subscription: true },
    });

    for (const invoice of overdueInvoices) {
      const sub = invoice.subscription;
      const next = transition(
        { status: sub.status as SubscriptionStatus, graceEndsAt: sub.graceEndsAt },
        { type: 'INVOICE_OVERDUE', dueAt: invoice.dueAt },
      );

      if (next.status === sub.status) continue;

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: next.status, graceEndsAt: next.graceEndsAt },
      });

      await this.prisma.auditEvent.create({
        data: {
          organizationId: sub.organizationId,
          actorUserId: 'system',
          action: 'billing.subscription_past_due',
          targetType: 'subscription',
          targetId: sub.id,
          description: `Subscription moved to PAST_DUE for overdue invoice ${invoice.number}. Grace ends at ${next.graceEndsAt?.toISOString()}`,
          changes: {
            previousStatus: sub.status,
            newStatus: next.status,
            graceEndsAt: next.graceEndsAt?.toISOString(),
            invoiceId: invoice.id,
          },
        },
      });
    }
  }

  /**
   * 2. Grace Period Check:
   * Finds PAST_DUE subscriptions whose grace period has ended.
   * Moves status PAST_DUE -> RESTRICTED (locks payroll and gates features).
   */
  async checkGracePeriods(now: Date) {
    const expiredGraceSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        graceEndsAt: { lte: now },
      },
    });

    for (const sub of expiredGraceSubs) {
      const next = transition(
        { status: sub.status as SubscriptionStatus, graceEndsAt: sub.graceEndsAt },
        { type: 'GRACE_CHECK', now },
      );

      if (next.status === sub.status) continue;

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: next.status },
      });

      await this.prisma.auditEvent.create({
        data: {
          organizationId: sub.organizationId,
          actorUserId: 'system',
          action: 'billing.subscription_restricted',
          targetType: 'subscription',
          targetId: sub.id,
          description: `Subscription grace period expired; restricted features applied for organization ${sub.organizationId}`,
          changes: {
            previousStatus: sub.status,
            newStatus: next.status,
            restrictedAt: now.toISOString(),
          },
        },
      });
    }
  }

  /**
   * 3. Period Expiration & Downgrade/Cancellation Processing:
   * When currentPeriodEnd is reached:
   * - If cancelAtPeriodEnd is true -> Reverts subscription to FREE.
   * - If pendingPlanCode is set -> Applies the new plan commercial terms.
   */
  async checkPeriodExpirations(now: Date) {
    const expiredSubs = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE', 'RESTRICTED'] },
        currentPeriodEnd: { lte: now },
        OR: [
          { cancelAtPeriodEnd: true },
          { pendingPlanCode: { not: null } },
        ],
      },
    });

    const freePlan = await this.prisma.billingPlan.findUnique({
      where: { code: FREE_PLAN_CODE },
    });

    for (const sub of expiredSubs) {
      if (sub.cancelAtPeriodEnd && freePlan) {
        // Return to Free
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'FREE',
            planCode: FREE_PLAN_CODE,
            includedEmployees: freePlan.includedEmployees,
            baseFeeKobo: 0n,
            overageRateKobo: 0n,
            maxOverageEmployees: freePlan.maxOverageEmployees,
            cancelAtPeriodEnd: false,
            pendingPlanCode: null,
            pendingBillingCycle: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            graceEndsAt: null,
          },
        });

        await this.prisma.auditEvent.create({
          data: {
            organizationId: sub.organizationId,
            actorUserId: 'system',
            action: 'billing.subscription_cancelled',
            targetType: 'subscription',
            targetId: sub.id,
            description: `Subscription reached end of period and reverted to Free tier`,
            changes: {
              previousPlan: sub.planCode,
              newPlan: FREE_PLAN_CODE,
              status: 'FREE',
            },
          },
        });
      } else if (sub.pendingPlanCode) {
        // Apply scheduled downgrade or plan change
        const targetPlan = await this.prisma.billingPlan.findUnique({
          where: { code: sub.pendingPlanCode },
        });

        if (targetPlan) {
          const cycle = (sub.pendingBillingCycle ?? sub.billingCycle) as BillingCycle;
          const terms = termsFromPlan(targetPlan, cycle);
          const newPeriodEnd = addCycle(now, cycle);

          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: {
              planCode: targetPlan.code,
              billingCycle: cycle,
              includedEmployees: terms.includedEmployees,
              baseFeeKobo: terms.baseFeeKobo,
              overageRateKobo: terms.overageRateKobo,
              maxOverageEmployees: terms.maxOverageEmployees,
              pendingPlanCode: null,
              pendingBillingCycle: null,
              currentPeriodStart: now,
              currentPeriodEnd: newPeriodEnd,
            },
          });

          await this.prisma.auditEvent.create({
            data: {
              organizationId: sub.organizationId,
              actorUserId: 'system',
              action: 'billing.subscription_plan_change_applied',
              targetType: 'subscription',
              targetId: sub.id,
              description: `Applied scheduled plan change to ${targetPlan.code} (${cycle})`,
              changes: {
                previousPlan: sub.planCode,
                newPlan: targetPlan.code,
                billingCycle: cycle,
              },
            },
          });
        }
      }
    }
  }

  /**
   * 4. Automated Renewal Invoices:
   * Issues a RENEWAL invoice 7 days before currentPeriodEnd for active subscribers
   * who have not scheduled a cancellation.
   */
  async issueRenewalInvoices(now: Date) {
    const leadWindow = new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY_MS);

    const renewalSubs = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: leadWindow, gt: now },
      },
    });

    for (const sub of renewalSubs) {
      if (!sub.currentPeriodEnd) continue;

      // Check if a renewal invoice was already issued for this upcoming period
      const existing = await this.prisma.billingInvoice.findFirst({
        where: {
          subscriptionId: sub.id,
          kind: 'RENEWAL',
          periodStart: sub.currentPeriodEnd,
          status: { in: ['OPEN', 'PAID'] },
        },
      });

      if (existing) continue;

      try {
        const billableEmployees = await this.prisma.employee.count({
          where: {
            organizationId: sub.organizationId,
            status: { in: BILLABLE_STATUSES },
          },
        });

        const cycle = sub.billingCycle as BillingCycle;
        const targetPlanCode = sub.pendingPlanCode ?? sub.planCode;
        const targetPlan = await this.prisma.billingPlan.findUnique({
          where: { code: targetPlanCode },
        });

        if (!targetPlan) continue;

        const terms = termsFromPlan(targetPlan, cycle);
        const quote = priceForPeriod(terms, cycle, billableEmployees);
        const periodStart = sub.currentPeriodEnd;
        const periodEnd = addCycle(periodStart, cycle);

        await this.invoices.issueWithCheckout({
          subscription: sub,
          kind: 'RENEWAL',
          periodStart,
          periodEnd,
          dueAt: periodStart,
          lines: quote.lines,
          totalKobo: quote.totalKobo,
          targetPlanCode: targetPlan.code,
          targetBillingCycle: cycle,
          targetTerms: terms,
          billedEmployeeCount: billableEmployees,
        });

        this.logger.log(
          `Issued RENEWAL invoice for org ${sub.organizationId} (plan=${targetPlan.code}, amount=${quote.totalKobo} kobo)`,
        );
      } catch (err: any) {
        this.logger.warn(
          `Failed to issue renewal invoice for subscription ${sub.id}: ${err?.message ?? err}`,
        );
      }
    }
  }
}
