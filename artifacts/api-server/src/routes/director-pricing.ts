import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db,
  pricingTiersTable,
  quantityPriceBreaksTable,
  customerPricingTable,
  wholesaleAccountsTable,
  productsTable,
} from '@workspace/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { calculateWholesalePrice, loadPriceContextForAccount } from '../lib/wholesalePricing.js';

const router = Router();
// Director-only on every endpoint here
router.use(requireRole('director'));

// ── Pricing tiers CRUD ───────────────────────────────────────────────────────
router.get('/tiers', async (_req, res) => {
  const tiers = await db.select().from(pricingTiersTable).orderBy(pricingTiersTable.sortOrder, pricingTiersTable.name);
  return res.json({ data: tiers });
});

router.get('/tiers/:id', async (req, res) => {
  const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, req.params.id));
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  return res.json({ data: tier });
});

router.post('/tiers', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Tier name is required.' });
  const [tier] = await db.insert(pricingTiersTable).values({
    id: randomUUID(),
    name: b.name.trim(),
    description: b.description ?? '',
    status: b.status ?? 'active',
    defaultDiscountPct: b.defaultDiscountPct ?? 0,
    minOrderCents: b.minOrderCents ?? 0,
    minOrderQty: b.minOrderQty ?? 0,
    weeklyOrderVolumeCents: b.weeklyOrderVolumeCents ?? null,
    monthlyOrderVolumeCents: b.monthlyOrderVolumeCents ?? null,
    paymentTerms: b.paymentTerms ?? 'net14',
    deliveryEnabled: b.deliveryEnabled ?? true,
    pickupEnabled: b.pickupEnabled ?? true,
    freeDeliveryThresholdCents: b.freeDeliveryThresholdCents ?? null,
    cutOffTime: b.cutOffTime ?? '12:00',
    leadTimeDays: b.leadTimeDays ?? 2,
    productAccessRule: b.productAccessRule ?? 'all',
    allowedProductIds: b.allowedProductIds ? JSON.stringify(b.allowedProductIds) : null,
    allowedCategories: b.allowedCategories ? JSON.stringify(b.allowedCategories) : null,
    requiresApproval: b.requiresApproval ?? false,
    notes: b.notes ?? null,
    internalNotes: b.internalNotes ?? null,
    sortOrder: b.sortOrder ?? 0,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: tier });
});

router.patch('/tiers/:id', async (req, res) => {
  const b = req.body ?? {};
  const allowed = [
    'name','description','status','defaultDiscountPct','minOrderCents','minOrderQty',
    'weeklyOrderVolumeCents','monthlyOrderVolumeCents','paymentTerms',
    'deliveryEnabled','pickupEnabled','freeDeliveryThresholdCents',
    'cutOffTime','leadTimeDays','productAccessRule',
    'requiresApproval','notes','internalNotes','sortOrder',
  ] as const;
  const updates: Record<string, any> = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
  if (b.allowedProductIds !== undefined) updates.allowedProductIds = b.allowedProductIds ? JSON.stringify(b.allowedProductIds) : null;
  if (b.allowedCategories !== undefined) updates.allowedCategories = b.allowedCategories ? JSON.stringify(b.allowedCategories) : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [tier] = await db.update(pricingTiersTable).set(updates).where(eq(pricingTiersTable.id, req.params.id)).returning();
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  return res.json({ data: tier });
});

router.delete('/tiers/:id', async (req, res) => {
  // Soft archive — never hard delete (preserves price history)
  const [tier] = await db.update(pricingTiersTable)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(pricingTiersTable.id, req.params.id))
    .returning();
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  return res.json({ success: true, data: tier });
});

// ── Quantity price breaks ────────────────────────────────────────────────────
router.get('/quantity-breaks', async (req, res) => {
  const { productId, tierId, customerId } = req.query;
  const conds: any[] = [];
  if (productId) conds.push(eq(quantityPriceBreaksTable.productId, productId as string));
  if (tierId)    conds.push(eq(quantityPriceBreaksTable.tierId, tierId as string));
  if (customerId)conds.push(eq(quantityPriceBreaksTable.customerId, customerId as string));
  const breaks = await db.select().from(quantityPriceBreaksTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(quantityPriceBreaksTable.createdAt));
  return res.json({ data: breaks });
});

router.post('/quantity-breaks', async (req, res) => {
  const b = req.body ?? {};
  if (!b.productId) return res.status(400).json({ error: 'productId is required.' });
  if (typeof b.minQty !== 'number' || b.minQty < 1) return res.status(400).json({ error: 'minQty must be a positive number.' });
  if (b.unitPriceCents == null && b.discountPct == null) return res.status(400).json({ error: 'Provide unitPriceCents or discountPct.' });
  const scope = b.scope === 'customer' ? 'customer' : 'tier';
  if (scope === 'tier' && !b.tierId)        return res.status(400).json({ error: 'tierId required for tier scope.' });
  if (scope === 'customer' && !b.customerId)return res.status(400).json({ error: 'customerId required for customer scope.' });

  const [created] = await db.insert(quantityPriceBreaksTable).values({
    id: randomUUID(),
    productId: b.productId,
    scope,
    tierId: scope === 'tier' ? b.tierId : null,
    customerId: scope === 'customer' ? b.customerId : null,
    minQty: b.minQty,
    maxQty: b.maxQty ?? null,
    unitPriceCents: b.unitPriceCents ?? null,
    discountPct: b.discountPct ?? null,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    isActive: b.isActive ?? true,
    notes: b.notes ?? null,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: created });
});

router.patch('/quantity-breaks/:id', async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  for (const k of ['minQty','maxQty','unitPriceCents','discountPct','isActive','notes'] as const) {
    if (b[k] !== undefined) updates[k] = b[k];
  }
  if (b.startsAt !== undefined) updates.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt   !== undefined) updates.endsAt   = b.endsAt   ? new Date(b.endsAt)   : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(quantityPriceBreaksTable).set(updates).where(eq(quantityPriceBreaksTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Quantity break not found' });
  return res.json({ data: updated });
});

router.delete('/quantity-breaks/:id', async (req, res) => {
  // Soft archive — preserve history for past order audit trails
  const [updated] = await db.update(quantityPriceBreaksTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(quantityPriceBreaksTable.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Quantity break not found' });
  return res.json({ success: true, data: updated });
});

// ── Customer custom pricing ──────────────────────────────────────────────────
router.get('/customer-pricing', async (req, res) => {
  const { customerId } = req.query;
  const rows = await db.select().from(customerPricingTable)
    .where(customerId ? eq(customerPricingTable.customerId, customerId as string) : undefined)
    .orderBy(desc(customerPricingTable.createdAt));
  return res.json({ data: rows });
});

router.post('/customer-pricing', async (req, res) => {
  const b = req.body ?? {};
  if (!b.customerId) return res.status(400).json({ error: 'customerId is required.' });
  if (!b.productId && !b.category) return res.status(400).json({ error: 'productId or category is required.' });
  if (b.unitPriceCents == null && b.discountPct == null) return res.status(400).json({ error: 'Provide unitPriceCents or discountPct.' });

  const [created] = await db.insert(customerPricingTable).values({
    id: randomUUID(),
    customerId: b.customerId,
    productId: b.productId ?? null,
    category: b.category ?? null,
    unitPriceCents: b.unitPriceCents ?? null,
    discountPct: b.discountPct ?? null,
    startsAt: b.startsAt ? new Date(b.startsAt) : null,
    endsAt: b.endsAt ? new Date(b.endsAt) : null,
    isActive: b.isActive ?? true,
    notes: b.notes ?? null,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: created });
});

router.patch('/customer-pricing/:id', async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  for (const k of ['unitPriceCents','discountPct','isActive','notes'] as const) {
    if (b[k] !== undefined) updates[k] = b[k];
  }
  if (b.startsAt !== undefined) updates.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt   !== undefined) updates.endsAt   = b.endsAt   ? new Date(b.endsAt)   : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(customerPricingTable).set(updates).where(eq(customerPricingTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Custom price not found' });
  return res.json({ data: updated });
});

router.delete('/customer-pricing/:id', async (req, res) => {
  // Soft archive — preserve history for past order audit trails
  const [updated] = await db.update(customerPricingTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(customerPricingTable.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Custom price not found' });
  return res.json({ success: true, data: updated });
});

// ── Assign tier / suspend / custom-pricing flag on wholesale account ─────────
router.patch('/wholesale/:accountId/tier', async (req, res) => {
  const { tierId, customPricingEnabled } = req.body ?? {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (tierId !== undefined) updates.tierId = tierId || null;
  if (customPricingEnabled !== undefined) updates.customPricingEnabled = !!customPricingEnabled;
  if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'Nothing to update.' });
  const [updated] = await db.update(wholesaleAccountsTable).set(updates)
    .where(eq(wholesaleAccountsTable.id, req.params.accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  return res.json({ data: updated });
});

router.patch('/wholesale/:accountId/suspend', async (req, res) => {
  const { isSuspended, suspendedReason } = req.body ?? {};
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ isSuspended: !!isSuspended, suspendedReason: suspendedReason ?? null, updatedAt: new Date() })
    .where(eq(wholesaleAccountsTable.id, req.params.accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  return res.json({ data: updated });
});

// ── Product wholesale access controls ────────────────────────────────────────
router.patch('/products/:id/wholesale-access', async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (b.wholesaleAccessMode !== undefined) {
    if (!['all','tiers','customers','hidden'].includes(b.wholesaleAccessMode)) {
      return res.status(400).json({ error: 'Invalid access mode' });
    }
    updates.wholesaleAccessMode = b.wholesaleAccessMode;
  }
  if (b.wholesaleAllowedTierIds !== undefined)
    updates.wholesaleAllowedTierIds = b.wholesaleAllowedTierIds ? JSON.stringify(b.wholesaleAllowedTierIds) : null;
  if (b.wholesaleAllowedCustomerIds !== undefined)
    updates.wholesaleAllowedCustomerIds = b.wholesaleAllowedCustomerIds ? JSON.stringify(b.wholesaleAllowedCustomerIds) : null;
  if (b.wholesaleRequiresApproval !== undefined) updates.wholesaleRequiresApproval = !!b.wholesaleRequiresApproval;
  if (b.wholesaleMaxQtyPerCustomer !== undefined) updates.wholesaleMaxQtyPerCustomer = b.wholesaleMaxQtyPerCustomer ?? null;
  if (b.wholesaleOrderByRequest !== undefined) updates.wholesaleOrderByRequest = !!b.wholesaleOrderByRequest;
  if (b.isWholesaleAvailable !== undefined) updates.isWholesaleAvailable = !!b.isWholesaleAvailable;

  if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  return res.json({ data: updated });
});

// ── Pricing preview — show which rule applies for a product/customer/qty ─────
router.post('/pricing-preview', async (req, res) => {
  const { customerId, productId, qty } = req.body ?? {};
  if (!customerId || !productId || !qty) return res.status(400).json({ error: 'customerId, productId, qty required.' });
  try {
    const ctx = await loadPriceContextForAccount(customerId);
    if (!ctx) return res.status(404).json({ error: 'Customer wholesale account not found' });
    const result = await calculateWholesalePrice({
      productId, qty,
      customerId,
      accountId: ctx.accountId,
      tierId: ctx.tierId,
      customPricingEnabled: ctx.customPricingEnabled,
    });
    return res.json({ data: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
