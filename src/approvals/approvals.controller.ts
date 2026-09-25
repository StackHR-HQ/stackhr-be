import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ApprovalsService } from './approvals.service';
import { CreateApprovalRequestDto } from './dto/create-approval-request.dto';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { ApprovalQueryDto } from './dto/approval-query.dto';

const APPROVER_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
  USER_ROLES.MANAGER,
];

@Controller('approvals')
@UseGuards(AuthGuard, RolesGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  submitRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalRequestDto,
  ) {
    return this.approvalsService.submitRequest(user, dto);
  }

  @Get('chain-config')
  getChainConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.approvalsService.getChainConfig(user);
  }

  @Get()
  listRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApprovalQueryDto,
  ) {
    return this.approvalsService.listRequests(user, query);
  }

  @Patch(':id/decide')
  @RequireRoles(...APPROVER_ROLES)
  decideRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvalsService.decideRequest(user, id, dto);
  }

  @Patch(':id/cancel')
  cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.approvalsService.cancelRequest(user, id);
  }
}
