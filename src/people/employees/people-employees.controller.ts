import {
  Controller,
  Get,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { PeopleEmployeesService } from './people-employees.service';

@Controller('people/employees')
@UseGuards(AuthGuard, RolesGuard)
@UseFilters(PeopleExceptionFilter)
@RequireRoles(...PEOPLE_ADMIN_ROLES)
export class PeopleEmployeesController {
  constructor(private readonly employeesService: PeopleEmployeesService) {}

  @Get()
  listEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.employeesService.listEmployees(user, query);
  }

  @Get(':employeeId')
  getEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeesService.getEmployee(user, employeeId);
  }
}
