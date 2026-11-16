export interface SeatLimits {
  includedEmployees: number;
  maxOverageEmployees: number;
}

export interface SeatCheck {
  allowed: boolean;
  /** Hard ceiling: included allowance + permitted overage. */
  limit: number;
  /** Seats still available before the ceiling. */
  remaining: number;
}

/**
 * Whether `adding` more employees fit under the subscription's ceiling.
 * `currentHeadcount` should count every non-terminated employee (ACTIVE,
 * ONBOARDING and PENDING_INVITATION) so a flood of invites can't bypass the cap.
 */
export function canAddEmployees(
  limits: SeatLimits,
  currentHeadcount: number,
  adding: number,
): SeatCheck {
  const limit = limits.includedEmployees + limits.maxOverageEmployees;
  const remaining = Math.max(0, limit - currentHeadcount);
  return { allowed: adding <= remaining, limit, remaining };
}
