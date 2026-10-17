import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationHeader = req.headers['x-correlation-id'];
    const correlationId =
      (Array.isArray(correlationHeader)
        ? correlationHeader[0]
        : correlationHeader) || randomUUID();

    const traceparent = req.headers['traceparent'];
    let traceId: string;
    let spanId: string;

    if (typeof traceparent === 'string') {
      const parts = traceparent.trim().split('-');
      if (
        parts.length >= 4 &&
        parts[1].length === 32 &&
        parts[2].length === 16
      ) {
        traceId = parts[1];
        spanId = parts[2];
      } else {
        traceId = randomBytes(16).toString('hex');
        spanId = randomBytes(8).toString('hex');
      }
    } else {
      const xTraceId = req.headers['x-trace-id'];
      traceId =
        (Array.isArray(xTraceId) ? xTraceId[0] : xTraceId) ||
        randomBytes(16).toString('hex');
      spanId = randomBytes(8).toString('hex');
    }

    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-trace-id', traceId);

    RequestContextService.run(
      {
        correlationId,
        traceId,
        spanId,
        startTime: Date.now(),
      },
      () => {
        next();
      },
    );
  }
}
