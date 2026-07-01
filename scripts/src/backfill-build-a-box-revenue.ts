/**
 * One-time backfill: recompute unitCents + lineCents for all historical
 * Build a Box order items that were stored with $0 or client-supplied prices.
 *
 * Run: pnpm --filter @workspace/scripts run backfill-build-a-box-revenue
 *
 * Safe to re-run — only updates rows where at least one build-a-box item
 * has a stale/missing unitCents (i.e. unitCents = 0 or absent).
 * Orders already backfilled (unitCents > 0) are skipped.
 */

import { db, ordersTable, productsTable, storeSettingsTable } from '@workspace/db';
import { sql, eq } from 'drizzle-orm';

// ── Types mirrored from orderPricing.ts ────────────────────────────────────

type BuildABoxSizeConfig = { size: number; label: string; priceCents: number };

interface OrderItemRecord {
  productId: string;
  variantId?: string | null;
  quantity: number;
  selectedOptions?: Array<{
    optionId?: string;
    groupId?: string;
    priceAdjustmentCents?: number;
  }>;
  isFreeReward?: boolean;
  unitPriceCents?: number;
  unitCents?: number;
  lineCents?: number;
  [key: string]: unknown;
}

// ── Pricing helpers (extracted from orderPricing.ts) ───────────────────────

function computeBuildABoxPriceSync(
  size: number,
  selectedOptions: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>,
  sizes: BuildABoxSizeConfig[],
  cookieSurchargeMap: Map<string, number>,
): number | null {
  const sizeConfig = sizes.find(s => s.size === size);
  if (!sizeConfig) {
    console.warn(`  ⚠  No size config found for build-a-box-${size} — skipping item`);
    return null;
  }

  let surchargeCents = 0;
  for (const opt of selectedOptions) {
    if (opt.groupId !== 'box-contents' || !opt.optionId) continue;
    const dbSurcharge = cookieSurchargeMap.get(opt.optionId) ?? 0;
    const clientAdj = opt.priceAdjustmentCents ?? 0;
    const qty = dbSurcharge > 0 ? Math.round(clientAdj / dbSurcharge) : 0;
    surchargeCents += qty * dbSurcharge;
  }

  return sizeConfig.priceCents + surchargeCents;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔧  Build a Box revenue backfill starting…\n');

  // 1. Load build-a-box sizes config from store_settings
  const [sizesRow] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.key, 'build_a_box_sizes'));

  const buildABoxSizes: BuildABoxSizeConfig[] = sizesRow
    ? (JSON.parse(sizesRow.value) as BuildABoxSizeConfig[])
    : [];

  if (buildABoxSizes.length === 0) {
    console.warn('⚠  No build_a_box_sizes config found in store_settings.');
    console.warn('   Prices will only be recomputed from size config; surcharges will still be applied.');
    console.warn('   Continue? (proceeding — surcharge re-derivation still uses product table)\n');
  } else {
    console.log(`✅  Loaded ${buildABoxSizes.length} box size configs: ${buildABoxSizes.map(s => `${s.size}pk=$${(s.priceCents / 100).toFixed(2)}`).join(', ')}\n`);
  }

  // 2. Load all product surcharges (full table scan — small table)
  const productRows = await db
    .select({ id: productsTable.id, surchargeCents: productsTable.buildABoxSurchargeCents })
    .from(productsTable);
  const cookieSurchargeMap = new Map(productRows.map(p => [p.id, p.surchargeCents ?? 0]));
  console.log(`✅  Loaded surcharges for ${productRows.length} products\n`);

  // 3. Find all orders that contain at least one build-a-box item
  //    Use a jsonb existence check — cast items to jsonb array and look for
  //    productId values matching the pattern.
  const babOrders = await db.execute<{ id: string; items: OrderItemRecord[] }>(
    sql`
      SELECT id, items
      FROM orders
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(items) AS elem
        WHERE elem->>'productId' ~ '^build-a-box-[0-9]+$'
      )
      ORDER BY created_at
    `,
  );

  const rows = babOrders.rows;
  console.log(`📦  Found ${rows.length} order(s) containing Build a Box items\n`);

  if (rows.length === 0) {
    console.log('Nothing to do — exiting.');
    return;
  }

  let skipped = 0;
  let updated = 0;
  let errored = 0;

  for (const row of rows) {
    const items: OrderItemRecord[] = Array.isArray(row.items) ? row.items : [];

    // Check whether this order already has correct unitCents on all bab items
    const babItems = items.filter(it => /^build-a-box-\d+$/.test(it.productId));
    const needsUpdate = babItems.some(it => !it.unitCents || it.unitCents === 0);

    if (!needsUpdate) {
      skipped++;
      continue;
    }

    // Recompute prices for every build-a-box item in this order
    let anyChange = false;
    const updatedItems = items.map(item => {
      const boxMatch = /^build-a-box-(\d+)$/.exec(item.productId);
      if (!boxMatch) return item; // non-bab items are left untouched

      const size = parseInt(boxMatch[1], 10);
      const unitCents = computeBuildABoxPriceSync(
        size,
        item.selectedOptions ?? [],
        buildABoxSizes,
        cookieSurchargeMap,
      );

      if (unitCents === null) {
        // Size config missing — leave item as-is and flag the order
        console.warn(`  ⚠  Order ${row.id}: cannot recompute build-a-box-${size} (no size config)`);
        return item;
      }

      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const lineCents = unitCents * qty;

      if (item.unitCents !== unitCents || item.lineCents !== lineCents) {
        anyChange = true;
        console.log(
          `  📝  Order ${row.id}: build-a-box-${size} qty=${qty} ` +
          `unitCents ${item.unitCents ?? 'n/a'} → ${unitCents} | ` +
          `lineCents ${item.lineCents ?? 'n/a'} → ${lineCents}`,
        );
      }

      return { ...item, unitCents, lineCents };
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
  console.log(`⏭  Skipped : ${skipped} order(s) (already correct)`);
  if (errored > 0) console.error(`❌  Errors  : ${errored} order(s)`);
  console.log('─────────────────────────────────────────');
  console.log('\nBackfill complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
