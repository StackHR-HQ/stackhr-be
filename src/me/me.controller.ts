import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MeService } from './me.service';

@Controller('me')
@UseGuards(AuthGuard, RolesGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.meService.getProfile(user);
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
}
