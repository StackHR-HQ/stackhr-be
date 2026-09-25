import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveListener } from './leave.listener';
import { ApprovalsModule } from '../approvals/approvals.module';

@Module({
  imports: [ApprovalsModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveListener],
  exports: [LeaveService],
})
export class LeaveModule {}
