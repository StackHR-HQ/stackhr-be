import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

const ORG_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

const TEAM_ACCESS_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
];

@Controller(['organizations', 'organization'])
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get(['', 'current'])
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.getCurrent(user);
  }

  @Patch(['', 'current'])
  @UseGuards(RolesGuard)
  @RequireRoles(...ORG_ADMIN_ROLES)
  updateCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateCurrent(user, dto);
  }

  @Get('current/members')
  @UseGuards(RolesGuard)
  @RequireRoles(...ORG_ADMIN_ROLES)
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listMembers(user);
  }

  @Patch('current/members/:memberId/role')
  @UseGuards(RolesGuard)
  @RequireRoles(...TEAM_ACCESS_ADMIN_ROLES)
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(user, memberId, dto);
  }

  @Delete('current/members/:memberId')
  @UseGuards(RolesGuard)
  @RequireRoles(...TEAM_ACCESS_ADMIN_ROLES)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationsService.removeMember(user, memberId);
  }

  @Get('current/roles')
  @UseGuards(RolesGuard)
  @RequireRoles(...ORG_ADMIN_ROLES)
  listRoles() {
    return this.organizationsService.listRoles();
  }
}
