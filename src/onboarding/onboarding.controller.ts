import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth/auth.types';
import { OnboardingService } from './onboarding.service';

const BUSINESS_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('onboarding')
@UseGuards(AuthGuard)
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
      companyName: String(body.companyName ?? ''),
      industry: String(body.industry ?? ''),
      companySize: String(body.companySize ?? ''),
      currency: body.currency === undefined ? undefined : String(body.currency),
      payrollFrequency:
        body.payrollFrequency === undefined
          ? undefined
          : String(body.payrollFrequency),
      taxId: body.taxId === undefined ? undefined : String(body.taxId),
      logo: body.logo === undefined ? undefined : String(body.logo),
    });
  }

  @Post('employees')
  @RequireRoles(...BUSINESS_ADMIN_ROLES)
  addEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.addEmployee(user, {
      fullName: String(body.fullName ?? ''),
      email: String(body.email ?? ''),
      department: String(body.department ?? ''),
      jobTitle: String(body.jobTitle ?? ''),
      employmentType: String(body.employmentType ?? ''),
      salary: Number(body.salary),
      startDate: String(body.startDate ?? ''),
      managerId: body.managerId === undefined ? undefined : String(body.managerId),
    });
  }
}
