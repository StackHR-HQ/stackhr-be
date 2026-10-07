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
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { AttachReceiptDto } from './dto/attach-receipt.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('spend')
@UseGuards(AuthGuard, RolesGuard)
export class SpendController {
  constructor(private readonly spendService: SpendService) {}

  @Post('expenses')
  submitExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.spendService.submitExpense(user, dto);
  }

  @Post('expenses/:id/receipt')
  attachReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') expenseId: string,
    @Body() dto: AttachReceiptDto,
  ) {
    return this.spendService.attachReceipt(user, expenseId, dto);
  }

  @Get('expenses')
  getExpenses(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getExpenses(user);
  }

  @Get('expenses/:id')
  getExpenseDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.getExpenseDetails(user, id);
  }

  @Patch('expenses/:id/cancel')
  cancelExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.cancelExpense(user, id);
  }

  @Post('advances')
  submitSalaryAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSalaryAdvanceDto,
  ) {
    return this.spendService.submitSalaryAdvance(user, dto);
  }

  @Get('advances')
  getSalaryAdvances(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getSalaryAdvances(user);
  }

  @Post('advances/:id/disburse')
  @RequireRoles(...ADMIN_ROLES)
  disburseSalaryAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.disburseSalaryAdvance(user, id);
  }

  @Patch('advances/:id/cancel')
  cancelSalaryAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.spendService.cancelSalaryAdvance(user, id);
  }

  @Get('reimbursements')
  getReimbursements(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getReimbursements(user);
  }
}
