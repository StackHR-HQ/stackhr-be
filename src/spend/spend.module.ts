import { Module } from '@nestjs/common';
import { SpendController } from './spend.controller';
import { ReimbursementsController } from './reimbursements.controller';
import { SpendService } from './spend.service';
import { SpendListener } from './spend.listener';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  controllers: [SpendController, ReimbursementsController],
  providers: [SpendService, SpendListener],
  exports: [SpendService],
})
export class SpendModule {}
