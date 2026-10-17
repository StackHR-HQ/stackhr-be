import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreaker } from './circuit-breaker';
import { executeWithRetry, isDefaultTransientError } from './retry-policy';
import type { ResilientRequestOptions } from './resilience.types';

@Injectable()
export class ResilientHttpClient {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  getCircuitBreaker(
    name: string,
    failureThreshold = 5,
    recoveryTimeoutMs = 30000,
  ): CircuitBreaker {
    let cb = this.circuitBreakers.get(name);
    if (!cb) {
      cb = new CircuitBreaker({ name, failureThreshold, recoveryTimeoutMs });
      this.circuitBreakers.set(name, cb);
    }
    return cb;
  }

  async fetch(
    url: string | URL,
    init?: RequestInit,
    options: ResilientRequestOptions = {},
  ): Promise<Response> {
    const serviceName =
      options.circuitBreaker?.name || new URL(url.toString()).hostname;
    const circuitBreaker = this.getCircuitBreaker(
      serviceName,
      options.circuitBreaker?.failureThreshold,
      options.circuitBreaker?.recoveryTimeoutMs,
    );

    const timeoutMs = options.timeoutMs ?? 15000;

    return circuitBreaker.execute(async () => {
      return executeWithRetry(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await globalThis.fetch(url, {
              ...init,
              signal: controller.signal,
            });

            if (
              !response.ok &&
              [408, 429, 500, 502, 503, 504].includes(response.status)
            ) {
              throw new ServiceUnavailableException(
                `Remote service [${serviceName}] responded with transient status ${response.status}`,
              );
            }

            return response;
          } catch (err: any) {
            if (err.name === 'AbortError') {
              throw new ServiceUnavailableException(
                `Request to [${serviceName}] timed out after ${timeoutMs}ms`,
              );
            }
            throw err;
          } finally {
            clearTimeout(timer);
          }
        },
        {
          name: serviceName,
          ...options.retry,
          isRetryable: isDefaultTransientError,
        },
      );
    });
  }

  getAllCircuitStats() {
    return Array.from(this.circuitBreakers.values()).map((cb) => cb.getStats());
  }
}
