import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SubscriptionsService } from './subscriptions.service';
import { InvoicesService } from './invoices.service';
import { BillingWebhookService } from './billing-webhook.service';
import { BachsClient } from './bachs/bachs.client';
import { BachsWebhookController } from './bachs/bachs-webhook.controller';
import { BachsWebhookGuard } from './bachs/bachs-webhook.guard';
import { EntitlementsService } from './entitlements.service';
import { EntitlementGuard } from './entitlement.guard';
import { BillingSchedulerService } from './billing-scheduler.service';

/** Global so any module can gate routes with @RequireEntitlement. */
@Global()
@Module({
  controllers: [BillingController, BachsWebhookController],
  providers: [
    BillingService,
    SubscriptionsService,
    InvoicesService,
    BillingWebhookService,
    BachsClient,
    BachsWebhookGuard,
    EntitlementsService,
    EntitlementGuard,
    BillingSchedulerService,
  ],
  exports: [
    SubscriptionsService,
    EntitlementsService,
    EntitlementGuard,
    BillingSchedulerService,
  ],
})
export class BillingModule {}
