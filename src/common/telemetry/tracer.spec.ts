import { withSpan } from './tracer';
import { RequestContextService } from '../context/request-context.service';

describe('OpenTelemetry Tracer withSpan', () => {
  it('should execute the operation inside a span and return result', async () => {
    const result = await RequestContextService.run(
      {
        correlationId: 'trace-test-corr',
        traceId: 'trace-test-trace',
        organizationId: 'org-otel-1',
        userId: 'usr-otel-2',
        startTime: Date.now(),
      },
      () => {
        return withSpan(
          'test-operation',
          (span) => {
            expect(span).toBeDefined();
            return Promise.resolve('operation-completed');
          },
          { 'custom.metric': 42 },
        );
      },
    );

    expect(result).toBe('operation-completed');
  });

  it('should capture errors, record exception, and rethrow', async () => {
    await expect(
      withSpan('failing-operation', () => {
        return Promise.reject(new Error('Downstream network failure'));
      }),
    ).rejects.toThrow('Downstream network failure');
  });
});
