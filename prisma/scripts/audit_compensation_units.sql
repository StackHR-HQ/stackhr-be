-- Pre/Post Audit Query: Compensation Unit Consistency (Naira vs Kobo)
--
-- Run against staging/prod before and after deploying
-- 20261117234500_convert_existing_compensation_to_kobo to surface any active
-- CompensationRecord rows that still diverge from employee.annualSalaryMinor
-- or look suspiciously under-scaled (e.g. Case A allowance-heavy or Case B
-- high-earner >= N1M/month rows where salaryAmount >= 10000).
--
-- Expected result on a clean database: 0 rows.

SELECT
  e."id"                         AS employee_id,
  e."organizationId"             AS organization_id,
  e."fullName"                   AS full_name,
  e."salaryAmount"               AS employee_salary_naira,
  e."annualSalaryMinor"          AS employee_annual_kobo,
  cr."id"                        AS comp_record_id,
  cr."basicSalary"               AS basic_kobo,
  COALESCE(cr."housingAllowance", 0)   AS housing_kobo,
  COALESCE(cr."transportAllowance", 0) AS transport_kobo,
  COALESCE(cr."otherAllowances", 0)    AS other_kobo,
  (
    cr."basicSalary"
    + COALESCE(cr."housingAllowance", 0)
    + COALESCE(cr."transportAllowance", 0)
    + COALESCE(cr."otherAllowances", 0)
  ) * 12                         AS comp_annual_kobo,
  CASE
    WHEN e."annualSalaryMinor" > 0
      AND (
        (
          cr."basicSalary"
          + COALESCE(cr."housingAllowance", 0)
          + COALESCE(cr."transportAllowance", 0)
          + COALESCE(cr."otherAllowances", 0)
        ) * 12 < (e."annualSalaryMinor" * 0.9)
        OR (
          cr."basicSalary"
          + COALESCE(cr."housingAllowance", 0)
          + COALESCE(cr."transportAllowance", 0)
          + COALESCE(cr."otherAllowances", 0)
        ) * 12 > (e."annualSalaryMinor" * 1.1)
      )
      THEN 'COMP_VS_ANNUAL_DIVERGENCE'
    WHEN (
      cr."basicSalary"
      + COALESCE(cr."housingAllowance", 0)
      + COALESCE(cr."transportAllowance", 0)
      + COALESCE(cr."otherAllowances", 0)
    ) BETWEEN 1 AND 2000000
      THEN 'SUSPICIOUSLY_LOW_GROSS_KOBO (< N20k/mo)'
    ELSE 'OK'
  END                            AS flag
FROM "compensation_record" cr
JOIN "employee" e ON cr."employeeId" = e."id"
WHERE cr."effectiveTo" IS NULL
  AND (
    (
      e."annualSalaryMinor" > 0
      AND (
        (
          cr."basicSalary"
          + COALESCE(cr."housingAllowance", 0)
          + COALESCE(cr."transportAllowance", 0)
          + COALESCE(cr."otherAllowances", 0)
        ) * 12 < (e."annualSalaryMinor" * 0.9)
        OR (
          cr."basicSalary"
          + COALESCE(cr."housingAllowance", 0)
          + COALESCE(cr."transportAllowance", 0)
          + COALESCE(cr."otherAllowances", 0)
        ) * 12 > (e."annualSalaryMinor" * 1.1)
      )
    )
    OR (
      cr."basicSalary"
      + COALESCE(cr."housingAllowance", 0)
      + COALESCE(cr."transportAllowance", 0)
      + COALESCE(cr."otherAllowances", 0)
    ) BETWEEN 1 AND 2000000
  )
ORDER BY e."organizationId", e."fullName";

