import { Router } from 'express';
import { db, stockItemsTable, stockCategoriesTable, stockMovementsTable } from '@workspace/db';
import { eq, and, asc, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireRole } from '../middlewares/auth.js';
import { applyStockItemAction, applyTransferBetweenStockItems, buildSupplierOrderList } from '../lib/stockActions.js';

const router = Router();

function isValidCategory(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const WASTAGE_REASONS = [
  'Overbaked',
  'Damaged',
  'Expired',
  'Customer return',
  'Staff error',
  'Equipment issue',
  'Rangehood/temperature issue',
  'Other',
] as const;

function canEditAll(role?: string) {
  return role === 'director' || role === 'master';
}

function stringifyCsvValue(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// ── GET /api/stock/categories ────────────────────────────────────────────────
// Returns managed category list from DB.
router.get('/categories', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const rows = await db
    .select()
    .from(stockCategoriesTable)
    .orderBy(asc(stockCategoriesTable.name));
  res.json({ data: rows.map((r) => ({ id: r.id, label: r.name })) });
});

// ── POST /api/stock/categories ───────────────────────────────────────────────
// Director / master only — create a new category.
router.post('/categories', requireRole('director', 'master'), async (req, res) => {
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

  // Check for duplicate id or name
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

// ── DELETE /api/stock/categories/:id ────────────────────────────────────────
// Director / master only — remove a category.
// Blocked if any active stock items still use it.
router.delete('/categories/:id', requireRole('director', 'master'), async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select()
    .from(stockCategoriesTable)
    .where(eq(stockCategoriesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  // Prevent deletion if items still use this category
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

// ── GET /api/stock/items ─────────────────────────────────────────────────────
// Directors / master see costCents; managers do not.
router.get('/items', requireRole('director', 'master', 'manager'), async (req, res) => {
  const fullAccess = canEditAll(req.user!.role);
  const includeInactive = String(req.query.includeInactive ?? 'false').toLowerCase() === 'true';

  const rows = includeInactive
    ? await db
        .select()
        .from(stockItemsTable)
        .orderBy(desc(stockItemsTable.isActive), asc(stockItemsTable.category), asc(stockItemsTable.name))
    : await db
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
    allowNegativeStock: Boolean(req.body.allowNegativeStock),
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
  const id = String(req.params.id);
  const fullAccess = canEditAll(req.user!.role);

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
    const { name, category, unit, currentQuantity, lowStockThreshold, allowNegativeStock, costCents, supplier, notes } = req.body;
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
    if (allowNegativeStock !== undefined) updates.allowNegativeStock = Boolean(allowNegativeStock);
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

// ── POST /api/stock/items/:id/actions ───────────────────────────────────────
router.post('/items/:id/actions', requireRole('director', 'master', 'manager'), async (req, res) => {
  const id = String(req.params.id);
  const {
    action,
    quantity,
    targetQuantity,
    targetStockItemId,
    reason,
    notes,
    photoUrl,
    costImpactCents,
    allowNegativeOverride,
  } = req.body ?? {};

  if (!['add', 'remove', 'adjust', 'transfer', 'wasted', 'expired', 'stocktake'].includes(action)) {
    return res.status(400).json({ error: 'Invalid stock action.' });
  }
  if ((action === 'wasted' || action === 'expired') && reason && !WASTAGE_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid wastage reason.' });
  }

  try {
    let updated;
    await db.transaction(async (tx) => {
      if (action === 'transfer') {
        if (!canEditAll(req.user!.role)) throw new Error('Only directors and masters can transfer stock.');
        if (!targetStockItemId) throw new Error('Target stock item is required for transfers.');
        await applyTransferBetweenStockItems(tx, {
          stockItemId: id,
          targetStockItemId: String(targetStockItemId),
          actionType: 'transfer',
          quantity: Number(quantity ?? 0),
          reason: typeof reason === 'string' ? reason : 'Transfer',
          notes: typeof notes === 'string' ? notes : null,
          photoUrl: typeof photoUrl === 'string' ? photoUrl : null,
          costImpactCents: typeof costImpactCents === 'number' ? Math.round(costImpactCents) : null,
          allowNegativeOverride: Boolean(allowNegativeOverride),
          actor: { userId: req.user!.id, name: req.user!.name, role: req.user!.role },
        });
        const [fresh] = await tx.select().from(stockItemsTable).where(eq(stockItemsTable.id, id));
        updated = fresh;
        return;
      }

      updated = await applyStockItemAction(tx, {
        stockItemId: id,
        actionType: action,
        quantity: Number(quantity ?? 0),
        targetQuantity: targetQuantity != null ? Number(targetQuantity) : undefined,
        reason: typeof reason === 'string' ? reason : null,
        notes: typeof notes === 'string' ? notes : null,
        photoUrl: typeof photoUrl === 'string' ? photoUrl : null,
        costImpactCents: typeof costImpactCents === 'number' ? Math.round(costImpactCents) : null,
        allowNegativeOverride: Boolean(allowNegativeOverride),
        actor: { userId: req.user!.id, name: req.user!.name, role: req.user!.role },
      });
    });
    return res.json({ data: updated });
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Stock action failed.' });
  }
});

// ── GET /api/stock/items/:id/history ────────────────────────────────────────
router.get('/items/:id/history', requireRole('director', 'master', 'manager'), async (req, res) => {
  const rows = await db.select().from(stockMovementsTable)
    .where(eq(stockMovementsTable.stockItemId, String(req.params.id)))
    .orderBy(desc(stockMovementsTable.createdAt));
  res.json({ data: rows });
});

// ── POST /api/stock/import ──────────────────────────────────────────────────
router.post('/import', requireRole('director', 'master'), async (req, res) => {
  const csvText = String(req.body?.csvText ?? '').trim();
  if (!csvText) return res.status(400).json({ error: 'csvText is required.' });

  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must include a header and at least one row.' });
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const required = ['name', 'category', 'unit', 'currentquantity'];
  if (!required.every((field) => headers.includes(field))) {
    return res.status(400).json({ error: 'CSV must include name, category, unit, and currentQuantity columns.' });
  }

  const summary = { created: 0, updated: 0 };
  await db.transaction(async (tx) => {
    for (const line of lines.slice(1)) {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
      const name = String(row.name ?? '').trim();
      const category = String(row.category ?? '').trim();
      if (!name || !category) continue;
      const [existing] = await tx.select().from(stockItemsTable)
        .where(and(eq(stockItemsTable.name, name), eq(stockItemsTable.category, category), eq(stockItemsTable.isActive, true)));
      const payload = {
        name,
        category,
        unit: String(row.unit ?? 'units').trim() || 'units',
        currentQuantity: Math.max(0, Number(row.currentquantity ?? 0) || 0),
        lowStockThreshold: Math.max(0, Number(row.lowstockthreshold ?? 0) || 0),
        allowNegativeStock: ['true', '1', 'yes'].includes(String(row.allownegativestock ?? '').toLowerCase()),
        costCents: row.costcents ? Math.max(0, Math.round(Number(row.costcents) || 0)) : null,
        supplier: String(row.supplier ?? '').trim() || null,
        notes: String(row.notes ?? '').trim() || null,
        updatedAt: new Date(),
      };

      if (existing) {
        await tx.update(stockItemsTable).set(payload).where(eq(stockItemsTable.id, existing.id));
        summary.updated += 1;
      } else {
        await tx.insert(stockItemsTable).values({
          id: randomUUID(),
          ...payload,
          isActive: true,
          createdAt: new Date(),
        });
        summary.created += 1;
      }
    }
  });

  res.json({ data: summary });
});

// ── GET /api/stock/reports/export ───────────────────────────────────────────
router.get('/reports/export', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const rows = await db.select().from(stockItemsTable)
    .where(eq(stockItemsTable.isActive, true))
    .orderBy(asc(stockItemsTable.category), asc(stockItemsTable.name));

  const csvLines = [
    ['Name', 'Category', 'Unit', 'Current Quantity', 'Low Stock Threshold', 'Allow Negative Stock', 'Cost Cents', 'Supplier', 'Notes']
      .map(stringifyCsvValue).join(','),
    ...rows.map((row) => [
      row.name,
      row.category,
      row.unit,
      row.currentQuantity,
      row.lowStockThreshold,
      row.allowNegativeStock,
      row.costCents ?? '',
      row.supplier ?? '',
      row.notes ?? '',
    ].map(stringifyCsvValue).join(',')),
  ];

  res.json({ data: { rows, csv: csvLines.join('\n') } });
});

// ── GET /api/stock/supplier-order-list ──────────────────────────────────────
router.get('/supplier-order-list', requireRole('director', 'master', 'manager'), async (_req, res) => {
  const suppliers = await buildSupplierOrderList();
  res.json({ data: suppliers });
});

export default router;
