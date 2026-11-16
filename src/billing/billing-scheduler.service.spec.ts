import { Test, TestingModule } from '@nestjs/testing';
import { BillingSchedulerService } from './billing-scheduler.service';
import { PrismaService } from '../database/prisma.service';
import { InvoicesService } from './invoices.service';

const NOW = new Date('2026-11-16T12:00:00Z');

describe('BillingSchedulerService', () => {
  let service: BillingSchedulerService;
  let prisma: {
    billingInvoice: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    subscription: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
    billingPlan: {
      findUnique: jest.Mock;
    };
    employee: {
      count: jest.Mock;
    };
    auditEvent: {
      create: jest.Mock;
    };
  };
  let invoices: {
    issueWithCheckout: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      billingInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      subscription: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      billingPlan: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { code: string } }) => {
          if (where.code === 'FREE') {
            return Promise.resolve({
              code: 'FREE',
              name: 'Free',
              includedEmployees: 5,
              monthlyFeeKobo: 0n,
              annualFeeKobo: 0n,
              overageRateKobo: 0n,
              maxOverageEmployees: 0,
            });
          }
          if (where.code === 'STARTER') {
            return Promise.resolve({
              code: 'STARTER',
              name: 'Starter',
              includedEmployees: 15,
              monthlyFeeKobo: 1_000_000n,
              annualFeeKobo: 10_800_000n,
              overageRateKobo: 50_000n,
              maxOverageEmployees: 15,
            });
          }
          return Promise.resolve(null);
        }),
      },
      employee: {
        count: jest.fn().mockResolvedValue(10),
      },
      auditEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    invoices = {
      issueWithCheckout: jest.fn().mockResolvedValue({
        invoice: { id: 'inv-renew-1', number: 'INV-20261116-RENEW1' },
        checkoutUrl: 'https://checkout.bachs.io/chk_renew',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoices },
      ],
    }).compile();

    service = module.get<BillingSchedulerService>(BillingSchedulerService);
  });

  describe('checkOverdueInvoices', () => {
    it('moves an ACTIVE subscription to PAST_DUE with a 7-day grace window when invoice is overdue', async () => {
      const overdueDueAt = new Date('2026-11-10T00:00:00Z');
      const invoice = {
        id: 'inv-1',
        number: 'INV-20261110-001',
        dueAt: overdueDueAt,
        subscription: {
          id: 'sub-1',
          organizationId: 'org-1',
          status: 'ACTIVE',
          graceEndsAt: null,
        },
      };
      prisma.billingInvoice.findMany.mockResolvedValue([invoice]);

      await service.checkOverdueInvoices(NOW);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          status: 'PAST_DUE',
          graceEndsAt: new Date(overdueDueAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'billing.subscription_past_due',
        }),
      });
    });
  });

  describe('checkGracePeriods', () => {
    it('moves a PAST_DUE subscription to RESTRICTED when grace period has elapsed', async () => {
      const pastDueSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'PAST_DUE',
        graceEndsAt: new Date('2026-11-15T00:00:00Z'), // expired yesterday
      };
      prisma.subscription.findMany.mockResolvedValue([pastDueSub]);

      await service.checkGracePeriods(NOW);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'RESTRICTED' },
      });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'billing.subscription_restricted',
        }),
      });
    });
  });

  describe('checkPeriodExpirations', () => {
    it('reverts a cancelled subscription to the FREE plan when currentPeriodEnd passes', async () => {
      const cancelledSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        planCode: 'STARTER',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2026-11-15T00:00:00Z'),
      };
      prisma.subscription.findMany.mockResolvedValue([cancelledSub]);

      await service.checkPeriodExpirations(NOW);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: 'FREE',
          planCode: 'FREE',
          baseFeeKobo: 0n,
          cancelAtPeriodEnd: false,
        }),
      });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'billing.subscription_cancelled',
        }),
      });
    });

    it('applies a scheduled pending downgrade when currentPeriodEnd passes', async () => {
      const pendingDowngradeSub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        planCode: 'GROWTH',
        pendingPlanCode: 'STARTER',
        pendingBillingCycle: 'MONTHLY',
        billingCycle: 'MONTHLY',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-11-15T00:00:00Z'),
      };
      prisma.subscription.findMany.mockResolvedValue([pendingDowngradeSub]);

      await service.checkPeriodExpirations(NOW);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          planCode: 'STARTER',
          pendingPlanCode: null,
          includedEmployees: 15,
          baseFeeKobo: 1_000_000n,
        }),
      });
      expect(prisma.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          action: 'billing.subscription_plan_change_applied',
        }),
      });
    });
  });

  describe('issueRenewalInvoices', () => {
    it('issues a RENEWAL invoice 7 days before periodEnd for active subscriptions', async () => {
      const sub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-11-20T00:00:00Z'), // 4 days from NOW (within 7-day window)
      };
      prisma.subscription.findMany.mockResolvedValue([sub]);
      prisma.billingInvoice.findFirst.mockResolvedValue(null); // no existing invoice

      await service.issueRenewalInvoices(NOW);

      expect(invoices.issueWithCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'RENEWAL',
          targetPlanCode: 'STARTER',
          dueAt: sub.currentPeriodEnd,
        }),
      );
    });

    it('skips issuing renewal invoice if one already exists for that period', async () => {
      const sub = {
        id: 'sub-1',
        organizationId: 'org-1',
        status: 'ACTIVE',
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-11-20T00:00:00Z'),
      };
      prisma.subscription.findMany.mockResolvedValue([sub]);
      prisma.billingInvoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

      await service.issueRenewalInvoices(NOW);

      expect(invoices.issueWithCheckout).not.toHaveBeenCalled();
    });
  });
});
