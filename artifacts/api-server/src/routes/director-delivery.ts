import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, productsTable, productCategoriesTable } from '@workspace/db';
import { eq, asc, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import {
  getRetailDeliverySettings,
  saveRetailDeliverySettings,
  type RetailDeliverySlot,
} from '../lib/retailDelivery.js';

const router = Router();

const allowedRoles = requireRole('director', 'manager', 'master');
const requireSettings = requireManagerPermission('settings');

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSlotLabel(dow: number, hour: number): string {
  const dayLabel = DOW_LABELS[dow] ?? `Day ${dow}`;
  if (hour === 12) return `${dayLabel} by 12pm`;
  if (hour > 12) return `${dayLabel} by ${hour - 12}pm`;
  return `${dayLabel} by ${hour}am`;
}

function computeCutoffDayOffset(deliveryDow: number, cutoffDow: number): number {
  let offset = cutoffDow - deliveryDow;
  if (offset >= 0) offset -= 7;
  return offset;
}

async function fetchCategoriesWithCounts() {
  try {
    const cats = await db
      .select()
      .from(productCategoriesTable)
      .where(eq(productCategoriesTable.isActive, true))
      .orderBy(asc(productCategoriesTable.sortOrder));

    const productMeta = await db
      .select({ categoryId: productsTable.categoryId, category: productsTable.category })
      .from(productsTable)
      .where(eq(productsTable.isActive, true));

    const byId = new Map<string, number>();
    const bySlug = new Map<string, number>();
    for (const p of productMeta) {
      if (p.categoryId) byId.set(p.categoryId, (byId.get(p.categoryId) ?? 0) + 1);
      else if (p.category) bySlug.set(p.category, (bySlug.get(p.category) ?? 0) + 1);
    }

    return cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      sortOrder: cat.sortOrder,
      isDeliveryAvailable: (cat as any).isDeliveryAvailable ?? false,
      productCount: (byId.get(cat.id) ?? 0) + (bySlug.get(cat.slug) ?? 0),
    }));
  } catch {
    const result = await db.execute(sql`
      SELECT
        pc.id,
        pc.name,
        pc.slug,
        pc.sort_order AS "sortOrder",
        COALESCE(pc.is_delivery_available, false) AS "isDeliveryAvailable",
        COALESCE(p.cnt, 0)::int AS "productCount"
      FROM product_categories pc
      LEFT JOIN (
        SELECT COALESCE(category_id, category) AS key, COUNT(*)::int AS cnt
        FROM products WHERE is_active = true
        GROUP BY key
      ) p ON (pc.id = p.key OR pc.slug = p.key)
      WHERE pc.is_active = true
      ORDER BY pc.sort_order ASC
    `);
    return (result.rows ?? []) as any[];
  }
}

// GET /api/director/delivery-settings
router.get('/delivery-settings', allowedRoles, requireSettings, async (_req, res) => {
  const [config, categories, products] = await Promise.all([
    getRetailDeliverySettings(),
    fetchCategoriesWithCounts(),
    db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        category: productsTable.category,
        categoryId: productsTable.categoryId,
        isPickupOnly: productsTable.isPickupOnly,
        isActive: productsTable.isActive,
      })
      .from(productsTable)
      .where(eq(productsTable.isActive, true))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.name)),
  ]);

  return res.json({
    data: {
      enabled: config.enabled,
      feeCents: config.feeCents,
      slots: config.slots,
      blackoutDates: config.blackoutDates,
      categories,
      products,
    },
  });
});

// PATCH /api/director/delivery-settings
router.patch('/delivery-settings', allowedRoles, requireSettings, async (req, res) => {
  const { enabled, feeCents, slots, blackoutDates } = req.body;

  const current = await getRetailDeliverySettings();

  if (enabled !== undefined) current.enabled = Boolean(enabled);
  if (feeCents !== undefined) current.feeCents = Math.max(0, Math.round(Number(feeCents)));
  if (Array.isArray(blackoutDates)) {
    current.blackoutDates = blackoutDates
      .filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
  }
  if (Array.isArray(slots)) {
    current.slots = (slots as any[]).map((s) => {
      const deliveryDow = Number(s.deliveryDow ?? 0) % 7;
      const cutoffDow = Number(s.cutoffDow ?? 0) % 7;
      const cutoffHour = Math.min(23, Math.max(0, Number(s.cutoffHour ?? 17)));
      const cutoffDayOffset =
        s.cutoffDayOffset !== undefined
          ? Number(s.cutoffDayOffset)
          : computeCutoffDayOffset(deliveryDow, cutoffDow);
      const slot: RetailDeliverySlot = {
        id: s.id && typeof s.id === 'string' && s.id.trim() ? s.id : `rds_${randomUUID().slice(0, 12)}`,
        deliveryDow,
        deliveryLabel: DOW_LABELS[deliveryDow] ?? `Day ${deliveryDow}`,
        cutoffDow,
        cutoffDayLabel: DOW_LABELS[cutoffDow] ?? `Day ${cutoffDow}`,
        cutoffDayOffset,
        cutoffLabel: s.cutoffLabel?.trim() || formatSlotLabel(cutoffDow, cutoffHour),
        cutoffHour,
        windowOpen: s.windowOpen?.trim() || '8am',
        windowClose: s.windowClose?.trim() || '5pm',
      };
      return slot;
    });
  }

  await saveRetailDeliverySettings(current, req.user?.id);
  return res.json({ data: current });
});

export default router;
