import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { BachsClient } from './bachs/bachs.client';
import { PrismaService } from '../database/prisma.service';
import { PlanUpgradeRequiredException } from './plan-upgrade-required.exception';
import {
  activeSubscription,
  createPrismaMock,
} from './testing/billing-fixtures';

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as PlanUpgradeRequiredException;
  }
  throw new Error('expected the call to be rejected');
}

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementsService,
        SubscriptionsService,
        InvoicesService,
        { provide: BachsClient, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(EntitlementsService);
  });

  describe('assertFeature', () => {
    it('blocks payroll on the Free plan with 402 PLAN_UPGRADE_REQUIRED, suggesting Starter', async () => {
      const error = await rejection(service.assertFeature('org-1', 'payroll'));

      expect(error).toBeInstanceOf(PlanUpgradeRequiredException);
      expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(error.getResponse()).toMatchObject({
        code: 'PLAN_UPGRADE_REQUIRED',
        details: {
          feature: 'payroll',
          requiredPlan: 'STARTER',
          currentPlan: 'FREE',
        },
      });
    });

    it('keeps payroll available while PAST_DUE (grace period)', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { status: 'PAST_DUE' }),
      );

      await expect(
        service.assertFeature('org-1', 'payroll'),
      ).resolves.toBeUndefined();
    });

    it('blocks disbursement once a paid org is RESTRICTED', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { status: 'RESTRICTED' }),
      );

      const error = await rejection(
        service.assertFeature('org-1', 'disbursement'),
      );

      expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    });
  });

  describe('assertCanAddEmployees', () => {
    it('stops a Free org at 5 seats, counting pending invites, and suggests Starter', async () => {
      prisma.employee.count.mockResolvedValue(5); // seat-holding: ACTIVE + ONBOARDING + PENDING_INVITATION

      const error = await rejection(service.assertCanAddEmployees('org-1', 1));

      expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(error.getResponse()).toMatchObject({
        code: 'PLAN_UPGRADE_REQUIRED',
        details: {
          feature: 'employees',
          currentPlan: 'FREE',
          requiredPlan: 'STARTER',
          limit: 5,
          remaining: 0,
        },
      });
      expect(prisma.employee.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: { in: ['ACTIVE', 'ONBOARDING', 'PENDING_INVITATION'] },
        },
      });
    });

    it('rejects a whole import batch that would overshoot the cap and points to a plan that fits', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('STARTER'),
      );
      prisma.employee.count.mockResolvedValue(25); // Starter ceiling 30

      const error = await rejection(service.assertCanAddEmployees('org-1', 10));

      expect(error.getResponse()).toMatchObject({
        details: { requiredPlan: 'GROWTH', limit: 30, remaining: 5 },
      });
    });

    it('allows additions within the cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('STARTER'),
      );
      prisma.employee.count.mockResolvedValue(25);

      await expect(
        service.assertCanAddEmployees('org-1', 5),
      ).resolves.toBeUndefined();
    });
  });
});
