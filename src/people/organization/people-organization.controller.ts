import { Controller, Get, UseFilters, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { PeopleOrganizationService } from './people-organization.service';

@Controller('people')
@UseGuards(AuthGuard, RolesGuard)
@UseFilters(PeopleExceptionFilter)
@RequireRoles(...PEOPLE_ADMIN_ROLES)
export class PeopleOrganizationController {
  constructor(
    private readonly organizationService: PeopleOrganizationService,
  ) {}

  @Get('departments')
  listDepartments(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listDepartments(user);
  }

  @Get('teams')
  listTeams(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listTeams(user);
  }
}
