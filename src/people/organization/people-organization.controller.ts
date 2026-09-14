import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { createPeopleValidationPipe } from '../common/people-validation.pipe';
import { DepartmentDto } from './dto/department.dto';
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

  @Post('departments')
  createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(createPeopleValidationPipe()) body: DepartmentDto,
  ) {
    return this.organizationService.createDepartment(user, body);
  }

  @Patch('departments/:departmentId')
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('departmentId') departmentId: string,
    @Body(createPeopleValidationPipe()) body: DepartmentDto,
  ) {
    return this.organizationService.updateDepartment(user, departmentId, body);
  }

  @Delete('departments/:departmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('departmentId') departmentId: string,
  ) {
    return this.organizationService.deleteDepartment(user, departmentId);
  }

  @Get('teams')
  listTeams(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.listTeams(user);
  }
}
