import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  CircuitBreakerOptions,
  CircuitBreakerState,
} from './resilience.types';
import { isDefaultTransientError } from './retry-policy';

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly logger: Logger;

  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private lastStateChange = Date.now();

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name || 'Default';
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30000;
    this.logger = new Logger(`CircuitBreaker[${this.name}]`);
  }

  getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      isAvailable: this.getState() !== 'OPEN',
    };
  }

  private transitionTo(newState: CircuitBreakerState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'OPEN') {
      this.logger.error(
        `Circuit tripped to OPEN (Threshold: ${this.failureThreshold} failures). Failing fast for ${this.recoveryTimeoutMs}ms.`,
      );
    } else if (newState === 'HALF_OPEN') {
      this.logger.warn(
        `Cooldown elapsed. Circuit entered HALF_OPEN (Allowing 1 canary probe).`,
      );
    } else if (newState === 'CLOSED' && oldState !== 'CLOSED') {
      this.logger.log(
        `Canary probe succeeded. Circuit recovered to CLOSED (Normal operations restored).`,
      );
    }
  }

  async execute<T>(
    operation: () => Promise<T>,
    isFailure: (err: any) => boolean = isDefaultTransientError,
  ): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      throw new ServiceUnavailableException(
        `Circuit breaker is OPEN for [${this.name}]. Upstream service is temporarily degraded. Please try again shortly.`,
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err: any) {
      if (isFailure(err)) {
        this.onFailure(err);
      }
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveFailures = 0;
      this.transitionTo('CLOSED');
    } else {
      this.consecutiveFailures = 0;
    }
  }

  private onFailure(err: any) {
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    this.consecutiveFailures++;
    this.logger.warn(
      `Recorded failure ${this.consecutiveFailures}/${this.failureThreshold} for [${this.name}]: ${err.message}`,
    );

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
  }
}
