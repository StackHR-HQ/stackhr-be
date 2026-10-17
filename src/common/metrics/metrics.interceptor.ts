import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.record(req, res.statusCode, startTime);
        },
        error: (error: unknown) => {
          const err = error as
            { status?: number; statusCode?: number } | undefined;
          const statusCode = Number(err?.status || err?.statusCode || 500);
          this.record(req, statusCode, startTime);
        },
      }),
    );
  }

  private record(req: Request, statusCode: number, startTime: bigint) {
    const elapsedNs = process.hrtime.bigint() - startTime;
    const durationSeconds = Number(elapsedNs) / 1_000_000_000;

    // Use parameterized route pattern if available (e.g., /v1/api/payroll/runs/:id) to prevent high cardinality
    let route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.originalUrl?.split('?')[0] || req.url;

    // Normalize GUIDs/UUIDs and numeric IDs to prevent metric cardinality explosion
    route = route
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/c[a-z0-9]{24}/gi, '/:id');

    this.metricsService.recordHttpRequest(
      req.method,
      route,
      statusCode,
      durationSeconds,
    );
  }
}
