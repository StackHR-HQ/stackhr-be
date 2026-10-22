import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('should run a callback within context and retrieve stored fields', () => {
    const store = {
      correlationId: 'test-corr-123',
      traceId: 'test-trace-456',
      spanId: 'span-789',
      organizationId: 'org-1',
      userId: 'user-1',
      startTime: Date.now() - 50,
    };

    RequestContextService.run(store, () => {
      expect(RequestContextService.getStore()).toEqual(store);
      expect(RequestContextService.getCorrelationId()).toBe('test-corr-123');
      expect(RequestContextService.getTraceId()).toBe('test-trace-456');
      expect(RequestContextService.getSpanId()).toBe('span-789');
      expect(RequestContextService.getOrganizationId()).toBe('org-1');
      expect(RequestContextService.getUserId()).toBe('user-1');
      expect(RequestContextService.getDurationMs()).toBeGreaterThanOrEqual(40);
    });
  });

  it('should maintain isolation between concurrent asynchronous executions', async () => {
    const runA = async () => {
      return RequestContextService.run(
        {
          correlationId: 'req-A',
          traceId: 'trace-A',
          startTime: Date.now(),
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return RequestContextService.getCorrelationId();
        },
      );
    };

    const runB = async () => {
      return RequestContextService.run(
        {
          correlationId: 'req-B',
          traceId: 'trace-B',
          startTime: Date.now(),
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return RequestContextService.getCorrelationId();
        },
      );
    };

    const [resultA, resultB] = await Promise.all([runA(), runB()]);
    expect(resultA).toBe('req-A');
    expect(resultB).toBe('req-B');
  });

  it('should allow setting additional fields dynamically within context', () => {
    RequestContextService.run(
      {
        correlationId: 'init-corr',
        traceId: 'init-trace',
        startTime: Date.now(),
      },
      () => {
        expect(RequestContextService.getOrganizationId()).toBeUndefined();
        RequestContextService.set('organizationId', 'late-bound-org');
        RequestContextService.set('userId', 'late-bound-user');

        expect(RequestContextService.getOrganizationId()).toBe(
          'late-bound-org',
        );
        expect(RequestContextService.getUserId()).toBe('late-bound-user');
      },
    );
  });

  it('should return undefined when queried outside an active context', () => {
    expect(RequestContextService.getStore()).toBeUndefined();
    expect(RequestContextService.getCorrelationId()).toBeUndefined();
    expect(RequestContextService.getTraceId()).toBeUndefined();
  });
});
