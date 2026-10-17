import { Injectable, LoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger } from 'pino';
import { RequestContextService } from '../context/request-context.service';
import { PINO_REDACT_PATHS } from './logger.constants';

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly pino: PinoLogger;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';

    this.pino = pino({
      level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
      redact: {
        paths: PINO_REDACT_PATHS,
        censor: '[REDACTED]',
      },
      transport:
        !isProduction && process.env.NODE_ENV !== 'test'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      base: {
        env: process.env.NODE_ENV || 'development',
        service: 'stackhr-backend',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  private buildContextPayload(
    context?: string,
    extra?: Record<string, unknown>,
  ) {
    const store = RequestContextService.getStore();
    return {
      correlationId: store?.correlationId,
      traceId: store?.traceId,
      spanId: store?.spanId,
      organizationId: store?.organizationId,
      userId: store?.userId,
      durationMs: RequestContextService.getDurationMs(),
      context: context || 'Application',
      ...extra,
    };
  }

  log(message: any, ...optionalParams: any[]): void {
    const { context, meta } = this.extractContextAndMeta(optionalParams);
    const payload = this.buildContextPayload(context, meta);
    if (typeof message === 'object' && message !== null) {
      this.pino.info({ ...payload, ...message });
    } else {
      this.pino.info(payload, String(message));
    }
  }

  error(message: any, ...optionalParams: any[]): void {
    const { context, meta, trace } = this.extractContextAndMeta(optionalParams);
    const payload = this.buildContextPayload(context, {
      ...meta,
      stack: trace || (message instanceof Error ? message.stack : undefined),
    });

    if (message instanceof Error) {
      this.pino.error(payload, message.message);
    } else if (typeof message === 'object' && message !== null) {
      this.pino.error({ ...payload, ...message });
    } else {
      this.pino.error(payload, String(message));
    }
  }

  warn(message: any, ...optionalParams: any[]): void {
    const { context, meta } = this.extractContextAndMeta(optionalParams);
    const payload = this.buildContextPayload(context, meta);
    if (typeof message === 'object' && message !== null) {
      this.pino.warn({ ...payload, ...message });
    } else {
      this.pino.warn(payload, String(message));
    }
  }

  debug?(message: any, ...optionalParams: any[]): void {
    const { context, meta } = this.extractContextAndMeta(optionalParams);
    const payload = this.buildContextPayload(context, meta);
    if (typeof message === 'object' && message !== null) {
      this.pino.debug({ ...payload, ...message });
    } else {
      this.pino.debug(payload, String(message));
    }
  }

  verbose?(message: any, ...optionalParams: any[]): void {
    const { context, meta } = this.extractContextAndMeta(optionalParams);
    const payload = this.buildContextPayload(context, meta);
    if (typeof message === 'object' && message !== null) {
      this.pino.trace({ ...payload, ...message });
    } else {
      this.pino.trace(payload, String(message));
    }
  }

  private extractContextAndMeta(params: any[]): {
    context?: string;
    trace?: string;
    meta?: Record<string, unknown>;
  } {
    let context: string | undefined;
    let trace: string | undefined;
    let meta: Record<string, unknown> = {};

    for (const param of params) {
      if (typeof param === 'string') {
        if (!context) {
          context = param;
        } else if (!trace) {
          trace = param;
        }
      } else if (typeof param === 'object' && param !== null) {
        meta = { ...meta, ...param };
      }
    }

    return { context, trace, meta };
  }
}
