import { Logger } from '@nestjs/common';
import type { RetryOptions } from './resilience.types';

export function isDefaultTransientError(error: any): boolean {
  if (!error) return false;

  const status =
    error.status ??
    error.statusCode ??
    error.response?.status ??
    error.response?.statusCode;

  if (typeof status === 'number') {
    // 408 Timeout, 429 Rate Limit, 500 Internal, 502 Bad Gateway, 503 Unavailable, 504 Gateway Timeout
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
    // Explicit 4xx errors are client errors and should never be retried
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  const message = String(error.message || error).toLowerCase();
  const transientPatterns = [
    'econnreset',
    'etimedout',
    'enotfound',
    'eai_again',
    'econnrefused',
    'socket hang up',
    'network error',
    'fetch failed',
    'aborterror',
    'timeout',
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    name = 'Operation',
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 5000,
    backoffFactor = 2,
    isRetryable = isDefaultTransientError,
  } = options;

  const logger = new Logger(`RetryPolicy[${name}]`);
  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      attempt++;

      if (attempt > maxRetries || !isRetryable(err)) {
        throw err;
      }

      // Exponential Backoff with Full Jitter: random(0, min(maxDelayMs, initialDelayMs * backoffFactor^attempt))
      const calculatedBackoff = Math.min(
        maxDelayMs,
        initialDelayMs * Math.pow(backoffFactor, attempt - 1),
      );
      const jitteredDelayMs = Math.floor(Math.random() * calculatedBackoff);

      logger.warn(
        `Attempt ${attempt}/${maxRetries} failed with error: "${err.message}". Retrying in ${jitteredDelayMs}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, jitteredDelayMs));
    }
  }
}
