import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

let columnEnsured = false;

/**
 * Phase 1 — column guard (runs BEFORE Stripe sync).
 *
 * Adds build_a_box_surcharge_cents to the products table when it doesn't exist.
 * Root cause: the column was added to the Drizzle schema but was missing from
 * post-merge.sh's pre-apply list, so drizzle-kit push never actually created
 * it in the DB. Every db.select().from(productsTable) then threw
 * "column does not exist" — silently caught — returning [] for all customers.
 *
 * The column is also pre-applied in post-merge.sh so future task merges won't
 * repeat the problem.
 */
export async function ensureProductsSchemaReady(): Promise<void> {
  if (columnEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS build_a_box_surcharge_cents integer NOT NULL DEFAULT 0
    `);
    columnEnsured = true;
  } catch (err) {
    logger.error({ err }, 'ensureProductsSchemaReady: failed (non-fatal)');
  }
}

/**
 * Phase 2 — category_id backfill (runs AFTER Stripe sync).
 *
 * Restores NULL category_id FK values on products by matching the product's
 * `category` slug field against product_categories.slug.
 *
 * Running after Stripe sync ensures the repair wins even if the sync pipeline
 * ever inadvertently touched the public products table during that boot cycle.
 * No one-shot guard — runs on every boot so it self-heals if nulls reappear.
 */
export async function repairProductCategoryLinks(): Promise<void> {
  try {
    const countResult = await db.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM products WHERE category_id IS NULL
    `);
    const nullCount = Number(countResult.rows[0]?.n ?? 0);
    if (nullCount === 0) return;

    logger.info({ nullCount }, 'repairProductCategoryLinks: restoring NULL category_id links');

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
        'repairProductCategoryLinks: some products have no matching category slug (e.g. deleted/legacy) — left as NULL'
      );
    } else {
      logger.info({ fixed }, 'repairProductCategoryLinks: all category_id links restored');
    }
  } catch (err) {
    logger.error({ err }, 'repairProductCategoryLinks: failed (non-fatal)');
  }
}
