/**
 * Security migration: remove plaintext PAN/CVV from wholesale_cards
 *
 * This script idempotently drops full_card_number, cvv, and visible_to_manager
 * from the wholesale_cards table and verifies that no residual sensitive data
 * remains. It is safe to run multiple times.
 *
 * Run: pnpm --filter @workspace/scripts run purge-wholesale-card-secrets
 */

import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const SENSITIVE_COLUMNS = ['full_card_number', 'cvv', 'visible_to_manager'];
const TABLE = 'wholesale_cards';

async function columnExists(columnName: string): Promise<boolean> {
  const res = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${TABLE} AND column_name = ${columnName}
  `);
  return res.rows.length > 0;
}

async function run() {
  for (const col of SENSITIVE_COLUMNS) {
    if (await columnExists(col)) {
      console.log(`Dropping column ${TABLE}.${col} …`);
      await db.execute(sql.raw(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS "${col}"`));
      console.log(`  ✓ Dropped ${col}`);
    } else {
      console.log(`  ✓ ${col} already absent — nothing to do`);
    }
  }

  // Verify each column individually
  const stillPresent: string[] = [];
  for (const col of SENSITIVE_COLUMNS) {
    if (await columnExists(col)) {
      stillPresent.push(col);
    }
  }

  if (stillPresent.length > 0) {
    throw new Error(`PURGE FAILED — sensitive columns still present: ${stillPresent.join(', ')}`);
  }

  console.log('\n✓ Verification passed: no sensitive card data columns remain in the database.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
