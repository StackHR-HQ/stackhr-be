ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "userType" TEXT NOT NULL DEFAULT 'BUSINESS';

ALTER TABLE "session"
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "user_userType_idx" ON "user"("userType");

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

CREATE INDEX IF NOT EXISTS "organization_ownerId_idx" ON "organization"("ownerId");

ALTER TABLE "organization"
  ADD CONSTRAINT "organization_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "companySize" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS "payrollFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "taxId" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

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

ALTER TABLE "employee"
  ADD CONSTRAINT "employee_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee"
  ADD CONSTRAINT "employee_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
