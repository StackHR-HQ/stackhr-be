-- Link a portal account to an employee profile only after invitation acceptance.
-- A portal account can have one employee profile per organization; unlinked
-- employee records remain valid while an invitation is outstanding.

ALTER TABLE "employee"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "employee_organizationId_userId_key"
  ON "employee"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "employee_userId_idx"
  ON "employee"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employee_userId_fkey'
      AND conrelid = '"employee"'::regclass
  ) THEN
    ALTER TABLE "employee"
      ADD CONSTRAINT "employee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- A User has no organization column. Membership is therefore the durable
-- tenant boundary for a linked employee profile. Validate it on employee
-- changes and refuse removal of a membership that an employee link requires.
CREATE OR REPLACE FUNCTION "enforce_employee_user_membership"()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."userId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "member"
    WHERE "organizationId" = NEW."organizationId"
      AND "userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'employee user must be a member of the same organization'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "employee_user_membership_check" ON "employee";
CREATE TRIGGER "employee_user_membership_check"
  BEFORE INSERT OR UPDATE OF "organizationId", "userId" ON "employee"
  FOR EACH ROW EXECUTE FUNCTION "enforce_employee_user_membership"();

CREATE OR REPLACE FUNCTION "prevent_linked_employee_membership_removal"()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "employee"
    WHERE "organizationId" = OLD."organizationId"
      AND "userId" = OLD."userId"
  ) THEN
    RAISE EXCEPTION 'cannot remove membership while it is linked to an employee profile'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "linked_employee_membership_delete_check" ON "member";
CREATE TRIGGER "linked_employee_membership_delete_check"
  BEFORE DELETE ON "member"
  FOR EACH ROW EXECUTE FUNCTION "prevent_linked_employee_membership_removal"();

DROP TRIGGER IF EXISTS "linked_employee_membership_update_check" ON "member";
CREATE TRIGGER "linked_employee_membership_update_check"
  BEFORE UPDATE OF "organizationId", "userId" ON "member"
  FOR EACH ROW EXECUTE FUNCTION "prevent_linked_employee_membership_removal"();
