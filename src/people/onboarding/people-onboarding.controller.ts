import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { PeopleOnboardingService } from './people-onboarding.service';

@Controller('people/onboarding')
@UseGuards(AuthGuard, RolesGuard)
@UseFilters(PeopleExceptionFilter)
@RequireRoles(...PEOPLE_ADMIN_ROLES)
export class PeopleOnboardingController {
  constructor(private readonly onboardingService: PeopleOnboardingService) {}

  @Get('templates')
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.listTemplates(user);
  }

  @Get('employees')
  listEmployees(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.listEmployees(user);
  }

  @Patch('employees/:employeeId/checklist/:itemId')
  setChecklistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.onboardingService.setChecklistItem(user, employeeId, itemId, {
      completed: body?.completed,
    });
  }
}
