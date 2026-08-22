import {
  Body,
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

  @Patch('company')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.updateCompanyInfo(user, {
      companyName: readString(body.companyName),
      industry: readString(body.industry),
      companySize: readString(body.companySize),
      currency: readOptionalString(body.currency),
      payrollFrequency: readOptionalString(body.payrollFrequency),
      taxId: readOptionalString(body.taxId),
      logo: readOptionalString(body.logo),
    });
  }

  @Post('employees')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  addEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.addEmployee(user, {
      fullName: readString(body.fullName),
      email: readString(body.email),
      department: readString(body.department),
      jobTitle: readString(body.jobTitle),
      employmentType: readString(body.employmentType),
      salary: Number(body.salary),
      startDate: readString(body.startDate),
      managerId: readOptionalString(body.managerId),
    });
  }

  @Post('employees/import')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  importEmployees(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.importEmployees(user, readString(body.csv));
  }
}
