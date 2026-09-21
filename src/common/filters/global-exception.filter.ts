import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'An unexpected error occurred';
    let errorString = 'InternalServerError';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      errorString =
        exception instanceof HttpException
          ? exception.name
          : 'InternalServerError';
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const resObj = exceptionResponse as Record<string, unknown>;
      const rawMessage = resObj.message;

      if (Array.isArray(rawMessage) && rawMessage.length > 0) {
        message = String(rawMessage[0]);
      } else if (typeof rawMessage === 'string') {
        message = rawMessage;
      } else if (typeof resObj.error === 'string') {
        message = resObj.error;
      }

      if (typeof resObj.error === 'string') {
        errorString = resObj.error;
      } else if (exception instanceof HttpException) {
        errorString = exception.name;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack);
      message = exception.message || message;
      errorString = exception.name;
    }

    response.status(status).json({
      success: false,
      message,
      data: null,
      error: {
        error: errorString,
        statusCode: status,
      },
    });
  }
}
