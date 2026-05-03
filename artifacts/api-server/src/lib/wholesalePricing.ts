import {
  db,
  productsTable,
  pricingTiersTable,
  quantityPriceBreaksTable,
  customerPricingTable,
  wholesaleAccountsTable,
} from '@workspace/db';
import { and, eq, lte, gte, isNull, or, desc, sql } from 'drizzle-orm';

export type PriceSource =
  | 'manual_override'
  | 'customer_product_price'
  | 'customer_category_price'
  | 'quantity_break_customer'
  | 'quantity_break_tier'
  | 'tier_default_discount'
  | 'standard_wholesale'
  | 'none';

export interface PriceResult {
  unitCents: number;
  totalCents: number;
  source: PriceSource;
  sourceLabel: string;
  sourceId?: string;
  basePriceCents: number;
  discountPct?: number;
  productId: string;
  qty: number;
}

export interface PriceContext {
  productId: string;
  qty: number;
  customerId: string;          // wholesale user id
  accountId: string;           // wholesale account id
  tierId?: string | null;
  customPricingEnabled: boolean;
  manualOverrideCents?: number | null;
}

function applyDiscount(baseCents: number, pct: number | null | undefined): number {
  if (!pct || pct <= 0) return baseCents;
  return Math.round(baseCents * (1 - pct / 100));
}

/**
 * Securely calculate the wholesale unit price for one line.
 * Priority:
 *   1. Manual override
 *   2. Customer-specific product price
 *   3. Customer-specific category price
 *   4. Quantity break (customer scope)
 *   5. Quantity break (tier scope)
 *   6. Tier default discount on standard wholesale
 *   7. Standard wholesale price
 *   8. Error if none
 */
export async function calculateWholesalePrice(ctx: PriceContext): Promise<PriceResult> {
  const { productId, qty, customerId, tierId, customPricingEnabled, manualOverrideCents } = ctx;

  if (qty <= 0) throw new Error(`Invalid quantity for product ${productId}`);

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) throw new Error(`Product not found: ${productId}`);
  if (!product.isActive)         throw new Error(`Product unavailable: ${product.name}`);
  if (!product.isWholesaleAvailable) throw new Error(`Not wholesale available: ${product.name}`);
  if (product.isSoldOut)         throw new Error(`Sold out: ${product.name}`);

  const baseCents = product.wholesalePriceCents ?? product.priceCents;

  // 1. Manual override
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

  const now = new Date();
  const dateActive = (startsAt: Date | null, endsAt: Date | null) =>
    (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);

  // 2. Customer product-specific price (only if custom pricing enabled)
  if (customPricingEnabled) {
    // Deterministic order: most recently created rule wins among overlapping active rules.
    const customerProductPrices = await db.select().from(customerPricingTable).where(and(
      eq(customerPricingTable.customerId, customerId),
      eq(customerPricingTable.productId, productId),
      eq(customerPricingTable.isActive, true),
    )).orderBy(desc(customerPricingTable.createdAt));
    for (const cp of customerProductPrices) {
      if (!dateActive(cp.startsAt, cp.endsAt)) continue;
      if (cp.unitPriceCents != null) {
        return {
          unitCents: cp.unitPriceCents,
          totalCents: cp.unitPriceCents * qty,
          source: 'customer_product_price',
          sourceLabel: 'Customer-specific price',
          sourceId: cp.id,
          basePriceCents: baseCents,
          productId, qty,
        };
      }
      if (cp.discountPct != null) {
        const unit = applyDiscount(baseCents, cp.discountPct);
        return {
          unitCents: unit,
          totalCents: unit * qty,
          source: 'customer_product_price',
          sourceLabel: `Customer ${cp.discountPct}% off`,
          sourceId: cp.id,
          discountPct: cp.discountPct,
          basePriceCents: baseCents,
          productId, qty,
        };
      }
    }

    // 3. Customer category price
    if (product.category) {
      const customerCategoryPrices = await db.select().from(customerPricingTable).where(and(
        eq(customerPricingTable.customerId, customerId),
        eq(customerPricingTable.category, product.category),
        isNull(customerPricingTable.productId),
        eq(customerPricingTable.isActive, true),
      )).orderBy(desc(customerPricingTable.createdAt));
      for (const cp of customerCategoryPrices) {
        if (!dateActive(cp.startsAt, cp.endsAt)) continue;
        if (cp.discountPct != null) {
          const unit = applyDiscount(baseCents, cp.discountPct);
          return {
            unitCents: unit,
            totalCents: unit * qty,
            source: 'customer_category_price',
            sourceLabel: `Customer category ${cp.discountPct}% off`,
            sourceId: cp.id,
            discountPct: cp.discountPct,
            basePriceCents: baseCents,
            productId, qty,
          };
        }
      }
    }
  }

  // 4. Quantity break (customer scope) — pick highest minQty band that fits qty,
  // tiebreak by most recently created (deterministic).
  const customerQtyBreaks = await db.select().from(quantityPriceBreaksTable).where(and(
    eq(quantityPriceBreaksTable.productId, productId),
    eq(quantityPriceBreaksTable.scope, 'customer'),
    eq(quantityPriceBreaksTable.customerId, customerId),
    eq(quantityPriceBreaksTable.isActive, true),
    lte(quantityPriceBreaksTable.minQty, qty),
    or(isNull(quantityPriceBreaksTable.maxQty), gte(quantityPriceBreaksTable.maxQty, qty)),
  )).orderBy(desc(quantityPriceBreaksTable.minQty), desc(quantityPriceBreaksTable.createdAt));
  for (const qb of customerQtyBreaks) {
    if (!dateActive(qb.startsAt, qb.endsAt)) continue;
    const unit = qb.unitPriceCents ?? applyDiscount(baseCents, qb.discountPct);
    return {
      unitCents: unit,
      totalCents: unit * qty,
      source: 'quantity_break_customer',
      sourceLabel: `Customer qty break (${qb.minQty}+)`,
      sourceId: qb.id,
      discountPct: qb.discountPct ?? undefined,
      basePriceCents: baseCents,
      productId, qty,
    };
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
      if (!dateActive(qb.startsAt, qb.endsAt)) continue;
      const unit = qb.unitPriceCents ?? applyDiscount(baseCents, qb.discountPct);
      return {
        unitCents: unit,
        totalCents: unit * qty,
        source: 'quantity_break_tier',
        sourceLabel: `Tier qty break (${qb.minQty}+)`,
        sourceId: qb.id,
        discountPct: qb.discountPct ?? undefined,
        basePriceCents: baseCents,
        productId, qty,
      };
    }
  }

  // 6. Tier default discount
  if (tierId) {
    const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, tierId));
    if (tier && tier.status === 'active' && tier.defaultDiscountPct > 0) {
      const unit = applyDiscount(baseCents, tier.defaultDiscountPct);
      return {
        unitCents: unit,
        totalCents: unit * qty,
        source: 'tier_default_discount',
        sourceLabel: `${tier.name} tier (${tier.defaultDiscountPct}% off)`,
        sourceId: tier.id,
        discountPct: tier.defaultDiscountPct,
        basePriceCents: baseCents,
        productId, qty,
      };
    }
  }

  // 7. Standard wholesale price (only if defined)
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

  // 8. No valid wholesale price — error
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
 * Load pricing context for a wholesale account.
 */
export async function loadPriceContextForAccount(userId: string): Promise<{
  accountId: string;
  customerId: string;
  tierId: string | null;
  customPricingEnabled: boolean;
  isSuspended: boolean;
  status: string;
} | null> {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId));
  if (!account) return null;
  return {
    accountId: account.id,
    customerId: userId,
    tierId: account.tierId ?? null,
    customPricingEnabled: account.customPricingEnabled,
    isSuspended: account.isSuspended,
    status: account.status,
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

  // Tier check
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
      customPricingEnabled: ctx.customPricingEnabled,
      manualOverrideCents: opts.allowOverrides ? (it.manualOverrideCents ?? null) : null,
    });
    lines.push(result);
    subtotalCents += result.totalCents;
  }

  // Tier minimum order check
  if (tier && tier.minOrderCents > 0 && subtotalCents < tier.minOrderCents) {
    throw new Error(`Order below tier minimum of $${(tier.minOrderCents / 100).toFixed(2)}`);
  }
  if (tier && tier.minOrderQty > 0) {
    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    if (totalQty < tier.minOrderQty) {
      throw new Error(`Order below tier minimum quantity of ${tier.minOrderQty}`);
    }
  }

  return { lines, subtotalCents, totalCents: subtotalCents, warnings };
}
