import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  APIResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<APIResponse<T>> {
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
