-- ConvertExistingCompensationToKobo
--
-- Context:
--   PR #31 switched POST /payroll/compensation to store amounts in KOBO.
--   Payroll calculation (calculateRun) now divides CompensationRecord values
--   by 100 before computing gross pay.
--
--   All CompensationRecord rows created BEFORE PR #31 store amounts in NAIRA.
--   Without this migration, existing employees' payroll would calculate at
--   1/100th of their actual salary.
--
-- What this does:
--   Multiplies basicSalary, housingAllowance, transportAllowance, and
--   otherAllowances by 100 on ALL existing CompensationRecord rows,
--   converting them from Naira to Kobo.
--
-- Why unconditional (no WHERE filter):
--   The frontend was told to hold off on salary edits until this migration
--   deploys. No post-PR#31 kobo records should exist. An unconditional
--   UPDATE is simpler, auditable, and has no risk of false negatives
--   (missed records → employee paid 1/100th of salary).
--
-- Note: employee.salaryAmount is NOT touched — it is intentionally stored
--   in whole Naira and read as such by the payroll calculation fallback.
--   Converting it would break payroll for employees without a
--   CompensationRecord.

UPDATE "compensation_record"
SET
  "basicSalary"         = "basicSalary" * 100,
  "housingAllowance"    = COALESCE("housingAllowance", 0) * 100,
  "transportAllowance"  = COALESCE("transportAllowance", 0) * 100,
  "otherAllowances"     = COALESCE("otherAllowances", 0) * 100,
  "updatedAt"           = NOW();
