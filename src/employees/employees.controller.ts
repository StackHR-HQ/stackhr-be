import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { OffboardEmployeeDto } from './dto/offboard-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ReassignManagerDto } from './dto/reassign-manager.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
] as const;

const MANAGER_READ_ROLES = [...ADMIN_ROLES, USER_ROLES.MANAGER] as const;

@Controller('employees')
@UseGuards(AuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequireRoles(...ADMIN_ROLES)
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(user, dto);
  }

  @Get()
  @RequireRoles(...ADMIN_ROLES)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(user, query);
  }

  @Get('hierarchy/tree')
  @RequireRoles(...MANAGER_READ_ROLES)
  getHierarchyTree(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getHierarchyTree(user);
  }

  @Get('managers')
  @RequireRoles(...MANAGER_READ_ROLES)
  listManagers(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.listManagers(user);
  }

  @Get('departments/summary')
  @RequireRoles(...MANAGER_READ_ROLES)
  getDepartmentSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getDepartmentSummary(user);
  }

  @Get(':id')
  @RequireRoles(...MANAGER_READ_ROLES)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.findOne(user, id);
  }

  @Patch(':id')
  @RequireRoles(...ADMIN_ROLES)
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(user, id, dto);
  }

  @Patch(':id/reassign-manager')
  @RequireRoles(...ADMIN_ROLES)
  reassignManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignManagerDto,
  ) {
    return this.employeesService.reassignManager(user, id, dto);
  }

  @Patch(':id/offboard')
  @RequireRoles(...ADMIN_ROLES)
  offboardEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OffboardEmployeeDto,
  ) {
    return this.employeesService.offboardEmployee(user, id, dto);
  }
}
