import { Router } from 'express';
import { db, stockItemsTable } from '@workspace/db';
import { eq, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireRole } from '../middlewares/auth.js';
import { sendNotification } from '../lib/notificationService.js';

const router = Router();

function isValidCategory(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function canEditAll(role?: string) {
  return role === 'director' || role === 'master';
}

const DEFAULT_CATEGORIES = [
  { id: 'coffee',         label: 'Coffee'         },
  { id: 'drinks',         label: 'Drinks'         },
  { id: 'front_of_house', label: 'Front of House' },
  { id: 'sauces',         label: 'Sauces'         },
  { id: 'chocolate',      label: 'Chocolate'      },
  { id: 'kitchen',        label: 'Kitchen'        },
  { id: 'milk',           label: 'Milk'           },
  { id: 'dairy',          label: 'Dairy'          },
  { id: 'packaging',      label: 'Packaging'      },
  { id: 'cleaning',       label: 'Cleaning'       },
];

// ── GET /api/stock/categories ────────────────────────────────────────────────
router.get('/categories', requireRole('director', 'master', 'manager'), (_req, res) => {
  res.json({ data: DEFAULT_CATEGORIES });
});

// ── GET /api/stock/items ─────────────────────────────────────────────────────
// Directors / master see costCents; managers do not.
router.get('/items', requireRole('director', 'master', 'manager'), async (req, res) => {
  const fullAccess = canEditAll(req.user!.role);

  const rows = await db
    .select()
    .from(stockItemsTable)
    .where(eq(stockItemsTable.isActive, true))
    .orderBy(asc(stockItemsTable.category), asc(stockItemsTable.name));

  const data = rows.map((item) => {
    if (fullAccess) return item;
    const { costCents: _c, ...rest } = item;
    return rest;
  });

  res.json({ data });
});

// ── POST /api/stock/items ────────────────────────────────────────────────────
// Director / master only — create a new stock item.
router.post('/items', requireRole('director', 'master'), async (req, res) => {
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
  res.status(201).json({ data: item });
});

// ── PATCH /api/stock/items/:id ───────────────────────────────────────────────
// Director / master: all fields. Manager: currentQuantity only.
router.patch('/items/:id', requireRole('director', 'master', 'manager'), async (req, res) => {
  const { id } = req.params;
  const fullAccess = canEditAll(req.user!.role);

  // Fetch the full row so we can detect threshold crossings after update
  const [existing] = await db
    .select()
    .from(stockItemsTable)
    .where(eq(stockItemsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: 'Stock item not found' });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (fullAccess) {
    const { name, category, unit, currentQuantity, lowStockThreshold, costCents, supplier, notes } = req.body;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) { res.status(400).json({ error: 'name must be a non-empty string' }); return; }
      updates.name = name.trim();
    }
    if (category !== undefined) {
      if (!isValidCategory(category)) { res.status(400).json({ error: 'category must be a non-empty string' }); return; }
      updates.category = category;
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
      res.status(400).json({ error: 'currentQuantity (number) is required' });
      return;
    }
    updates.currentQuantity = Math.max(0, currentQuantity);
  }

  await db.update(stockItemsTable).set(updates as any).where(eq(stockItemsTable.id, id));

  const [updated] = await db.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));

  // ── Low-stock push notification (fire-and-forget) ─────────────────────────
  // Only notify when quantity actually changed and threshold is configured
  if (updates.currentQuantity !== undefined && existing.lowStockThreshold > 0) {
    const oldQty = existing.currentQuantity;
    const newQty = updated.currentQuantity;
    const threshold = updated.lowStockThreshold;
    const itemName = updated.name;

    // Out of stock: quantity just hit zero
    if (newQty <= 0 && oldQty > 0) {
      sendNotification({
        roles: ['director', 'master'],
        type: 'stock_out',
        title: '🚨 Out of Stock',
        body: `${itemName} is now out of stock. Reorder immediately.`,
        data: { stockItemId: id, name: itemName, quantity: newQty },
      }).catch(() => {});
    // Low stock: just crossed below the threshold (but not already zero)
    } else if (newQty > 0 && newQty <= threshold && oldQty > threshold) {
      sendNotification({
        roles: ['director', 'master'],
        type: 'stock_low',
        title: '⚠️ Low Stock Alert',
        body: `${itemName} is running low — only ${newQty} ${updated.unit} remaining.`,
        data: { stockItemId: id, name: itemName, quantity: newQty, threshold },
      }).catch(() => {});
    }
  }

  if (fullAccess) {
    res.json({ data: updated });
  } else {
    const { costCents: _c, ...rest } = updated;
    res.json({ data: rest });
  }
});

// ── DELETE /api/stock/items/:id ──────────────────────────────────────────────
// Director / master only — soft delete.
router.delete('/items/:id', requireRole('director', 'master'), async (req, res) => {
  const { id } = req.params;
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
