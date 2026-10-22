import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      name: 'TestService',
      failureThreshold: 3,
      recoveryTimeoutMs: 50, // 50ms for fast testing
    });
  });

  it('should start in CLOSED state and execute operations normally', async () => {
    expect(cb.getState()).toBe('CLOSED');
    const result = await cb.execute(() => Promise.resolve('hello-resilience'));
    expect(result).toBe('hello-resilience');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('should trip to OPEN when consecutive transient failures hit threshold', async () => {
    const error = new Error('fetch failed: network socket reset');

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow(
        'fetch failed',
      );
    }

    expect(cb.getState()).toBe('OPEN');
    expect(cb.getStats().consecutiveFailures).toBe(3);
  });

  it('should fail fast when OPEN without calling underlying operation', async () => {
    const error = new Error('ECONNRESET');
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow(
        'ECONNRESET',
      );
    }

    expect(cb.getState()).toBe('OPEN');

    const fn = jest.fn();
    await expect(cb.execute(fn)).rejects.toThrow(ServiceUnavailableException);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should transition to HALF_OPEN after cooldown and recover to CLOSED on successful probe', async () => {
    const error = new Error('ECONNRESET');
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    expect(cb.getState()).toBe('OPEN');

    // Wait for recovery timeout (50ms)
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(cb.getState()).toBe('HALF_OPEN');

    // Probe succeeds
    const result = await cb.execute(() => Promise.resolve('probe-succeeded'));
    expect(result).toBe('probe-succeeded');

    // Circuit should now be healed back to CLOSED
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().consecutiveFailures).toBe(0);
  });

  it('should revert to OPEN if canary probe fails while HALF_OPEN', async () => {
    const error = new Error('ECONNRESET');
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(error))).rejects.toThrow();
    }

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cb.getState()).toBe('HALF_OPEN');

    // Probe fails
    await expect(
      cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))),
    ).rejects.toThrow();

    expect(cb.getState()).toBe('OPEN');
  });
});
