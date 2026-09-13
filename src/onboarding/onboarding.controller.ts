import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../auth/auth.types';
import { OnboardingService } from './onboarding.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AddEmployeeDto } from './dto/add-employee.dto';
import { ImportEmployeesDto } from './dto/import-employees.dto';
import { CreateOnboardingTemplateDto } from './dto/create-template.dto';
import { UpdateChecklistTaskDto } from './dto/update-checklist-task.dto';

const BUSINESS_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('onboarding')
@UseGuards(AuthGuard, RolesGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  getStatus(@Req() request: AuthenticatedRequest) {
    return this.onboardingService.getStatus(request.user!);
  }

  @Patch('company')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.onboardingService.updateCompanyInfo(user, dto);
  }

  @Post('employees')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  addEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddEmployeeDto,
  ) {
    return this.onboardingService.addEmployee(user, dto);
  }

  @Post('employees/import')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportEmployeesDto,
  ) {
    return this.onboardingService.importEmployees(user, dto.csv);
  }

  @Get('templates')
  getTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.getTemplates(user);
  }

  @Post('templates')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  saveTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOnboardingTemplateDto,
  ) {
    return this.onboardingService.saveTemplate(user, dto);
  }

  @Get('checklists/:employeeId')
  getEmployeeChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.onboardingService.getEmployeeChecklist(user, employeeId);
  }

  @Patch('checklists/:employeeId/tasks/:taskId')
  updateChecklistTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateChecklistTaskDto,
  ) {
    return this.onboardingService.updateChecklistTask(
      user,
      employeeId,
      taskId,
      dto.completed,
    );
  }
}
