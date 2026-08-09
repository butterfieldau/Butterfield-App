import { Router } from 'express';
import { db, stockItemsTable, stockCategoriesTable } from '@workspace/db';
import { eq, and, asc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { sendNotification } from '../lib/notificationService.js';

const router = Router();

// All stock routes require director/master OR manager with 'stock' permission.
// requireManagerPermission passes directors/masters unconditionally and checks
// managers for the named permission, so this pair covers all cases cleanly.
router.use(requireRole('director', 'master', 'manager'));
router.use(requireManagerPermission('stock'));

// Managers with the 'stock' permission get identical access to directors.
function canEditAll(role?: string) {
  return role === 'director' || role === 'master' || role === 'manager';
}

// ── GET /api/stock/categories ─────────────────────────────────────────────────
router.get('/categories', async (_req, res) => {
  const rows = await db
    .select()
    .from(stockCategoriesTable)
    .orderBy(asc(stockCategoriesTable.name));
  res.json({ data: rows.map((r) => ({ id: r.id, label: r.name })) });
});

// ── POST /api/stock/categories ────────────────────────────────────────────────
router.post('/categories', async (req, res) => {
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

  const [existing] = await db
    .select({ id: stockCategoriesTable.id })
    .from(stockCategoriesTable)
    .where(eq(stockCategoriesTable.id, id));
  if (existing) {
    res.status(409).json({ error: 'Category already exists' });
    return;
  }

  const now = new Date();
  await db.insert(stockCategoriesTable).values({ id, name: trimmed, createdAt: now });
  res.status(201).json({ data: { id, label: trimmed } });
});

// ── DELETE /api/stock/categories/:id ─────────────────────────────────────────
router.delete('/categories/:id', async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select()
    .from(stockCategoriesTable)
    .where(eq(stockCategoriesTable.id, id));
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

// ── GET /api/stock/items ──────────────────────────────────────────────────────
// All authorised roles (directors + managers with 'stock') see full data including costCents.
router.get('/items', async (req, res) => {
  const rows = await db
    .select()
    .from(stockItemsTable)
    .where(eq(stockItemsTable.isActive, true))
    .orderBy(asc(stockItemsTable.category), asc(stockItemsTable.name));

  res.json({ data: rows });
});

// ── POST /api/stock/items ─────────────────────────────────────────────────────
router.post('/items', async (req, res) => {
  const { name, category, unit, currentQuantity, lowStockThreshold, costCents, supplier, notes } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!category || typeof category !== 'string' || !category.trim()) {
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
  res.status(201).json({ data: item });
});

// ── PATCH /api/stock/items/:id ────────────────────────────────────────────────
// All authorised roles get full edit access (same as director).
router.patch('/items/:id', async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select()
    .from(stockItemsTable)
    .where(eq(stockItemsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }

  const { name, category, unit, currentQuantity, lowStockThreshold, costCents, supplier, notes } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) { res.status(400).json({ error: 'name must be a non-empty string' }); return; }
    updates.name = name.trim();
  }
  if (category !== undefined) {
    if (typeof category !== 'string' || !category.trim()) { res.status(400).json({ error: 'category must be a non-empty string' }); return; }
    updates.category = category;
  }
  if (unit !== undefined) updates.unit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'units';
  if (currentQuantity !== undefined) updates.currentQuantity = Math.max(0, Number(currentQuantity) || 0);
  if (lowStockThreshold !== undefined) updates.lowStockThreshold = Math.max(0, Number(lowStockThreshold) || 0);
  if (costCents !== undefined) updates.costCents = costCents === null ? null : (typeof costCents === 'number' ? Math.round(Math.max(0, costCents)) : null);
  if (supplier !== undefined) updates.supplier = typeof supplier === 'string' ? supplier.trim() || null : null;
  if (notes !== undefined) updates.notes = typeof notes === 'string' ? notes.trim() || null : null;

  await db.update(stockItemsTable).set(updates as any).where(eq(stockItemsTable.id, id));

  const [updated] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));

  // ── Low-stock push notification ─────────────────────────────────────────────
  if (updates.currentQuantity !== undefined && existing.lowStockThreshold > 0) {
    const oldQty = existing.currentQuantity;
    const newQty = updated.currentQuantity;
    const threshold = updated.lowStockThreshold;
    const itemName = updated.name;

    if (newQty <= 0 && oldQty > 0) {
      sendNotification({
        roles: ['director', 'master'],
        type: 'stock_out',
        title: '🚨 Out of Stock',
        body: `${itemName} is now out of stock. Reorder immediately.`,
        data: { stockItemId: id, name: itemName, quantity: newQty, screen: '/(director)/stock' },
      }).catch(() => {});
    } else if (newQty > 0 && newQty <= threshold && oldQty > threshold) {
      sendNotification({
        roles: ['director', 'master'],
        type: 'stock_low',
        title: '⚠️ Low Stock Alert',
        body: `${itemName} is running low — only ${newQty} ${updated.unit} remaining.`,
        data: { stockItemId: id, name: itemName, quantity: newQty, threshold, screen: '/(director)/stock' },
      }).catch(() => {});
    }
  }

  res.json({ data: updated });
});

// ── DELETE /api/stock/items/:id ───────────────────────────────────────────────
router.delete('/items/:id', async (req, res) => {
  const id = String(req.params.id);
  const [existing] = await db
    .select({ id: stockItemsTable.id })
    .from(stockItemsTable)
    .where(eq(stockItemsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }

  await db.update(stockItemsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(stockItemsTable.id, id));
  res.json({ data: { success: true } });
});

export default router;
