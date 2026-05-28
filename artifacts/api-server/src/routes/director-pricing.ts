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
import { eq, desc, and, ne, isNull, or } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { calculateWholesalePrice, loadPriceContextForAccount } from '../lib/wholesalePricing.js';

const router = Router();

// Wholesale pricing management: director and master only.
// Apply role check per-route (not globally) so that requests destined for
// other /director routers can pass through without being blocked here.
const directorOnly = requireRole('director', 'master');

// ── Pricing tiers CRUD ───────────────────────────────────────────────────────

router.get('/tiers', directorOnly, async (_req, res) => {
  const tiers = await db.select().from(pricingTiersTable)
    .where(ne(pricingTiersTable.status, 'archived'))
    .orderBy(pricingTiersTable.sortOrder, pricingTiersTable.name);
  return res.json({ data: tiers });
});

router.get('/tiers/:id', directorOnly, async (req, res) => {
  const [tier] = await db.select().from(pricingTiersTable).where(eq(pricingTiersTable.id, req.params.id));
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  return res.json({ data: tier });
});

router.post('/tiers', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Tier name is required.' });
  const [tier] = await db.insert(pricingTiersTable).values({
    id: randomUUID(),
    name: b.name.trim(),
    description: b.description ?? '',
    status: b.status === 'inactive' ? 'inactive' : 'active',
    defaultDiscountPct: 0,
    minOrderCents: 0,
    minOrderQty: 0,
    paymentTerms: 'net14',
    deliveryEnabled: true,
    pickupEnabled: true,
    cutOffTime: '12:00',
    leadTimeDays: 2,
    productAccessRule: 'all',
    requiresApproval: false,
    sortOrder: 0,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: tier });
});

router.patch('/tiers/:id', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  if (b.name !== undefined) updates.name = b.name.trim();
  if (b.description !== undefined) updates.description = b.description;
  if (b.status !== undefined) {
    if (!['active', 'inactive'].includes(b.status)) return res.status(400).json({ error: 'Status must be active or inactive.' });
    updates.status = b.status;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [tier] = await db.update(pricingTiersTable).set(updates)
    .where(eq(pricingTiersTable.id, req.params.id)).returning();
  if (!tier) return res.status(404).json({ error: 'Tier not found' });
  return res.json({ data: tier });
});

// Delete a tier — automatically unassigns all customers from that tier first
router.delete('/tiers/:id', directorOnly, async (req, res) => {
  const { force } = req.body ?? {};

  // Count how many wholesale accounts are on this tier
  const assigned = await db.select().from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.tierId, req.params.id));

  if (assigned.length > 0 && !force) {
    return res.status(409).json({
      error: `${assigned.length} customer${assigned.length !== 1 ? 's are' : ' is'} assigned to this tier.`,
      assignedCount: assigned.length,
      canForce: true,
    });
  }

  // Unassign all customers from this tier
  if (assigned.length > 0) {
    await db.update(wholesaleAccountsTable)
      .set({ tierId: null, updatedAt: new Date() })
      .where(eq(wholesaleAccountsTable.tierId, req.params.id));
  }

  // Archive the tier (preserve for order audit trail)
  const [tier] = await db.update(pricingTiersTable)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(pricingTiersTable.id, req.params.id))
    .returning();
  if (!tier) return res.status(404).json({ error: 'Tier not found' });

  return res.json({ success: true, unassignedCount: assigned.length });
});

// ── Quantity price breaks CRUD ───────────────────────────────────────────────

router.get('/quantity-breaks', directorOnly, async (req, res) => {
  const { productId, tierId, customerId } = req.query;
  const conds: any[] = [eq(quantityPriceBreaksTable.isActive, true)];
  if (productId)  conds.push(eq(quantityPriceBreaksTable.productId, productId as string));
  if (tierId)     conds.push(eq(quantityPriceBreaksTable.tierId, tierId as string));
  if (customerId) conds.push(eq(quantityPriceBreaksTable.customerId, customerId as string));
  const breaks = await db.select().from(quantityPriceBreaksTable)
    .where(and(...conds))
    .orderBy(desc(quantityPriceBreaksTable.createdAt));
  return res.json({ data: breaks });
});

router.post('/quantity-breaks', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  if (!b.productId) return res.status(400).json({ error: 'productId is required.' });
  if (typeof b.minQty !== 'number' || b.minQty < 1) return res.status(400).json({ error: 'minQty must be a positive number.' });
  if (!b.unitPriceCents || b.unitPriceCents <= 0) return res.status(400).json({ error: 'unitPriceCents (price per unit) is required.' });
  const scope = b.scope === 'customer' ? 'customer' : 'tier';
  if (scope === 'tier' && !b.tierId)        return res.status(400).json({ error: 'tierId required for tier scope.' });
  if (scope === 'customer' && !b.customerId) return res.status(400).json({ error: 'customerId required for customer scope.' });

  const [created] = await db.insert(quantityPriceBreaksTable).values({
    id: randomUUID(),
    productId: b.productId,
    scope,
    tierId: scope === 'tier' ? b.tierId : null,
    customerId: scope === 'customer' ? b.customerId : null,
    minQty: b.minQty,
    maxQty: null,
    unitPriceCents: b.unitPriceCents,
    discountPct: null,
    isActive: b.isActive !== false,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: created });
});

router.patch('/quantity-breaks/:id', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  if (b.minQty !== undefined)       updates.minQty = b.minQty;
  if (b.unitPriceCents !== undefined) updates.unitPriceCents = b.unitPriceCents;
  if (b.isActive !== undefined)     updates.isActive = b.isActive;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(quantityPriceBreaksTable).set(updates)
    .where(eq(quantityPriceBreaksTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Quantity break not found' });
  return res.json({ data: updated });
});

// Hard delete — immediately removes from pricing; order history retains the priceSource label
router.delete('/quantity-breaks/:id', directorOnly, async (req, res) => {
  const [deleted] = await db.delete(quantityPriceBreaksTable)
    .where(eq(quantityPriceBreaksTable.id, req.params.id))
    .returning();
  if (!deleted) return res.status(404).json({ error: 'Quantity break not found' });
  return res.json({ success: true });
});

// ── Customer custom pricing CRUD ─────────────────────────────────────────────

router.get('/customer-pricing', directorOnly, async (req, res) => {
  const { customerId } = req.query;
  const conds: any[] = [eq(customerPricingTable.isActive, true)];
  if (customerId) conds.push(eq(customerPricingTable.customerId, customerId as string));
  const rows = await db.select().from(customerPricingTable)
    .where(and(...conds))
    .orderBy(desc(customerPricingTable.createdAt));
  return res.json({ data: rows });
});

router.post('/customer-pricing', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  if (!b.customerId) return res.status(400).json({ error: 'customerId is required.' });
  if (!b.productId)  return res.status(400).json({ error: 'productId is required.' });
  if (!b.unitPriceCents || b.unitPriceCents <= 0) return res.status(400).json({ error: 'unitPriceCents (price per unit) is required.' });

  const [created] = await db.insert(customerPricingTable).values({
    id: randomUUID(),
    customerId: b.customerId,
    productId: b.productId,
    category: null,
    unitPriceCents: b.unitPriceCents,
    discountPct: null,
    isActive: b.isActive !== false,
    createdBy: req.user!.id,
  }).returning();
  return res.status(201).json({ data: created });
});

router.patch('/customer-pricing/:id', directorOnly, async (req, res) => {
  const b = req.body ?? {};
  const updates: Record<string, any> = {};
  if (b.unitPriceCents !== undefined) updates.unitPriceCents = b.unitPriceCents;
  if (b.isActive !== undefined)      updates.isActive = b.isActive;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(customerPricingTable).set(updates)
    .where(eq(customerPricingTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Custom price not found' });
  return res.json({ data: updated });
});

// Hard delete — immediately removes from pricing; order history retains priceSource label
router.delete('/customer-pricing/:id', directorOnly, async (req, res) => {
  const [deleted] = await db.delete(customerPricingTable)
    .where(eq(customerPricingTable.id, req.params.id))
    .returning();
  if (!deleted) return res.status(404).json({ error: 'Custom price not found' });
  return res.json({ success: true });
});

// ── Assign / unassign tier on a wholesale account ────────────────────────────

router.patch('/wholesale/:accountId/tier', directorOnly, async (req, res) => {
  const { tierId } = req.body ?? {};
  const updates: Record<string, any> = { updatedAt: new Date() };
  updates.tierId = tierId || null;
  const [updated] = await db.update(wholesaleAccountsTable).set(updates)
    .where(eq(wholesaleAccountsTable.id, req.params.accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  return res.json({ data: updated });
});

router.patch('/wholesale/:accountId/suspend', directorOnly, async (req, res) => {
  const { isSuspended, suspendedReason } = req.body ?? {};
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ isSuspended: !!isSuspended, suspendedReason: suspendedReason ?? null, updatedAt: new Date() })
    .where(eq(wholesaleAccountsTable.id, req.params.accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Account not found' });
  return res.json({ data: updated });
});

// ── Product wholesale access controls ────────────────────────────────────────

router.patch('/products/:id/wholesale-access', directorOnly, async (req, res) => {
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
  if (b.isWholesaleAvailable !== undefined) updates.isWholesaleAvailable = !!b.isWholesaleAvailable;

  if (Object.keys(updates).length === 1) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Product not found' });
  return res.json({ data: updated });
});

// ── Pricing preview ───────────────────────────────────────────────────────────

router.post('/pricing-preview', directorOnly, async (req, res) => {
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
    });
    return res.json({ data: result });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
