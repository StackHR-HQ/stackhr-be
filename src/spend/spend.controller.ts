import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SpendService } from './spend.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { AttachReceiptDto } from './dto/attach-receipt.dto';

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

  @Get('reimbursements')
  getReimbursements(@CurrentUser() user: AuthenticatedUser) {
    return this.spendService.getReimbursements(user);
  }
}
