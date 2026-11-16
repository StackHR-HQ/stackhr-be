import { Test, TestingModule } from '@nestjs/testing';
import { BillingCycleService } from './billing-cycle.service';
import { InvoicesService } from './invoices.service';
import { BillingNotifier } from './billing-notifier.service';
import { BachsClient } from './bachs/bachs.client';
import { PrismaService } from '../database/prisma.service';
import {
  activeSubscription,
  createPrismaMock,
} from './testing/billing-fixtures';

const DAY = 24 * 60 * 60 * 1000;
const PERIOD_END = new Date('2026-12-01T00:00:00Z');

describe('BillingCycleService', () => {
  let service: BillingCycleService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifier: Record<keyof BillingNotifier, jest.Mock>;
  let bachs: { chargeSavedCard: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    notifier = {
      invoiceIssued: jest.fn(),
      paymentReceived: jest.fn(),
      paymentFailed: jest.fn(),
      overdue: jest.fn(),
      restricted: jest.fn(),
    };
    bachs = {
      chargeSavedCard: jest.fn().mockResolvedValue({ chargeId: 'ch_auto' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingCycleService,
        InvoicesService,
        { provide: BillingNotifier, useValue: notifier },
        { provide: BachsClient, useValue: bachs },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BillingCycleService);
  });

  describe('issueRenewals', () => {
    it('invoices the next period 7 days ahead, priced on current headcount, and emails it', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER'),
      ]);
      prisma.employee.count.mockResolvedValue(18); // 3 over Starter's 15

      await service.issueRenewals(new Date(PERIOD_END.getTime() - 6 * DAY));

      expect(prisma.billingInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'RENEWAL',
          status: 'OPEN',
          periodStart: PERIOD_END,
          periodEnd: new Date('2027-01-01T00:00:00Z'),
          dueAt: PERIOD_END,
          totalKobo: 1_150_000n, // ₦10,000 + 3 × ₦500
          targetPlanCode: 'STARTER',
          targetBillingCycle: 'MONTHLY',
          billedEmployeeCount: 18,
        }),
      });
      expect(notifier.invoiceIssued).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'RENEWAL' }),
      );
    });

    const sixDaysBefore = new Date(PERIOD_END.getTime() - 6 * DAY);

    it('applies a scheduled downgrade by pricing the renewal on the new plan', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('GROWTH', { pendingPlanCode: 'STARTER' }),
      ]);
      prisma.employee.count.mockResolvedValue(10);

      await service.issueRenewals(sixDaysBefore);

      expect(prisma.billingInvoice.create.mock.calls[0][0].data).toMatchObject({
        totalKobo: 1_000_000n, // Starter ₦10,000, not Growth ₦20,000
        targetPlanCode: 'STARTER',
        targetTerms: { includedEmployees: 15, baseFeeKobo: '1000000' },
      });
    });

    it('keeps the price a customer signed up on, even if the catalog has since changed', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER', { baseFeeKobo: 800_000n }), // older ₦8,000 price
      ]);
      prisma.employee.count.mockResolvedValue(10);

      await service.issueRenewals(sixDaysBefore);

      expect(prisma.billingInvoice.create.mock.calls[0][0].data.totalKobo).toBe(
        800_000n,
      );
    });

    it('issues nothing when the next period is already invoiced, or the subscription is cancelling', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER'),
        activeSubscription('GROWTH', { id: 'sub-2', cancelAtPeriodEnd: true }),
      ]);
      prisma.billingInvoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

      const result = await service.issueRenewals(sixDaysBefore);

      expect(result).toEqual({ issued: 0 });
      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
      expect(notifier.invoiceIssued).not.toHaveBeenCalled();
    });

    it('does not renew before the 7-day window opens', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER'),
      ]);

      await service.issueRenewals(new Date(PERIOD_END.getTime() - 8 * DAY));

      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    });
  });

  describe('processPeriodEnds', () => {
    it('returns a cancelled subscription to Free at period end and voids its open renewal', async () => {
      prisma.subscription.findMany.mockImplementation(({ where }) =>
        Promise.resolve(
          where?.cancelAtPeriodEnd === true
            ? [activeSubscription('GROWTH', { cancelAtPeriodEnd: true })]
            : [],
        ),
      );

      await service.processPeriodEnds(new Date(PERIOD_END.getTime() + 60_000));

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          planCode: 'FREE',
          status: 'FREE',
          includedEmployees: 5,
          baseFeeKobo: 0n,
          maxOverageEmployees: 0,
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          pendingPlanCode: null,
        }),
      });
      expect(prisma.billingInvoice.updateMany).toHaveBeenCalledWith({
        where: {
          subscriptionId: 'sub-1',
          status: 'OPEN',
          kind: { in: ['RENEWAL', 'OVERAGE_TRUEUP'] },
        },
        data: { status: 'VOID' },
      });
    });

    function openRenewal(overrides: Record<string, unknown> = {}) {
      return {
        id: 'inv-r1',
        organizationId: 'org-1',
        subscriptionId: 'sub-1',
        number: 'INV-20261124-RRRRRR',
        kind: 'RENEWAL',
        status: 'OPEN',
        totalKobo: 1_000_000n,
        dueAt: PERIOD_END,
        remindersSent: 0,
        lastChargeAttemptAt: null,
        subscription: activeSubscription('STARTER'),
        ...overrides,
      };
    }
    const GRACE_END = new Date('2026-12-08T00:00:00Z');

    it('marks the subscription PAST_DUE with 7 days of grace when a renewal goes unpaid, emailing once', async () => {
      prisma.billingInvoice.findMany.mockResolvedValue([openRenewal()]);

      await service.processPeriodEnds(
        new Date(PERIOD_END.getTime() + 60 * 60 * 1000),
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'PAST_DUE', graceEndsAt: GRACE_END },
      });
      expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-r1' },
        data: { remindersSent: 1 },
      });
      expect(notifier.overdue).toHaveBeenCalledTimes(1);
      expect(notifier.overdue).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-r1' }),
        GRACE_END,
      );
    });

    it('changes nothing on a re-run once the overdue notice has gone out', async () => {
      prisma.billingInvoice.findMany.mockResolvedValue([
        openRenewal({
          remindersSent: 1,
          subscription: activeSubscription('STARTER', {
            status: 'PAST_DUE',
            graceEndsAt: GRACE_END,
          }),
        }),
      ]);

      await service.processPeriodEnds(
        new Date(PERIOD_END.getTime() + 2 * 60 * 60 * 1000),
      );

      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(notifier.overdue).not.toHaveBeenCalled();
    });

    const pastDue = () =>
      activeSubscription('STARTER', {
        status: 'PAST_DUE',
        graceEndsAt: GRACE_END,
      });

    it('sends one mid-grace reminder from day 3 of grace', async () => {
      prisma.billingInvoice.findMany.mockResolvedValue([
        openRenewal({ remindersSent: 1, subscription: pastDue() }),
      ]);

      await service.processPeriodEnds(new Date(PERIOD_END.getTime() + 3 * DAY));

      expect(notifier.overdue).toHaveBeenCalledTimes(1);
      expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-r1' },
        data: { remindersSent: 2 },
      });
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('restricts the subscription when grace ends, emailing the restriction once', async () => {
      prisma.billingInvoice.findMany.mockResolvedValue([
        openRenewal({ remindersSent: 2, subscription: pastDue() }),
      ]);

      await service.processPeriodEnds(GRACE_END);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'RESTRICTED' },
      });
      expect(notifier.restricted).toHaveBeenCalledWith('org-1');
    });

    it('leaves an already RESTRICTED subscription alone on later runs', async () => {
      prisma.billingInvoice.findMany.mockResolvedValue([
        openRenewal({
          remindersSent: 2,
          subscription: activeSubscription('STARTER', {
            status: 'RESTRICTED',
            graceEndsAt: GRACE_END,
          }),
        }),
      ]);

      await service.processPeriodEnds(new Date(GRACE_END.getTime() + 5 * DAY));

      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(notifier.restricted).not.toHaveBeenCalled();
      expect(notifier.overdue).not.toHaveBeenCalled();
    });

    describe('saved-card auto-charge (BILLING_AUTO_CHARGE_ENABLED)', () => {
      const withCard = () =>
        openRenewal({
          subscription: activeSubscription('STARTER', {
            bachsPaymentMethodId: 'pm_123',
          }),
        });
      afterEach(() => {
        delete process.env.BILLING_AUTO_CHARGE_ENABLED;
      });

      it('charges the saved card on the due date and waits for the result before marking overdue', async () => {
        process.env.BILLING_AUTO_CHARGE_ENABLED = 'true';
        prisma.billingInvoice.findMany.mockResolvedValue([withCard()]);

        await service.processPeriodEnds(
          new Date(PERIOD_END.getTime() + 60_000),
        );

        expect(bachs.chargeSavedCard).toHaveBeenCalledWith({
          customerId: 'cust_existing',
          paymentMethodId: 'pm_123',
          amount: '10000.00',
          reference: expect.stringMatching(/^inv-r1\./),
          idempotencyKey: 'stackhr-autocharge-inv-r1-1',
          description: expect.stringContaining('INV-20261124-RRRRRR'),
        });
        expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
          where: { id: 'inv-r1' },
          data: { lastChargeAttemptAt: expect.any(Date) },
        });
        expect(prisma.subscription.update).not.toHaveBeenCalled();
        expect(notifier.overdue).not.toHaveBeenCalled();
      });

      it('marks overdue as usual once a charge attempt is 24 hours old and still unpaid', async () => {
        process.env.BILLING_AUTO_CHARGE_ENABLED = 'true';
        prisma.billingInvoice.findMany.mockResolvedValue([
          { ...withCard(), lastChargeAttemptAt: PERIOD_END },
        ]);

        await service.processPeriodEnds(
          new Date(PERIOD_END.getTime() + DAY + 60_000),
        );

        expect(bachs.chargeSavedCard).not.toHaveBeenCalled();
        expect(prisma.subscription.update).toHaveBeenCalledWith({
          where: { id: 'sub-1' },
          data: { status: 'PAST_DUE', graceEndsAt: GRACE_END },
        });
      });

      it('never charges when the flag is off', async () => {
        prisma.billingInvoice.findMany.mockResolvedValue([withCard()]);

        await service.processPeriodEnds(
          new Date(PERIOD_END.getTime() + 60_000),
        );

        expect(bachs.chargeSavedCard).not.toHaveBeenCalled();
      });
    });
  });

  describe('issueOverageTrueUps', () => {
    const NOV_16 = new Date('2026-11-16T00:00:00Z'); // 15 of 30 days left

    it('bills employees added beyond the allowance, prorated for the rest of the period', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER', { billedEmployeeCount: 12 }),
      ]);
      prisma.employee.count.mockResolvedValue(20);

      await service.issueOverageTrueUps(NOV_16);

      expect(prisma.billingInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'OVERAGE_TRUEUP',
          totalKobo: 125_000n, // 5 extra × ₦500 × 15/30 days
          periodStart: NOV_16,
          periodEnd: PERIOD_END,
          dueAt: new Date('2026-11-23T00:00:00Z'),
          billedEmployeeCount: 20,
          targetPlanCode: null,
        }),
      });
      expect(notifier.invoiceIssued).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'OVERAGE_TRUEUP' }),
      );
    });

    it('only bills the employees not already paid for', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER', { billedEmployeeCount: 18 }),
      ]);
      prisma.employee.count.mockResolvedValue(20);

      await service.issueOverageTrueUps(NOV_16);

      expect(prisma.billingInvoice.create.mock.calls[0][0].data.totalKobo).toBe(
        50_000n,
      ); // 2 × ₦500 × ½
    });

    it('issues nothing within the allowance, or while a true-up is still open', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        activeSubscription('STARTER', { billedEmployeeCount: 12 }),
      ]);
      prisma.employee.count.mockResolvedValue(15);
      await service.issueOverageTrueUps(NOV_16);

      prisma.employee.count.mockResolvedValue(20);
      prisma.billingInvoice.findFirst.mockResolvedValue({
        id: 'inv-open-trueup',
      });
      await service.issueOverageTrueUps(NOV_16);

      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    });
  });
});
