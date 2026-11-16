import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BillingWebhookService } from '../billing-webhook.service';
import { BachsWebhookGuard } from './bachs-webhook.guard';
import type { BachsWebhookEvent } from './bachs.types';

/**
 * Register this URL in the Bachs Developer Portal (Webhooks → Add destination)
 * for: collection.succeeded, collection.underpaid, collection.failed,
 * payment_method.saved, checkout.expired.
 */
@Controller('billing/webhooks')
export class BachsWebhookController {
  constructor(private readonly webhooks: BillingWebhookService) {}

  @Post('bachs')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @UseGuards(BachsWebhookGuard)
  async receive(@Body() event: BachsWebhookEvent) {
    const { duplicate } = await this.webhooks.handle(event);
    return { received: true, duplicate };
  }
}
