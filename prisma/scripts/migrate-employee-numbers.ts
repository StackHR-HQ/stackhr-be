import 'dotenv/config';
import { Client } from 'pg';
import { getOrgPrefix } from '../../src/common/utils/employee-number.util';

/**
 * Production Migration Script: Rewrites legacy employee numbers to <TAG>-EMP-<NUMBER>
 *
 * Behavior:
 * - Defaults to a dry run (read-only plan preview and transaction rollback).
 * - Requires `--apply` flag to commit updates.
 * - Only rewrites legacy numbers matching strictly `^EMP-(\\d+)$` (e.g. EMP-0001, EMP-12345).
 * - Preserves custom strings (e.g. STAFF-A, CONTRACTOR) and imported bare IDs (e.g. 20240157).
 * - Checks already-tagged identifiers (<TAG>-EMP-<NUMBER>) and flags any where the existing tag
 *   diverges from getOrgPrefix(org) (e.g. from prior one-off runs on staging).
 * - Runs duplicate employee number verification before committing.
 *
 * Usage:
 *   # Dry run (default):
 *   DATABASE_URL="<url>" yarn ts-node prisma/scripts/migrate-employee-numbers.ts
 *
 *   # Apply to database:
 *   DATABASE_URL="<url>" yarn ts-node prisma/scripts/migrate-employee-numbers.ts --apply
 */
async function main() {
  const isApply = process.argv.includes('--apply');
  const isDryRun = !isApply;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  console.log('================================================================');
  console.log('Employee Number Migration Runbook');
  console.log(
    `Mode: ${isApply ? 'APPLY (Changes will be committed)' : 'DRY RUN (Default: changes will be rolled back)'}`,
  );
  console.log('================================================================\n');

  try {
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

    console.log(`Found ${res.rows.length} employee records with an employee number.`);

    const updates: Array<{
      id: string;
      orgName: string;
      fullName: string;
      oldNum: string;
      newNum: string;
    }> = [];
    const mismatches: Array<{
      orgName: string;
      fullName: string;
      currentNum: string;
      currentTag: string;
      expectedTag: string;
    }> = [];
    let preservedCount = 0;

    for (const row of res.rows) {
      const empNum = (row.employeeNumber || '').trim();
      const prefix = getOrgPrefix({ slug: row.org_slug, name: row.org_name });

      const legacyMatch = /^EMP-(\d+)$/i.exec(empNum);
      if (legacyMatch) {
        const seq = legacyMatch[1];
        const newNum = `${prefix}-EMP-${seq.padStart(4, '0')}`;
        if (newNum !== empNum) {
          updates.push({
            id: row.id,
            orgName: row.org_name,
            fullName: row.fullName,
            oldNum: empNum,
            newNum,
          });
        }
        continue;
      }

      const taggedMatch = /^([A-Z0-9]{2,5})-EMP-(\d+)$/i.exec(empNum);
      if (taggedMatch) {
        const currentTag = taggedMatch[1].toUpperCase();
        if (currentTag !== prefix) {
          mismatches.push({
            orgName: row.org_name,
            fullName: row.fullName,
            currentNum: empNum,
            currentTag,
            expectedTag: prefix,
          });
        }
        preservedCount++;
        continue;
      }

      // Untouched: custom IDs (e.g. STAFF-A, CONTRACTOR) or imported numeric IDs (e.g. 20240157)
      preservedCount++;
    }

    if (updates.length > 0) {
      console.log(`\nPlanned Updates (${updates.length}):`);
      for (const u of updates) {
        console.log(`  [UPDATE] ${u.orgName} | ${u.fullName} | ${u.oldNum} -> ${u.newNum}`);
      }
    } else {
      console.log('\nNo legacy employee numbers (EMP-####) to rewrite.');
    }

    if (mismatches.length > 0) {
      console.log(
        `\n[!] Flagged Tag Discrepancies on Already-Tagged Records (${mismatches.length}):`,
      );
      for (const m of mismatches) {
        console.log(
          `  [FLAGGED TAG MISMATCH] ${m.orgName} | ${m.fullName} | ${m.currentNum} (tag "${m.currentTag}" != expected "${m.expectedTag}")`,
        );
      }
    } else {
      console.log('\nZero tag discrepancies detected on already-tagged records.');
    }

    console.log(
      `\nPreserved untouched records (custom / imported / already matching): ${preservedCount}`,
    );

    if (isDryRun) {
      console.log('\n--- DRY RUN SUMMARY ---');
      console.log(`- Would rewrite: ${updates.length} legacy records`);
      console.log(`- Untouched records: ${preservedCount}`);
      console.log(`- Tag discrepancies flagged: ${mismatches.length}`);
      await client.query('ROLLBACK');
      console.log(
        '\n[DRY RUN] Rolled back transaction. Zero database modifications were committed.',
      );
      console.log('To apply these changes in production, rerun with the --apply flag:');
      console.log('  yarn ts-node prisma/scripts/migrate-employee-numbers.ts --apply\n');
      return;
    }

    // Apply Mode
    console.log(`\nApplying ${updates.length} updates...`);
    for (const u of updates) {
      await client.query(
        'UPDATE employee SET "employeeNumber" = $1 WHERE id = $2',
        [u.newNum, u.id],
      );
    }

    // Step 3 Duplicate Check Verification
    console.log('Running duplicate employee number verification check...');
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
        '\n[ERROR] Duplicate employee number check failed! Rolling back transaction:',
        dupes.rows,
      );
      await client.query('ROLLBACK');
      process.exit(1);
    }

    await client.query('COMMIT');
    console.log(
      `\n[SUCCESS] Migration committed successfully. Updated ${updates.length} records. Zero duplicates found.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n[ERROR] Migration failed and was rolled back:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
