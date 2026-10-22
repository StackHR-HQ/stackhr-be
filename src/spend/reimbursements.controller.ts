import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/roles.guard';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SpendService } from './spend.service';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('reimbursements')
@UseGuards(AuthGuard, RolesGuard)
export class ReimbursementsController {
  constructor(private readonly spendService: SpendService) {}

  @Get()
  getReimbursements(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getReimbursements(user);
  }

  @Post()
  createReimbursement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReimbursementDto,
  ) {
    return this.spendService.createReimbursement(user, dto);
  }

  @Get('summary')
  getReimbursementsSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getReimbursementsSummary(user);
  }

  @Get(':id')
  getReimbursementDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.getReimbursementDetails(user, id);
  }

  @Patch(':id/cancel')
  cancelReimbursement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.cancelReimbursement(user, id);
  }

  @Post(':id/pay')
  @RequireRoles(...ADMIN_ROLES)
  payReimbursement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.payReimbursement(user, id);
  }
}
