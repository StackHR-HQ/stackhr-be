import { Module } from '@nestjs/common';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';
import { AuthModule } from '../auth/auth.module';
import { OutboxModule } from '../common/outbox/outbox.module';
import { ResilienceModule } from '../common/resilience/resilience.module';

@Module({
  imports: [AuthModule, OutboxModule, ResilienceModule],
  controllers: [StackhrAdminController],
  providers: [StackhrAdminService],
  exports: [StackhrAdminService],
})
export class StackhrAdminModule {}
