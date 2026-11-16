export type BillingCycle = 'MONTHLY' | 'ANNUAL';

/**
 * Commercial terms for a subscription. `baseFeeKobo` is the fee for one full
 * billing cycle (monthly or annual); `overageRateKobo` is always per extra
 * employee per month.
 */
export interface CommercialTerms {
  includedEmployees: number;
  baseFeeKobo: bigint;
  overageRateKobo: bigint;
  maxOverageEmployees: number;
}

export const MONTHS_IN_CYCLE: Record<BillingCycle, number> = {
  MONTHLY: 1,
  ANNUAL: 12,
};

export interface InvoiceLine {
  code: 'BASE_FEE' | 'OVERAGE';
  description: string;
  quantity: number;
  unitAmountKobo: bigint;
  amountKobo: bigint;
}

export interface PeriodQuote {
  lines: InvoiceLine[];
  totalKobo: bigint;
}

export function priceForPeriod(
  terms: CommercialTerms,
  cycle: BillingCycle,
  activeEmployees: number,
): PeriodQuote {
  const lines: InvoiceLine[] = [
    {
      code: 'BASE_FEE',
      description: 'Base package fee',
      quantity: 1,
      unitAmountKobo: terms.baseFeeKobo,
      amountKobo: terms.baseFeeKobo,
    },
  ];

  const extraEmployees = Math.max(0, activeEmployees - terms.includedEmployees);
  if (extraEmployees > 0) {
    const months = MONTHS_IN_CYCLE[cycle];
    // Overage is billed per month for the whole cycle, undiscounted.
    const unitAmountKobo = terms.overageRateKobo * BigInt(months);
    const amountKobo = BigInt(extraEmployees) * unitAmountKobo;
    lines.push({
      code: 'OVERAGE',
      description: `${extraEmployees} employee(s) above the included allowance × ${months} month(s)`,
      quantity: extraEmployees,
      unitAmountKobo,
      amountKobo,
    });
  }

  return {
    lines,
    totalKobo: lines.reduce((sum, l) => sum + l.amountKobo, 0n),
  };
}

/** Kobo → Bachs decimal string at NGN precision, e.g. 2250000n → "22500.00". */
export function koboToBachsAmount(kobo: bigint): string {
  if (kobo < 0n) throw new RangeError('Amount must not be negative');
  const naira = kobo / 100n;
  const remainder = (kobo % 100n).toString().padStart(2, '0');
  return `${naira}.${remainder}`;
}

/** Bachs decimal string → exact kobo. Rejects anything finer than a kobo. */
export function bachsAmountToKobo(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) {
    throw new RangeError(`Unsupported NGN amount: "${amount}"`);
  }
  const [, naira, fraction = ''] = match;
  return BigInt(naira) * 100n + BigInt(fraction.padEnd(2, '0'));
}
