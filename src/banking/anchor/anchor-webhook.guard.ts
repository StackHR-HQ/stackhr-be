import * as crypto from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AnchorWebhookGuard implements CanActivate {
  private readonly logger = new Logger(AnchorWebhookGuard.name);
  private readonly webhookSecret: string | undefined;

  constructor() {
    this.webhookSecret = process.env.ANCHOR_WEBHOOK_SECRET;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-anchor-signature'] as
      string | undefined;

    if (!this.webhookSecret) {
      if (process.env.NODE_ENV === 'test') {
        return true;
      }
      this.logger.error(
        'ANCHOR_WEBHOOK_SECRET is not configured in environment',
      );
      throw new UnauthorizedException('Webhook verification unconfigured');
    }

    if (!signature) {
      this.logger.warn(
        'Incoming Anchor webhook rejected: missing x-anchor-signature header',
      );
      throw new UnauthorizedException('Missing x-anchor-signature header');
    }

    const reqWithRawBody = request as Request & { rawBody?: Buffer };
    const rawPayload: string = Buffer.isBuffer(reqWithRawBody.rawBody)
      ? reqWithRawBody.rawBody.toString('utf8')
      : JSON.stringify(request.body ?? {});

    const computedSignature = crypto
      .createHmac('sha1', this.webhookSecret)
      .update(rawPayload)
      .digest('base64');

    const expectedBuf = Buffer.from(signature, 'utf8');
    const computedBuf = Buffer.from(computedSignature, 'utf8');

    if (
      expectedBuf.length !== computedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, computedBuf)
    ) {
      this.logger.warn('Incoming Anchor webhook rejected: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
