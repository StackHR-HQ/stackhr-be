import type { CatalogPlan } from '../billing-catalog';

const PAID = {
  payroll: true,
  payslips: true,
  disbursement: true,
  pensionRemittance: true,
  payeRemittance: true,
  leaveManagement: 'full',
  selfService: 'full',
};

/** Launch catalog — mirrors the billing_core migration seed. */
export const catalog: Record<string, CatalogPlan> = {
  FREE: {
    code: 'FREE',
    name: 'Free',
    includedEmployees: 5,
    monthlyFeeKobo: 0n,
    annualFeeKobo: 0n,
    overageRateKobo: 0n,
    maxOverageEmployees: 0,
    entitlements: {
      payroll: false,
      payslips: false,
      disbursement: false,
      pensionRemittance: false,
      payeRemittance: false,
      leaveManagement: 'basic',
      selfService: 'limited',
      expenseApprovals: 'none',
      hrReporting: 'basic',
      onboardingSupport: 'none',
    },
    selfServe: true,
    isActive: true,
    sortOrder: 0,
  },
  STARTER: {
    code: 'STARTER',
    name: 'Starter',
    includedEmployees: 15,
    monthlyFeeKobo: 1_000_000n,
    annualFeeKobo: 10_800_000n,
    overageRateKobo: 50_000n,
    maxOverageEmployees: 15,
    entitlements: {
      ...PAID,
      expenseApprovals: 'basic',
      hrReporting: 'standard',
      onboardingSupport: 'standard',
    },
    selfServe: true,
    isActive: true,
    sortOrder: 1,
  },
  GROWTH: {
    code: 'GROWTH',
    name: 'Growth',
    includedEmployees: 30,
    monthlyFeeKobo: 2_000_000n,
    annualFeeKobo: 21_600_000n,
    overageRateKobo: 50_000n,
    maxOverageEmployees: 20,
    entitlements: {
      ...PAID,
      expenseApprovals: 'full',
      hrReporting: 'standard',
      onboardingSupport: 'standard',
    },
    selfServe: true,
    isActive: true,
    sortOrder: 2,
  },
  BUSINESS: {
    code: 'BUSINESS',
    name: 'Business',
    includedEmployees: 50,
    monthlyFeeKobo: 3_500_000n,
    annualFeeKobo: 37_800_000n,
    overageRateKobo: 45_000n,
    maxOverageEmployees: 50,
    entitlements: {
      ...PAID,
      expenseApprovals: 'full',
      hrReporting: 'advanced',
      onboardingSupport: 'priority',
    },
    selfServe: true,
    isActive: true,
    sortOrder: 3,
  },
  ENTERPRISE: {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    includedEmployees: 0,
    monthlyFeeKobo: 0n,
    annualFeeKobo: 0n,
    overageRateKobo: 0n,
    maxOverageEmployees: 0,
    entitlements: {
      ...PAID,
      expenseApprovals: 'full',
      hrReporting: 'advanced',
      onboardingSupport: 'priority',
    },
    selfServe: false,
    isActive: true,
    sortOrder: 5,
  },
};

/** A paid ACTIVE subscription row on the given plan/cycle. */
export function activeSubscription(
  planCode: keyof typeof catalog,
  overrides: Record<string, unknown> = {},
) {
  const plan = catalog[planCode];
  return {
    id: 'sub-1',
    organizationId: 'org-1',
    planCode,
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    includedEmployees: plan.includedEmployees,
    baseFeeKobo: plan.monthlyFeeKobo,
    overageRateKobo: plan.overageRateKobo,
    maxOverageEmployees: plan.maxOverageEmployees,
    customTerms: false,
    billedEmployeeCount: 0,
    currentPeriodStart: new Date('2026-11-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
    pendingPlanCode: null,
    pendingBillingCycle: null,
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    bachsCustomerId: 'cust_existing',
    bachsPaymentMethodId: null,
    ...overrides,
  };
}

/**
 * Prisma fake: catalog lookups are real, everything else is a jest.fn with a
 * pass-through default so tests can assert on what was written.
 */
export function createPrismaMock() {
  const prisma: any = {
    billingPlan: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(catalog[where.code] ?? null),
      ),
      findMany: jest.fn(() =>
        Promise.resolve(
          Object.values(catalog).sort((a, b) => a.sortOrder - b.sortOrder),
        ),
      ),
    },
    subscription: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }) =>
        Promise.resolve({ id: 'sub-new', ...data }),
      ),
      update: jest.fn(({ data }) => Promise.resolve({ id: 'sub-1', ...data })),
    },
    billingInvoice: {
      create: jest.fn(({ data }) => Promise.resolve({ id: 'inv-1', ...data })),
      update: jest.fn(({ where, data }) =>
        Promise.resolve({ ...where, ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    billingWebhookEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }) => Promise.resolve({ id: 'whe-1', ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    employee: {
      count: jest.fn().mockResolvedValue(0),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'Acme Ltd',
        owner: { email: 'ada@acme.ng', name: 'Ada Owner' },
      }),
    },
    auditEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}
