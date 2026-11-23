import { HttpException, HttpStatus } from '@nestjs/common';

export const PLAN_UPGRADE_REQUIRED = 'PLAN_UPGRADE_REQUIRED';

export interface PlanUpgradeDetails {
  /** The gated feature, or 'employees' for the seat cap. */
  feature: string;
  currentPlan: string;
  /** Smallest self-serve plan that unlocks it; ENTERPRISE if none does. */
  requiredPlan: string;
  [key: string]: unknown;
}

/**
 * 402 Payment Required — distinct from 403 so the frontend can show an
 * upgrade prompt rather than an access-denied screen.
 */
export class PlanUpgradeRequiredException extends HttpException {
  constructor(message: string, details: PlanUpgradeDetails) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        code: PLAN_UPGRADE_REQUIRED,
        message,
        details,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
