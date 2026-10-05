import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles, CurrentUser } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ComplianceService } from './compliance.service';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('compliance')
@UseGuards(AuthGuard, RolesGuard)
export class ComplianceAlertsController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('alerts')
  @RequireRoles(...ADMIN_ROLES)
  getAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.complianceService.getAlerts(user);
  }
}
