import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const CODES_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Serializes errors as `{ error: { code, message, fields? } }`, the People
 * API contract. Exceptions may pass `{ code, message, fields }` as their body.
 */
@Catch()
export class PeopleExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PeopleExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const details = typeof body === 'object' && body !== null ? body : {};
    const rawMessage = 'message' in details ? details.message : body;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : String(rawMessage);
    const code =
      'code' in details && typeof details.code === 'string'
        ? details.code
        : (CODES_BY_STATUS[status] ?? 'ERROR');

    response.status(status).json({
      error: {
        code,
        message,
        ...('fields' in details && details.fields
          ? { fields: details.fields }
          : {}),
      },
    });
  }
}
