-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Ensure pgcrypto extension is installed for cryptographic randomness
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Provision uuidv7() function for Postgres versions prior to native support (< 17/18)
CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid
AS $$
DECLARE
  v_time timestamp with time zone := clock_timestamp();
  v_secs bigint := FLOOR(EXTRACT(EPOCH FROM v_time));
  v_msec bigint := MOD(FLOOR(EXTRACT(MILLISECONDS FROM v_time)), 1000);
  v_timestamp bigint := (v_secs * 1000) + v_msec;
  v_bytes bytea;
BEGIN
  v_bytes := set_byte(
    set_byte(
      set_byte(
        set_byte(
          set_byte(
            set_byte(
              gen_random_bytes(16),
              0, (v_timestamp >> 40)::bit(8)::int
            ),
            1, (v_timestamp >> 32)::bit(8)::int
          ),
          2, (v_timestamp >> 24)::bit(8)::int
        ),
        3, (v_timestamp >> 16)::bit(8)::int
      ),
      4, (v_timestamp >> 8)::bit(8)::int
    ),
    5, (v_timestamp)::bit(8)::int
  );

  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 112);
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);

  RETURN encode(v_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "passwordHash" TEXT,
    "userType" TEXT NOT NULL DEFAULT 'BUSINESS',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,
    "impersonatedBy" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "industry" TEXT,
    "companySize" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "payrollFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "payDate" INTEGER NOT NULL DEFAULT 25,
    "taxId" TEXT,
    "pensionEmployeeRateOverride" DOUBLE PRECISION,
    "pensionEmployerRateOverride" DOUBLE PRECISION,
    "pensionBasisOverride" TEXT,
    "penCentralEmployerCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "ownerId" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT,
    "employeeId" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "headEmployeeId" TEXT,
    "parentDepartmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "departmentId" TEXT,
    "headEmployeeId" TEXT,
    "leadEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_level" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "employeeNumber" TEXT,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workEmail" TEXT,
    "personalEmail" TEXT,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "address" TEXT,
    "workLocation" TEXT,
    "nationality" TEXT,
    "currency" TEXT DEFAULT 'NGN',
    "payFrequency" TEXT DEFAULT 'MONTHLY',
    "bankAccountLast4" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactRelationship" TEXT,
    "emergencyContactPhone" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "tin" TEXT,
    "pensionProvider" TEXT,
    "pensionRsaNumber" TEXT,
    "pfaCode" TEXT,
    "avatarUrl" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "jobTitle" TEXT NOT NULL,
    "departmentId" TEXT,
    "department" TEXT,
    "positionLevelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_INVITATION',
    "startDate" TIMESTAMP(3) NOT NULL,
    "probationEndDate" DATE,
    "terminationDate" DATE,
    "annualSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "salaryAmount" INTEGER NOT NULL DEFAULT 0,
    "declaredRent" INTEGER NOT NULL DEFAULT 0,
    "nhfOptIn" BOOLEAN NOT NULL DEFAULT false,
    "managerId" TEXT,
    "invitationToken" TEXT,
    "invitationSentAt" TIMESTAMP(3),
    "invitationAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_history" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annualSalaryMinor" BIGINT NOT NULL DEFAULT 0,
    "previousSalary" BIGINT NOT NULL DEFAULT 0,
    "newSalary" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT DEFAULT 'NGN',
    "payFrequency" TEXT DEFAULT 'MONTHLY',
    "reason" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "daysPerYear" INTEGER NOT NULL DEFAULT 20,
    "defaultDays" INTEGER NOT NULL DEFAULT 20,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policy" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "description" TEXT,
    "accrualFrequency" TEXT NOT NULL DEFAULT 'ANNUAL',
    "carryForwardDays" INTEGER NOT NULL DEFAULT 0,
    "maxConsecutiveDays" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "allocatedDays" INTEGER NOT NULL DEFAULT 0,
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "pendingDays" INTEGER NOT NULL DEFAULT 0,
    "remainingDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 1,
    "days" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "employeeId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'All employees',
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_department" (
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "onboarding_template_department_pkey" PRIMARY KEY ("templateId","departmentId")
);

-- CreateTable
CREATE TABLE "onboarding_checklist_item" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "onboarding_checklist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_onboarding" (
    "employeeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_onboarding_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "onboarding_item_completion" (
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "completedByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_item_completion_pkey" PRIMARY KEY ("employeeId","itemId")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "employeeId" TEXT,
    "description" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "payload" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subjectTable" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountSnapshot" INTEGER,
    "metadata" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cardId" TEXT,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT,
    "receiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimbursement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expenseId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "repaymentMonths" INTEGER NOT NULL DEFAULT 1,
    "monthlyDeduction" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "disbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_record" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "basicSalary" INTEGER NOT NULL,
    "housingAllowance" INTEGER NOT NULL DEFAULT 0,
    "transportAllowance" INTEGER NOT NULL DEFAULT 0,
    "otherAllowances" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compensation_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" INTEGER NOT NULL DEFAULT 0,
    "totalTax" INTEGER NOT NULL DEFAULT 0,
    "totalPension" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "bulkTransferJson" JSONB,
    "paymentExportBatchJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" INTEGER NOT NULL,
    "housingAllowance" INTEGER NOT NULL DEFAULT 0,
    "transportAllowance" INTEGER NOT NULL DEFAULT 0,
    "otherAllowances" INTEGER NOT NULL DEFAULT 0,
    "grossSalary" INTEGER NOT NULL,
    "taxDeduction" INTEGER NOT NULL DEFAULT 0,
    "pensionDeduction" INTEGER NOT NULL DEFAULT 0,
    "employerPensionDeduction" INTEGER NOT NULL DEFAULT 0,
    "nhfDeduction" INTEGER NOT NULL DEFAULT 0,
    "rentReliefApplied" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "netSalary" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "grossSalary" INTEGER NOT NULL,
    "netSalary" INTEGER NOT NULL,
    "breakdownJson" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rule_set" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'NG',
    "name" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "rentReliefPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "rentReliefCap" INTEGER NOT NULL DEFAULT 500000,
    "pensionEmployeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "pensionEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "pensionBasisFields" TEXT NOT NULL DEFAULT 'BASIC,HOUSING,TRANSPORT',
    "nhfRate" DOUBLE PRECISION NOT NULL DEFAULT 0.025,
    "nhfBasisField" TEXT NOT NULL DEFAULT 'BASIC',
    "taxFreeThreshold" INTEGER NOT NULL DEFAULT 800000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rule_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rule" (
    "id" TEXT NOT NULL,
    "taxRuleSetId" TEXT NOT NULL,
    "bandOrder" INTEGER NOT NULL,
    "bandName" TEXT NOT NULL,
    "lowerLimit" INTEGER NOT NULL,
    "upperLimit" INTEGER,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_remittance_schedule" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "penCentralValidationId" TEXT,
    "penCentralScheduleId" TEXT,
    "periodMonth" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "employerCode" TEXT NOT NULL,
    "totalEmployeePension" INTEGER NOT NULL DEFAULT 0,
    "totalEmployerPension" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validationErrorsJson" TEXT,
    "paymentId" TEXT,
    "paymentProvider" TEXT,
    "virtualAccountNumber" TEXT,
    "virtualAccountBank" TEXT,
    "virtualAccountName" TEXT,
    "paymentExpiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "receiptId" TEXT,
    "receiptJson" TEXT,
    "disbursementStatus" TEXT,
    "disbursementJson" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pension_remittance_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_event" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "failureReason" TEXT NOT NULL,
    "stackTrace" TEXT,
    "retryCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_deposit_account" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "anchorAccountId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "nipCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "balanceKobo" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_deposit_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corporate_card" (
    "id" TEXT NOT NULL DEFAULT (uuidv7())::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "anchorCardId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "maskedPan" TEXT NOT NULL,
    "expiryMonth" TEXT NOT NULL,
    "expiryYear" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'MASTERCARD',
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "spendingLimitKobo" INTEGER NOT NULL DEFAULT 0,
    "spendingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "organization_ownerId_idx" ON "organization"("ownerId");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "department_organizationId_idx" ON "department"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "department_organizationId_id_key" ON "department"("organizationId", "id");

-- CreateIndex
CREATE INDEX "team_organizationId_idx" ON "team"("organizationId");

-- CreateIndex
CREATE INDEX "team_member_organizationId_idx" ON "team_member"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_teamId_employeeId_key" ON "team_member"("teamId", "employeeId");

-- CreateIndex
CREATE INDEX "position_level_organizationId_idx" ON "position_level"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "position_level_organizationId_name_key" ON "position_level"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_userId_key" ON "employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invitationToken_key" ON "employee"("invitationToken");

-- CreateIndex
CREATE INDEX "employee_organizationId_status_idx" ON "employee"("organizationId", "status");

-- CreateIndex
CREATE INDEX "employee_managerId_idx" ON "employee"("managerId");

-- CreateIndex
CREATE INDEX "employee_organizationId_employeeNumber_idx" ON "employee"("organizationId", "employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "employee_organizationId_id_key" ON "employee"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_organizationId_email_key" ON "employee"("organizationId", "email");

-- CreateIndex
CREATE INDEX "compensation_history_organizationId_employeeId_idx" ON "compensation_history"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "leave_type_organizationId_idx" ON "leave_type"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_organizationId_name_key" ON "leave_type"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_organizationId_id_key" ON "leave_type"("organizationId", "id");

-- CreateIndex
CREATE INDEX "leave_policy_organizationId_idx" ON "leave_policy"("organizationId");

-- CreateIndex
CREATE INDEX "leave_balance_organizationId_employeeId_idx" ON "leave_balance"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "leave_balance_leaveTypeId_idx" ON "leave_balance"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_organizationId_employeeId_leaveTypeId_key" ON "leave_balance"("organizationId", "employeeId", "leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_employeeId_leaveTypeId_year_key" ON "leave_balance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_request_organizationId_status_idx" ON "leave_request"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leave_request_employeeId_idx" ON "leave_request"("employeeId");

-- CreateIndex
CREATE INDEX "leave_request_leaveTypeId_idx" ON "leave_request"("leaveTypeId");

-- CreateIndex
CREATE INDEX "document_organizationId_scope_idx" ON "document"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "document_employeeId_idx" ON "document"("employeeId");

-- CreateIndex
CREATE INDEX "document_template_organizationId_idx" ON "document_template"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_template_organizationId_id_key" ON "onboarding_template"("organizationId", "id");

-- CreateIndex
CREATE INDEX "onboarding_template_department_organizationId_idx" ON "onboarding_template_department"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_template_department_departmentId_key" ON "onboarding_template_department"("departmentId");

-- CreateIndex
CREATE INDEX "onboarding_checklist_item_templateId_idx" ON "onboarding_checklist_item"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_checklist_item_organizationId_id_key" ON "onboarding_checklist_item"("organizationId", "id");

-- CreateIndex
CREATE INDEX "employee_onboarding_templateId_idx" ON "employee_onboarding"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_onboarding_organizationId_employeeId_key" ON "employee_onboarding"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "onboarding_item_completion_organizationId_idx" ON "onboarding_item_completion"("organizationId");

-- CreateIndex
CREATE INDEX "onboarding_item_completion_itemId_idx" ON "onboarding_item_completion"("itemId");

-- CreateIndex
CREATE INDEX "audit_event_organizationId_createdAt_idx" ON "audit_event"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_event_employeeId_createdAt_idx" ON "audit_event"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_createdAt_idx" ON "audit_log"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_idx" ON "audit_log"("actorId");

-- CreateIndex
CREATE INDEX "approval_request_organizationId_status_idx" ON "approval_request"("organizationId", "status");

-- CreateIndex
CREATE INDEX "approval_request_requesterId_idx" ON "approval_request"("requesterId");

-- CreateIndex
CREATE INDEX "approval_request_approverId_idx" ON "approval_request"("approverId");

-- CreateIndex
CREATE INDEX "approval_request_subjectTable_subjectId_idx" ON "approval_request"("subjectTable", "subjectId");

-- CreateIndex
CREATE INDEX "expense_organizationId_status_idx" ON "expense"("organizationId", "status");

-- CreateIndex
CREATE INDEX "expense_employeeId_idx" ON "expense"("employeeId");

-- CreateIndex
CREATE INDEX "expense_cardId_idx" ON "expense"("cardId");

-- CreateIndex
CREATE INDEX "reimbursement_organizationId_status_idx" ON "reimbursement"("organizationId", "status");

-- CreateIndex
CREATE INDEX "reimbursement_employeeId_idx" ON "reimbursement"("employeeId");

-- CreateIndex
CREATE INDEX "salary_advance_organizationId_status_idx" ON "salary_advance"("organizationId", "status");

-- CreateIndex
CREATE INDEX "salary_advance_employeeId_idx" ON "salary_advance"("employeeId");

-- CreateIndex
CREATE INDEX "compensation_record_organizationId_employeeId_idx" ON "compensation_record"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "compensation_record_employeeId_effectiveTo_idx" ON "compensation_record"("employeeId", "effectiveTo");

-- CreateIndex
CREATE INDEX "payroll_run_organizationId_status_idx" ON "payroll_run"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_organizationId_periodYear_periodMonth_key" ON "payroll_run"("organizationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "payroll_item_organizationId_payrollRunId_idx" ON "payroll_item"("organizationId", "payrollRunId");

-- CreateIndex
CREATE INDEX "payroll_item_employeeId_idx" ON "payroll_item"("employeeId");

-- CreateIndex
CREATE INDEX "payslip_organizationId_employeeId_idx" ON "payslip"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "payslip_payrollRunId_idx" ON "payslip"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_payrollRunId_employeeId_key" ON "payslip"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "tax_rule_set_country_effectiveFrom_idx" ON "tax_rule_set"("country", "effectiveFrom");

-- CreateIndex
CREATE INDEX "tax_rule_taxRuleSetId_bandOrder_idx" ON "tax_rule"("taxRuleSetId", "bandOrder");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entry_businessEmail_key" ON "waitlist_entry"("businessEmail");

-- CreateIndex
CREATE INDEX "waitlist_entry_businessEmail_idx" ON "waitlist_entry"("businessEmail");

-- CreateIndex
CREATE UNIQUE INDEX "pension_remittance_schedule_payrollRunId_key" ON "pension_remittance_schedule"("payrollRunId");

-- CreateIndex
CREATE INDEX "pension_remittance_schedule_organizationId_status_idx" ON "pension_remittance_schedule"("organizationId", "status");

-- CreateIndex
CREATE INDEX "pension_remittance_schedule_payrollRunId_idx" ON "pension_remittance_schedule"("payrollRunId");

-- CreateIndex
CREATE INDEX "idempotency_key_organizationId_status_idx" ON "idempotency_key"("organizationId", "status");

-- CreateIndex
CREATE INDEX "idempotency_key_lockedUntil_idx" ON "idempotency_key"("lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_organizationId_key_key" ON "idempotency_key"("organizationId", "key");

-- CreateIndex
CREATE INDEX "outbox_event_organizationId_status_idx" ON "outbox_event"("organizationId", "status");

-- CreateIndex
CREATE INDEX "outbox_event_status_nextRetryAt_idx" ON "outbox_event"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "dead_letter_event_organizationId_idx" ON "dead_letter_event"("organizationId");

-- CreateIndex
CREATE INDEX "dead_letter_event_eventType_idx" ON "dead_letter_event"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "organization_deposit_account_organizationId_key" ON "organization_deposit_account"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_deposit_account_anchorAccountId_key" ON "organization_deposit_account"("anchorAccountId");

-- CreateIndex
CREATE INDEX "organization_deposit_account_organizationId_idx" ON "organization_deposit_account"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "corporate_card_anchorCardId_key" ON "corporate_card"("anchorCardId");

-- CreateIndex
CREATE INDEX "corporate_card_organizationId_status_idx" ON "corporate_card"("organizationId", "status");

-- CreateIndex
CREATE INDEX "corporate_card_organizationId_employeeId_idx" ON "corporate_card"("organizationId", "employeeId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization" ADD CONSTRAINT "organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_headEmployeeId_fkey" FOREIGN KEY ("organizationId", "headEmployeeId") REFERENCES "employee"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_parentDepartmentId_fkey" FOREIGN KEY ("organizationId", "parentDepartmentId") REFERENCES "department"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_level" ADD CONSTRAINT "position_level_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "department"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_positionLevelId_fkey" FOREIGN KEY ("positionLevelId") REFERENCES "position_level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_history" ADD CONSTRAINT "compensation_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_history" ADD CONSTRAINT "compensation_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_type" ADD CONSTRAINT "leave_type_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_type"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_type"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template" ADD CONSTRAINT "onboarding_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_department" ADD CONSTRAINT "onboarding_template_department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_department" ADD CONSTRAINT "onboarding_template_department_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_department" ADD CONSTRAINT "onboarding_template_department_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "department"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_item" ADD CONSTRAINT "onboarding_checklist_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_checklist_item" ADD CONSTRAINT "onboarding_checklist_item_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_onboarding" ADD CONSTRAINT "employee_onboarding_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_item_completion" ADD CONSTRAINT "onboarding_item_completion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_item_completion" ADD CONSTRAINT "onboarding_item_completion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee_onboarding"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_item_completion" ADD CONSTRAINT "onboarding_item_completion_organizationId_itemId_fkey" FOREIGN KEY ("organizationId", "itemId") REFERENCES "onboarding_checklist_item"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "corporate_card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimbursement" ADD CONSTRAINT "reimbursement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advance" ADD CONSTRAINT "salary_advance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advance" ADD CONSTRAINT "salary_advance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_record" ADD CONSTRAINT "compensation_record_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_record" ADD CONSTRAINT "compensation_record_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rule" ADD CONSTRAINT "tax_rule_taxRuleSetId_fkey" FOREIGN KEY ("taxRuleSetId") REFERENCES "tax_rule_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_remittance_schedule" ADD CONSTRAINT "pension_remittance_schedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_remittance_schedule" ADD CONSTRAINT "pension_remittance_schedule_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_deposit_account" ADD CONSTRAINT "organization_deposit_account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_card" ADD CONSTRAINT "corporate_card_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corporate_card" ADD CONSTRAINT "corporate_card_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

