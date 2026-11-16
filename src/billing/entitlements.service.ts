import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  FREE_PLAN_CODE,
  SEAT_HOLDING_STATUSES,
  asEntitlements,
} from './billing-catalog';
import { SeatLimits, canAddEmployees } from './domain/seat-cap';
import {
  Entitlements,
  GatedFeature,
  SubscriptionStatus,
  resolveEntitlements,
} from './domain/entitlements';
import { SubscriptionsService } from './subscriptions.service';
import { PlanUpgradeRequiredException } from './plan-upgrade-required.exception';

const FEATURE_LABELS: Record<GatedFeature, string> = {
  payroll: 'Payroll',
  payslips: 'Payslips',
  disbursement: 'Salary and expense payouts',
  pensionRemittance: 'Pension remittance',
  payeRemittance: 'PAYE remittance',
};

export interface EffectivePlan {
  status: SubscriptionStatus;
  planCode: string;
  entitlements: Entitlements;
  seatLimits: SeatLimits;
}

/** Single place that answers "is this org allowed to do X on its plan?". */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getEffective(organizationId: string): Promise<EffectivePlan> {
    const sub = await this.subscriptions.getOrCreateForOrg(organizationId);
    if (!sub) throw new Error('Subscription could not be resolved');

    const [plan, free] = await Promise.all([
      this.prisma.billingPlan.findUnique({ where: { code: sub.planCode } }),
      this.prisma.billingPlan.findUnique({ where: { code: FREE_PLAN_CODE } }),
    ]);
    if (!plan || !free) throw new Error('Billing catalog is incomplete');

    const status = sub.status as SubscriptionStatus;
    // Free and restricted orgs get the Free ceiling; paid orgs their agreed terms.
    const onFreeTerms = status === 'FREE' || status === 'RESTRICTED';
    return {
      status,
      planCode: sub.planCode,
      seatLimits: onFreeTerms
        ? {
            includedEmployees: free.includedEmployees,
            maxOverageEmployees: free.maxOverageEmployees,
          }
        : {
            includedEmployees: sub.includedEmployees,
            maxOverageEmployees: sub.maxOverageEmployees,
          },
      entitlements: resolveEntitlements({
        status,
        plan: asEntitlements(plan.entitlements),
        free: asEntitlements(free.entitlements),
      }),
    };
  }

  async assertFeature(organizationId: string, feature: GatedFeature) {
    const effective = await this.getEffective(organizationId);
    if (effective.entitlements[feature]) return;

    const requiredPlan = await this.cheapestPlanWith(feature);
    throw new PlanUpgradeRequiredException(
      `${FEATURE_LABELS[feature]} is not included in your current plan. Upgrade to continue.`,
      {
        feature,
        currentPlan: effective.planCode,
        requiredPlan,
      },
    );
  }

  /**
   * Seats are held by ACTIVE, ONBOARDING and PENDING_INVITATION employees, so
   * a flood of invitations can't get round the cap. Batches are all-or-nothing.
   */
  async assertCanAddEmployees(organizationId: string, adding: number) {
    if (adding <= 0) return;
    const [effective, seatsUsed] = await Promise.all([
      this.getEffective(organizationId),
      this.prisma.employee.count({
        where: { organizationId, status: { in: SEAT_HOLDING_STATUSES } },
      }),
    ]);

    const check = canAddEmployees(effective.seatLimits, seatsUsed, adding);
    if (check.allowed) return;

    const requiredPlan = await this.smallestPlanFor(seatsUsed + adding);
    throw new PlanUpgradeRequiredException(
      `Your plan allows up to ${check.limit} employees (${check.remaining} remaining). Upgrade to add ${adding} more.`,
      {
        feature: 'employees',
        currentPlan: effective.planCode,
        requiredPlan,
        limit: check.limit,
        remaining: check.remaining,
        requested: adding,
      },
    );
  }

  private async smallestPlanFor(headcount: number): Promise<string> {
    const plans = await this.prisma.billingPlan.findMany({
      where: { isActive: true, selfServe: true },
      orderBy: { sortOrder: 'asc' },
    });
    const match = plans.find(
      (p) =>
        p.code !== FREE_PLAN_CODE &&
        p.includedEmployees + p.maxOverageEmployees >= headcount,
    );
    return match?.code ?? 'ENTERPRISE';
  }

  private async cheapestPlanWith(feature: GatedFeature): Promise<string> {
    const plans = await this.prisma.billingPlan.findMany({
      where: { isActive: true, selfServe: true },
      orderBy: { sortOrder: 'asc' },
    });
    const match = plans.find((p) => asEntitlements(p.entitlements)[feature]);
    return match?.code ?? 'ENTERPRISE';
  }
}
