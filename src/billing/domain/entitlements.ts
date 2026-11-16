export type SubscriptionStatus = 'FREE' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED';

/** Shape of `BillingPlan.entitlements` (JSON column). */
export interface Entitlements {
  payroll: boolean;
  payslips: boolean;
  disbursement: boolean;
  pensionRemittance: boolean;
  payeRemittance: boolean;
  leaveManagement: 'basic' | 'full';
  selfService: 'limited' | 'full';
  expenseApprovals: 'none' | 'basic' | 'full';
  hrReporting: 'basic' | 'standard' | 'advanced';
  onboardingSupport: 'none' | 'standard' | 'priority';
}

/** Boolean features that can be gated with an entitlement check. */
export type GatedFeature =
  | 'payroll'
  | 'payslips'
  | 'disbursement'
  | 'pensionRemittance'
  | 'payeRemittance';

export interface EntitlementInput {
  status: SubscriptionStatus;
  /** Entitlements of the subscribed plan. */
  plan: Entitlements;
  /** Entitlements of the FREE catalog plan. */
  free: Entitlements;
}

export function resolveEntitlements(input: EntitlementInput): Entitlements {
  // PAST_DUE deliberately keeps paid entitlements: it is the grace window.
  if (input.status === 'FREE' || input.status === 'RESTRICTED') {
    return input.free;
  }
  return input.plan;
}
