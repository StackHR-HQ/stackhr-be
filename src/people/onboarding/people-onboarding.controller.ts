import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import {
  AssignOnboardingTemplateDto,
  SaveOnboardingTemplateDto,
  SetChecklistItemDto,
} from './dto/onboarding.dto';
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

  @Post('templates')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(createPeopleValidationPipe()) body: SaveOnboardingTemplateDto,
  ) {
    return this.onboardingService.createTemplate(user, body);
  }

  @Patch('templates/:templateId')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
    @Body(createPeopleValidationPipe()) body: SaveOnboardingTemplateDto,
  ) {
    return this.onboardingService.updateTemplate(user, templateId, body);
  }

  @Delete('templates/:templateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
  ) {
    return this.onboardingService.deleteTemplate(user, templateId);
  }

  @Get('employees')
  listEmployees(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.listEmployees(user);
  }

  @Get('employees/:employeeId')
  getEmployeeChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.onboardingService.getEmployeeChecklist(user, employeeId);
  }

  @Post('employees')
  assignTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AssignOnboardingTemplateDto | Record<string, unknown>,
  ) {
    return this.onboardingService.assignTemplate(user, {
      employeeId: body?.employeeId,
      templateId: body?.templateId,
    });
  }

  @Patch('employees/:employeeId/checklist/:itemId')
  setChecklistItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Param('itemId') itemId: string,
    @Body() body: SetChecklistItemDto | Record<string, unknown>,
  ) {
    return this.onboardingService.setChecklistItem(user, employeeId, itemId, {
      completed: body?.completed,
    });
  }

  @Post('employees/:employeeId/complete')
  completeOnboarding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.onboardingService.completeOnboarding(user, employeeId);
  }
}
