import { Module } from '@nestjs/common';
import { StackhrAdminController } from './stackhr-admin.controller';
import { StackhrAdminService } from './stackhr-admin.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [StackhrAdminController],
  providers: [StackhrAdminService],
})
export class StackhrAdminModule {}
