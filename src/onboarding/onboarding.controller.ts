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
import { readOptionalString, readString } from '../common/input';

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
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.updateCompanyInfo(
      user,
      this.companyInput(body),
      undefined,
      { partial: true },
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
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.addEmployee(user, this.employeeInput(body));
  }

  @Post('employees/import')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.importEmployees(user, readString(body.csv));
  }

  private objectInput(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException(`${field} must be an object`);
    return value as Record<string, unknown>;
  }

  private companyInput(body: Record<string, unknown>): CompanyInfoInput {
    return {
      companyName: readOptionalString(body.companyName ?? body.name),
      industry: readOptionalString(body.industry),
      companySize: readOptionalString(body.companySize),
      currency: readOptionalString(body.currency),
      payrollFrequency: readOptionalString(body.payrollFrequency),
      taxId: readOptionalString(body.taxId),
      logo: readOptionalString(body.logo),
      logoDataUrl: readOptionalString(body.logoDataUrl),
      registrationNumber: readOptionalString(body.registrationNumber),
      businessType: readOptionalString(body.businessType),
      website: readOptionalString(body.website),
      foundedYear:
        typeof body.foundedYear === 'number'
          ? body.foundedYear
          : typeof body.foundedYear === 'string' && body.foundedYear.trim()
            ? Number(body.foundedYear)
            : undefined,
      addressLine1: readOptionalString(body.addressLine1),
      addressLine2: readOptionalString(body.addressLine2),
      city: readOptionalString(body.city),
      state: readOptionalString(body.state),
      country: readOptionalString(body.country),
      postalCode: readOptionalString(body.postalCode),
      primaryColor: readOptionalString(body.primaryColor),
      accentColor: readOptionalString(body.accentColor),
    };
  }

  private employeeInput(body: Record<string, unknown>): EmployeeInput {
    return {
      id: readOptionalString(body.id),
      fullName: readString(body.fullName),
      email: readString(body.email),
      department: readString(body.department),
      jobTitle: readString(body.jobTitle),
      employmentType: readString(body.employmentType),
      salary: Number(body.salary),
      startDate: readString(body.startDate),
      managerId: readOptionalString(body.managerId),
      managerName: readOptionalString(body.managerName ?? body.manager),
      managerEmail: readOptionalString(body.managerEmail),
    };
  }
}
