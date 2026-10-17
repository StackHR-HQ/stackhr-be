import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import {
  IDEMPOTENCY_OPTIONS_KEY,
  IdempotencyOptions,
} from './idempotency.decorator';
import { IdempotencyService } from './idempotency.service';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { MetricsService } from '../metrics/metrics.service';
import { Optional } from '@nestjs/common';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotencyService: IdempotencyService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.getAllAndOverride<
      IdempotencyOptions | undefined
    >(IDEMPOTENCY_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!options) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest & Request>();
    const res = http.getResponse<Response>();

    const rawKey =
      req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) {
      if (options.required !== false) {
        throw new BadRequestException(
          'Idempotency-Key header is required for this operation.',
        );
      }
      return next.handle();
    }

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      throw new BadRequestException(
        'An active organization context is required for idempotent operations.',
      );
    }

    const userId = req.user?.id ?? 'system';
    const endpoint =
      `${req.method} ${req.baseUrl || ''}${req.path || ''}`.trim();

    return from(
      this.idempotencyService.acquireKey({
        organizationId,
        userId,
        key: String(key).trim(),
        endpoint,
        body: req.body,
        lockTimeoutSeconds: options.lockTimeoutSeconds,
      }),
    ).pipe(
      tap(() => {
        // Successful acquisition or lease
        this.metricsService?.recordIdempotency('lease_acquired', endpoint);
      }),
      switchMap((result) => {
        if (result.isReplay) {
          this.metricsService?.recordIdempotency('replayed', endpoint);
          res.setHeader('Idempotent-Replayed', 'true');
          res.status(result.statusCode);
          return of(result.responseBody);
        }

        return next.handle().pipe(
          tap({
            next: (responsePayload) => {
              const statusCode = res.statusCode || 200;
              void this.idempotencyService.completeKey(
                result.recordId,
                statusCode,
                responsePayload,
              );
            },
            error: () => {
              void this.idempotencyService.failKey(result.recordId);
            },
          }),
        );
      }),
    );
  }
}
