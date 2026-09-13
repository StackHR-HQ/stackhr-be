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
import { CurrentUser } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { OffboardEmployeeDto } from './dto/offboard-employee.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { ReassignManagerDto } from './dto/reassign-manager.dto';

@Controller('employees')
@UseGuards(AuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.employeesService.findAll(user, query);
  }

  @Get('hierarchy/tree')
  getHierarchyTree(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getHierarchyTree(user);
  }

  @Get('departments/summary')
  getDepartmentSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.getDepartmentSummary(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.employeesService.findOne(user, id);
  }

  @Patch(':id')
  updateEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(user, id, dto);
  }

  @Patch(':id/reassign-manager')
  reassignManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReassignManagerDto,
  ) {
    return this.employeesService.reassignManager(user, id, dto);
  }

  @Patch(':id/offboard')
  offboardEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OffboardEmployeeDto,
  ) {
    return this.employeesService.offboardEmployee(user, id, dto);
  }
}
