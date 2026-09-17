import {
  Body,
  BadRequestException,
  Controller,
  Get,
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
import type { CompanyInfoInput, EmployeeInput } from './onboarding.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AddEmployeeDto } from './dto/add-employee.dto';
import { ImportEmployeesDto } from './dto/import-employees.dto';

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

  @Get('company')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  getCompany(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.getCompanyInfo(user);
  }

  @Patch('company')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.onboardingService.updateCompanyInfo(
      user,
      this.companyInput(dto),
    );
  }

  @Post('complete')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const company = this.objectInput(body.companyInfo, 'companyInfo');
    if (!Array.isArray(body.employees))
      throw new BadRequestException('employees must be an array');
    return this.onboardingService.complete(
      user,
      this.companyInput(company),
      body.employees.map((row: unknown) =>
        this.employeeInput(this.objectInput(row, 'employee')),
      ),
    );
  }

  @Post('employees')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  addEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddEmployeeDto,
  ) {
    return this.onboardingService.addEmployee(user, this.employeeInput(dto));
  }

  @Post('employees/import')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportEmployeesDto,
  ) {
    return this.onboardingService.importEmployees(user, dto.csv);
  }

  private objectInput(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException(`${field} must be an object`);
    return value as Record<string, unknown>;
  }

  private companyInput(
    body: Partial<UpdateCompanyDto> & Record<string, any>,
  ): CompanyInfoInput {
    return {
      companyName: String(body.companyName ?? body.name ?? ''),
      industry: String(body.industry ?? ''),
      companySize: String(body.companySize ?? ''),
      currency: body.currency ?? undefined,
      payrollFrequency: body.payrollFrequency ?? undefined,
      taxId: body.taxId ?? undefined,
      logo: body.logo ?? undefined,
      logoDataUrl: body.logoDataUrl ?? undefined,
    };
  }

  private employeeInput(
    body: Partial<AddEmployeeDto> & Record<string, any>,
  ): EmployeeInput {
    return {
      id: body.id ?? undefined,
      fullName: String(body.fullName ?? ''),
      email: String(body.email ?? ''),
      department: String(body.department ?? ''),
      jobTitle: String(body.jobTitle ?? ''),
      employmentType: String(body.employmentType ?? ''),
      salary: Number(body.salary ?? 0),
      startDate: String(body.startDate ?? ''),
      managerId: body.managerId ?? undefined,
      managerName: body.managerName ?? body.manager ?? undefined,
      managerEmail: body.managerEmail ?? undefined,
    };
  }
}
