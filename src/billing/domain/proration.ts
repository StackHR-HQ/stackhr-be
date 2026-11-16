import { BillingCycle, CommercialTerms, priceForPeriod } from './pricing';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface UpgradeProrationInput {
  from: CommercialTerms;
  to: CommercialTerms;
  cycle: BillingCycle;
  activeEmployees: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}

export interface UpgradeProration {
  amountKobo: bigint;
  remainingDays: number;
  totalDays: number;
}

/**
 * Day-based proration for an immediate upgrade: the customer pays the
 * difference between the new and old period price for the days left.
 */
export function prorateUpgrade(input: UpgradeProrationInput): UpgradeProration {
  const totalDays = Math.max(
    1,
    Math.round(
      (input.periodEnd.getTime() - input.periodStart.getTime()) / DAY_MS,
    ),
  );
  const remainingDays = Math.max(
    0,
    Math.ceil((input.periodEnd.getTime() - input.now.getTime()) / DAY_MS),
  );

  const oldPrice = priceForPeriod(
    input.from,
    input.cycle,
    input.activeEmployees,
  ).totalKobo;
  const newPrice = priceForPeriod(
    input.to,
    input.cycle,
    input.activeEmployees,
  ).totalKobo;
  // No credits/refunds on plan changes: a cheaper target costs nothing now.
  const difference = newPrice > oldPrice ? newPrice - oldPrice : 0n;

  const amountKobo = (difference * BigInt(remainingDays)) / BigInt(totalDays);

  return { amountKobo, remainingDays, totalDays };
}
