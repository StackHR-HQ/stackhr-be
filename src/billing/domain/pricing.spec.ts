import {
  bachsAmountToKobo,
  koboToBachsAmount,
  priceForPeriod,
} from './pricing';

// Expected values come from "StackHR Launch Pricing and Commercial Policy" v1.0.
const GROWTH_MONTHLY = {
  includedEmployees: 30,
  baseFeeKobo: 2_000_000n, // ₦20,000
  overageRateKobo: 50_000n, // ₦500 / extra employee / month
  maxOverageEmployees: 20,
};

describe('priceForPeriod', () => {
  it('charges a Growth org with 35 employees ₦22,500 for a month (policy worked example)', () => {
    const quote = priceForPeriod(GROWTH_MONTHLY, 'MONTHLY', 35);

    expect(quote.totalKobo).toBe(2_250_000n);
  });

  it('bills annual overage for 12 months with no discount (policy: overage discounts must be explicit)', () => {
    const growthAnnual = { ...GROWTH_MONTHLY, baseFeeKobo: 21_600_000n }; // ₦216,000

    const quote = priceForPeriod(growthAnnual, 'ANNUAL', 35);

    expect(quote.totalKobo).toBe(24_600_000n); // ₦216,000 + 5 × ₦500 × 12
  });
});

describe('Bachs amount conversion', () => {
  it('formats kobo as a 2-decimal naira string', () => {
    expect(koboToBachsAmount(2_250_000n)).toBe('22500.00');
    expect(koboToBachsAmount(5n)).toBe('0.05');
    expect(koboToBachsAmount(0n)).toBe('0.00');
  });

  it('parses naira decimal strings into exact kobo', () => {
    expect(bachsAmountToKobo('22500.00')).toBe(2_250_000n);
    expect(bachsAmountToKobo('29.5')).toBe(2_950n);
    expect(bachsAmountToKobo('300')).toBe(30_000n);
  });

  it('rejects amounts it cannot represent exactly', () => {
    expect(() => bachsAmountToKobo('1.005')).toThrow();
    expect(() => bachsAmountToKobo('abc')).toThrow();
    expect(() => bachsAmountToKobo('-5.00')).toThrow();
  });
});
