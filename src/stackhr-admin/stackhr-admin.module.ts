import { Module } from '@nestjs/common';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';
import { AuthModule } from '../auth/auth.module';
import { OutboxModule } from '../common/outbox/outbox.module';

@Module({
  imports: [AuthModule, OutboxModule],
  controllers: [StackhrAdminController],
  providers: [StackhrAdminService],
})
export class StackhrAdminModule {}
