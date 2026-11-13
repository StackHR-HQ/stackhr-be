import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollListener } from './payroll.listener';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { BankingModule } from '../banking/banking.module';

@Module({
  imports: [ApprovalsModule, ComplianceModule, BankingModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollListener],
  exports: [PayrollService],
})
export class PayrollModule {}
