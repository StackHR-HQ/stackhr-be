import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const method = request.method?.toUpperCase();

    if (!method || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const routePath = String(request.route?.path ?? request.url ?? '');
    const resource = this.extractResourceName(routePath);
    const body = (request.body ?? {}) as Record<string, unknown>;

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const user = request.user;
          const resourceId =
            (responseBody?.id as string) ??
            (responseBody?.user?.id as string) ??
            (responseBody?.employee?.id as string) ??
            (responseBody?.organization?.id as string) ??
            null;

          void this.auditService.log({
            organizationId: user?.organizationId ?? null,
            actorId: user?.id ?? null,
            action: `${method} ${routePath}`,
            resource,
            resourceId,
            payload: Object.keys(body).length > 0 ? body : null,
            ipAddress: request.ip ?? null,
            userAgent: request.headers['user-agent'] ?? null,
          });
        },
      }),
    );
  }

  private extractResourceName(path: string): string {
    const segments = path
      .replace(/^\/v1\/api\//, '')
      .split('/')
      .filter(Boolean);
    return segments[0] ?? 'unknown';
  }
}
