import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let metricsService: MetricsService;
  let recordHttpRequestSpy: jest.SpyInstance;

  beforeEach(() => {
    metricsService = new MetricsService();
    recordHttpRequestSpy = jest
      .spyOn(metricsService, 'recordHttpRequest')
      .mockImplementation();
    interceptor = new MetricsInterceptor(metricsService);
  });

  const createMockContext = (
    method: string,
    url: string,
    statusCode = 200,
  ): ExecutionContext => {
    const req = {
      method,
      url,
      originalUrl: url,
      baseUrl: '',
      route: { path: url },
    };
    const res = {
      statusCode,
    };

    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as unknown as ExecutionContext;
  };

  it('should record HTTP request duration and status code on success', (done) => {
    const context = createMockContext('GET', '/v1/api/employees', 200);
    const next: CallHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(recordHttpRequestSpy).toHaveBeenCalledWith(
          'GET',
          '/v1/api/employees',
          200,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('should normalize UUIDs in routes to avoid cardinality explosion', (done) => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const context = createMockContext('GET', `/v1/api/employees/${uuid}`);
    const next: CallHandler = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(recordHttpRequestSpy).toHaveBeenCalledWith(
          'GET',
          '/v1/api/employees/:id',
          200,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('should record HTTP request and error status code on failure', (done) => {
    const context = createMockContext('POST', '/v1/api/auth/login', 401);
    const error = { status: 401, message: 'Unauthorized' };
    const next: CallHandler = {
      handle: () => throwError(() => error),
    };

    interceptor.intercept(context, next).subscribe({
      error: () => {
        expect(recordHttpRequestSpy).toHaveBeenCalledWith(
          'POST',
          '/v1/api/auth/login',
          401,
          expect.any(Number),
        );
        done();
      },
    });
  });

  it('should pass through non-http contexts untouched', (done) => {
    const rpcContext = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;

    const next: CallHandler = {
      handle: () => of('rpc-result'),
    };

    interceptor.intercept(rpcContext, next).subscribe({
      next: (val) => {
        expect(val).toBe('rpc-result');
        expect(recordHttpRequestSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
