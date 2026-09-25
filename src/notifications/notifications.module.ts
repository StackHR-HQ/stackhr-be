import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { NotificationsListener } from './notifications.listener';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, NotificationsListener],
  exports: [EmailService, NotificationsListener],
})
export class NotificationsModule {}
