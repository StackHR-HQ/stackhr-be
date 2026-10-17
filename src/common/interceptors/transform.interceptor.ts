import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BYPASS_TRANSFORM_KEY } from './bypass-transform.decorator';

export interface APIResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  error?: {
    error: string;
    statusCode: number;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, unknown> {
  constructor(@Optional() private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.reflector) {
      const bypass = this.reflector.getAllAndOverride<boolean>(
        BYPASS_TRANSFORM_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (bypass) {
        return next.handle();
      }
    }
    return next.handle().pipe(
      map((res) => {
        // If response is already formatted with success and data fields, pass through to avoid double-wrapping
        if (
          res &&
          typeof res === 'object' &&
          'success' in res &&
          typeof (res as Record<string, unknown>).success === 'boolean'
        ) {
          return res as APIResponse<T>;
        }

        return {
          success: true,
          message: 'Request successful',
          data: (res ?? null) as T,
        };
      }),
    );
  }
}
