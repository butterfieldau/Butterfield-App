import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, wholesaleOrdersTable, wholesaleAccountsTable, productsTable, pricingTiersTable,
  wholesaleCardsTable,
} from '@workspace/db';
import { eq, desc, asc, and } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { sendNotification } from '../lib/notificationService.js';
import {
  calculateWholesalePrice,
  canCustomerAccessProduct,
  loadPriceContextForAccount,
  priceAndValidateOrder,
} from '../lib/wholesalePricing.js';

const router = Router();
router.use(requireRole('wholesale'));

function getPublicBaseUrl(): string {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim())
    .find(Boolean);
  return domain ? `https://${domain}` : '';
}

function absolutizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = getPublicBaseUrl();
  if (/^https?:\/\//i.test(url)) {
    const storageMatch = url.match(/(\/api\/storage\/objects\/.+)/);
    if (storageMatch) return base ? `${base}${storageMatch[1]}` : storageMatch[1];
    return url;
  }
  if (!base) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

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
router.get('/profile', (_req, res) => res.redirect(307, '/api/wholesale/account'));

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
      imageUrl: absolutizeUrl(p.imageUrl),
      images: p.imageUrl ? [absolutizeUrl(p.imageUrl)].filter((v): v is string => !!v) : [],
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

    // Add the account's delivery fee if this is a delivery order
    const deliveryFeeCents = (deliveryType === 'delivery') ? (account.deliveryFeeCents ?? 0) : 0;
    const finalTotalCents  = priced.totalCents + deliveryFeeCents;

    const [order] = await db.insert(wholesaleOrdersTable).values({
      id: randomUUID(),
      accountId: account.id,
      userId: req.user!.id,
      status: 'pending',
      poReference: poReference ?? null,
      items: itemsWithNames as any,
      notes: notes ?? null,
      totalCents: finalTotalCents,
      deliveryType: deliveryType ?? 'pickup',
      scheduledDate: scheduledDate ?? null,
    }).returning();

    const itemCount = Array.isArray(itemsWithNames) ? itemsWithNames.reduce((sum, item) => sum + Math.max(1, Number(item.qty ?? 1) || 1), 0) : 1;
    void sendNotification({
      roles: ['manager', 'director', 'master'],
      type: 'new_wholesale_order',
      title: 'New Wholesale Order',
      body: `${account.companyName} · ${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(finalTotalCents / 100).toFixed(2)}`,
      data: { orderId: order.id, screen: '/(wholesale)/orders' },
    }).catch(() => {});

    return res.status(201).json({ data: { ...order, pricing: { ...priced, deliveryFeeCents, finalTotalCents } } });
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Order validation failed' });
  }
});

function safeParseJson(s: string): any[] {
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
}

// ── Wholesale Cards on File ───────────────────────────────────────────────────
async function getAccountForUser(userId: string) {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId));
  return account ?? null;
}

router.get('/cards', async (req, res) => {
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const cards = await db.select().from(wholesaleCardsTable)
    .where(eq(wholesaleCardsTable.accountId, account.id))
    .orderBy(wholesaleCardsTable.createdAt);
  return res.json({ data: cards });
});

router.post('/cards', async (req, res) => {
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const { nameOnCard, cardBrand, last4, expiry, isDefault } = req.body;
  if (!nameOnCard || !last4 || !expiry) return res.status(400).json({ error: 'nameOnCard, last4 and expiry are required.' });
  if (isDefault) {
    await db.update(wholesaleCardsTable).set({ isDefault: false }).where(eq(wholesaleCardsTable.accountId, account.id));
  }
  // If first card, make it default
  const existing = await db.select().from(wholesaleCardsTable).where(eq(wholesaleCardsTable.accountId, account.id));
  const makeDefault = isDefault || existing.length === 0;
  const [card] = await db.insert(wholesaleCardsTable).values({
    id: randomUUID(), accountId: account.id,
    nameOnCard, cardBrand: cardBrand ?? 'Visa', last4, expiry, isDefault: makeDefault,
  }).returning();
  return res.status(201).json({ data: card });
});

router.patch('/cards/:id', async (req, res) => {
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const { nameOnCard, cardBrand, last4, expiry, isDefault } = req.body;
  const updates: Record<string, any> = {};
  if (nameOnCard !== undefined) updates.nameOnCard = nameOnCard;
  if (cardBrand   !== undefined) updates.cardBrand  = cardBrand;
  if (last4       !== undefined) updates.last4       = last4;
  if (expiry      !== undefined) updates.expiry      = expiry;
  if (isDefault) {
    await db.update(wholesaleCardsTable).set({ isDefault: false }).where(eq(wholesaleCardsTable.accountId, account.id));
    updates.isDefault = true;
  }
  const [updated] = await db.update(wholesaleCardsTable).set(updates)
    .where(and(eq(wholesaleCardsTable.id, req.params.id), eq(wholesaleCardsTable.accountId, account.id)))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Card not found' });
  return res.json({ data: updated });
});

router.delete('/cards/:id', async (req, res) => {
  const account = await getAccountForUser(req.user!.id);
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  const [deleted] = await db.delete(wholesaleCardsTable)
    .where(and(eq(wholesaleCardsTable.id, req.params.id), eq(wholesaleCardsTable.accountId, account.id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: 'Card not found' });
  // If deleted was default and there are remaining cards, make newest default
  if (deleted.isDefault) {
    const [remaining] = await db.select().from(wholesaleCardsTable)
      .where(eq(wholesaleCardsTable.accountId, account.id)).orderBy(desc(wholesaleCardsTable.createdAt)).limit(1);
    if (remaining) await db.update(wholesaleCardsTable).set({ isDefault: true }).where(eq(wholesaleCardsTable.id, remaining.id));
  }
  return res.json({ success: true });
});

export default router;
