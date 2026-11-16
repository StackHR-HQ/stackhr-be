-- AlterTable
ALTER TABLE "billing_invoice" ADD COLUMN     "lastChargeAttemptAt" TIMESTAMPTZ(3),
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;


ALTER TABLE "billing_invoice"
  ADD CONSTRAINT "billing_invoice_reminders_nonneg" CHECK ("remindersSent" >= 0);
