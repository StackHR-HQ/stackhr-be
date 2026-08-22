import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('stackhr-admin')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT)
export class StackhrAdminController {
  @Get('me')
  getCurrentAdmin(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
