import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles, CurrentUser } from '../auth/auth.decorators';
import { USER_ROLES, type UserRole } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BankingService } from './banking.service';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { IssueCardDto } from './dto/issue-card.dto';
import { UpdateCardLimitDto } from './dto/update-card-limit.dto';
import { ToggleCardFreezeDto } from './dto/toggle-card-freeze.dto';

const ADMIN_ROLES: UserRole[] = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('banking')
@UseGuards(AuthGuard)
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  @Get('banks')
  async getBanks() {
    const banks = await this.bankingService.getBanks();
    return { banks };
  }

  @Post('verify-account')
  async verifyAccount(@Body() dto: VerifyAccountDto) {
    const account = await this.bankingService.verifyAccount(dto);
    return { account };
  }

  @Get('deposit-account')
  @UseGuards(RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  async getDepositAccount(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const depositAccount = await this.bankingService.getDepositAccount(
      user.organizationId,
    );
    return { depositAccount };
  }

  @Post('deposit-account/sync')
  @UseGuards(RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  async syncDepositAccount(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const depositAccount = await this.bankingService.syncDepositAccountBalance(
      user.organizationId,
    );
    return { depositAccount };
  }

  @Post('cards')
  @UseGuards(RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  async issueCard(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueCardDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    return this.bankingService.issueCorporateCard(user.organizationId, dto);
  }

  @Get('cards')
  async getCards(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const isEmployeeOnly = user.role === USER_ROLES.EMPLOYEE;
    return this.bankingService.getCorporateCards(
      user.organizationId,
      isEmployeeOnly ? user.id : undefined,
    );
  }

  @Get('cards/:id')
  async getCardDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    return this.bankingService.getCorporateCardDetails(user.organizationId, id);
  }

  @Patch('cards/:id/freeze')
  @UseGuards(RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  async toggleCardFreeze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ToggleCardFreezeDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    return this.bankingService.toggleCardFreeze(user.organizationId, id, dto);
  }

  @Patch('cards/:id/limit')
  @UseGuards(RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  async updateCardLimit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCardLimitDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    return this.bankingService.updateCardSpendingLimit(
      user.organizationId,
      id,
      dto,
    );
  }
}
