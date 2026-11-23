-- AlterTable
ALTER TABLE "billing_invoice" ADD COLUMN     "billedEmployeeCount" INTEGER,
ADD COLUMN     "targetBillingCycle" TEXT,
ADD COLUMN     "targetPlanCode" TEXT,
ADD COLUMN     "targetTerms" JSONB;


ALTER TABLE "billing_invoice"
  ADD CONSTRAINT "billing_invoice_target_cycle_check" CHECK ("targetBillingCycle" IS NULL OR "targetBillingCycle" IN ('MONTHLY', 'ANNUAL')),
  ADD CONSTRAINT "billing_invoice_billed_count_nonneg" CHECK ("billedEmployeeCount" IS NULL OR "billedEmployeeCount" >= 0);
