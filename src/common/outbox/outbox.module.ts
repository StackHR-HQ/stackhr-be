import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService],
})
export class OutboxModule {}
