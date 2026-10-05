import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceAlertsController } from './compliance-alerts.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ComplianceController, ComplianceAlertsController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
