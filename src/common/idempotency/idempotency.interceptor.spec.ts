import {
  BadRequestException,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, throwError, lastValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockReflector: { getAllAndOverride: jest.Mock };
  let mockIdempotencyService: {
    acquireKey: jest.Mock;
    completeKey: jest.Mock;
    failKey: jest.Mock;
  };
  let mockContext: ExecutionContext;
  let mockNext: { handle: jest.Mock };
  let mockReq: any;
  let mockRes: any;
  let resHeaders: Record<string, string>;

  beforeEach(() => {
    resHeaders = {};
    mockReq = {
      headers: {},
      method: 'POST',
      baseUrl: '/v1/api',
      path: '/payroll/runs/run-1/execute',
      body: { totalNet: 50000 },
      user: {
        id: 'usr-123',
        organizationId: 'org-abc',
      },
    };

    mockRes = {
      statusCode: 200,
      setHeader: jest.fn((k: string, v: string) => {
        resHeaders[k.toLowerCase()] = v;
      }),
      status: jest.fn((code: number) => {
        mockRes.statusCode = code;
        return mockRes;
      }),
    };

    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
    } as unknown as ExecutionContext;

    mockNext = {
      handle: jest.fn().mockReturnValue(of({ success: true, runId: 'run-1' })),
    };

    mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    mockIdempotencyService = {
      acquireKey: jest.fn(),
      completeKey: jest.fn(),
      failKey: jest.fn(),
    };

    interceptor = new IdempotencyInterceptor(
      mockReflector as unknown as Reflector,
      mockIdempotencyService as unknown as IdempotencyService,
    );
  });

  it('should pass through if handler is not decorated with @Idempotent', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const stream = interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(stream);

    expect(result).toEqual({ success: true, runId: 'run-1' });
    expect(mockNext.handle).toHaveBeenCalled();
    expect(mockIdempotencyService.acquireKey).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException if Idempotency-Key is missing and required', () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      required: true,
    });
    mockReq.headers = {}; // no key

    expect(() =>
      interceptor.intercept(mockContext, mockNext as unknown as CallHandler),
    ).toThrow(BadRequestException);
  });

  it('should pass through if key is missing but required is false', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      required: false,
    });
    mockReq.headers = {}; // no key

    const stream = interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(stream);

    expect(result).toEqual({ success: true, runId: 'run-1' });
    expect(mockIdempotencyService.acquireKey).not.toHaveBeenCalled();
  });

  it('should short-circuit and return cached response on replay', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      required: true,
    });
    mockReq.headers = { 'idempotency-key': 'key-replay-123' };

    mockIdempotencyService.acquireKey.mockResolvedValue({
      isReplay: true,
      recordId: 'rec-1',
      statusCode: 200,
      responseBody: { success: true, cached: true },
    });

    const stream = interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(stream);

    expect(result).toEqual({ success: true, cached: true });
    expect(mockNext.handle).not.toHaveBeenCalled();
    expect(resHeaders['idempotent-replayed']).toBe('true');
  });

  it('should execute handler, complete key, and return data on new key', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      required: true,
    });
    mockReq.headers = { 'idempotency-key': 'key-new-456' };

    mockIdempotencyService.acquireKey.mockResolvedValue({
      isReplay: false,
      recordId: 'rec-2',
    });

    const stream = interceptor.intercept(mockContext, mockNext);
    const result = await lastValueFrom(stream);

    expect(result).toEqual({ success: true, runId: 'run-1' });
    expect(mockNext.handle).toHaveBeenCalled();
    expect(mockIdempotencyService.completeKey).toHaveBeenCalledWith(
      'rec-2',
      200,
      { success: true, runId: 'run-1' },
    );
  });

  it('should mark key as FAILED if handler throws an error', async () => {
    mockReflector.getAllAndOverride.mockReturnValue({
      required: true,
    });
    mockReq.headers = { 'idempotency-key': 'key-error-789' };

    mockIdempotencyService.acquireKey.mockResolvedValue({
      isReplay: false,
      recordId: 'rec-3',
    });

    mockNext = {
      handle: jest
        .fn()
        .mockReturnValue(
          throwError(() => new Error('Bank gateway connection timeout')),
        ),
    };

    const stream = interceptor.intercept(mockContext, mockNext);
    await expect(lastValueFrom(stream)).rejects.toThrow(
      'Bank gateway connection timeout',
    );

    expect(mockIdempotencyService.failKey).toHaveBeenCalledWith('rec-3');
  });
});
