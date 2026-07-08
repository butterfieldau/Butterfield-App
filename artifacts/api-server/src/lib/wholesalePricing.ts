import {
  db,
  productsTable,
  pricingTiersTable,
  quantityPriceBreaksTable,
  customerPricingTable,
  wholesaleAccountsTable,
} from '@workspace/db';
import { and, eq, lte, gte, isNull, or, desc, inArray } from 'drizzle-orm';

export type PriceSource =
  | 'manual_override'
  | 'customer_product_price'
  | 'customer_category_price'
  | 'quantity_break_customer'
  | 'quantity_break_tier'
  | 'standard_wholesale'
  | 'none';

export interface PriceResult {
  unitCents: number;
  totalCents: number;
  source: PriceSource;
  sourceLabel: string;
  sourceId?: string;
  basePriceCents: number;
  productId: string;
  qty: number;
}

export interface PriceContext {
  productId: string;
  qty: number;
  customerId: string;
  accountId: string;
  tierId?: string | null;
  manualOverrideCents?: number | null;
}

/**
 * Securely calculate the wholesale unit price for one line item.
 * Priority (strictly manual rules only — no automatic discounts):
 *   1. Manual override (director-set)
 *   2. Customer-specific product price
 *   3. Customer-specific category price
 *   4. Quantity break (customer scope)
 *   5. Quantity break (tier scope)
 *   6. Standard wholesale price
 *   7. Error — no wholesale price configured
 */
export async function calculateWholesalePrice(ctx: PriceContext): Promise<PriceResult> {
  const { productId, qty, customerId, tierId, manualOverrideCents } = ctx;

  if (qty <= 0) throw new Error(`Invalid quantity for product ${productId}`);

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) throw new Error(`Product not found: ${productId}`);
  if (!product.isActive)             throw new Error(`Product unavailable: ${product.name}`);
  if (!product.isWholesaleAvailable) throw new Error(`Not wholesale available: ${product.name}`);
  if (product.isSoldOut)             throw new Error(`Sold out: ${product.name}`);

  const baseCents = product.wholesalePriceCents ?? product.priceCents;

  // 1. Manual override (director-set per-order line)
  if (manualOverrideCents != null && manualOverrideCents > 0) {
    return {
      unitCents: manualOverrideCents,
      totalCents: manualOverrideCents * qty,
      source: 'manual_override',
      sourceLabel: 'Director manual override',
      basePriceCents: baseCents,
      productId, qty,
    };
  }

  // 2. Customer-specific product price (always checked — no flag gate)
  const customerProductPrices = await db.select().from(customerPricingTable).where(and(
    eq(customerPricingTable.customerId, customerId),
    eq(customerPricingTable.productId, productId),
    eq(customerPricingTable.isActive, true),
  )).orderBy(desc(customerPricingTable.createdAt));

  for (const cp of customerProductPrices) {
    if (cp.unitPriceCents != null) {
      return {
        unitCents: cp.unitPriceCents,
        totalCents: cp.unitPriceCents * qty,
        source: 'customer_product_price',
        sourceLabel: 'Custom customer price',
        sourceId: cp.id,
        basePriceCents: baseCents,
        productId, qty,
      };
    }
  }

  // 3. Customer-specific category price
  if (product.category) {
    const customerCategoryPrices = await db.select().from(customerPricingTable).where(and(
      eq(customerPricingTable.customerId, customerId),
      eq(customerPricingTable.category, product.category),
      isNull(customerPricingTable.productId),
      eq(customerPricingTable.isActive, true),
    )).orderBy(desc(customerPricingTable.createdAt));

    for (const cp of customerCategoryPrices) {
      if (cp.unitPriceCents != null) {
        return {
          unitCents: cp.unitPriceCents,
          totalCents: cp.unitPriceCents * qty,
          source: 'customer_category_price',
          sourceLabel: 'Custom category price',
          sourceId: cp.id,
          basePriceCents: baseCents,
          productId, qty,
        };
      }
    }
  }

  // 4. Quantity break (customer scope) — highest minQty band that fits qty
  const customerQtyBreaks = await db.select().from(quantityPriceBreaksTable).where(and(
    eq(quantityPriceBreaksTable.productId, productId),
    eq(quantityPriceBreaksTable.scope, 'customer'),
    eq(quantityPriceBreaksTable.customerId, customerId),
    eq(quantityPriceBreaksTable.isActive, true),
    lte(quantityPriceBreaksTable.minQty, qty),
    or(isNull(quantityPriceBreaksTable.maxQty), gte(quantityPriceBreaksTable.maxQty, qty)),
  )).orderBy(desc(quantityPriceBreaksTable.minQty), desc(quantityPriceBreaksTable.createdAt));

  for (const qb of customerQtyBreaks) {
    if (qb.unitPriceCents != null) {
      return {
        unitCents: qb.unitPriceCents,
        totalCents: qb.unitPriceCents * qty,
        source: 'quantity_break_customer',
        sourceLabel: `Qty break (${qb.minQty}+)`,
        sourceId: qb.id,
        basePriceCents: baseCents,
        productId, qty,
      };
    }
  }

  // 5. Quantity break (tier scope)
  if (tierId) {
    const tierQtyBreaks = await db.select().from(quantityPriceBreaksTable).where(and(
      eq(quantityPriceBreaksTable.productId, productId),
      eq(quantityPriceBreaksTable.scope, 'tier'),
      eq(quantityPriceBreaksTable.tierId, tierId),
      eq(quantityPriceBreaksTable.isActive, true),
      lte(quantityPriceBreaksTable.minQty, qty),
      or(isNull(quantityPriceBreaksTable.maxQty), gte(quantityPriceBreaksTable.maxQty, qty)),
    )).orderBy(desc(quantityPriceBreaksTable.minQty), desc(quantityPriceBreaksTable.createdAt));

    for (const qb of tierQtyBreaks) {
      if (qb.unitPriceCents != null) {
        return {
          unitCents: qb.unitPriceCents,
          totalCents: qb.unitPriceCents * qty,
          source: 'quantity_break_tier',
          sourceLabel: `Tier qty break (${qb.minQty}+)`,
          sourceId: qb.id,
          basePriceCents: baseCents,
          productId, qty,
        };
      }
    }
  }

  // 6. Standard wholesale price (only if explicitly set)
  if (product.wholesalePriceCents != null && product.wholesalePriceCents > 0) {
    return {
      unitCents: product.wholesalePriceCents,
      totalCents: product.wholesalePriceCents * qty,
      source: 'standard_wholesale',
      sourceLabel: 'Standard wholesale price',
      basePriceCents: baseCents,
      productId, qty,
    };
  }

  // 7. No wholesale price — do not guess
  throw new Error(`No wholesale price configured for ${product.name}`);
}

/**
 * Check whether a wholesale customer/account can see/order a given product.
 */
export async function canCustomerAccessProduct(
  product: typeof productsTable.$inferSelect,
  ctx: { customerId: string; tierId?: string | null }
): Promise<{ ok: boolean; reason?: string }> {
  if (!product.isActive)              return { ok: false, reason: 'Inactive' };
  if (!product.isWholesaleAvailable)  return { ok: false, reason: 'Not wholesale available' };

  const mode = product.wholesaleAccessMode ?? 'all';
  if (mode === 'all') return { ok: true };
  if (mode === 'hidden') return { ok: false, reason: 'Hidden from wholesale' };
  if (mode === 'tiers') {
    const allowed: string[] = product.wholesaleAllowedTierIds
      ? safeJsonArr(product.wholesaleAllowedTierIds) : [];
    if (!ctx.tierId || !allowed.includes(ctx.tierId)) return { ok: false, reason: 'Not in allowed tier' };
    return { ok: true };
  }
  if (mode === 'customers') {
    const allowed: string[] = product.wholesaleAllowedCustomerIds
      ? safeJsonArr(product.wholesaleAllowedCustomerIds) : [];
    if (!allowed.includes(ctx.customerId)) return { ok: false, reason: 'Not allowed for this customer' };
    return { ok: true };
  }
  return { ok: true };
}

function safeJsonArr(s: string): string[] {
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
}

/**
 * Batch version of calculateWholesalePrice for listing/browsing many products at once
 * (e.g. the wholesale catalog screen). Mirrors the exact same priority order as
 * calculateWholesalePrice, but loads all customer-pricing and quantity-break rows for
 * the whole product set in a handful of queries instead of ~5 sequential queries PER
 * product. Order placement still uses calculateWholesalePrice per-line (small, and
 * must independently re-verify each line at submit time) — this bulk path is for
 * read-only display where products/qty are already known and trusted server-side.
 */
export async function calculateWholesalePricesBulk(
  requests: Array<{ product: typeof productsTable.$inferSelect; qty: number }>,
  ctx: { customerId: string; tierId?: string | null },
): Promise<Map<string, PriceResult | { error: string }>> {
  const { customerId, tierId } = ctx;
  const results = new Map<string, PriceResult | { error: string }>();
  if (requests.length === 0) return results;

  const productIds = requests.map((r) => r.product.id);
  const categories = [...new Set(requests.map((r) => r.product.category).filter((c): c is string => !!c))];

  const [customerProductPrices, customerCategoryPrices, customerQtyBreaks, tierQtyBreaks] = await Promise.all([
    db.select().from(customerPricingTable).where(and(
      eq(customerPricingTable.customerId, customerId),
      inArray(customerPricingTable.productId, productIds),
      eq(customerPricingTable.isActive, true),
    )).orderBy(desc(customerPricingTable.createdAt)),
    categories.length > 0
      ? db.select().from(customerPricingTable).where(and(
          eq(customerPricingTable.customerId, customerId),
          inArray(customerPricingTable.category, categories),
          isNull(customerPricingTable.productId),
          eq(customerPricingTable.isActive, true),
        )).orderBy(desc(customerPricingTable.createdAt))
      : Promise.resolve([]),
    db.select().from(quantityPriceBreaksTable).where(and(
      inArray(quantityPriceBreaksTable.productId, productIds),
      eq(quantityPriceBreaksTable.scope, 'customer'),
      eq(quantityPriceBreaksTable.customerId, customerId),
      eq(quantityPriceBreaksTable.isActive, true),
    )).orderBy(desc(quantityPriceBreaksTable.minQty), desc(quantityPriceBreaksTable.createdAt)),
    tierId
      ? db.select().from(quantityPriceBreaksTable).where(and(
          inArray(quantityPriceBreaksTable.productId, productIds),
          eq(quantityPriceBreaksTable.scope, 'tier'),
          eq(quantityPriceBreaksTable.tierId, tierId),
          eq(quantityPriceBreaksTable.isActive, true),
        )).orderBy(desc(quantityPriceBreaksTable.minQty), desc(quantityPriceBreaksTable.createdAt))
      : Promise.resolve([]),
  ]);

  const groupBy = <T, K>(rows: T[], keyFn: (row: T) => K | null | undefined): Map<K, T[]> => {
    const map = new Map<K, T[]>();
    for (const row of rows) {
      const key = keyFn(row);
      if (key == null) continue;
      const arr = map.get(key);
      if (arr) arr.push(row); else map.set(key, [row]);
    }
    return map;
  };

  const productPricesByProduct = groupBy(customerProductPrices, (r) => r.productId);
  const categoryPricesByCategory = groupBy(customerCategoryPrices, (r) => r.category);
  const customerQtyBreaksByProduct = groupBy(customerQtyBreaks, (r) => r.productId);
  const tierQtyBreaksByProduct = groupBy(tierQtyBreaks, (r) => r.productId);

  for (const { product, qty } of requests) {
    try {
      if (qty <= 0) throw new Error(`Invalid quantity for product ${product.id}`);
      if (!product.isActive)             throw new Error(`Product unavailable: ${product.name}`);
      if (!product.isWholesaleAvailable) throw new Error(`Not wholesale available: ${product.name}`);
      if (product.isSoldOut)             throw new Error(`Sold out: ${product.name}`);

      const baseCents = product.wholesalePriceCents ?? product.priceCents;

      const productPrice = (productPricesByProduct.get(product.id) ?? []).find((cp) => cp.unitPriceCents != null);
      if (productPrice) {
        results.set(product.id, {
          unitCents: productPrice.unitPriceCents!,
          totalCents: productPrice.unitPriceCents! * qty,
          source: 'customer_product_price',
          sourceLabel: 'Custom customer price',
          sourceId: productPrice.id,
          basePriceCents: baseCents,
          productId: product.id, qty,
        });
        continue;
      }

      if (product.category) {
        const categoryPrice = (categoryPricesByCategory.get(product.category) ?? []).find((cp) => cp.unitPriceCents != null);
        if (categoryPrice) {
          results.set(product.id, {
            unitCents: categoryPrice.unitPriceCents!,
            totalCents: categoryPrice.unitPriceCents! * qty,
            source: 'customer_category_price',
            sourceLabel: 'Custom category price',
            sourceId: categoryPrice.id,
            basePriceCents: baseCents,
            productId: product.id, qty,
          });
          continue;
        }
      }

      const customerQtyBreak = (customerQtyBreaksByProduct.get(product.id) ?? [])
        .filter((qb) => qb.minQty <= qty && (qb.maxQty == null || qb.maxQty >= qty) && qb.unitPriceCents != null)[0];
      if (customerQtyBreak) {
        results.set(product.id, {
          unitCents: customerQtyBreak.unitPriceCents!,
          totalCents: customerQtyBreak.unitPriceCents! * qty,
          source: 'quantity_break_customer',
          sourceLabel: `Qty break (${customerQtyBreak.minQty}+)`,
          sourceId: customerQtyBreak.id,
          basePriceCents: baseCents,
          productId: product.id, qty,
        });
        continue;
      }

      if (tierId) {
        const tierQtyBreak = (tierQtyBreaksByProduct.get(product.id) ?? [])
          .filter((qb) => qb.minQty <= qty && (qb.maxQty == null || qb.maxQty >= qty) && qb.unitPriceCents != null)[0];
        if (tierQtyBreak) {
          results.set(product.id, {
            unitCents: tierQtyBreak.unitPriceCents!,
            totalCents: tierQtyBreak.unitPriceCents! * qty,
            source: 'quantity_break_tier',
            sourceLabel: `Tier qty break (${tierQtyBreak.minQty}+)`,
            sourceId: tierQtyBreak.id,
            basePriceCents: baseCents,
            productId: product.id, qty,
          });
          continue;
        }
      }

      if (product.wholesalePriceCents != null && product.wholesalePriceCents > 0) {
        results.set(product.id, {
          unitCents: product.wholesalePriceCents,
          totalCents: product.wholesalePriceCents * qty,
          source: 'standard_wholesale',
          sourceLabel: 'Standard wholesale price',
          basePriceCents: baseCents,
          productId: product.id, qty,
        });
        continue;
      }

      throw new Error(`No wholesale price configured for ${product.name}`);
    } catch (err: any) {
      results.set(product.id, { error: err?.message ?? 'Unable to calculate price' });
    }
  }

  return results;
}

/**
 * Load pricing context for a wholesale account.
 */
export async function loadPriceContextForAccount(userId: string): Promise<{
  accountId: string;
  customerId: string;
  tierId: string | null;
  customPricingEnabled: boolean;
  isSuspended: boolean;
  status: string;
  minOrderCents: number;
} | null> {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId));
  if (!account) return null;
  return {
    accountId: account.id,
    customerId: userId,
    tierId: account.tierId ?? null,
    customPricingEnabled: true, // always enabled — pricing rules always apply when set
    isSuspended: account.isSuspended,
    status: account.status,
    minOrderCents: account.minOrderCents ?? 0,
  };
}

/**
 * Validate and price a full wholesale order. Returns server-computed totals.
 * Throws on any rule violation. NEVER trust client totals.
 */
export async function priceAndValidateOrder(
  userId: string,
  items: Array<{ productId: string; qty: number; manualOverrideCents?: number | null }>,
  opts: { allowOverrides: boolean }
): Promise<{
  lines: PriceResult[];
  subtotalCents: number;
  totalCents: number;
  warnings: string[];
}> {
  const ctx = await loadPriceContextForAccount(userId);
  if (!ctx) throw new Error('Wholesale account not found');
  if (ctx.isSuspended) throw new Error('Account is suspended');
  if (ctx.status !== 'approved') throw new Error('Account is not approved');

  let tier: typeof pricingTiersTable.$inferSelect | undefined;
  if (ctx.tierId) {
    const [t] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, ctx.tierId));
    tier = t;
  }

  if (!Array.isArray(items) || items.length === 0) throw new Error('Order has no items');

  const warnings: string[] = [];
  const lines: PriceResult[] = [];
  let subtotalCents = 0;

  for (const it of items) {
    if (!it.productId || typeof it.qty !== 'number' || it.qty <= 0) {
      throw new Error('Invalid line item');
    }
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, it.productId));
    if (!product) throw new Error(`Product not found: ${it.productId}`);

    const access = await canCustomerAccessProduct(product, { customerId: userId, tierId: ctx.tierId });
    if (!access.ok) throw new Error(`Cannot order ${product.name}: ${access.reason}`);

    if (product.minOrderQty && it.qty < product.minOrderQty) {
      throw new Error(`${product.name} minimum quantity is ${product.minOrderQty}`);
    }
    if (product.maxOrderQty && it.qty > product.maxOrderQty) {
      throw new Error(`${product.name} maximum quantity is ${product.maxOrderQty}`);
    }
    if (product.wholesaleMaxQtyPerCustomer && it.qty > product.wholesaleMaxQtyPerCustomer) {
      throw new Error(`${product.name} limited to ${product.wholesaleMaxQtyPerCustomer} per customer`);
    }

    const result = await calculateWholesalePrice({
      productId: it.productId,
      qty: it.qty,
      customerId: userId,
      accountId: ctx.accountId,
      tierId: ctx.tierId,
      manualOverrideCents: opts.allowOverrides ? (it.manualOverrideCents ?? null) : null,
    });
    lines.push(result);
    subtotalCents += result.totalCents;
  }

  // Minimum order check — account-level override takes priority over tier default
  const effectiveMinOrderCents = ctx.minOrderCents > 0
    ? ctx.minOrderCents
    : (tier?.minOrderCents ?? 0);
  if (effectiveMinOrderCents > 0 && subtotalCents < effectiveMinOrderCents) {
    throw new Error(`Order below minimum of $${(effectiveMinOrderCents / 100).toFixed(2)} AUD`);
  }
  if (tier && tier.minOrderQty > 0) {
    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    if (totalQty < tier.minOrderQty) {
      throw new Error(`Order below tier minimum quantity of ${tier.minOrderQty}`);
    }
  }

  return { lines, subtotalCents, totalCents: subtotalCents, warnings };
}
