import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const WEBHOOK_EXCLUSIONS = [
  '/banking/webhook',
  '/v1/api/banking/webhook',
  '/billing/webhooks/bachs',
  '/v1/api/billing/webhooks/bachs',
];

/**
 * Global CSRF guard that validates Origin (or Referer fallback) against the
 * CORS allowlist on all state-changing HTTP methods, excluding signature-verified
 * external webhook endpoints.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(allowedOrigins: string[]) {
    this.allowedOrigins = new Set(allowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method ?? 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0];
    if (WEBHOOK_EXCLUSIONS.some((excluded) => path === excluded)) {
      return true;
    }

    // Bearer-token requests are not automatically attached by browsers and
    // aren't exposed to CSRF (Postman, mobile, server-to-server).
    const authHeader = req.headers.authorization;
    if (
      typeof authHeader === 'string' &&
      authHeader.trimStart().toLowerCase().startsWith('bearer ')
    ) {
      return true;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    let requestOrigin: string | null = null;
    if (typeof originHeader === 'string' && originHeader.trim()) {
      requestOrigin = originHeader.trim();
    } else if (typeof refererHeader === 'string' && refererHeader.trim()) {
      try {
        requestOrigin = new URL(refererHeader.trim()).origin;
      } catch {
        requestOrigin = null;
      }
    }

    if (!requestOrigin || !this.allowedOrigins.has(requestOrigin)) {
      throw new ForbiddenException('Invalid or missing request origin');
    }

    return true;
  }
}
