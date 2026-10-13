import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('compliance')
@UseGuards(AuthGuard)
export class TenantComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('active-rule-set')
  async getActiveRuleSet(@Query('country') country?: string) {
    return this.complianceService.getEffectiveTaxRuleSet(country || 'NG');
  }
}
