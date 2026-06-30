import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

let ensured = false;

/**
 * Runs on every boot. Two idempotent repairs:
 *
 * 1. Adds build_a_box_surcharge_cents if it doesn't exist yet.
 *    (Column was added to Drizzle schema but drizzle-kit push was never run
 *    in production, causing every db.select().from(productsTable) to throw
 *    "column does not exist" — silently caught — returning [] for customers.)
 *
 * 2. Restores NULL category_id links by matching the product's `category`
 *    slug field against product_categories.slug.
 *    (Root cause: the Stripe product sync writes rows using only Stripe-side
 *    fields; it does not preserve category_id, so any re-sync overwrites the
 *    FK with NULL while leaving the slug column intact.)
 */
export async function ensureProductsSchemaReady(): Promise<void> {
  if (ensured) return;
  try {
    // ── 1. Add missing column ────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS build_a_box_surcharge_cents integer NOT NULL DEFAULT 0
    `);

    // ── 2. Backfill NULL category_id from category slug ──────────────────────
    const countResult = await db.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM products WHERE category_id IS NULL
    `);
    const nullCount = Number(countResult.rows[0]?.n ?? 0);

    if (nullCount > 0) {
      logger.info({ nullCount }, 'ensureProductsSchemaReady: restoring NULL category_id links');

      const repairResult = await db.execute(sql`
        UPDATE products
        SET category_id = (
          SELECT id FROM product_categories WHERE slug = products.category LIMIT 1
        )
        WHERE category_id IS NULL
          AND EXISTS (
            SELECT 1 FROM product_categories WHERE slug = products.category
          )
      `);

      const fixed = (repairResult as any).rowCount ?? 0;
      const remaining = nullCount - fixed;

      if (remaining > 0) {
        logger.warn(
          { fixed, remaining },
          'ensureProductsSchemaReady: some products have no matching category slug (e.g. deleted/legacy) — left as NULL'
        );
      } else {
        logger.info({ fixed }, 'ensureProductsSchemaReady: all category_id links restored');
      }
    }

    ensured = true;
  } catch (err) {
    logger.error({ err }, 'ensureProductsSchemaReady: failed (non-fatal, server continues)');
  }
}
