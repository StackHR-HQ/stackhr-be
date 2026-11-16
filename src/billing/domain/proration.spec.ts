import { prorateUpgrade } from './proration';

const STARTER = {
  includedEmployees: 15,
  baseFeeKobo: 1_000_000n, // ₦10,000
  overageRateKobo: 50_000n,
  maxOverageEmployees: 15,
};
const GROWTH = {
  includedEmployees: 30,
  baseFeeKobo: 2_000_000n, // ₦20,000
  overageRateKobo: 50_000n,
  maxOverageEmployees: 20,
};

// 1 Nov → 1 Dec 2026 is a 30-day period; 16 Nov leaves 15 days.
const period = {
  periodStart: new Date('2026-11-01T00:00:00Z'),
  periodEnd: new Date('2026-12-01T00:00:00Z'),
};

describe('prorateUpgrade', () => {
  it('charges the price difference for the remaining days of the period', () => {
    const result = prorateUpgrade({
      from: STARTER,
      to: GROWTH,
      cycle: 'MONTHLY',
      activeEmployees: 15,
      ...period,
      now: new Date('2026-11-16T00:00:00Z'),
    });

    expect(result.amountKobo).toBe(500_000n); // (₦20,000 − ₦10,000) × 15/30
  });

  it('never charges a negative amount when the new plan costs less for this headcount', () => {
    const customExpensive = { ...STARTER, baseFeeKobo: 3_000_000n }; // negotiated ₦30,000

    const result = prorateUpgrade({
      from: customExpensive,
      to: GROWTH,
      cycle: 'MONTHLY',
      activeEmployees: 15,
      ...period,
      now: new Date('2026-11-16T00:00:00Z'),
    });

    expect(result.amountKobo).toBe(0n);
  });
});
