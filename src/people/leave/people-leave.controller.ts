import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser, RequireRoles } from '../../auth/auth.decorators';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PEOPLE_ADMIN_ROLES } from '../common/people-access';
import { PeopleExceptionFilter } from '../common/people-exception.filter';
import { PeopleLeaveService } from './people-leave.service';

@Controller('people/leave')
@UseGuards(AuthGuard, RolesGuard)
@UseFilters(PeopleExceptionFilter)
@RequireRoles(...PEOPLE_ADMIN_ROLES)
export class PeopleLeaveController {
  constructor(private readonly leaveService: PeopleLeaveService) {}

  @Get('requests')
  listRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.listRequests(user);
  }

  @Patch('requests/:requestId/decision')
  decideRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.leaveService.decideRequest(user, requestId, {
      status: body?.status,
    });
  }

  @Get('types')
  listTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.listTypes(user);
  }

  @Get('policies')
  listPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.listPolicies(user);
  }

  @Get('balances')
  listBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveService.listBalances(user);
  }
}
