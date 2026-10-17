import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { runWithTenantContext } from './tenant-context';
import { RequestContextService } from '../common/context/request-context.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = request.user?.organizationId ?? null;
    const userId = request.user?.id ?? null;

    if (organizationId) {
      RequestContextService.set('organizationId', organizationId);
    }
    if (userId) {
      RequestContextService.set('userId', userId);
    }

    return new Observable((subscriber) => {
      runWithTenantContext({ organizationId }, () => {
        const subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        return () => subscription.unsubscribe();
      });
    });
  }
}
