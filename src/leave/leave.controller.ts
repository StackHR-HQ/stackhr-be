import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/roles.guard';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { LeaveService } from './leave.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('leave')
@UseGuards(AuthGuard, RolesGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post('types')
  @RequireRoles(...ADMIN_ROLES)
  createLeaveType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveService.createLeaveType(user, dto);
  }

  @Get('types')
  getLeaveTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getLeaveTypes(user);
  }

  @Get('balances')
  getLeaveBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.getLeaveBalances(user);
  }

  @Get('history')
  getLeaveHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeaveQueryDto,
  ) {
    return this.leaveService.getLeaveHistory(user, query);
  }

  @Post('requests')
  submitLeaveRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveService.submitLeaveRequest(user, dto);
  }

  @Get('requests/:id')
  getLeaveRequestDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.leaveService.getLeaveRequestDetails(user, id);
  }
}
