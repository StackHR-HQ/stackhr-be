import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_OPTIONS_KEY = 'IDEMPOTENCY_OPTIONS';

export interface IdempotencyOptions {
  /**
   * If true, requests without an Idempotency-Key header are rejected with 400 Bad Request.
   * Default: true
   */
  required?: boolean;
  /**
   * Maximum duration in seconds an IN_PROGRESS lease remains valid before considered expired.
   * Default: 120 seconds (2 minutes)
   */
  lockTimeoutSeconds?: number;
}

export const Idempotent = (options: IdempotencyOptions = { required: true }) =>
  SetMetadata(IDEMPOTENCY_OPTIONS_KEY, options);
