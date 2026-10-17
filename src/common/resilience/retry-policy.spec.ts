import { executeWithRetry, isDefaultTransientError } from './retry-policy';

describe('RetryPolicy with Exponential Backoff and Full Jitter', () => {
  it('should return result on first attempt without retrying when successful', async () => {
    const fn = jest.fn().mockResolvedValue('success-payload');

    const result = await executeWithRetry(fn, {
      name: 'TestOp',
      maxRetries: 3,
      initialDelayMs: 10,
    });

    expect(result).toBe('success-payload');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors and succeed if subsequent attempt succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed: network socket reset'))
      .mockResolvedValueOnce('recovered-payload');

    const result = await executeWithRetry(fn, {
      name: 'TestOp',
      maxRetries: 3,
      initialDelayMs: 5,
      maxDelayMs: 20,
    });

    expect(result).toBe('recovered-payload');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-transient 4xx errors and fail fast immediately', async () => {
    const badRequestError = {
      message: 'Invalid employer code',
      status: 400,
    };
    const fn = jest.fn().mockRejectedValue(badRequestError);

    await expect(
      executeWithRetry(fn, {
        name: 'TestOp',
        maxRetries: 3,
        initialDelayMs: 5,
      }),
    ).rejects.toEqual(badRequestError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retries and throw if error persists beyond maxRetries', async () => {
    const persistentError = new Error('ECONNRESET');
    const fn = jest.fn().mockRejectedValue(persistentError);

    await expect(
      executeWithRetry(fn, {
        name: 'TestOp',
        maxRetries: 2,
        initialDelayMs: 5,
        maxDelayMs: 20,
      }),
    ).rejects.toThrow('ECONNRESET');

    // 1 initial attempt + 2 retries = 3 attempts total
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should classify transient and non-transient errors correctly', () => {
    expect(isDefaultTransientError({ status: 503 })).toBe(true);
    expect(isDefaultTransientError({ status: 502 })).toBe(true);
    expect(isDefaultTransientError({ status: 429 })).toBe(true);
    expect(isDefaultTransientError(new Error('socket hang up'))).toBe(true);
    expect(isDefaultTransientError(new Error('ETIMEDOUT'))).toBe(true);

    expect(isDefaultTransientError({ status: 400 })).toBe(false);
    expect(isDefaultTransientError({ status: 401 })).toBe(false);
    expect(isDefaultTransientError({ status: 404 })).toBe(false);
    expect(isDefaultTransientError({ status: 422 })).toBe(false);
  });
});
