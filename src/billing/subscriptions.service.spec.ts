import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { BachsClient } from './bachs/bachs.client';
import { PrismaService } from '../database/prisma.service';
import {
  activeSubscription,
  createPrismaMock,
} from './testing/billing-fixtures';

const NOW = new Date('2026-11-16T00:00:00Z');

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let bachs: {
    createCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
  };

  beforeEach(async () => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    prisma = createPrismaMock();
    bachs = {
      createCustomer: jest.fn().mockResolvedValue({ customerId: 'cust_new' }),
      createCheckoutSession: jest.fn().mockResolvedValue({
        checkoutId: 'chk_1',
        checkoutUrl: 'https://checkout.bachs.io/chk_1',
        expiresAt: new Date('2026-11-16T01:00:00Z'),
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        InvoicesService,
        { provide: BachsClient, useValue: bachs },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SubscriptionsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('subscribe', () => {
    it('issues an INITIAL Starter invoice with a Bachs NGN checkout, without activating the plan yet', async () => {
      prisma.employee.count.mockResolvedValue(12);

      const result = await service.subscribe('org-1', {
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
      });

      expect(result.checkoutUrl).toBe('https://checkout.bachs.io/chk_1');
      expect(prisma.billingInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          kind: 'INITIAL',
          status: 'OPEN',
          totalKobo: 1_000_000n, // ₦10,000 — 12 employees fit Starter's 15
          periodStart: NOW,
          periodEnd: new Date('2026-12-16T00:00:00Z'),
          targetPlanCode: 'STARTER',
          targetBillingCycle: 'MONTHLY',
          billedEmployeeCount: 12,
        }),
      });
      expect(bachs.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust_new', amount: '10000.00' }),
      );
      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('offers bank transfer by not asking Bachs to save a card (saving restricts checkout to cards)', async () => {
      await service.subscribe('org-1', {
        planCode: 'STARTER',
        billingCycle: 'MONTHLY',
      });

      expect(bachs.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ savePaymentMethod: false }),
      );
    });

    it('creates no invoice when Bachs rejects the customer (e.g. missing API scope)', async () => {
      bachs.createCustomer.mockRejectedValue(
        new Error('missing scope customers:write'),
      );

      await expect(
        service.subscribe('org-1', {
          planCode: 'STARTER',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toThrow('missing scope');
      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    });

    it('voids the invoice when the checkout cannot be created, leaving nothing payable', async () => {
      bachs.createCheckoutSession.mockRejectedValue(new Error('provider down'));

      await expect(
        service.subscribe('org-1', {
          planCode: 'STARTER',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toThrow('provider down');
      expect(prisma.billingInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          status: 'VOID',
          lastFailureReason: 'Checkout creation failed: provider down',
        },
      });
    });

    it('refuses Enterprise self-serve (contact sales)', async () => {
      await expect(
        service.subscribe('org-1', {
          planCode: 'ENTERPRISE',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    });

    it('refuses a plan whose employee ceiling is below current headcount', async () => {
      prisma.employee.count.mockResolvedValue(31); // Starter ceiling is 30

      await expect(
        service.subscribe('org-1', {
          planCode: 'STARTER',
          billingCycle: 'MONTHLY',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePlan', () => {
    it('upgrades immediately via a prorated invoice for the rest of the period', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('STARTER'),
      );
      prisma.employee.count.mockResolvedValue(15);

      const result = await service.changePlan('org-1', { planCode: 'GROWTH' });

      expect(result).toMatchObject({
        effective: 'ON_PAYMENT',
        checkoutUrl: 'https://checkout.bachs.io/chk_1',
      });
      expect(prisma.billingInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'UPGRADE_PRORATION',
          totalKobo: 500_000n, // (₦20,000 − ₦10,000) × 15/30 days
          periodStart: NOW,
          periodEnd: new Date('2026-12-01T00:00:00Z'),
          targetPlanCode: 'GROWTH',
          targetBillingCycle: 'MONTHLY',
          targetTerms: {
            includedEmployees: 30,
            baseFeeKobo: '2000000',
            overageRateKobo: '50000',
            maxOverageEmployees: 20,
          },
        }),
      });
      expect(bachs.createCustomer).not.toHaveBeenCalled(); // reuses cust_existing
    });

    it('schedules a downgrade for renewal without charging anything', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH'),
      );
      prisma.employee.count.mockResolvedValue(12);

      const result = await service.changePlan('org-1', { planCode: 'STARTER' });

      expect(result).toMatchObject({
        effective: 'AT_RENEWAL',
        planCode: 'STARTER',
        effectiveAt: '2026-12-01T00:00:00.000Z',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { pendingPlanCode: 'STARTER' },
      });
      expect(prisma.billingInvoice.create).not.toHaveBeenCalled();
    });

    it('refuses a downgrade the current headcount would not fit', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH'),
      );
      prisma.employee.count.mockResolvedValue(40); // Starter ceiling is 30

      await expect(
        service.changePlan('org-1', { planCode: 'STARTER' }),
      ).rejects.toThrow(ConflictException);
    });

    it('cancels a pending downgrade when re-selecting the active plan', async () => {
      const subWithPending = {
        ...activeSubscription('GROWTH'),
        pendingPlanCode: 'STARTER',
      };
      prisma.subscription.findUnique.mockResolvedValue(subWithPending);

      const result = await service.changePlan('org-1', { planCode: 'GROWTH' });

      expect(result).toEqual({
        effective: 'IMMEDIATE',
        planCode: 'GROWTH',
        cancelAtPeriodEnd: false,
        message: 'Pending plan change cancelled',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          pendingPlanCode: null,
          pendingBillingCycle: null,
          cancelAtPeriodEnd: false,
        },
      });
    });

    it('clears cancelAtPeriodEnd when re-selecting the current plan', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { cancelAtPeriodEnd: true }),
      );

      const result = await service.changePlan('org-1', { planCode: 'GROWTH' });

      expect(result).toEqual({
        effective: 'IMMEDIATE',
        planCode: 'GROWTH',
        cancelAtPeriodEnd: false,
        message: 'Subscription cancellation undone',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          pendingPlanCode: null,
          pendingBillingCycle: null,
          cancelAtPeriodEnd: false,
        },
      });
    });

    it('throws BadRequestException if selecting current plan with no pending change', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH'),
      );

      await expect(
        service.changePlan('org-1', { planCode: 'GROWTH' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels at the end of the paid period rather than immediately', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH'),
      );

      const result = await service.cancel('org-1');

      expect(result).toEqual({
        cancelAtPeriodEnd: true,
        effectiveAt: '2026-12-01T00:00:00.000Z',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: true },
      });
    });

    it('has nothing to cancel on the Free plan', async () => {
      await expect(service.cancel('org-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resume', () => {
    it('clears cancelAtPeriodEnd to re-enable auto-renewal', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { cancelAtPeriodEnd: true }),
      );

      const result = await service.resume('org-1');

      expect(result).toEqual({
        cancelAtPeriodEnd: false,
        effectiveAt: '2026-12-01T00:00:00.000Z',
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { cancelAtPeriodEnd: false },
      });
    });

    it('throws BadRequestException on the Free plan', async () => {
      await expect(service.resume('org-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
