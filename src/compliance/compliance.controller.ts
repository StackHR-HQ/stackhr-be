import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { CreateTaxRuleSetDto } from './dto/create-tax-rule-set.dto';
import { UpdateTaxRuleSetDto } from './dto/update-tax-rule-set.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';

@Controller('stackhr-admin/compliance')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('rule-sets')
  async findAllRuleSets(@Query('country') country?: string) {
    return this.complianceService.findAllRuleSets(country || 'NG');
  }

  @Get('rule-sets/:id')
  async findRuleSetById(@Param('id') id: string) {
    return this.complianceService.findRuleSetById(id);
  }

  @Post('rule-sets')
  async createRuleSet(@Body() dto: CreateTaxRuleSetDto) {
    return this.complianceService.createRuleSet(dto);
  }

  @Patch('rule-sets/:id')
  async updateRuleSet(
    @Param('id') id: string,
    @Body() dto: UpdateTaxRuleSetDto,
  ) {
    return this.complianceService.updateRuleSet(id, dto);
  }

  @Post('seed-nta2026')
  async seedNta2026() {
    return this.complianceService.seedNta2026RuleSet();
  }
}
