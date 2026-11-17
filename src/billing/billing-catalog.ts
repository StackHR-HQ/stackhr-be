import type { BillingCycle, CommercialTerms } from './domain/pricing';
import { MONTHS_IN_CYCLE } from './domain/pricing';
import type { Entitlements } from './domain/entitlements';

export const FREE_PLAN_CODE = 'FREE';

/** Employee statuses that occupy a seat for cap purposes. */
export const SEAT_HOLDING_STATUSES = [
  'ACTIVE',
  'ONBOARDING',
  'PENDING_INVITATION',
];
/** Employee statuses that are billed. */
export const BILLABLE_STATUSES = ['ACTIVE'];

export interface CatalogPlan {
  code: string;
  name: string;
  includedEmployees: number;
  monthlyFeeKobo: bigint;
  annualFeeKobo: bigint;
  overageRateKobo: bigint;
  maxOverageEmployees: number;
  entitlements: unknown;
  selfServe: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** Snapshot of catalog terms for a given cycle (stored on subscription/invoice). */
export function termsFromPlan(
  plan: CatalogPlan,
  cycle: BillingCycle,
): CommercialTerms {
  return {
    includedEmployees: plan.includedEmployees,
    baseFeeKobo: cycle === 'ANNUAL' ? plan.annualFeeKobo : plan.monthlyFeeKobo,
    overageRateKobo: plan.overageRateKobo,
    maxOverageEmployees: plan.maxOverageEmployees,
  };
}

/** JSON-safe form of terms (BigInt → string) for Json columns. */
export function serializeTerms(terms: CommercialTerms) {
  return {
    includedEmployees: terms.includedEmployees,
    baseFeeKobo: terms.baseFeeKobo.toString(),
    overageRateKobo: terms.overageRateKobo.toString(),
    maxOverageEmployees: terms.maxOverageEmployees,
  };
}

export function deserializeTerms(json: unknown): CommercialTerms {
  const raw = json as Record<string, unknown>;
  return {
    includedEmployees: Number(raw.includedEmployees),
    baseFeeKobo: BigInt(raw.baseFeeKobo as string | number | bigint),
    overageRateKobo: BigInt(raw.overageRateKobo as string | number | bigint),
    maxOverageEmployees: Number(raw.maxOverageEmployees),
  };
}

export function addCycle(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + MONTHS_IN_CYCLE[cycle]);
  return end;
}

export function asEntitlements(json: unknown): Entitlements {
  return json as Entitlements;
}
