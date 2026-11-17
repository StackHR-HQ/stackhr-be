import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  BILLABLE_STATUSES,
  FREE_PLAN_CODE,
  SEAT_HOLDING_STATUSES,
  addCycle,
  termsFromPlan,
} from './billing-catalog';
import {
  BillingCycle,
  CommercialTerms,
  koboToBachsAmount,
  priceForPeriod,
} from './domain/pricing';
import { prorateUpgrade } from './domain/proration';
import { InvoicesService } from './invoices.service';

export interface ChangePlanInput {
  planCode: string;
  /** Optional cycle switch; always takes effect at renewal. */
  billingCycle?: BillingCycle;
}

export interface SubscribeInput {
  planCode: string;
  billingCycle: BillingCycle;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Every org has exactly one subscription row. Orgs created before billing
   * existed (or since) get a FREE row on first access — there is no trial.
   */
  async getOrCreateForOrg(organizationId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;

    const free = await this.prisma.billingPlan.findUnique({
      where: { code: FREE_PLAN_CODE },
    });
    if (!free) throw new Error('FREE plan missing from billing catalog');

    try {
      return await this.prisma.subscription.create({
        data: {
          organizationId,
          planCode: FREE_PLAN_CODE,
          status: 'FREE',
          billingCycle: 'MONTHLY',
          includedEmployees: free.includedEmployees,
          baseFeeKobo: 0n,
          overageRateKobo: 0n,
          maxOverageEmployees: free.maxOverageEmployees,
        },
      });
    } catch (error: any) {
      // Concurrent first access: another request created it.
      if (error?.code === 'P2002') {
        return this.prisma.subscription.findUnique({
          where: { organizationId },
        });
      }
      throw error;
    }
  }

  /**
   * Free → paid. Issues an INITIAL invoice + checkout; the plan is applied by
   * the payment webhook, never on redirect.
   */
  async subscribe(organizationId: string, input: SubscribeInput) {
    const sub = await this.getOrCreateForOrg(organizationId);
    if (!sub) throw new Error('Subscription could not be created');
    if (sub.status !== 'FREE') {
      throw new ConflictException(
        sub.status === 'RESTRICTED'
          ? 'Pay the outstanding invoice to restore your plan'
          : 'Already on a paid plan; use change-plan instead',
      );
    }

    const plan = await this.loadPurchasablePlan(input.planCode);
    const { billable, seats } = await this.headcount(organizationId);
    this.assertFits(plan, seats);

    const terms = termsFromPlan(plan, input.billingCycle);
    const quote = priceForPeriod(terms, input.billingCycle, billable);
    const now = new Date();

    await this.invoices.voidAbandoned(organizationId, [
      'INITIAL',
      'UPGRADE_PRORATION',
    ]);
    const { invoice, checkoutUrl } = await this.invoices.issueWithCheckout({
      subscription: sub,
      kind: 'INITIAL',
      periodStart: now,
      periodEnd: addCycle(now, input.billingCycle),
      dueAt: now,
      lines: quote.lines,
      totalKobo: quote.totalKobo,
      targetPlanCode: plan.code,
      targetBillingCycle: input.billingCycle,
      targetTerms: terms,
      billedEmployeeCount: billable,
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      totalKobo: invoice.totalKobo,
      totalNaira: koboToBachsAmount(invoice.totalKobo),
      checkoutUrl,
    };
  }

  /**
   * Upgrades apply immediately once the prorated invoice is paid; downgrades
   * and cycle changes are scheduled for the end of the current period.
   */
  async changePlan(organizationId: string, input: ChangePlanInput) {
    const sub = await this.requireChangeableSubscription(organizationId);
    const cycle = sub.billingCycle as BillingCycle;
    const cycleChange =
      input.billingCycle && input.billingCycle !== cycle
        ? input.billingCycle
        : null;

    if (input.planCode === sub.planCode) {
      if (
        sub.pendingPlanCode ||
        sub.cancelAtPeriodEnd ||
        (sub.pendingBillingCycle && !cycleChange)
      ) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            pendingPlanCode: null,
            pendingBillingCycle: cycleChange ?? null,
            cancelAtPeriodEnd: false,
          },
        });
        return {
          effective: 'IMMEDIATE' as const,
          planCode: sub.planCode,
          cancelAtPeriodEnd: false,
          message: sub.pendingPlanCode
            ? 'Pending plan change cancelled'
            : 'Subscription cancellation undone',
        };
      }

      if (!cycleChange) {
        throw new BadRequestException('You are already on this plan');
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingBillingCycle: cycleChange },
      });
      return this.scheduled(sub, sub.planCode, cycleChange);
    }

    const [target, current] = await Promise.all([
      this.loadPurchasablePlan(input.planCode),
      this.prisma.billingPlan.findUnique({ where: { code: sub.planCode } }),
    ]);
    if (!current) throw new Error(`Plan ${sub.planCode} missing from catalog`);
    const { billable, seats } = await this.headcount(organizationId);
    this.assertFits(target, seats);

    if (target.sortOrder < current.sortOrder) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          pendingPlanCode: target.code,
          ...(cycleChange ? { pendingBillingCycle: cycleChange } : {}),
        },
      });
      return this.scheduled(sub, target.code, cycleChange ?? cycle);
    }

    // Upgrade (priced in the current cycle; any cycle switch waits for renewal).
    const toTerms = termsFromPlan(target, cycle);
    const now = new Date();
    const proration = prorateUpgrade({
      from: this.snapshotTerms(sub),
      to: toTerms,
      cycle,
      activeEmployees: billable,
      periodStart: sub.currentPeriodStart!,
      periodEnd: sub.currentPeriodEnd!,
      now,
    });

    if (cycleChange) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { pendingBillingCycle: cycleChange },
      });
    }

    if (proration.amountKobo === 0n) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          planCode: target.code,
          pendingPlanCode: null,
          ...this.termsData(toTerms),
        },
      });
      return { effective: 'IMMEDIATE' as const, planCode: target.code };
    }

    await this.invoices.voidAbandoned(organizationId, [
      'INITIAL',
      'UPGRADE_PRORATION',
    ]);
    const { invoice, checkoutUrl } = await this.invoices.issueWithCheckout({
      subscription: sub,
      kind: 'UPGRADE_PRORATION',
      periodStart: now,
      periodEnd: sub.currentPeriodEnd!,
      dueAt: now,
      lines: [
        {
          code: 'PRORATION',
          description: `Upgrade ${current.name} → ${target.name} for ${proration.remainingDays} of ${proration.totalDays} days`,
          quantity: 1,
          unitAmountKobo: proration.amountKobo,
          amountKobo: proration.amountKobo,
        },
      ],
      totalKobo: proration.amountKobo,
      targetPlanCode: target.code,
      targetBillingCycle: cycle,
      targetTerms: toTerms,
      billedEmployeeCount: billable,
    });

    return {
      effective: 'ON_PAYMENT' as const,
      planCode: target.code,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      totalKobo: invoice.totalKobo,
      totalNaira: koboToBachsAmount(invoice.totalKobo),
      checkoutUrl,
    };
  }

  /** Cancellation takes effect at period end; the org then returns to Free. */
  async cancel(organizationId: string) {
    const sub = await this.getOrCreateForOrg(organizationId);
    if (!sub || sub.status === 'FREE') {
      throw new BadRequestException('There is no paid subscription to cancel');
    }
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });
    return {
      cancelAtPeriodEnd: true,
      effectiveAt: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /** Undo a pending period-end cancellation and re-enable auto-renewal. */
  async resume(organizationId: string) {
    const sub = await this.getOrCreateForOrg(organizationId);
    if (!sub || sub.status === 'FREE') {
      throw new BadRequestException('There is no paid subscription to resume');
    }
    if (sub.cancelAtPeriodEnd) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: false },
      });
    }
    return {
      cancelAtPeriodEnd: false,
      effectiveAt: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  private async requireChangeableSubscription(organizationId: string) {
    const sub = await this.getOrCreateForOrg(organizationId);
    if (!sub) throw new Error('Subscription could not be created');
    if (sub.status === 'FREE') {
      throw new BadRequestException(
        'You are on the Free plan; subscribe first',
      );
    }
    if (sub.status !== 'ACTIVE') {
      throw new ConflictException(
        'Pay the outstanding invoice before changing your plan',
      );
    }
    if (sub.customTerms) {
      throw new ConflictException(
        'Your plan has custom terms; contact StackHR to change it',
      );
    }
    return sub;
  }

  private scheduled(
    sub: { currentPeriodEnd: Date | null },
    planCode: string,
    billingCycle: string,
  ) {
    return {
      effective: 'AT_RENEWAL' as const,
      planCode,
      billingCycle,
      effectiveAt: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  private snapshotTerms(sub: {
    includedEmployees: number;
    baseFeeKobo: bigint;
    overageRateKobo: bigint;
    maxOverageEmployees: number;
  }): CommercialTerms {
    return {
      includedEmployees: sub.includedEmployees,
      baseFeeKobo: sub.baseFeeKobo,
      overageRateKobo: sub.overageRateKobo,
      maxOverageEmployees: sub.maxOverageEmployees,
    };
  }

  private termsData(terms: CommercialTerms) {
    return {
      includedEmployees: terms.includedEmployees,
      baseFeeKobo: terms.baseFeeKobo,
      overageRateKobo: terms.overageRateKobo,
      maxOverageEmployees: terms.maxOverageEmployees,
    };
  }

  private async loadPurchasablePlan(code: string) {
    const plan = await this.prisma.billingPlan.findUnique({ where: { code } });
    if (!plan || !plan.isActive || plan.code === FREE_PLAN_CODE) {
      throw new BadRequestException(`Unknown plan "${code}"`);
    }
    if (!plan.selfServe) {
      throw new BadRequestException(
        `${plan.name} is arranged with our sales team — please contact us`,
      );
    }
    return plan;
  }

  private async headcount(organizationId: string) {
    const [billable, seats] = await Promise.all([
      this.prisma.employee.count({
        where: { organizationId, status: { in: BILLABLE_STATUSES } },
      }),
      this.prisma.employee.count({
        where: { organizationId, status: { in: SEAT_HOLDING_STATUSES } },
      }),
    ]);
    return { billable, seats };
  }

  private assertFits(
    plan: {
      name: string;
      includedEmployees: number;
      maxOverageEmployees: number;
    },
    seats: number,
  ) {
    const limit = plan.includedEmployees + plan.maxOverageEmployees;
    if (seats > limit) {
      throw new ConflictException(
        `${plan.name} supports up to ${limit} employees; you have ${seats}. Choose a larger plan.`,
      );
    }
  }
}
