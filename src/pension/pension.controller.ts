import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles, CurrentUser } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PensionService } from './pension.service';
import {
  PensionScheduleQueryDto,
  UpdatePensionConfigDto,
} from './dto/pension.dto';

const PENSION_ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('pension')
@UseGuards(AuthGuard, RolesGuard)
export class PensionController {
  constructor(private readonly pensionService: PensionService) {}

  @Get('pfas')
  getRegisteredPfas() {
    return this.pensionService.getRegisteredPfas();
  }

  @Get('config')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  getEmployerConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.pensionService.getEmployerConfig(user);
  }

  @Patch('config')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  updateEmployerConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePensionConfigDto,
  ) {
    return this.pensionService.updateEmployerConfig(user, dto);
  }

  @Post('schedules/from-payroll/:payrollRunId')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  createScheduleFromPayroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('payrollRunId') payrollRunId: string,
  ) {
    return this.pensionService.createScheduleFromPayroll(user, payrollRunId);
  }

  @Get('schedules')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  listSchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PensionScheduleQueryDto,
  ) {
    return this.pensionService.listSchedules(user, query);
  }

  @Get('schedules/:id')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.pensionService.getSchedule(user, id);
  }

  @Post('schedules/:id/validate')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  validateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.validateSchedule(user, id);
  }

  @Get('schedules/:id/validation-status')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  checkValidationStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.checkValidationStatus(user, id);
  }

  @Post('schedules/:id/submit')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  submitSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.submitSchedule(user, id);
  }

  @Post('schedules/:id/payment')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  initiatePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.initiatePayment(user, id);
  }

  @Get('schedules/:id/payment-status')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  syncPaymentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.syncPaymentStatus(user, id);
  }

  @Get('schedules/:id/disbursements')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  syncDisbursements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.pensionService.syncDisbursements(user, id);
  }

  @Get('dashboard')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.pensionService.getDashboard(user);
  }

  @Get('compliance-report')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  getComplianceReport(@CurrentUser() user: AuthenticatedUser) {
    return this.pensionService.getComplianceReport(user);
  }
}
