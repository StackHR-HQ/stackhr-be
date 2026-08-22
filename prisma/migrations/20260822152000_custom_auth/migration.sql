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
