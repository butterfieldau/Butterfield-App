import { db, productsTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

/**
 * Idempotent startup repair: restores NULL category_id values on products
 * by matching the product's `category` slug against product_categories.slug.
 *
 * Safe to run on every boot — exits immediately if no NULL rows exist.
 * Errors are caught and logged; the server starts regardless.
 */
export async function repairProductCategories(): Promise<void> {
  try {
    const countResult = await db.execute<{ n: string }>(sql`
      SELECT count(*) AS n FROM products WHERE category_id IS NULL
    `);
    const n = Number(countResult.rows[0]?.n ?? 0);
    if (n === 0) return;

    logger.info({ nullCategoryCount: n }, 'repairProductCategories: repairing NULL category_id links');

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
    const remaining = n - fixed;

    if (remaining > 0) {
      logger.warn(
        { fixed, remaining },
        'repairProductCategories: some products still have no matching category slug'
      );
    } else {
      logger.info({ fixed }, 'repairProductCategories: all NULL category_id links restored');
    }
  } catch (err) {
    logger.error({ err }, 'repairProductCategories: repair failed (non-fatal, server continues)');
  }
}
