-- Store given and family names separately so HR and self-service edits do not
-- have to re-parse fullName. fullName stays the display/search value and is
-- maintained by the application alongside these columns.

ALTER TABLE "employee"
  ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

-- Backfill by splitting on the last space; single-word names become firstName.
UPDATE "employee"
SET "firstName" = CASE
      WHEN position(' ' IN trim("fullName")) = 0 THEN trim("fullName")
      ELSE trim(regexp_replace(trim("fullName"), '\s+\S+$', ''))
    END,
    "lastName" = CASE
      WHEN position(' ' IN trim("fullName")) = 0 THEN ''
      ELSE substring(trim("fullName") FROM '\S+$')
    END;
