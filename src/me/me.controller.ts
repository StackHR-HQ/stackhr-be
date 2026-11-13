import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MeService } from './me.service';
import { UpdateMeProfileDto } from './dto/update-me-profile.dto';
import { UpdateMeOnboardingItemDto } from './dto/update-me-onboarding-item.dto';

@Controller('me')
@UseGuards(AuthGuard, RolesGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getProfile(user);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMeProfileDto,
  ) {
    return this.meService.updateProfile(user, dto);
  }

  @Get('onboarding')
  getOnboarding(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getOnboarding(user);
  }

  @Patch('onboarding/items/:itemId')
  updateOnboardingItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateMeOnboardingItemDto,
  ) {
    return this.meService.updateOnboardingItem(
      user,
      itemId,
      dto.completed ?? true,
    );
  }

  @Patch('onboarding/tasks/:taskId')
  updateOnboardingTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateMeOnboardingItemDto,
  ) {
    return this.meService.updateOnboardingItem(
      user,
      taskId,
      dto.completed ?? true,
    );
  }

  @Get('compensation-history')
  getCompensationHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getCompensationHistory(user);
  }

  @Get('notifications')
  getNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getNotifications(user);
  }

  @Get('documents')
  getDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getDocuments(user);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getActivity(user);
  }

  @Get('payslips')
  getPayslips(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getPayslips(user);
  }

  @Get('leave-balances')
  getLeaveBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getLeaveBalances(user);
  }

  @Get('leave-requests')
  getLeaveRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getLeaveRequests(user);
  }

  @Get('expenses')
  getExpenses(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getExpenses(user);
  }

  @Get('advances')
  getSalaryAdvances(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getSalaryAdvances(user);
  }

  @Get('cards')
  getCorporateCards(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getCorporateCards(user);
  }
}
