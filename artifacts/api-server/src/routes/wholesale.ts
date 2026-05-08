import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, productsTable, pricingTiersTable,
} from '@workspace/db';
import { eq, desc, asc } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import {
  calculateWholesalePrice,
  canCustomerAccessProduct,
  loadPriceContextForAccount,
  priceAndValidateOrder,
} from '../lib/wholesalePricing.js';

const router = Router();
router.use(requireRole('wholesale'));

router.get('/account', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  let tier: any = null;
  if (account.tierId) {
    const [t] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, account.tierId));
    tier = t ?? null;
  }
  return res.json({ data: { ...account, tier } });
});

// Alias kept for client compatibility
router.get('/profile', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  let tier: any = null;
  if (account.tierId) {
    const [t] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, account.tierId));
    tier = t ?? null;
  }
  return res.json({ data: { ...account, tier } });
});

// Tier-aware catalog: returns only products this customer can access,
// with the secure unit price computed for qty=1.
router.get('/catalog', async (req, res) => {
  const ctx = await loadPriceContextForAccount(req.user!.id);
  if (!ctx) return res.status(404).json({ error: 'Account not found' });
  if (ctx.isSuspended) return res.status(403).json({ error: 'Your account is suspended.' });

  const products = await db.select().from(productsTable)
    .where(eq(productsTable.isActive, true))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.name));

  const out: any[] = [];
  for (const p of products) {
    const access = await canCustomerAccessProduct(p, { customerId: req.user!.id, tierId: ctx.tierId });
    if (!access.ok) continue;
    let unitPriceCents: number | null = null;
    let priceSource: string | null = null;
    let priceLabel: string | null = null;
    try {
      const price = await calculateWholesalePrice({
        productId: p.id, qty: Math.max(p.minOrderQty ?? 1, 1),
        customerId: req.user!.id,
        accountId: ctx.accountId,
        tierId: ctx.tierId,
        customPricingEnabled: ctx.customPricingEnabled,
      });
      unitPriceCents = price.unitCents;
      priceSource = price.source;
      priceLabel = price.sourceLabel;
    } catch {
      // skip products with no valid wholesale price
      continue;
    }
    out.push({
      id: p.id,
      name: p.name,
      description: p.description,
      shortDescription: p.shortDescription,
      category: p.category,
      imageUrl: p.imageUrl,
      images: p.imageUrl ? [p.imageUrl] : [],
      unitPriceCents,
      basePriceCents: p.wholesalePriceCents ?? p.priceCents,
      priceSource,
      priceLabel,
      gstIncluded: p.gstIncluded,
      minOrderQty: p.minOrderQty,
      maxOrderQty: p.maxOrderQty,
      isSoldOut: p.isSoldOut,
      isComingSoon: p.isComingSoon,
      requiresApproval: p.wholesaleRequiresApproval,
      orderByRequest: p.wholesaleOrderByRequest,
      tags: p.tags ? safeParseJson(p.tags) : [],
      allergens: p.allergens ? safeParseJson(p.allergens) : [],
      dietaryTags: p.dietaryTags ? safeParseJson(p.dietaryTags) : [],
      // legacy compat fields
      prices: [{ id: p.stripePriceId ?? p.id, unit_amount: unitPriceCents, currency: 'aud' }],
      active: true,
    });
  }
  return res.json({ data: out });
});

// Legacy alias
router.get('/products', (req, res) => res.redirect(307, '/api/wholesale/catalog'));

router.get('/orders', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const orders = await db.select().from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.accountId, account.id))
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  return res.json({ data: orders });
});

router.get('/orders/:id', async (req, res) => {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // Customers can only see their own orders
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account || order.accountId !== account.id) return res.status(403).json({ error: 'Forbidden' });
  return res.json({ data: order });
});

router.get('/invoices', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const orders = await db.select().from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.accountId, account.id))
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  return res.json({ data: orders });
});

// SECURE order placement — server prices everything from scratch, ignores client totals.
router.post('/orders', async (req, res) => {
  const { items, poReference, notes, deliveryType, scheduledDate } = req.body ?? {};
  try {
    // Prices ENTIRELY computed on server — never trust client totals.
    const priced = await priceAndValidateOrder(req.user!.id, items, { allowOverrides: false });
    const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const itemsWithNames = await Promise.all(priced.lines.map(async (l) => {
      const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, l.productId));
      return {
        productId: l.productId,
        productName: product?.name ?? 'Unknown Product',
        qty: l.qty,
        unitPriceCents: l.unitCents,
        totalCents: l.totalCents,
        priceSource: l.source,
        priceLabel: l.sourceLabel,
      };
    }));

    const [order] = await db.insert(wholesaleOrdersTable).values({
      id: randomUUID(),
      accountId: account.id,
      userId: req.user!.id,
      status: 'pending',
      poReference: poReference ?? null,
      items: itemsWithNames as any,
      notes: notes ?? null,
      totalCents: priced.totalCents,
      deliveryType: deliveryType ?? 'pickup',
      scheduledDate: scheduledDate ?? null,
    }).returning();
    return res.status(201).json({ data: { ...order, pricing: priced } });
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Order validation failed' });
  }
});

function safeParseJson(s: string): any[] {
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
}

export default router;
