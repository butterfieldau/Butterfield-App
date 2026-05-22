import { randomUUID } from 'crypto';
import { Router } from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, stockCategoriesTable, stockItemsTable } from '@workspace/db';
import { stockMovementsTable } from '@workspace/db/schema';
import { requireRole } from '../middlewares/auth.js';
import { sendNotification } from '../lib/notificationService.js';

const router = Router();

function isValidCategory(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function canEditAll(role?: string) {
  return role === 'director' || role === 'master';
}

async function ensureStockMovementTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id text PRIMARY KEY,
      stock_item_id text NOT NULL,
      action_type text NOT NULL,
      quantity_before real NOT NULL DEFAULT 0,
      quantity_after real NOT NULL DEFAULT 0,
      quantity_delta real NOT NULL DEFAULT 0,
      reason text,
      notes text,
      cost_impact_cents integer,
      target_stock_item_id text,
      performed_by_user_id text,
      performed_by_name text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
}

async function logMovement(params: {
  stockItemId: string;
  actionType: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  reason?: string | null;
  notes?: string | null;
  costImpactCents?: number | null;
  targetStockItemId?: string | null;
  performedByUserId?: string | null;
  performedByName?: string | null;
}) {
  await ensureStockMovementTable();
  await db.insert(stockMovementsTable).values({
    id: randomUUID(),
    stockItemId: params.stockItemId,
    actionType: params.actionType,
    quantityBefore: params.quantityBefore,
    quantityAfter: params.quantityAfter,
    quantityDelta: params.quantityDelta,
    reason: params.reason ?? null,
    notes: params.notes ?? null,
    costImpactCents: params.costImpactCents ?? null,
    targetStockItemId: params.targetStockItemId ?? null,
    performedByUserId: params.performedByUserId ?? null,
    performedByName: params.performedByName ?? null,
    createdAt: new Date(),
  });
}

function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];
  const headers = rows[0].split(',').map((h) => h.trim());
  return rows.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return headers.reduce<Record<string, string>>((acc, key, idx) => {
      acc[key] = cells[idx] ?? '';
      return acc;
    }, {});
  });
}

function toCsvValue(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

router.get('/categories', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const rows = await db.select().from(stockCategoriesTable).orderBy(asc(stockCategoriesTable.name));
  res.json({ data: rows.map((r) => ({ id: r.id, label: r.name })) });
});

router.post('/categories', requireRole('director', 'master'), async (req, res): Promise<void> => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const trimmed = name.trim();
  const id = trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!id) {
    res.status(400).json({ error: 'Invalid category name' });
    return;
  }

  const [existing] = await db.select({ id: stockCategoriesTable.id }).from(stockCategoriesTable).where(eq(stockCategoriesTable.id, id));
  if (existing) {
    res.status(409).json({ error: 'Category already exists' });
    return;
  }

  const now = new Date();
  await db.insert(stockCategoriesTable).values({ id, name: trimmed, createdAt: now });
  res.status(201).json({ data: { id, label: trimmed } });
});

router.delete('/categories/:id', requireRole('director', 'master'), async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(stockCategoriesTable).where(eq(stockCategoriesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stockItemsTable)
    .where(and(eq(stockItemsTable.category, id), eq(stockItemsTable.isActive, true)));

  if (count > 0) {
    res.status(409).json({ error: `Cannot delete: ${count} item${count > 1 ? 's' : ''} still use this category. Reassign them first.` });
    return;
  }

  await db.delete(stockCategoriesTable).where(eq(stockCategoriesTable.id, id));
  res.json({ data: { success: true } });
});

router.get('/items', requireRole('director', 'master', 'manager'), async (req, res) => {
  const fullAccess = canEditAll(req.user!.role);
  const includeInactive = String(req.query.includeInactive ?? 'false') === 'true';

  const rows = await db
    .select()
    .from(stockItemsTable)
    .where(includeInactive ? undefined : eq(stockItemsTable.isActive, true))
    .orderBy(desc(stockItemsTable.isActive), asc(stockItemsTable.category), asc(stockItemsTable.name));

  const data = rows.map((item) => {
    if (fullAccess) return item;
    const { costCents: _c, ...rest } = item;
    return rest;
  });

  res.json({ data });
});

router.post('/items', requireRole('director', 'master'), async (req, res): Promise<void> => {
  const { name, category, unit, currentQuantity, lowStockThreshold, costCents, supplier, notes } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!isValidCategory(category)) {
    res.status(400).json({ error: 'category must be a non-empty string' });
    return;
  }

  const now = new Date();
  const item = {
    id: randomUUID(),
    name: name.trim(),
    category: category.trim(),
    unit: typeof unit === 'string' && unit.trim() ? unit.trim() : 'units',
    currentQuantity: typeof currentQuantity === 'number' && currentQuantity >= 0 ? currentQuantity : 0,
    lowStockThreshold: typeof lowStockThreshold === 'number' && lowStockThreshold >= 0 ? lowStockThreshold : 0,
    costCents: typeof costCents === 'number' && costCents >= 0 ? Math.round(costCents) : null,
    supplier: typeof supplier === 'string' ? supplier.trim() || null : null,
    notes: typeof notes === 'string' ? notes.trim() || null : null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(stockItemsTable).values(item);
  await logMovement({
    stockItemId: item.id,
    actionType: 'create',
    quantityBefore: 0,
    quantityAfter: item.currentQuantity,
    quantityDelta: item.currentQuantity,
    notes: 'Stock item created',
    performedByUserId: req.user?.id,
    performedByName: req.user?.name,
  });
  res.status(201).json({ data: item });
});

router.patch('/items/:id', requireRole('director', 'master', 'manager'), async (req, res) => {
  const id = String(req.params.id);
  const fullAccess = canEditAll(req.user!.role);
  const [existing] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Stock item not found' });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (fullAccess) {
    const { name, category, unit, currentQuantity, lowStockThreshold, costCents, supplier, notes } = req.body;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name must be a non-empty string' });
      updates.name = name.trim();
    }
    if (category !== undefined) {
      if (!isValidCategory(category)) return res.status(400).json({ error: 'category must be a non-empty string' });
      updates.category = category.trim();
    }
    if (unit !== undefined) updates.unit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'units';
    if (currentQuantity !== undefined) updates.currentQuantity = Math.max(0, Number(currentQuantity) || 0);
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = Math.max(0, Number(lowStockThreshold) || 0);
    if (costCents !== undefined) updates.costCents = costCents === null ? null : (typeof costCents === 'number' ? Math.round(Math.max(0, costCents)) : null);
    if (supplier !== undefined) updates.supplier = typeof supplier === 'string' ? supplier.trim() || null : null;
    if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.trim() || null : null;
  } else {
    const { currentQuantity } = req.body;
    if (currentQuantity === undefined || typeof currentQuantity !== 'number') {
      return res.status(400).json({ error: 'currentQuantity (number) is required' });
    }
    updates.currentQuantity = Math.max(0, currentQuantity);
  }

  await db.update(stockItemsTable).set(updates as any).where(eq(stockItemsTable.id, id));
  const [updated] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));

  if (updates.currentQuantity !== undefined) {
    await logMovement({
      stockItemId: id,
      actionType: 'adjust',
      quantityBefore: existing.currentQuantity,
      quantityAfter: updated.currentQuantity,
      quantityDelta: updated.currentQuantity - existing.currentQuantity,
      notes: fullAccess ? 'Stock item edited' : 'Quantity updated',
      performedByUserId: req.user?.id,
      performedByName: req.user?.name,
    });
  }

  if (updated.currentQuantity <= 0 && existing.currentQuantity > 0) {
    sendNotification({
      roles: ['director', 'master'],
      type: 'stock_out',
      title: 'Out of stock',
      body: `${updated.name} is now out of stock.`,
      data: { stockItemId: id, quantity: updated.currentQuantity },
    }).catch(() => {});
  } else if (updated.lowStockThreshold > 0 && updated.currentQuantity > 0 && updated.currentQuantity <= updated.lowStockThreshold && existing.currentQuantity > updated.lowStockThreshold) {
    sendNotification({
      roles: ['director', 'master'],
      type: 'stock_low',
      title: 'Low stock alert',
      body: `${updated.name} is running low — only ${updated.currentQuantity} ${updated.unit} remaining.`,
      data: { stockItemId: id, quantity: updated.currentQuantity, threshold: updated.lowStockThreshold },
    }).catch(() => {});
  }

  if (fullAccess) return res.json({ data: updated });
  const { costCents: _c, ...rest } = updated;
  return res.json({ data: rest });
});

router.post('/items/:id/action', requireRole('director', 'master', 'manager'), async (req, res) => {
  const id = String(req.params.id);
  const {
    action,
    quantity,
    targetQuantity,
    targetStockItemId,
    reason,
    notes,
    costImpactCents,
    allowNegativeOverride,
  } = req.body ?? {};

  const [item] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!item) return res.status(404).json({ error: 'Stock item not found' });

  const qty = Number(quantity ?? 0);
  const nextTarget = Number(targetQuantity ?? item.currentQuantity);
  const canGoNegative = allowNegativeOverride === true && canEditAll(req.user?.role);

  const failNegative = (nextQty: number) => {
    if (nextQty < 0 && !canGoNegative) {
      res.status(400).json({ error: 'Stock cannot go negative unless allowed by an admin override.' });
      return true;
    }
    return false;
  };

  if (!action || typeof action !== 'string') return res.status(400).json({ error: 'action is required' });

  const now = new Date();
  if (action === 'transfer') {
    if (!targetStockItemId) return res.status(400).json({ error: 'targetStockItemId is required for transfer' });
    if (!(qty > 0)) return res.status(400).json({ error: 'quantity must be greater than 0 for transfer' });
    const [target] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, String(targetStockItemId)));
    if (!target) return res.status(404).json({ error: 'Transfer target not found' });
    const sourceNext = item.currentQuantity - qty;
    if (failNegative(sourceNext)) return;
    const targetNext = target.currentQuantity + qty;
    await db.update(stockItemsTable).set({ currentQuantity: sourceNext, updatedAt: now }).where(eq(stockItemsTable.id, item.id));
    await db.update(stockItemsTable).set({ currentQuantity: targetNext, updatedAt: now }).where(eq(stockItemsTable.id, target.id));
    await logMovement({
      stockItemId: item.id,
      actionType: 'transfer_out',
      quantityBefore: item.currentQuantity,
      quantityAfter: sourceNext,
      quantityDelta: -qty,
      reason: reason ?? null,
      notes: notes ?? null,
      targetStockItemId: target.id,
      costImpactCents: costImpactCents ?? null,
      performedByUserId: req.user?.id,
      performedByName: req.user?.name,
    });
    await logMovement({
      stockItemId: target.id,
      actionType: 'transfer_in',
      quantityBefore: target.currentQuantity,
      quantityAfter: targetNext,
      quantityDelta: qty,
      reason: reason ?? null,
      notes: notes ?? null,
      targetStockItemId: item.id,
      costImpactCents: costImpactCents ?? null,
      performedByUserId: req.user?.id,
      performedByName: req.user?.name,
    });
    const [updated] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, item.id));
    return res.json({ data: updated });
  }

  let nextQty = item.currentQuantity;
  let delta = 0;
  switch (action) {
    case 'add':
      if (!(qty > 0)) return res.status(400).json({ error: 'quantity must be greater than 0' });
      nextQty = item.currentQuantity + qty;
      delta = qty;
      break;
    case 'remove':
    case 'wasted':
    case 'expired':
      if (!(qty > 0)) return res.status(400).json({ error: 'quantity must be greater than 0' });
      nextQty = item.currentQuantity - qty;
      delta = -qty;
      if (failNegative(nextQty)) return;
      break;
    case 'adjust':
    case 'stocktake':
      nextQty = nextTarget;
      delta = nextQty - item.currentQuantity;
      if (failNegative(nextQty)) return;
      break;
    default:
      return res.status(400).json({ error: 'Unsupported action' });
  }

  await db.update(stockItemsTable).set({ currentQuantity: nextQty, updatedAt: now }).where(eq(stockItemsTable.id, item.id));
  await logMovement({
    stockItemId: item.id,
    actionType: action,
    quantityBefore: item.currentQuantity,
    quantityAfter: nextQty,
    quantityDelta: delta,
    reason: reason ?? null,
    notes: notes ?? null,
    costImpactCents: costImpactCents ?? null,
    performedByUserId: req.user?.id,
    performedByName: req.user?.name,
  });
  const [updated] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, item.id));
  return res.json({ data: updated });
});

router.get('/items/:id/history', requireRole('director', 'master', 'manager'), async (req, res) => {
  await ensureStockMovementTable();
  const id = String(req.params.id);
  const rows = await db.select().from(stockMovementsTable).where(eq(stockMovementsTable.stockItemId, id)).orderBy(desc(stockMovementsTable.createdAt));
  res.json({ data: rows });
});

router.post('/import', requireRole('director', 'master'), async (req, res): Promise<void> => {
  const csvText = String(req.body?.csvText ?? '');
  if (!csvText.trim()) {
    res.status(400).json({ error: 'csvText is required' });
    return;
  }

  const rows = parseCsv(csvText);
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const name = row.name?.trim();
    const category = row.category?.trim() || 'other';
    if (!name) continue;
    const [existing] = await db.select().from(stockItemsTable).where(and(eq(stockItemsTable.name, name), eq(stockItemsTable.category, category)));
    const data = {
      name,
      category,
      unit: row.unit?.trim() || 'units',
      currentQuantity: Number(row.currentQuantity || 0),
      lowStockThreshold: Number(row.lowStockThreshold || 0),
      costCents: row.costCents ? Number(row.costCents) : null,
      supplier: row.supplier?.trim() || null,
      notes: row.notes?.trim() || null,
      isActive: true,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(stockItemsTable).set(data).where(eq(stockItemsTable.id, existing.id));
      updated += 1;
    } else {
      await db.insert(stockItemsTable).values({ id: randomUUID(), createdAt: new Date(), ...data });
      created += 1;
    }
  }
  res.json({ data: { created, updated } });
});

router.get('/export', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const rows = await db.select().from(stockItemsTable).orderBy(asc(stockItemsTable.category), asc(stockItemsTable.name));
  const headers = ['name', 'category', 'unit', 'currentQuantity', 'lowStockThreshold', 'costCents', 'supplier', 'notes', 'isActive'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue((row as any)[header])).join(',')),
  ];
  res.json({ data: { csv: lines.join('\n') } });
});

router.get('/supplier-order-list', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const rows = await db.select().from(stockItemsTable).where(eq(stockItemsTable.isActive, true)).orderBy(asc(stockItemsTable.supplier), asc(stockItemsTable.name));
  const grouped: Record<string, Array<{ id: string; name: string; unit: string; currentQuantity: number; lowStockThreshold: number; suggestedOrderQuantity: number }>> = {};
  for (const row of rows) {
    if (row.currentQuantity > row.lowStockThreshold) continue;
    const supplier = row.supplier?.trim() || 'Unassigned supplier';
    const suggestedOrderQuantity = Math.max(1, Math.ceil((row.lowStockThreshold || 1) * 2 - row.currentQuantity));
    if (!grouped[supplier]) grouped[supplier] = [];
    grouped[supplier].push({
      id: row.id,
      name: row.name,
      unit: row.unit,
      currentQuantity: row.currentQuantity,
      lowStockThreshold: row.lowStockThreshold,
      suggestedOrderQuantity,
    });
  }
  res.json({ data: grouped });
});

router.delete('/items/:id', requireRole('director', 'master'), async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }
  await db.update(stockItemsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(stockItemsTable.id, id));
  await logMovement({
    stockItemId: existing.id,
    actionType: 'archive',
    quantityBefore: existing.currentQuantity,
    quantityAfter: existing.currentQuantity,
    quantityDelta: 0,
    notes: 'Stock item archived',
    performedByUserId: req.user?.id,
    performedByName: req.user?.name,
  });
  res.json({ data: { success: true } });
});

export default router;
