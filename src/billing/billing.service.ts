import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BILLABLE_STATUSES,
  FREE_PLAN_CODE,
  SEAT_HOLDING_STATUSES,
  asEntitlements,
} from './billing-catalog';
import { resolveEntitlements, SubscriptionStatus } from './domain/entitlements';
import { koboToBachsAmount } from './domain/pricing';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly invoices: InvoicesService,
  ) {}

  requireOrgId(user: AuthenticatedUser): string {
    return this.checkOrgContext(user);
  }

  private checkOrgContext(user: AuthenticatedUser): string {
    if (!user.organizationId) {
      throw new BadRequestException(
        'An active organization context is required',
      );
    }
    return user.organizationId;
  }

  async getStatus(user: AuthenticatedUser) {
    const orgId = this.checkOrgContext(user);
    const sub = await this.subscriptions.getOrCreateForOrg(orgId);
    if (!sub) throw new NotFoundException('Subscription not found');

    const [plan, free, activeEmployeeCount, seatsUsed, openInvoice] =
      await Promise.all([
        this.prisma.billingPlan.findUnique({ where: { code: sub.planCode } }),
        this.prisma.billingPlan.findUnique({
          where: { code: FREE_PLAN_CODE },
        }),
        this.prisma.employee.count({
          where: { organizationId: orgId, status: { in: BILLABLE_STATUSES } },
        }),
        this.prisma.employee.count({
          where: {
            organizationId: orgId,
            status: { in: SEAT_HOLDING_STATUSES },
          },
        }),
        this.invoices.findOpenInvoice(orgId),
      ]);
    if (!plan || !free) throw new NotFoundException('Billing plan not found');

    const status = sub.status as SubscriptionStatus;
    // Once restricted, the effective seat ceiling is the Free one.
    const limits =
      status === 'RESTRICTED'
        ? {
            included: free.includedEmployees,
            overage: free.maxOverageEmployees,
          }
        : { included: sub.includedEmployees, overage: sub.maxOverageEmployees };

    return {
      status,
      planCode: sub.planCode,
      planName: plan.name,
      billingCycle: sub.billingCycle,
      activeEmployeeCount,
      seatsUsed,
      includedEmployees: limits.included,
      overageCap: limits.overage,
      seatLimit: limits.included + limits.overage,
      nextBillingDate:
        status === 'FREE'
          ? null
          : (sub.currentPeriodEnd?.toISOString() ?? null),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingPlanCode: sub.pendingPlanCode,
      pendingBillingCycle: sub.pendingBillingCycle,
      graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
      entitlements: resolveEntitlements({
        status,
        plan: asEntitlements(plan.entitlements),
        free: asEntitlements(free.entitlements),
      }),
      openInvoice: openInvoice
        ? {
            id: openInvoice.id,
            number: openInvoice.number,
            kind: openInvoice.kind,
            totalKobo: openInvoice.totalKobo,
            totalNaira: koboToBachsAmount(openInvoice.totalKobo),
            dueAt: openInvoice.dueAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Prices are shown only to signed-in business users (never on a public
   * route). Enterprise is negotiated, so it carries no price.
   */
  async listPlans(user: AuthenticatedUser) {
    this.checkOrgContext(user);
    const plans = await this.prisma.billingPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      currency: 'NGN',
      plans: plans.map((plan) => {
        if (!plan.selfServe) {
          return {
            code: plan.code,
            name: plan.name,
            selfServe: false,
            contactSales: true,
            entitlements: plan.entitlements,
          };
        }
        return {
          code: plan.code,
          name: plan.name,
          includedEmployees: plan.includedEmployees,
          maxEmployees: plan.includedEmployees + plan.maxOverageEmployees,
          monthlyPrice: koboToBachsAmount(plan.monthlyFeeKobo),
          annualPrice: koboToBachsAmount(plan.annualFeeKobo),
          overageRatePerEmployee: koboToBachsAmount(plan.overageRateKobo),
          selfServe: true,
          contactSales: false,
          entitlements: plan.entitlements,
        };
      }),
    };
  }
}
