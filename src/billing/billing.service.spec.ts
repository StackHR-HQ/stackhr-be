import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { BachsClient } from './bachs/bachs.client';
import { PrismaService } from '../database/prisma.service';
import { USER_ROLES, USER_TYPES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  activeSubscription,
  createPrismaMock,
} from './testing/billing-fixtures';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: ReturnType<typeof createPrismaMock>;

  const owner: AuthenticatedUser = {
    id: 'user-1',
    name: 'Ada Owner',
    email: 'ada@acme.ng',
    userType: USER_TYPES.BUSINESS,
    role: USER_ROLES.BUSINESS_OWNER,
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        SubscriptionsService,
        InvoicesService,
        { provide: BachsClient, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BillingService);
  });

  describe('getStatus', () => {
    it('puts an org with no subscription on the Free plan (no trial)', async () => {
      prisma.employee.count.mockResolvedValue(3);

      const status = await service.getStatus(owner);

      expect(status).toMatchObject({
        status: 'FREE',
        planCode: 'FREE',
        planName: 'Free',
        activeEmployeeCount: 3,
        seatLimit: 5,
        nextBillingDate: null,
        openInvoice: null,
      });
      expect(status.entitlements.payroll).toBe(false);
      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            planCode: 'FREE',
            status: 'FREE',
          }),
        }),
      );
    });

    it('requires an organization context', async () => {
      await expect(
        service.getStatus({ ...owner, organizationId: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('drops a RESTRICTED Growth org to Free entitlements and the Free seat limit', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { status: 'RESTRICTED' }),
      );

      const status = await service.getStatus(owner);

      expect(status.status).toBe('RESTRICTED');
      expect(status.planName).toBe('Growth');
      expect(status.seatLimit).toBe(5);
      expect(status.entitlements.payroll).toBe(false);
    });

    it('surfaces the open invoice so the business can pay it', async () => {
      prisma.subscription.findUnique.mockResolvedValue(
        activeSubscription('GROWTH', { status: 'PAST_DUE' }),
      );
      prisma.billingInvoice.findFirst.mockResolvedValue({
        id: 'inv-9',
        number: 'INV-20261201-ABC123',
        kind: 'RENEWAL',
        totalKobo: 2_250_000n,
        dueAt: new Date('2026-12-01T00:00:00Z'),
      });

      const status = await service.getStatus(owner);

      expect(status.entitlements.payroll).toBe(true);
      expect(status.seatLimit).toBe(50);
      expect(status.openInvoice).toMatchObject({
        id: 'inv-9',
        totalNaira: '22500.00',
      });
    });
  });

  describe('listPlans', () => {
    it('lists self-serve prices in naira and shows Enterprise as contact-sales with no price', async () => {
      const { plans } = await service.listPlans(owner);

      const growth = plans.find((p) => p.code === 'GROWTH');
      expect(growth).toMatchObject({
        name: 'Growth',
        includedEmployees: 30,
        monthlyPrice: '20000.00',
        annualPrice: '216000.00',
        overageRatePerEmployee: '500.00',
        maxEmployees: 50,
        selfServe: true,
      });

      const enterprise = plans.find((p) => p.code === 'ENTERPRISE');
      expect(enterprise).toEqual({
        code: 'ENTERPRISE',
        name: 'Enterprise',
        selfServe: false,
        contactSales: true,
        entitlements: expect.any(Object),
      });
    });
  });
});
