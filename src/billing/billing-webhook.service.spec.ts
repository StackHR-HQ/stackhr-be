import { Test, TestingModule } from '@nestjs/testing';
import { BillingWebhookService } from './billing-webhook.service';
import { PrismaService } from '../database/prisma.service';
import {
  activeSubscription,
  createPrismaMock,
} from './testing/billing-fixtures';
import type { BachsWebhookEvent } from './bachs/bachs.types';
import { BillingNotifier } from './billing-notifier.service';

const PERIOD_START = new Date('2026-11-16T00:00:00Z');
const PERIOD_END = new Date('2026-12-16T00:00:00Z');

function freeSubscription() {
  return {
    ...activeSubscription('STARTER'),
    planCode: 'FREE',
    status: 'FREE',
    includedEmployees: 5,
    baseFeeKobo: 0n,
    overageRateKobo: 0n,
    maxOverageEmployees: 0,
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };
}

function starterInitialInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    number: 'INV-20261116-AAAAAA',
    kind: 'INITIAL',
    status: 'OPEN',
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    totalKobo: 1_000_000n,
    targetPlanCode: 'STARTER',
    targetBillingCycle: 'MONTHLY',
    targetTerms: {
      includedEmployees: 15,
      baseFeeKobo: '1000000',
      overageRateKobo: '50000',
      maxOverageEmployees: 15,
    },
    billedEmployeeCount: 12,
    failedAttempts: 0,
    bachsCheckoutId: 'chk_1',
    subscription: freeSubscription(),
    ...overrides,
  };
}

function collectionEvent(
  type: string,
  data: Record<string, unknown> = {},
): BachsWebhookEvent {
  return {
    id: 'evt_1',
    type,
    created_at: '2026-11-16T00:05:00Z',
    data: {
      payment_id: 'pay_1',
      checkout_id: 'chk_1',
      reference: 'inv-1.m3x',
      amount: '10000.00',
      amount_paid: '10000.00',
      currency: 'NGN',
      ...data,
    },
  };
}

describe('BillingWebhookService', () => {
  let service: BillingWebhookService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifier: { paymentReceived: jest.Mock; paymentFailed: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    notifier = { paymentReceived: jest.fn(), paymentFailed: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingWebhookService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillingNotifier, useValue: notifier },
      ],
    }).compile();
    service = module.get(BillingWebhookService);
  });

  it('marks the invoice PAID and activates the Starter plan on the snapshotted terms', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(starterInitialInvoice());

    await service.handle(collectionEvent('collection.succeeded'));

    expect(prisma.billingInvoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'OPEN' },
      data: expect.objectContaining({
        status: 'PAID',
        paidAt: expect.any(Date),
        bachsChargeId: 'pay_1',
      }),
    });
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        graceEndsAt: null,
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
        includedEmployees: 15,
        baseFeeKobo: 1_000_000n,
        overageRateKobo: 50_000n,
        maxOverageEmployees: 15,
        currentPeriodStart: PERIOD_START,
        currentPeriodEnd: PERIOD_END,
        billedEmployeeCount: 12,
      }),
    });
    expect(prisma.billingWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'whe-1' },
      data: { processedAt: expect.any(Date), error: null },
    });
  });

  it('ignores a redelivery of an event that was already processed', async () => {
    prisma.billingWebhookEvent.findUnique.mockResolvedValue({
      id: 'whe-1',
      processedAt: new Date(),
    });

    const result = await service.handle(
      collectionEvent('collection.succeeded'),
    );

    expect(result).toEqual({ duplicate: true });
    expect(prisma.billingInvoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('leaves an underpaid invoice OPEN and records the shortfall without activating', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(starterInitialInvoice());

    await service.handle(
      collectionEvent('collection.succeeded', { amount_paid: '9000.00' }),
    );

    expect(prisma.billingInvoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { lastFailureReason: 'Underpaid: received 900000 of 1000000 kobo' },
    });
  });

  it('counts a failed collection against the invoice', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(starterInitialInvoice());

    await service.handle(
      collectionEvent('collection.failed', {
        status: 'failed',
        message: 'declined',
      }),
    );

    expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { failedAttempts: { increment: 1 }, lastFailureReason: 'declined' },
    });
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('applies a paid upgrade to the plan without moving the billing period', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(
      starterInitialInvoice({
        kind: 'UPGRADE_PRORATION',
        totalKobo: 500_000n,
        targetPlanCode: 'GROWTH',
        targetTerms: {
          includedEmployees: 30,
          baseFeeKobo: '2000000',
          overageRateKobo: '50000',
          maxOverageEmployees: 20,
        },
        billedEmployeeCount: 15,
        subscription: activeSubscription('STARTER'),
      }),
    );

    await service.handle(
      collectionEvent('collection.succeeded', { amount_paid: '5000.00' }),
    );

    const { data } = prisma.subscription.update.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'ACTIVE',
      planCode: 'GROWTH',
      includedEmployees: 30,
      baseFeeKobo: 2_000_000n,
      pendingPlanCode: null,
    });
    expect(data).not.toHaveProperty('currentPeriodStart');
    expect(data).not.toHaveProperty('currentPeriodEnd');
  });

  it('leaves the event unprocessed and rethrows when applying it fails, so Bachs retries', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(starterInitialInvoice());
    prisma.subscription.update.mockRejectedValue(new Error('db down'));

    await expect(
      service.handle(collectionEvent('collection.succeeded')),
    ).rejects.toThrow('db down');

    expect(prisma.billingWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'whe-1' },
      data: { error: 'db down' },
    });
    expect(prisma.billingWebhookEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });

  it('clears a pending cancellation when the business pays for an upgrade (they are staying)', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(
      starterInitialInvoice({
        kind: 'UPGRADE_PRORATION',
        totalKobo: 500_000n,
        targetPlanCode: 'GROWTH',
        subscription: activeSubscription('STARTER', {
          cancelAtPeriodEnd: true,
        }),
      }),
    );

    await service.handle(
      collectionEvent('collection.succeeded', { amount_paid: '5000.00' }),
    );

    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({
      cancelAtPeriodEnd: false,
    });
  });

  it('rolls the period forward on a paid renewal, applies the scheduled downgrade and emails a receipt', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(
      starterInitialInvoice({
        kind: 'RENEWAL',
        periodStart: new Date('2026-12-01T00:00:00Z'),
        periodEnd: new Date('2027-01-01T00:00:00Z'),
        subscription: activeSubscription('GROWTH', {
          status: 'PAST_DUE',
          pendingPlanCode: 'STARTER',
          pendingBillingCycle: 'MONTHLY',
        }),
      }),
    );

    await service.handle(collectionEvent('collection.succeeded'));

    expect(prisma.subscription.update.mock.calls[0][0].data).toMatchObject({
      status: 'ACTIVE',
      planCode: 'STARTER',
      currentPeriodStart: new Date('2026-12-01T00:00:00Z'),
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
      pendingPlanCode: null,
      pendingBillingCycle: null,
    });
    expect(notifier.paymentReceived).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-1' }),
    );
  });

  it('emails the billing contacts when a collection fails', async () => {
    prisma.billingInvoice.findFirst.mockResolvedValue(starterInitialInvoice());

    await service.handle(
      collectionEvent('collection.failed', {
        status: 'failed',
        message: 'declined',
      }),
    );

    expect(notifier.paymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-1' }),
      'declined',
    );
  });
});
