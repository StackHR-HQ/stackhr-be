import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';
import type { Request, Response } from 'express';

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseHeaders: Record<string, string>;

  beforeEach(() => {
    middleware = new RequestContextMiddleware();
    responseHeaders = {};

    mockResponse = {
      setHeader: jest.fn((key: string, value: string) => {
        responseHeaders[key.toLowerCase()] = value;
        return mockResponse as Response;
      }),
    };
  });

  it('should use existing x-correlation-id if provided in incoming headers', (done) => {
    mockRequest = {
      headers: {
        'x-correlation-id': 'custom-client-uuid-1234',
      },
    };

    middleware.use(mockRequest as Request, mockResponse as Response, () => {
      expect(responseHeaders['x-correlation-id']).toBe(
        'custom-client-uuid-1234',
      );
      expect(RequestContextService.getCorrelationId()).toBe(
        'custom-client-uuid-1234',
      );
      expect(responseHeaders['x-trace-id']).toBeDefined();
      expect(RequestContextService.getTraceId()).toBeDefined();
      done();
    });
  });

  it('should generate a correlation ID if not provided in incoming headers', (done) => {
    mockRequest = {
      headers: {},
    };

    middleware.use(mockRequest as Request, mockResponse as Response, () => {
      expect(responseHeaders['x-correlation-id']).toBeDefined();
      expect(responseHeaders['x-correlation-id'].length).toBeGreaterThan(10);
      expect(RequestContextService.getCorrelationId()).toBe(
        responseHeaders['x-correlation-id'],
      );
      done();
    });
  });

  it('should parse standard W3C traceparent header when present', (done) => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';
    const traceparent = `00-${traceId}-${spanId}-01`;

    mockRequest = {
      headers: {
        traceparent,
      },
    };

    middleware.use(mockRequest as Request, mockResponse as Response, () => {
      expect(responseHeaders['x-trace-id']).toBe(traceId);
      expect(RequestContextService.getTraceId()).toBe(traceId);
      expect(RequestContextService.getSpanId()).toBe(spanId);
      done();
    });
  });
});
