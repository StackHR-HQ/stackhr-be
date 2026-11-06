import { Module } from '@nestjs/common';
import { SpendController } from './spend.controller';
import { ReimbursementsController } from './reimbursements.controller';
import { SpendService } from './spend.service';
import { SpendListener } from './spend.listener';
import { ApprovalsModule } from '../approvals/approvals.module';
import { BankingModule } from '../banking/banking.module';
import { DOCUMENT_STORAGE } from '../people/documents/document-storage';
import { S3DocumentStorage } from '../people/documents/s3-document-storage';

@Module({
  imports: [ApprovalsModule, BankingModule],
  controllers: [SpendController, ReimbursementsController],
  providers: [
    SpendService,
    SpendListener,
    { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage },
  ],
  exports: [SpendService],
})
export class SpendModule {}
