import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { BillingCycleRunner } from './billing-cycle.runner';

export class RunBillingCycleDto {
  /** Simulated clock for QA; rejected in production. */
  @IsOptional()
  @IsISO8601()
  now?: string;
}

@Controller('stackhr-admin/billing')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(USER_ROLES.STACKHR_ADMIN)
export class BillingAdminController {
  constructor(private readonly runner: BillingCycleRunner) {}

  /** Run renewals, dunning and overage now (normally hourly). */
  @Post('run-cycle')
  @HttpCode(HttpStatus.OK)
  runCycle(@Body() dto: RunBillingCycleDto) {
    if (dto.now && process.env.NODE_ENV === 'production') {
      throw new BadRequestException(
        'Simulated time is not allowed in production',
      );
    }
    return this.runner.runExclusive(dto.now ? new Date(dto.now) : new Date());
  }
}
