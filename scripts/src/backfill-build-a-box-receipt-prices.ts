/**
 * One-time backfill: copy unitCents → unitPriceCents and lineCents → totalPriceCents
 * for all historical Build a Box order items that have a non-zero unitCents but a
 * missing or zero unitPriceCents.
 *
 * Run: pnpm --filter @workspace/scripts run backfill-build-a-box-receipt-prices
 *
 * Safe to re-run — only touches rows where a bab item has unitCents > 0 but
 * unitPriceCents is absent or 0.  Already-correct rows are skipped.
 */

import { db, ordersTable } from '@workspace/db';
import { sql, eq } from 'drizzle-orm';

interface OrderItemRecord {
  productId: string;
  quantity?: number;
  unitCents?: number;
  lineCents?: number;
  unitPriceCents?: number;
  totalPriceCents?: number;
  [key: string]: unknown;
}

async function main() {
  console.log('🔧  Build a Box receipt-price alias backfill starting…\n');

  // Find all orders that have at least one bab item where unitCents > 0
  // but unitPriceCents is missing or 0.
  const staleOrders = await db.execute<{ id: string; items: OrderItemRecord[] }>(
    sql`
      SELECT id, items
      FROM orders
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(items) AS elem
        WHERE elem->>'productId' ~ '^build-a-box-[0-9]+$'
          AND (elem->>'unitCents')::numeric > 0
          AND (
            elem->>'unitPriceCents' IS NULL
            OR (elem->>'unitPriceCents')::numeric = 0
          )
      )
      ORDER BY created_at
    `,
  );

  const rows = staleOrders.rows;
  console.log(`📦  Found ${rows.length} order(s) needing receipt-price alias backfill\n`);

  if (rows.length === 0) {
    console.log('Nothing to do — exiting.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let errored = 0;

  for (const row of rows) {
    const items: OrderItemRecord[] = Array.isArray(row.items) ? row.items : [];

    let anyChange = false;
    const updatedItems = items.map(item => {
      if (!/^build-a-box-\d+$/.test(item.productId)) return item;

      const unitCents = Number(item.unitCents ?? 0);
      const lineCents = Number(item.lineCents ?? 0);
      const existingUnitPrice = Number(item.unitPriceCents ?? 0);

      // Only patch if unitCents is meaningful and unitPriceCents is absent/zero
      if (unitCents <= 0 || existingUnitPrice > 0) return item;

      anyChange = true;
      console.log(
        `  📝  Order ${row.id}: ${item.productId} ` +
        `unitPriceCents: ${existingUnitPrice} → ${unitCents} | ` +
        `totalPriceCents: ${Number(item.totalPriceCents ?? 0)} → ${lineCents}`,
      );

      return { ...item, unitPriceCents: unitCents, totalPriceCents: lineCents };
    });

    if (!anyChange) {
      skipped++;
      continue;
    }

    try {
      await db
        .update(ordersTable)
        .set({ items: updatedItems })
        .where(eq(ordersTable.id, row.id));
      updated++;
    } catch (err) {
      errored++;
      console.error(`  ❌  Failed to update order ${row.id}:`, err);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅  Updated : ${updated} order(s)`);
  console.log(`⏭  Skipped : ${skipped} order(s) (no change needed)`);
  if (errored > 0) console.error(`❌  Errors  : ${errored} order(s)`);
  console.log('─────────────────────────────────────────');
  console.log('\nBackfill complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
