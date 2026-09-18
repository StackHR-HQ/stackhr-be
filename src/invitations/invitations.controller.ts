import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../auth/auth.decorators';
import { RolesGuard } from '../auth/roles.guard';
import { USER_ROLES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth.types';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

const ADMIN_ROLES = [
  USER_ROLES.BUSINESS_OWNER,
  USER_ROLES.BUSINESS_ADMIN,
  USER_ROLES.HR_ADMIN,
];

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  createInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(user, dto);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.findAll(user);
  }

  @Get(':id')
  getInvitationDetails(@Param('id') id: string) {
    return this.invitationsService.getInvitationDetails(id);
  }

  @Post(':id/accept')
  acceptInvitation(@Param('id') id: string, @Body() dto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.invitationsService.revokeInvitation(user, id);
  }

  @Post(':id/resend')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles(...ADMIN_ROLES)
  resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.invitationsService.resendInvitation(user, id);
  }
}
