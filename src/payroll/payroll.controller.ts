import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles, CurrentUser } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PayrollService } from './payroll.service';
import { SetCompensationDto } from './dto/set-compensation.dto';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { FundingCheckDto } from './dto/funding-check.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('payroll')
@UseGuards(AuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('compensation')
  @RequireRoles(...ADMIN_ROLES)
  setCompensation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetCompensationDto,
  ) {
    return this.payrollService.setCompensation(user, dto);
  }

  @Get('compensation/:employeeId')
  getCompensationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
  ) {
    return this.payrollService.getCompensationHistory(user, employeeId);
  }

  @Post('runs')
  @RequireRoles(...ADMIN_ROLES)
  createRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payrollService.createRun(user, dto);
  }

  @Post('runs/:id/calculate')
  @RequireRoles(...ADMIN_ROLES)
  calculateRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.calculateRun(user, runId);
  }

  @Post('runs/:id/submit')
  @RequireRoles(...ADMIN_ROLES)
  submitRunForApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.submitRunForApproval(user, runId);
  }

  @Post('runs/:id/funding-check')
  @RequireRoles(...ADMIN_ROLES)
  fundingCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
    @Body() dto: FundingCheckDto,
  ) {
    return this.payrollService.fundingCheck(user, runId, dto);
  }

  @Post('runs/:id/execute')
  @RequireRoles(...ADMIN_ROLES)
  executePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.executePayment(user, runId);
  }

  @Post('runs/:id/reconcile')
  @RequireRoles(...ADMIN_ROLES)
  reconcileRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.reconcileRun(user, runId);
  }

  @Get('runs')
  @RequireRoles(...ADMIN_ROLES)
  getRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollService.getRuns(user);
  }

  @Get('runs/:id')
  @RequireRoles(...ADMIN_ROLES)
  getRunById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.getRunById(user, runId);
  }
}
