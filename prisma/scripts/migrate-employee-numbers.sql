-- ==============================================================================
-- Production Runbook: Migrate Employee Numbers to <TAG>-EMP-<NUMBER> Format
-- ==============================================================================
-- Description:
--   Rewrites legacy employee numbers (e.g. EMP-0001) to organization-tagged
--   identifiers (e.g. UDU-EMP-0001, VICKI-EMP-0001, STACK-EMP-0001) while
--   preserving the exact numeric sequence and avoiding collisions.
--
-- Execution:
--   Run within a single transaction in psql or via database console:
--     psql $DATABASE_URL -f prisma/scripts/migrate-employee-numbers.sql
-- ==============================================================================

BEGIN;

-- 1. Step 1: Preview current employee numbers and target formatted identifiers
SELECT 
  e.id,
  o.id AS organization_id,
  o.name AS organization_name,
  o.slug AS organization_slug,
  e."fullName" AS employee_name,
  e."employeeNumber" AS old_employee_number,
  CONCAT(
    UPPER(
      SUBSTRING(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            TRANSLATE(
              COALESCE(
                CASE 
                  WHEN o.slug LIKE 'acme-%' AND LOWER(o.name) NOT LIKE 'acme%' THEN o.name 
                  ELSE o.slug 
                END,
                o.name,
                'ORG'
              ),
              'ỌọṢṣÁáÀàÉéÈèÍíÌìÓóÒòÚúÙùŃń',
              'OoSsAaAaEeEeIiIiOoOoUuUuNn'
            ),
            '[^a-zA-Z0-9]', '', 'g'
          ),
          '^([a-zA-Z0-9]{2,5}).*$', '\1'
        ) FROM 1 FOR 5
      )
    ),
    '-EMP-',
    LPAD(
      COALESCE(
        SUBSTRING(e."employeeNumber" FROM '([0-9]+)$'),
        '1'
      ),
      4,
      '0'
    )
  ) AS new_employee_number
FROM employee e
JOIN organization o ON o.id = e."organizationId"
WHERE e."employeeNumber" IS NOT NULL
ORDER BY o.name, e."createdAt" ASC;

-- 2. Step 2: Apply the update across all employees
UPDATE employee e
SET "employeeNumber" = CONCAT(
  UPPER(
    SUBSTRING(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          TRANSLATE(
            COALESCE(
              CASE 
                WHEN o.slug LIKE 'acme-%' AND LOWER(o.name) NOT LIKE 'acme%' THEN o.name 
                ELSE o.slug 
              END,
              o.name,
              'ORG'
            ),
            'ỌọṢṣÁáÀàÉéÈèÍíÌìÓóÒòÚúÙùŃń',
            'OoSsAaAaEeEeIiIiOoOoUuUuNn'
          ),
          '[^a-zA-Z0-9]', '', 'g'
        ),
        '^([a-zA-Z0-9]{2,5}).*$', '\1'
      ) FROM 1 FOR 5
    )
  ),
  '-EMP-',
  LPAD(
    COALESCE(
      SUBSTRING(e."employeeNumber" FROM '([0-9]+)$'),
      '1'
    ),
    4,
    '0'
  )
)
FROM organization o
WHERE o.id = e."organizationId"
  AND e."employeeNumber" IS NOT NULL
  AND e."employeeNumber" !~ '^[A-Z0-9]+-EMP-[0-9]+$';

-- 3. Step 3: Verify zero duplicate employee numbers per organization (must return 0 rows)
SELECT 
  "organizationId", 
  "employeeNumber", 
  COUNT(*) AS duplicate_count,
  array_agg("fullName") AS affected_employees
FROM employee
WHERE "employeeNumber" IS NOT NULL
GROUP BY "organizationId", "employeeNumber"
HAVING COUNT(*) > 1;

COMMIT;
