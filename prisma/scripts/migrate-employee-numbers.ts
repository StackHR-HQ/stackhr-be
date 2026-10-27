import { Client } from 'pg';
import { getOrgPrefix } from '../../src/common/utils/employee-number.util';

/**
 * Production Migration Script: Rewrites legacy employee numbers to <TAG>-EMP-<NUMBER>
 *
 * Usage:
 *   DATABASE_URL="<production-url>" yarn ts-node prisma/scripts/migrate-employee-numbers.ts
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('Beginning employee number migration transaction...');
    await client.query('BEGIN');

    const res = await client.query(`
      SELECT 
        e.id, 
        e."organizationId", 
        o.name AS org_name, 
        o.slug AS org_slug, 
        e."fullName", 
        e."employeeNumber"
      FROM employee e
      JOIN organization o ON o.id = e."organizationId"
      WHERE e."employeeNumber" IS NOT NULL
      ORDER BY o.slug, e."createdAt" ASC
    `);

    console.log(`Found ${res.rows.length} employee records to inspect.`);

    let updatedCount = 0;
    for (const row of res.rows) {
      const prefix = getOrgPrefix({ slug: row.org_slug, name: row.org_name });
      const match = /^(?:[A-Z0-9]+-)?(?:EMP-)?(\d+)$/i.exec(
        row.employeeNumber || '',
      );
      const seq = match ? match[1] : '1';
      const newNum = `${prefix}-EMP-${seq.padStart(4, '0')}`;

      if (newNum !== row.employeeNumber) {
        await client.query(
          'UPDATE employee SET "employeeNumber" = $1 WHERE id = $2',
          [newNum, row.id],
        );
        updatedCount++;
      }
    }

    console.log(`Updated ${updatedCount} employee records.`);

    // Verification check for duplicates within any organization
    const dupes = await client.query(`
      SELECT 
        "organizationId", 
        "employeeNumber", 
        COUNT(*) AS cnt, 
        array_agg("fullName") AS employees
      FROM employee
      WHERE "employeeNumber" IS NOT NULL
      GROUP BY "organizationId", "employeeNumber"
      HAVING COUNT(*) > 1
    `);

    if (dupes.rows.length > 0) {
      console.error(
        'Duplicate check failed! Rolling back transaction:',
        dupes.rows,
      );
      await client.query('ROLLBACK');
      process.exit(1);
    }

    await client.query('COMMIT');
    console.log('Migration committed successfully. Zero duplicates found.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed and was rolled back:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
