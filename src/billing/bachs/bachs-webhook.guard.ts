import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { verifyBachsSignature } from './bachs-signature';

/**
 * Verifies `X-Bachs-Signature-V2` against the raw body. Rejections return 400,
 * which Bachs does not retry (per its webhook docs).
 */
@Injectable()
export class BachsWebhookGuard implements CanActivate {
  private readonly logger = new Logger(BachsWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();
    const secret = process.env.BACHS_WEBHOOK_SECRET;

    if (!secret) {
      this.logger.error('BACHS_WEBHOOK_SECRET is not configured');
      // 503 so Bachs retries once the secret is configured.
      throw new ServiceUnavailableException(
        'Webhook verification unconfigured',
      );
    }

    // Never fall back to re-serialised JSON: the signature covers raw bytes.
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BadRequestException('Raw body unavailable');
    }

    const ok = verifyBachsSignature({
      header: request.headers['x-bachs-signature-v2'] as string | undefined,
      rawBody: request.rawBody,
      secret,
      now: new Date(),
    });
    if (!ok) {
      this.logger.warn('Bachs webhook rejected: invalid or stale signature');
      throw new BadRequestException('Invalid webhook signature');
    }
    return true;
  }
}
