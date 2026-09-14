import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { createPeopleValidationPipe } from '../common/people-validation.pipe';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
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

  @Post()
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body(createPeopleValidationPipe()) body: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(user, body);
  }

  @Patch(':employeeId')
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body(createPeopleValidationPipe()) body: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(user, employeeId, body);
  }

  @Get(':employeeId/compensation-history')
  listCompensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeesService.listCompensationHistory(user, employeeId);
  }

  @Get(':employeeId')
  getEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.employeesService.getEmployee(user, employeeId);
  }
}
