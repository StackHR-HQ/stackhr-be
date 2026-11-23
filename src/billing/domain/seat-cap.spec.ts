import { canAddEmployees } from './seat-cap';

const FREE_LIMITS = { includedEmployees: 5, maxOverageEmployees: 0 };
const STARTER_LIMITS = { includedEmployees: 15, maxOverageEmployees: 15 }; // up to 30

describe('canAddEmployees', () => {
  it('stops a Free org from going beyond 5 employees (policy: Free is 0–5)', () => {
    const result = canAddEmployees(FREE_LIMITS, 5, 1);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(5);
  });

  it('lets a Starter org grow into overage up to its cap, but no further', () => {
    expect(canAddEmployees(STARTER_LIMITS, 29, 1)).toEqual({
      allowed: true,
      limit: 30,
      remaining: 1,
    });
    expect(canAddEmployees(STARTER_LIMITS, 29, 2).allowed).toBe(false);
  });

  it('rejects a bulk import as a whole when the batch would overshoot the cap', () => {
    const result = canAddEmployees(STARTER_LIMITS, 25, 10);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(5);
  });
});
