import { Test, TestingModule } from '@nestjs/testing';
import { StackhrAdminService } from './stackhr-admin.service';
import { PrismaService } from '../database/prisma.service';
import { OutboxService } from '../common/outbox/outbox.service';
import { ResilientHttpClient } from '../common/resilience/resilient-client';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('StackhrAdminService', () => {
  let service: StackhrAdminService;
  let prismaMock: any;
  let outboxMock: any;

  const adminUser: AuthenticatedUser = {
    id: 'sys-admin-1',
    name: 'Platform Admin',
    email: 'admin@stackhr.app',
    userType: 'STACKHR_ADMIN',
    role: 'STACKHR_ADMIN',
    organizationId: null,
  };

  beforeEach(async () => {
    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
      organization: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'org-1',
            name: 'Acme Corp',
            slug: 'acme-corp',
            industry: 'Technology',
            companySize: '11-50',
            currency: 'NGN',
            payrollFrequency: 'MONTHLY',
            taxId: 'TIN-123',
            penCentralEmployerCode: 'PR0000126311',
            metadata: null,
            owner: { id: 'u-1', name: 'Owner', email: 'owner@acme.com' },
            depositAccount: {
              accountNumber: '9912345678',
              bankName: 'PROVIDUS BANK',
              balanceKobo: 1500000000n,
              status: 'ACTIVE',
            },
            documents: [],
            _count: { employees: 5, payrollRuns: 2, departments: 2 },
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
            updatedAt: new Date('2026-09-01T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'emp-1',
            employeeNumber: 'ACM-EMP-0001',
            fullName: 'Ada Okafor',
            email: 'ada@acme.com',
            jobTitle: 'Software Engineer',
            department: 'Engineering',
            employmentType: 'FULL_TIME',
            status: 'ACTIVE',
            salaryAmount: 500000,
            annualSalaryMinor: 600000000n,
            organizationId: 'org-1',
            createdAt: new Date('2026-09-01T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      payrollRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'run-1',
            organizationId: 'org-1',
            title: 'September 2026 Payroll',
            status: 'RECONCILED',
            totalGross: 2500000,
            totalNet: 2100000,
            shortfallAmount: 0,
            createdAt: new Date('2026-09-25T10:00:00.000Z'),
            updatedAt: new Date('2026-09-25T10:00:00.000Z'),
          },
        ]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      waitlistEntry: {
        count: jest.fn().mockResolvedValue(42),
      },
      organizationDepositAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'acc-1', balanceKobo: 1500000000n }]),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'aud-1',
          createdAt: new Date(),
        }),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      session: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reimbursement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryAdvance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      corporateCard: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      deadLetterEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      outboxEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      idempotencyKey: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        if (typeof callback === 'function') {
          return callback(prismaMock);
        }
        return Promise.all(callback);
      }),
      billingPlan: {
        findMany: jest.fn().mockResolvedValue([
          {
            code: 'FREE',
            name: 'Free',
            includedEmployees: 5,
            monthlyFeeKobo: 0n,
            annualFeeKobo: 0n,
            overageRateKobo: 0n,
            maxOverageEmployees: 0,
            selfServe: true,
            isActive: true,
            sortOrder: 0,
            entitlements: {},
          },
          {
            code: 'STARTER',
            name: 'Starter',
            includedEmployees: 15,
            monthlyFeeKobo: 1000000n,
            annualFeeKobo: 10800000n,
            overageRateKobo: 50000n,
            maxOverageEmployees: 15,
            selfServe: true,
            isActive: true,
            sortOrder: 1,
            entitlements: {},
          },
        ]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.code === 'STARTER') {
            return Promise.resolve({
              code: 'STARTER',
              name: 'Starter',
              includedEmployees: 15,
              monthlyFeeKobo: 1000000n,
              annualFeeKobo: 10800000n,
              overageRateKobo: 50000n,
              maxOverageEmployees: 15,
            });
          }
          return Promise.resolve(null);
        }),
      },
      subscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create, update }) =>
          Promise.resolve({
            id: 'sub-1',
            organizationId: create?.organizationId ?? 'org-1',
            planCode: create?.planCode ?? update?.planCode ?? 'STARTER',
            status: create?.status ?? update?.status ?? 'ACTIVE',
            billingCycle:
              create?.billingCycle ?? update?.billingCycle ?? 'MONTHLY',
            includedEmployees: 15,
            baseFeeKobo: 1000000n,
            overageRateKobo: 50000n,
            maxOverageEmployees: 15,
            customTerms: false,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(),
            cancelAtPeriodEnd: false,
            graceEndsAt: null,
            plan: { name: 'Starter' },
          }),
        ),
        update: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' }),
      },
      billingInvoice: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'PAID' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    outboxMock = {
      getDlqCount: jest.fn().mockResolvedValue(0),
      getDeadLetterEvents: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StackhrAdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: outboxMock },
        {
          provide: ResilientHttpClient,
          useValue: { getAllCircuitStats: () => [] },
        },
      ],
    }).compile();

    service = module.get<StackhrAdminService>(StackhrAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns platform dashboard metrics', async () => {
    const dashboard = await service.getDashboard();
    expect(dashboard.metrics.totalBusinesses).toBe(1);
    expect(dashboard.metrics.totalEmployees).toBe(1);
    expect(dashboard.metrics.totalPayrollNetMajor).toBe(2100000);
    expect(dashboard.metrics.waitlistCount).toBe(42);
  });

  it('lists and suspends/reactivates businesses', async () => {
    const list = await service.listBusinesses({ status: 'active' });
    expect(list.businesses).toHaveLength(1);
    expect(list.businesses[0].status).toBe('active');

    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      industry: 'Technology',
      companySize: '11-50',
      metadata: null,
    });
    prismaMock.organization.update.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
    });

    const suspended = await service.suspendBusiness(adminUser, 'org-1', {
      reason: 'Compliance review',
    });
    expect(suspended.business.status).toBe('suspended');
    expect(prismaMock.session.updateMany).toHaveBeenCalled();
  });

  it('lists cross-business employees and payroll runs', async () => {
    const employees = await service.listEmployees({});
    expect(employees.total).toBe(1);
    expect(employees.employees[0].annualSalaryMinor).toBe(600000000);

    const runs = await service.listPayrollRuns({});
    expect(runs.total).toBe(1);
  });

  it('masks employee account numbers in getPayrollRunById', async () => {
    prismaMock.payrollRun.findUnique.mockResolvedValue({
      id: 'run-1',
      organizationId: 'org-1',
      title: 'September 2026 Payroll',
      status: 'EXECUTED',
      items: [
        {
          id: 'item-1',
          employee: {
            id: 'emp-1',
            fullName: 'Ada Okafor',
            accountNumber: '0123456789',
          },
        },
      ],
      payslips: [],
      pensionRemittanceSchedule: null,
    });

    const result = await service.getPayrollRunById('run-1');
    expect(result.run.items[0].employee?.accountNumber).toBe('******6789');
    expect(result.run.items[0].employee?.accountNumberLast4).toBe('6789');
  });

  it('lists and decides KYB verification', async () => {
    const kyb = await service.listKybVerifications();
    expect(kyb.verifications).toHaveLength(1);

    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      metadata: null,
    });
    prismaMock.organization.update.mockResolvedValue({ id: 'org-1' });

    const decided = await service.decideKybVerification(adminUser, 'org-1', {
      decision: 'APPROVED',
      notes: 'TIN and PenCentral verified',
    });
    expect(decided.verification.kybStatus).toBe('VERIFIED');
  });

  it('returns system health overview', async () => {
    const health = await service.getSystemHealth();
    expect(health.status).toBe('healthy');
    expect(health.database.status).toBe('up');
    expect(health.backgroundJobs.dlqDepth).toBe(0);
  });

  it('lists subscriptions and catalog plans', async () => {
    const subs = await service.listSubscriptions({});
    expect(subs.total).toBe(1);
    expect(subs.subscriptions).toHaveLength(1);
    expect(subs.plans.length).toBeGreaterThanOrEqual(2);

    const plans = await service.getSubscriptionPlans();
    expect(plans.plans.length).toBeGreaterThanOrEqual(2);
  });

  it('gets subscription detail by organizationId', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      currency: 'NGN',
      metadata: null,
      owner: { id: 'u-1', name: 'Owner', email: 'owner@acme.com' },
      subscription: {
        id: 'sub-1',
        planCode: 'STARTER',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
        includedEmployees: 15,
        baseFeeKobo: 1000000n,
        overageRateKobo: 50000n,
        maxOverageEmployees: 15,
        customTerms: false,
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        plan: { name: 'Starter', entitlements: {} },
        invoices: [],
      },
      _count: { employees: 10 },
      createdAt: new Date(),
    });

    const sub = await service.getSubscriptionByOrgId('org-1');
    expect(sub.organizationId).toBe('org-1');
    expect(sub.planCode).toBe('STARTER');
    expect(sub.status).toBe('ACTIVE');
    expect(sub.baseFeeMajor).toBe(10000);
  });

  it('updates subscription with plan, cycle, and custom terms', async () => {
    prismaMock.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      metadata: null,
      subscription: null,
    });
    prismaMock.organization.update.mockResolvedValue({ id: 'org-1' });

    const result = await service.updateSubscription(adminUser, 'org-1', {
      planCode: 'STARTER',
      billingCycle: 'ANNUAL',
      status: 'ACTIVE',
    });

    expect(result.message).toBe('Subscription updated successfully');
    expect(result.subscription.planCode).toBe('STARTER');
    expect(prismaMock.subscription.upsert).toHaveBeenCalled();
    expect(prismaMock.auditEvent.create).toHaveBeenCalled();
  });

  it('lists invoices and gets invoice detail', async () => {
    prismaMock.billingInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        number: 'INV-2026-0001',
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' },
        kind: 'INITIAL',
        status: 'OPEN',
        subtotalKobo: 1000000n,
        totalKobo: 1000000n,
        dueAt: new Date(),
        paidAt: null,
        periodStart: new Date(),
        periodEnd: new Date(),
        lines: [],
        bachsCheckoutUrl: 'https://checkout.bachs.com/session-1',
        createdAt: new Date(),
      },
    ]);
    prismaMock.billingInvoice.count.mockResolvedValue(1);

    const invoices = await service.listInvoices({});
    expect(invoices.total).toBe(1);
    expect(invoices.invoices[0].number).toBe('INV-2026-0001');
    expect(invoices.invoices[0].totalMajor).toBe(10000);

    prismaMock.billingInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      number: 'INV-2026-0001',
      organizationId: 'org-1',
      organization: { id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' },
      kind: 'INITIAL',
      status: 'OPEN',
      subtotalKobo: 1000000n,
      totalKobo: 1000000n,
      dueAt: new Date(),
      paidAt: null,
      periodStart: new Date(),
      periodEnd: new Date(),
      lines: [],
      bachsCheckoutUrl: 'https://checkout.bachs.com/session-1',
      subscription: {
        id: 'sub-1',
        planCode: 'STARTER',
        status: 'ACTIVE',
        billingCycle: 'MONTHLY',
      },
      createdAt: new Date(),
    });

    const inv = await service.getInvoiceById('inv-1');
    expect(inv.id).toBe('inv-1');
    expect(inv.status).toBe('OPEN');
  });

  it('marks invoice as paid and activates subscription', async () => {
    prismaMock.billingInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      number: 'INV-2026-0001',
      organizationId: 'org-1',
      subscriptionId: 'sub-1',
      status: 'OPEN',
      periodStart: new Date(),
      periodEnd: new Date(),
      targetPlanCode: 'STARTER',
      targetBillingCycle: 'MONTHLY',
      targetTerms: null,
      billedEmployeeCount: null,
      organization: { name: 'Acme Corp' },
      subscription: {
        id: 'sub-1',
        planCode: 'FREE',
        billingCycle: 'MONTHLY',
      },
    });

    const result = await service.markInvoicePaid(adminUser, 'inv-1', {
      notes: 'Paid via bank transfer',
    });

    expect(result.message).toContain('successfully marked as paid');
    expect(prismaMock.billingInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1', status: { not: 'PAID' } },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
  });

  it('voids an open invoice', async () => {
    prismaMock.billingInvoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      number: 'INV-2026-0001',
      organizationId: 'org-1',
      status: 'OPEN',
    });

    const result = await service.voidInvoice(adminUser, 'inv-1', {
      reason: 'Billing dispute resolved',
    });

    expect(result.message).toContain('successfully voided');
    expect(prismaMock.billingInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: { status: 'VOID' },
      }),
    );
  });
});
