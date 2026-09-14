-- People module: repairs drift from 20260822152000_custom_auth, adds People
-- tables, and enforces tenant isolation with RLS.
--
-- Drift repair: the custom_auth migration is recorded as applied, but some
-- databases lack its organization columns and employee table. Every repair
-- statement is idempotent so it is a no-op where custom_auth fully applied.

-- ---------------------------------------------------------------------------
-- 1. Drift repair
-- ---------------------------------------------------------------------------

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "companySize" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS "payrollFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "taxId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "organization" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "salaryAmount" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "managerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_INVITATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_organizationId_email_key"
  ON "employee"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "employee_organizationId_status_idx"
  ON "employee"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "employee_managerId_idx"
  ON "employee"("managerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_organizationId_fkey') THEN
    ALTER TABLE "employee" ADD CONSTRAINT "employee_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_managerId_fkey') THEN
    ALTER TABLE "employee" ADD CONSTRAINT "employee_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_userType_idx" ON "user"("userType");

-- ---------------------------------------------------------------------------
-- 2. Employee profile columns
-- ---------------------------------------------------------------------------

ALTER TABLE "employee"
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "workLocation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "maritalStatus" TEXT,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "emergencyContactRelationship" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountLast4" TEXT,
  ADD CONSTRAINT "employee_bankAccountLast4_check"
    CHECK ("bankAccountLast4" IS NULL OR "bankAccountLast4" ~ '^[0-9]{4}$'),
  ADD CONSTRAINT "employee_not_own_manager_check"
    CHECK ("managerId" IS NULL OR "managerId" <> "id");

CREATE UNIQUE INDEX "employee_organizationId_id_key" ON "employee"("organizationId", "id");
CREATE INDEX "employee_departmentId_idx" ON "employee"("departmentId");

-- ---------------------------------------------------------------------------
-- 3. Organization structure
-- ---------------------------------------------------------------------------

CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "department_organizationId_name_key" ON "department"("organizationId", "name");
CREATE UNIQUE INDEX "department_organizationId_id_key" ON "department"("organizationId", "id");
CREATE INDEX "department_headEmployeeId_idx" ON "department"("headEmployeeId");
ALTER TABLE "department"
  ADD CONSTRAINT "department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "department_headEmployeeId_fkey" FOREIGN KEY ("headEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee"
  ADD CONSTRAINT "employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill departments from the existing free-text column.
INSERT INTO "department" ("id", "organizationId", "name")
SELECT gen_random_uuid()::text, "organizationId", trim("department")
FROM "employee"
WHERE trim("department") <> ''
GROUP BY "organizationId", trim("department")
ON CONFLICT ("organizationId", "name") DO NOTHING;

UPDATE "employee" e
SET "departmentId" = d."id"
FROM "department" d
WHERE d."organizationId" = e."organizationId"
  AND d."name" = trim(e."department");

-- Keep departmentId in sync for every writer (company setup, CSV import,
-- future People writes) so the free-text column never drifts from departments.
CREATE FUNCTION "sync_employee_department"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  department_id TEXT;
BEGIN
  IF trim(NEW."department") = '' THEN
    NEW."departmentId" := NULL;
    RETURN NEW;
  END IF;

  INSERT INTO "department" ("id", "organizationId", "name")
  VALUES (gen_random_uuid()::text, NEW."organizationId", trim(NEW."department"))
  ON CONFLICT ("organizationId", "name") DO NOTHING;

  SELECT "id" INTO department_id
  FROM "department"
  WHERE "organizationId" = NEW."organizationId"
    AND "name" = trim(NEW."department");

  NEW."departmentId" := department_id;
  RETURN NEW;
END $$;

CREATE TRIGGER "employee_department_sync"
  BEFORE INSERT OR UPDATE OF "department" ON "employee"
  FOR EACH ROW EXECUTE FUNCTION "sync_employee_department"();

CREATE TABLE "team" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "leadEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "team_organizationId_id_key" ON "team"("organizationId", "id");
CREATE INDEX "team_organizationId_idx" ON "team"("organizationId");
CREATE INDEX "team_leadEmployeeId_idx" ON "team"("leadEmployeeId");
ALTER TABLE "team"
  ADD CONSTRAINT "team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "team_leadEmployeeId_fkey" FOREIGN KEY ("leadEmployeeId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "team_member" (
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_member_pkey" PRIMARY KEY ("teamId", "employeeId")
);
CREATE INDEX "team_member_organizationId_idx" ON "team_member"("organizationId");
CREATE INDEX "team_member_employeeId_idx" ON "team_member"("employeeId");
ALTER TABLE "team_member"
  ADD CONSTRAINT "team_member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "team_member_organizationId_teamId_fkey" FOREIGN KEY ("organizationId", "teamId") REFERENCES "team"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "team_member_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Leave
-- ---------------------------------------------------------------------------

CREATE TABLE "leave_type" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDays" INTEGER NOT NULL,
    "paid" BOOLEAN NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'neutral',
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_type_defaultDays_check" CHECK ("defaultDays" >= 0),
    CONSTRAINT "leave_type_tone_check" CHECK ("tone" IN ('accent', 'positive', 'warning', 'critical', 'neutral'))
);
CREATE UNIQUE INDEX "leave_type_organizationId_name_key" ON "leave_type"("organizationId", "name");
CREATE UNIQUE INDEX "leave_type_organizationId_id_key" ON "leave_type"("organizationId", "id");
ALTER TABLE "leave_type"
  ADD CONSTRAINT "leave_type_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "leave_policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_policy_organizationId_idx" ON "leave_policy"("organizationId");
ALTER TABLE "leave_policy"
  ADD CONSTRAINT "leave_policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "leave_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_request_dates_check" CHECK ("endDate" >= "startDate"),
    CONSTRAINT "leave_request_days_check" CHECK ("days" > 0),
    CONSTRAINT "leave_request_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
CREATE INDEX "leave_request_organizationId_status_idx" ON "leave_request"("organizationId", "status");
CREATE INDEX "leave_request_employeeId_idx" ON "leave_request"("employeeId");
CREATE INDEX "leave_request_leaveTypeId_idx" ON "leave_request"("leaveTypeId");
ALTER TABLE "leave_request"
  ADD CONSTRAINT "leave_request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_request_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_request_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_type"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "leave_balance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_balance_days_check" CHECK ("totalDays" >= 0 AND "usedDays" >= 0)
);
CREATE UNIQUE INDEX "leave_balance_employeeId_leaveTypeId_year_key" ON "leave_balance"("employeeId", "leaveTypeId", "year");
CREATE INDEX "leave_balance_organizationId_idx" ON "leave_balance"("organizationId");
CREATE INDEX "leave_balance_leaveTypeId_idx" ON "leave_balance"("leaveTypeId");
ALTER TABLE "leave_balance"
  ADD CONSTRAINT "leave_balance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_balance_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_balance_organizationId_leaveTypeId_fkey" FOREIGN KEY ("organizationId", "leaveTypeId") REFERENCES "leave_type"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Documents
-- ---------------------------------------------------------------------------

CREATE TABLE "document" (
    "id" TEXT NOT NULL,
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
    CONSTRAINT "document_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_scope_check" CHECK (
      ("scope" = 'COMPANY' AND "employeeId" IS NULL) OR
      ("scope" = 'EMPLOYEE' AND "employeeId" IS NOT NULL)
    ),
    CONSTRAINT "document_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 10000000)
);
CREATE INDEX "document_organizationId_scope_idx" ON "document"("organizationId", "scope");
CREATE INDEX "document_employeeId_idx" ON "document"("employeeId");
ALTER TABLE "document"
  ADD CONSTRAINT "document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "document_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_template_organizationId_idx" ON "document_template"("organizationId");
ALTER TABLE "document_template"
  ADD CONSTRAINT "document_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Employee onboarding
-- ---------------------------------------------------------------------------

CREATE TABLE "onboarding_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onboarding_template_organizationId_id_key" ON "onboarding_template"("organizationId", "id");
ALTER TABLE "onboarding_template"
  ADD CONSTRAINT "onboarding_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "onboarding_template_department" (
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "onboarding_template_department_pkey" PRIMARY KEY ("templateId", "departmentId")
);
CREATE UNIQUE INDEX "onboarding_template_department_departmentId_key" ON "onboarding_template_department"("departmentId");
CREATE INDEX "onboarding_template_department_organizationId_idx" ON "onboarding_template_department"("organizationId");
ALTER TABLE "onboarding_template_department"
  ADD CONSTRAINT "onboarding_template_department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "onboarding_template_department_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "onboarding_template_department_organizationId_departmentId_fkey" FOREIGN KEY ("organizationId", "departmentId") REFERENCES "department"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "onboarding_checklist_item" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "onboarding_checklist_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onboarding_checklist_item_organizationId_id_key" ON "onboarding_checklist_item"("organizationId", "id");
CREATE INDEX "onboarding_checklist_item_templateId_idx" ON "onboarding_checklist_item"("templateId");
ALTER TABLE "onboarding_checklist_item"
  ADD CONSTRAINT "onboarding_checklist_item_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "onboarding_checklist_item_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_onboarding" (
    "employeeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_onboarding_pkey" PRIMARY KEY ("employeeId")
);
CREATE UNIQUE INDEX "employee_onboarding_organizationId_employeeId_key" ON "employee_onboarding"("organizationId", "employeeId");
CREATE INDEX "employee_onboarding_templateId_idx" ON "employee_onboarding"("templateId");
ALTER TABLE "employee_onboarding"
  ADD CONSTRAINT "employee_onboarding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_onboarding_organizationId_employeeId_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "employee"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_onboarding_organizationId_templateId_fkey" FOREIGN KEY ("organizationId", "templateId") REFERENCES "onboarding_template"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "onboarding_item_completion" (
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "completedByUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_item_completion_pkey" PRIMARY KEY ("employeeId", "itemId")
);
CREATE INDEX "onboarding_item_completion_organizationId_idx" ON "onboarding_item_completion"("organizationId");
CREATE INDEX "onboarding_item_completion_itemId_idx" ON "onboarding_item_completion"("itemId");
ALTER TABLE "onboarding_item_completion"
  ADD CONSTRAINT "onboarding_item_completion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "onboarding_item_completion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee_onboarding"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "onboarding_item_completion_organizationId_itemId_fkey" FOREIGN KEY ("organizationId", "itemId") REFERENCES "onboarding_checklist_item"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Audit
-- ---------------------------------------------------------------------------

CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
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
CREATE INDEX "audit_event_organizationId_createdAt_idx" ON "audit_event"("organizationId", "createdAt");
CREATE INDEX "audit_event_employeeId_createdAt_idx" ON "audit_event"("employeeId", "createdAt");
ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_event_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. Tenant isolation
--
-- The connection role (e.g. neondb_owner) has BYPASSRLS, so policies alone do
-- not isolate tenants. People queries run inside a transaction that executes
-- SET LOCAL ROLE stackhr_app (NOBYPASSRLS) and sets app.org_id, see
-- src/people/tenant/tenant-prisma.service.ts.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stackhr_app') THEN
    CREATE ROLE stackhr_app NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT stackhr_app TO %I', current_user);
END $$;

GRANT USAGE ON SCHEMA public TO stackhr_app;
GRANT SELECT ON "organization" TO stackhr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "employee", "department", "team", "team_member",
  "leave_type", "leave_policy", "leave_request", "leave_balance",
  "document", "document_template",
  "onboarding_template", "onboarding_template_department", "onboarding_checklist_item",
  "employee_onboarding", "onboarding_item_completion"
TO stackhr_app;
-- Audit history is append-only for the application role.
GRANT SELECT, INSERT ON "audit_event" TO stackhr_app;

ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization_tenant_isolation" ON "organization"
  FOR SELECT TO stackhr_app
  USING ("id" = (SELECT current_setting('app.org_id', true)));

DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'employee', 'department', 'team', 'team_member',
    'leave_type', 'leave_policy', 'leave_request', 'leave_balance',
    'document', 'document_template',
    'onboarding_template', 'onboarding_template_department', 'onboarding_checklist_item',
    'employee_onboarding', 'onboarding_item_completion', 'audit_event'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO stackhr_app USING ("organizationId" = (SELECT current_setting(''app.org_id'', true))) WITH CHECK ("organizationId" = (SELECT current_setting(''app.org_id'', true)))',
      tenant_table || '_tenant_isolation',
      tenant_table
    );
  END LOOP;
END $$;
