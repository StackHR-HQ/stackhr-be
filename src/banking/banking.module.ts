import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BankingController } from './banking.controller';
import { BankingService } from './banking.service';
import { AnchorClient } from './anchor/anchor.client';
import { AnchorWebhookController } from './anchor/anchor-webhook.controller';
import { AnchorWebhookGuard } from './anchor/anchor-webhook.guard';

@Module({
  imports: [AuthModule],
  controllers: [BankingController, AnchorWebhookController],
  providers: [BankingService, AnchorClient, AnchorWebhookGuard],
  exports: [BankingService, AnchorClient],
})
export class BankingModule {}
