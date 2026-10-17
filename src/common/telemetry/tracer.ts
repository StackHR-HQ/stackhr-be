import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { RequestContextService } from '../context/request-context.service';

export const appTracer = trace.getTracer('stackhr-backend', '1.0.0');

export async function withSpan<T>(
  name: string,
  operation: (span: Span) => Promise<T> | T,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return appTracer.startActiveSpan(name, async (span) => {
    try {
      const store = RequestContextService.getStore();
      if (store?.organizationId) {
        span.setAttribute('organization.id', store.organizationId);
      }
      if (store?.userId) {
        span.setAttribute('user.id', store.userId);
      }
      if (store?.correlationId) {
        span.setAttribute('correlation.id', store.correlationId);
      }
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) {
          span.setAttribute(k, v);
        }
      }

      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || 'An error occurred during span execution',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
