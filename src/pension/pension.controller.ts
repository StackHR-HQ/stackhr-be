import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  AttachEmployerDto,
  PensionScheduleQueryDto,
  UpdatePensionConfigDto,
  ValidateEmployerCodeDto,
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

  @Post('employers/validate')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  validateEmployer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateEmployerCodeDto,
  ) {
    return this.pensionService.validateEmployerCode(user, dto);
  }

  @Post('employers/attach')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  attachEmployer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AttachEmployerDto,
  ) {
    return this.pensionService.attachEmployer(user, dto);
  }

  @Get('employers/status')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  getEmployerStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.pensionService.getEmployerStatus(user);
  }

  @Delete('employers')
  @RequireRoles(...PENSION_ADMIN_ROLES)
  revokeEmployer(@CurrentUser() user: AuthenticatedUser) {
    return this.pensionService.revokeEmployer(user);
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
