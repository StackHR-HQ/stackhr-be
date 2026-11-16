import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { BillingWebhookService } from './billing-webhook.service';
import { BachsClient } from './bachs/bachs.client';
import { BachsWebhookController } from './bachs/bachs-webhook.controller';
import { BachsWebhookGuard } from './bachs/bachs-webhook.guard';

@Module({
  controllers: [BillingController, BachsWebhookController],
  providers: [
    BillingService,
    SubscriptionsService,
    InvoicesService,
    BillingWebhookService,
    BachsClient,
    BachsWebhookGuard,
  ],
  exports: [SubscriptionsService],
})
export class BillingModule {}
