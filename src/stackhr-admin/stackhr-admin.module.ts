import { Module } from '@nestjs/common';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';

@Module({
  controllers: [StackhrAdminController],
  providers: [StackhrAdminService],
})
export class StackhrAdminModule {}
