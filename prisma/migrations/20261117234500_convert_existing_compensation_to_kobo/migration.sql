-- ConvertExistingCompensationToKobo
--
-- Context:
--   PR #31 switched POST /payroll/compensation and calculateRun to treat
--   CompensationRecord amounts as KOBO (dividing by 100 during payroll runs).
--   However:
--     Case A: Records created prior to PR #31 (or via POST /employees) store
--             CompensationRecord amounts in NAIRA while employee.annualSalaryMinor
--             is already in KOBO (gross * 1200).
--     Case B: Records saved via the UI between PR #31 and the frontend kobo
--             switchover sent NAIRA to POST /payroll/compensation, which stored:
--               - CompensationRecord.* in NAIRA (1/100th of kobo)
--               - employee.annualSalaryMinor = gross_naira * 12 (1/100th of kobo)
--               - employee.salaryAmount = round(gross_naira / 100) (1/100th of naira)
--     Case C: Records already saved in KOBO have employee.salaryAmount >= 10000
--             and (gross * 12) ~ employee.annualSalaryMinor.
--
-- Safety & Idempotency:
--   Both updates below are guarded so Case C (already-kobo records) is never
--   touched, and re-running this migration produces 0 changes.

-- Case A: Pre-#31 / POST /employees records where CompensationRecord is in Naira
-- while employee.annualSalaryMinor is already in Kobo (~100x larger than gross * 12).
UPDATE "compensation_record" cr
SET
  "basicSalary"        = cr."basicSalary" * 100,
  "housingAllowance"   = COALESCE(cr."housingAllowance", 0) * 100,
  "transportAllowance" = COALESCE(cr."transportAllowance", 0) * 100,
  "otherAllowances"    = COALESCE(cr."otherAllowances", 0) * 100,
  "updatedAt"          = NOW()
FROM "employee" e
WHERE cr."employeeId" = e."id"
  AND e."annualSalaryMinor" > 0
  AND (
    cr."basicSalary"
    + COALESCE(cr."housingAllowance", 0)
    + COALESCE(cr."transportAllowance", 0)
    + COALESCE(cr."otherAllowances", 0)
  ) > 0
  AND (
    cr."basicSalary"
    + COALESCE(cr."housingAllowance", 0)
    + COALESCE(cr."transportAllowance", 0)
    + COALESCE(cr."otherAllowances", 0)
  ) * 12 <= (e."annualSalaryMinor" / 50);

-- Case B: Post-#31 UI-edited records where Naira was sent to POST /payroll/compensation.
-- Here (gross * 12) matches annualSalaryMinor, but salaryAmount was divided by 100
-- (so salaryAmount is < 10,000 Naira, e.g. 3,000 instead of 300,000) and basicSalary < 10,000,000.
UPDATE "compensation_record" cr
SET
  "basicSalary"        = cr."basicSalary" * 100,
  "housingAllowance"   = COALESCE(cr."housingAllowance", 0) * 100,
  "transportAllowance" = COALESCE(cr."transportAllowance", 0) * 100,
  "otherAllowances"    = COALESCE(cr."otherAllowances", 0) * 100,
  "updatedAt"          = NOW()
FROM "employee" e
WHERE cr."employeeId" = e."id"
  AND e."salaryAmount" > 0
  AND e."salaryAmount" < 10000
  AND cr."basicSalary" > 0
  AND cr."basicSalary" < 10000000
  AND e."annualSalaryMinor" > 0
  AND (
    cr."basicSalary"
    + COALESCE(cr."housingAllowance", 0)
    + COALESCE(cr."transportAllowance", 0)
    + COALESCE(cr."otherAllowances", 0)
  ) * 12 > (e."annualSalaryMinor" / 50);

UPDATE "employee" e
SET
  "annualSalaryMinor" = e."annualSalaryMinor" * 100,
  "salaryAmount"      = e."salaryAmount" * 100,
  "updatedAt"         = NOW()
WHERE e."salaryAmount" > 0
  AND e."salaryAmount" < 10000
  AND e."annualSalaryMinor" > 0
  AND EXISTS (
    SELECT 1
    FROM "compensation_record" cr
    WHERE cr."employeeId" = e."id"
      AND cr."effectiveTo" IS NULL
      AND (
        cr."basicSalary"
        + COALESCE(cr."housingAllowance", 0)
        + COALESCE(cr."transportAllowance", 0)
        + COALESCE(cr."otherAllowances", 0)
      ) * 12 >= (e."annualSalaryMinor" * 50)
  );

-- Convert CompensationHistory rows written in Naira (where annualSalaryMinor is
-- ~100x smaller than the employee's kobo annualSalaryMinor).
UPDATE "compensation_history" ch
SET
  "annualSalaryMinor" = ch."annualSalaryMinor" * 100,
  "previousSalary"    = ch."previousSalary" * 100,
  "newSalary"         = ch."newSalary" * 100
FROM "employee" e
WHERE ch."employeeId" = e."id"
  AND e."annualSalaryMinor" > 0
  AND ch."annualSalaryMinor" > 0
  AND ch."annualSalaryMinor" <= (e."annualSalaryMinor" / 50);
