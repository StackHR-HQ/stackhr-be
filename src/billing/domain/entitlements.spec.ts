import { Entitlements, resolveEntitlements } from './entitlements';

// Mirrors the launch catalog seeded in the billing_core migration.
const FREE: Entitlements = {
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
};
const GROWTH: Entitlements = {
  payroll: true,
  payslips: true,
  disbursement: true,
  pensionRemittance: true,
  payeRemittance: true,
  leaveManagement: 'full',
  selfService: 'full',
  expenseApprovals: 'full',
  hrReporting: 'standard',
  onboardingSupport: 'standard',
};

describe('resolveEntitlements', () => {
  it('locks a paid org down to Free entitlements once its grace period has expired', () => {
    const result = resolveEntitlements({
      status: 'RESTRICTED',
      plan: GROWTH,
      free: FREE,
    });

    expect(result.payroll).toBe(false);
    expect(result.disbursement).toBe(false);
    expect(result.payslips).toBe(false);
    expect(result).toEqual(FREE);
  });

  it('treats FREE status as Free entitlements even if a paid plan code lingers on the row', () => {
    const result = resolveEntitlements({
      status: 'FREE',
      plan: GROWTH,
      free: FREE,
    });

    expect(result).toEqual(FREE);
  });

  it('keeps paid entitlements while PAST_DUE (grace period)', () => {
    const result = resolveEntitlements({
      status: 'PAST_DUE',
      plan: GROWTH,
      free: FREE,
    });

    expect(result.payroll).toBe(true);
    expect(result).toEqual(GROWTH);
  });
});
