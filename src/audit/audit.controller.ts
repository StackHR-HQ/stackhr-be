import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Controller('audit')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditQueryDto) {
    return this.auditService.listForOrganization(user, query);
  }
}
