-- CreateTable
CREATE TABLE "billing_plan" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includedEmployees" INTEGER NOT NULL,
    "monthlyFeeKobo" BIGINT NOT NULL,
    "annualFeeKobo" BIGINT NOT NULL,
    "overageRateKobo" BIGINT NOT NULL,
    "maxOverageEmployees" INTEGER NOT NULL,
    "entitlements" JSONB NOT NULL,
    "selfServe" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_plan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FREE',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "includedEmployees" INTEGER NOT NULL,
    "baseFeeKobo" BIGINT NOT NULL,
    "overageRateKobo" BIGINT NOT NULL,
    "maxOverageEmployees" INTEGER NOT NULL,
    "customTerms" BOOLEAN NOT NULL DEFAULT false,
    "billedEmployeeCount" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodStart" TIMESTAMPTZ(3),
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "pendingPlanCode" TEXT,
    "pendingBillingCycle" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "graceEndsAt" TIMESTAMPTZ(3),
    "bachsCustomerId" TEXT,
    "bachsPaymentMethodId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoice" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalKobo" BIGINT NOT NULL,
    "totalKobo" BIGINT NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "bachsCheckoutId" TEXT,
    "bachsCheckoutUrl" TEXT,
    "bachsCheckoutExpiresAt" TIMESTAMPTZ(3),
    "bachsChargeId" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_event" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "error" TEXT,

    CONSTRAINT "billing_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_organizationId_key" ON "subscription"("organizationId");

-- CreateIndex
CREATE INDEX "subscription_planCode_idx" ON "subscription"("planCode");

-- CreateIndex
CREATE INDEX "subscription_status_currentPeriodEnd_idx" ON "subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_number_key" ON "billing_invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoice_bachsCheckoutId_key" ON "billing_invoice"("bachsCheckoutId");

-- CreateIndex
CREATE INDEX "billing_invoice_organizationId_status_idx" ON "billing_invoice"("organizationId", "status");

-- CreateIndex
CREATE INDEX "billing_invoice_subscriptionId_idx" ON "billing_invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "billing_invoice_status_dueAt_idx" ON "billing_invoice"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_event_provider_eventId_key" ON "billing_webhook_event"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "billing_plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Integrity constraints (status-like fields are plain TEXT by repo convention) ───
ALTER TABLE "billing_plan"
  ADD CONSTRAINT "billing_plan_amounts_nonneg" CHECK ("monthlyFeeKobo" >= 0 AND "annualFeeKobo" >= 0 AND "overageRateKobo" >= 0),
  ADD CONSTRAINT "billing_plan_counts_nonneg" CHECK ("includedEmployees" >= 0 AND "maxOverageEmployees" >= 0);

ALTER TABLE "subscription"
  ADD CONSTRAINT "subscription_status_check" CHECK ("status" IN ('FREE', 'ACTIVE', 'PAST_DUE', 'RESTRICTED')),
  ADD CONSTRAINT "subscription_billing_cycle_check" CHECK ("billingCycle" IN ('MONTHLY', 'ANNUAL')),
  ADD CONSTRAINT "subscription_pending_cycle_check" CHECK ("pendingBillingCycle" IS NULL OR "pendingBillingCycle" IN ('MONTHLY', 'ANNUAL')),
  ADD CONSTRAINT "subscription_amounts_nonneg" CHECK ("baseFeeKobo" >= 0 AND "overageRateKobo" >= 0),
  ADD CONSTRAINT "subscription_counts_nonneg" CHECK ("includedEmployees" >= 0 AND "maxOverageEmployees" >= 0 AND "billedEmployeeCount" >= 0),
  ADD CONSTRAINT "subscription_period_order" CHECK ("currentPeriodStart" IS NULL OR "currentPeriodEnd" IS NULL OR "currentPeriodEnd" > "currentPeriodStart");

ALTER TABLE "billing_invoice"
  ADD CONSTRAINT "billing_invoice_status_check" CHECK ("status" IN ('OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE')),
  ADD CONSTRAINT "billing_invoice_kind_check" CHECK ("kind" IN ('INITIAL', 'RENEWAL', 'UPGRADE_PRORATION', 'OVERAGE_TRUEUP')),
  ADD CONSTRAINT "billing_invoice_amounts_nonneg" CHECK ("subtotalKobo" >= 0 AND "totalKobo" >= 0),
  ADD CONSTRAINT "billing_invoice_period_order" CHECK ("periodEnd" > "periodStart"),
  ADD CONSTRAINT "billing_invoice_paid_has_date" CHECK ("status" <> 'PAID' OR "paidAt" IS NOT NULL);

-- ─── Launch catalog: "StackHR Launch Pricing and Commercial Policy" v1.0 (14 Oct 2026) ───
-- Amounts in kobo. Annual = monthly × 12 × 0.9. Overage caps are policy-pending defaults
-- (headroom up to the next tier's allowance) and are editable data.
INSERT INTO "billing_plan"
  ("code", "name", "includedEmployees", "monthlyFeeKobo", "annualFeeKobo", "overageRateKobo", "maxOverageEmployees", "entitlements", "selfServe", "isActive", "sortOrder", "updatedAt")
VALUES
  ('FREE', 'Free', 5, 0, 0, 0, 0,
   '{"payroll":false,"payslips":false,"disbursement":false,"pensionRemittance":false,"payeRemittance":false,"leaveManagement":"basic","selfService":"limited","expenseApprovals":"none","hrReporting":"basic","onboardingSupport":"none"}',
   true, true, 0, CURRENT_TIMESTAMP),
  ('STARTER', 'Starter', 15, 1000000, 10800000, 50000, 15,
   '{"payroll":true,"payslips":true,"disbursement":true,"pensionRemittance":true,"payeRemittance":true,"leaveManagement":"full","selfService":"full","expenseApprovals":"basic","hrReporting":"standard","onboardingSupport":"standard"}',
   true, true, 1, CURRENT_TIMESTAMP),
  ('GROWTH', 'Growth', 30, 2000000, 21600000, 50000, 20,
   '{"payroll":true,"payslips":true,"disbursement":true,"pensionRemittance":true,"payeRemittance":true,"leaveManagement":"full","selfService":"full","expenseApprovals":"full","hrReporting":"standard","onboardingSupport":"standard"}',
   true, true, 2, CURRENT_TIMESTAMP),
  ('BUSINESS', 'Business', 50, 3500000, 37800000, 45000, 50,
   '{"payroll":true,"payslips":true,"disbursement":true,"pensionRemittance":true,"payeRemittance":true,"leaveManagement":"full","selfService":"full","expenseApprovals":"full","hrReporting":"advanced","onboardingSupport":"priority"}',
   true, true, 3, CURRENT_TIMESTAMP),
  ('PROFESSIONAL', 'Professional', 100, 6000000, 64800000, 40000, 0,
   '{"payroll":true,"payslips":true,"disbursement":true,"pensionRemittance":true,"payeRemittance":true,"leaveManagement":"full","selfService":"full","expenseApprovals":"full","hrReporting":"advanced","onboardingSupport":"priority"}',
   true, true, 4, CURRENT_TIMESTAMP),
  ('ENTERPRISE', 'Enterprise', 0, 0, 0, 0, 0,
   '{"payroll":true,"payslips":true,"disbursement":true,"pensionRemittance":true,"payeRemittance":true,"leaveManagement":"full","selfService":"full","expenseApprovals":"full","hrReporting":"advanced","onboardingSupport":"priority"}',
   false, true, 5, CURRENT_TIMESTAMP);
