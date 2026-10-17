import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { OutboxService } from '../common/outbox/outbox.service';

@Controller('stackhr-admin')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles(USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT)
export class StackhrAdminController {
  constructor(private readonly outboxService: OutboxService) {}

  @Get('me')
  getCurrentAdmin(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Get('outbox/dlq')
  async getDeadLetterEvents(
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    const events = await this.outboxService.getDeadLetterEvents(
      organizationId,
      limit ? Math.min(Number(limit), 100) : 50,
    );
    const count = await this.outboxService.getDlqCount(organizationId);

    return {
      total: count,
      events,
    };
  }

  @Post('outbox/dlq/:id/replay')
  async replayDeadLetterEvent(@Param('id') id: string) {
    const replayed = await this.outboxService.replayDeadLetterEvent(id);
    return {
      message: 'Dead letter event successfully queued for replay',
      replayedEventId: replayed.id,
    };
  }
}
