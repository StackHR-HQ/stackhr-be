import { Module } from '@nestjs/common';
import { SpendController } from './spend.controller';
import { SpendService } from './spend.service';
import { SpendListener } from './spend.listener';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  controllers: [SpendController],
  providers: [SpendService, SpendListener],
  exports: [SpendService],
})
export class SpendModule {}
