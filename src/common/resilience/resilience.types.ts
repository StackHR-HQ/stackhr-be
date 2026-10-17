export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name?: string;
  /**
   * Number of consecutive failures before tripping the circuit from CLOSED to OPEN.
   * Default: 5
   */
  failureThreshold?: number;
  /**
   * Cooldown period in milliseconds before attempting a canary probe in HALF_OPEN.
   * Default: 30,000ms (30 seconds)
   */
  recoveryTimeoutMs?: number;
}

export interface RetryOptions {
  name?: string;
  /**
   * Maximum number of retry attempts after the initial failure.
   * Default: 3
   */
  maxRetries?: number;
  /**
   * Base initial delay in milliseconds.
   * Default: 200ms
   */
  initialDelayMs?: number;
  /**
   * Cap on maximum backoff delay in milliseconds.
   * Default: 5,000ms
   */
  maxDelayMs?: number;
  /**
   * Multiplier for exponential backoff.
   * Default: 2
   */
  backoffFactor?: number;
  /**
   * Custom predicate to determine whether an error is transient and retryable.
   */
  isRetryable?: (error: any) => boolean;
}

export interface ResilientRequestOptions {
  timeoutMs?: number;
  retry?: RetryOptions;
  circuitBreaker?: CircuitBreakerOptions;
}
