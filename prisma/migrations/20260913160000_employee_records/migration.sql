-- Employee records P0: database-owned IDs, exact compensation, compensation
-- history, invitation delivery state, and departmentId as the canonical
-- department reference.

-- ---------------------------------------------------------------------------
-- 1. Database-generated IDs (time-ordered UUIDv7, native in Postgres 18)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  id_table TEXT;
BEGIN
  FOREACH id_table IN ARRAY ARRAY[
    'user', 'session', 'account', 'verification', 'organization', 'member',
    'invitation', 'employee', 'department', 'team',
    'leave_type', 'leave_policy', 'leave_request', 'leave_balance',
    'document', 'document_template',
    'onboarding_template', 'onboarding_checklist_item', 'audit_event'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN "id" SET DEFAULT uuidv7()::text',
      id_table
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Compensation in integer minor units
--
-- salaryAmount held a monthly amount in major units; annualize it into minor
-- units. BIGINT because annual kobo amounts exceed the INTEGER range.
-- ---------------------------------------------------------------------------

ALTER TABLE "employee"
  ADD COLUMN "annualSalaryMinor" BIGINT,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY';

UPDATE "employee" e
SET "annualSalaryMinor" = e."salaryAmount"::bigint * 100 * 12,
    "currency" = o."currency",
    "payFrequency" = o."payrollFrequency"
FROM "organization" o
WHERE o."id" = e."organizationId";

ALTER TABLE "employee"
  ALTER COLUMN "annualSalaryMinor" SET NOT NULL,
  DROP COLUMN "salaryAmount",
  ADD CONSTRAINT "employee_annualSalaryMinor_check"
    CHECK ("annualSalaryMinor" > 0),
  ADD CONSTRAINT "employee_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "employee_payFrequency_check"
    CHECK ("payFrequency" IN ('MONTHLY', 'BIWEEKLY', 'WEEKLY'));

CREATE TABLE "compensation_history" (
    "id" TEXT NOT NULL DEFAULT uuidv7()::text,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "annualSalaryMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "payFrequency" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "compensation_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compensation_history_annualSalaryMinor_check"
      CHECK ("annualSalaryMinor" > 0),
    CONSTRAINT "compensation_history_currency_check"
      CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "compensation_history_payFrequency_check"
      CHECK ("payFrequency" IN ('MONTHLY', 'BIWEEKLY', 'WEEKLY'))
);
CREATE INDEX "compensation_history_organizationId_idx"
  ON "compensation_history"("organizationId");
CREATE INDEX "compensation_history_employeeId_effectiveDate_idx"
  ON "compensation_history"("employeeId", "effectiveDate");
ALTER TABLE "compensation_history"
  ADD CONSTRAINT "compensation_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "compensation_history_employee_fkey"
    FOREIGN KEY ("organizationId", "employeeId")
    REFERENCES "employee"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing salaries become the opening history entry.
INSERT INTO "compensation_history"
  ("organizationId", "employeeId", "annualSalaryMinor", "currency",
   "payFrequency", "effectiveDate", "changedByUserId")
SELECT "organizationId", "id", "annualSalaryMinor", "currency",
       "payFrequency", "startDate"::date, 'system'
FROM "employee";

-- ---------------------------------------------------------------------------
-- 3. Invitations linked to employee records
-- ---------------------------------------------------------------------------

ALTER TABLE "invitation"
  ADD COLUMN "employeeId" TEXT,
  ADD COLUMN "tokenHash" TEXT,
  ADD COLUMN "sendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastSentAt" TIMESTAMP(3),
  ADD CONSTRAINT "invitation_employee_fkey"
    FOREIGN KEY ("organizationId", "employeeId")
    REFERENCES "employee"("organizationId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");
CREATE INDEX "invitation_employeeId_idx" ON "invitation"("employeeId");
-- Server-side deduplication: one open invitation per employee.
CREATE UNIQUE INDEX "invitation_one_pending_per_employee_key"
  ON "invitation"("organizationId", "employeeId")
  WHERE "status" = 'pending' AND "employeeId" IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON "invitation" TO stackhr_app;
GRANT SELECT, INSERT ON "compensation_history" TO stackhr_app;

DO $$
DECLARE
  tenant_table TEXT;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY['invitation', 'compensation_history']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO stackhr_app USING ("organizationId" = (SELECT current_setting(''app.org_id'', true))) WITH CHECK ("organizationId" = (SELECT current_setting(''app.org_id'', true)))',
      tenant_table || '_tenant_isolation',
      tenant_table
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Departments: normalized unique names, departmentId canonical
-- ---------------------------------------------------------------------------

DROP INDEX "department_organizationId_name_key";
CREATE UNIQUE INDEX "department_organizationId_normalized_name_key"
  ON "department"("organizationId", lower(regexp_replace(trim("name"), '\s+', ' ', 'g')));

-- An explicitly set departmentId wins and refreshes the free-text name. The
-- free-text column is resolved (or creates a department) only when it is the
-- value that changed, which keeps company setup and CSV import working.
CREATE OR REPLACE FUNCTION "sync_employee_department"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  department_id TEXT;
  department_name TEXT;
  normalized TEXT;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW."departmentId" IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW."departmentId" IS DISTINCT FROM OLD."departmentId") THEN
    IF NEW."departmentId" IS NULL THEN
      NEW."department" := '';
      RETURN NEW;
    END IF;

    SELECT "name" INTO department_name
    FROM "department"
    WHERE "id" = NEW."departmentId"
      AND "organizationId" = NEW."organizationId";

    IF department_name IS NULL THEN
      RAISE EXCEPTION 'department must belong to the employee organization'
        USING ERRCODE = '23503';
    END IF;

    NEW."department" := department_name;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."department" IS NOT DISTINCT FROM OLD."department" THEN
    RETURN NEW;
  END IF;

  IF trim(NEW."department") = '' THEN
    NEW."departmentId" := NULL;
    RETURN NEW;
  END IF;

  normalized := lower(regexp_replace(trim(NEW."department"), '\s+', ' ', 'g'));

  INSERT INTO "department" ("organizationId", "name")
  VALUES (NEW."organizationId", regexp_replace(trim(NEW."department"), '\s+', ' ', 'g'))
  ON CONFLICT DO NOTHING;

  SELECT "id", "name" INTO department_id, department_name
  FROM "department"
  WHERE "organizationId" = NEW."organizationId"
    AND lower(regexp_replace(trim("name"), '\s+', ' ', 'g')) = normalized;

  NEW."departmentId" := department_id;
  NEW."department" := department_name;
  RETURN NEW;
END $$;

DROP TRIGGER "employee_department_sync" ON "employee";
CREATE TRIGGER "employee_department_sync"
  BEFORE INSERT OR UPDATE OF "department", "departmentId" ON "employee"
  FOR EACH ROW EXECUTE FUNCTION "sync_employee_department"();

-- Renaming a department refreshes the denormalized name on its employees.
CREATE FUNCTION "sync_department_name_to_employees"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "employee"
  SET "department" = NEW."name"
  WHERE "departmentId" = NEW."id"
    AND "organizationId" = NEW."organizationId"
    AND "department" IS DISTINCT FROM NEW."name";
  RETURN NEW;
END $$;

CREATE TRIGGER "department_name_sync"
  AFTER UPDATE OF "name" ON "department"
  FOR EACH ROW EXECUTE FUNCTION "sync_department_name_to_employees"();
