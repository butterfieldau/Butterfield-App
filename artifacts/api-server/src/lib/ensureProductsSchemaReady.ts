import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

let ensured = false;

/**
 * Adds any columns that were added to the Drizzle products schema but may not
 * yet exist in the live database (e.g. after a deploy without drizzle-kit push).
 * Safe to call multiple times — the `IF NOT EXISTS` guard makes it idempotent.
 */
export async function ensureProductsSchemaReady(): Promise<void> {
  if (ensured) return;
  try {
    await db.execute(sql`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS build_a_box_surcharge_cents integer NOT NULL DEFAULT 0
    `);
    ensured = true;
  } catch (err) {
    logger.error({ err }, 'ensureProductsSchemaReady: failed (non-fatal)');
  }
}
