import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/auth.decorators';
import { USER_ROLES } from '../auth/auth.constants';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async joinWaitlist(@Body() dto: JoinWaitlistDto) {
    return this.waitlistService.joinWaitlist(dto);
  }

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles(USER_ROLES.STACKHR_ADMIN, USER_ROLES.STACKHR_SUPPORT)
  async getWaitlistEntries() {
    return this.waitlistService.getWaitlistEntries();
  }
}
