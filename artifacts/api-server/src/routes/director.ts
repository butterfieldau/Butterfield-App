import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, usersTable, customerProfilesTable, staffProfilesTable,
  wholesaleAccountsTable, ordersTable, storeSettingsTable, productsTable,
} from '@workspace/db';
import { eq, desc, count, sum, gte, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';

const router = Router();
router.use(requireRole('director'));

// ── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek  = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalOrders] = await db.select({ count: count() }).from(ordersTable);
  const [todayOrders] = await db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday));
  const [weekOrders]  = await db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek));

  const [todayRev]  = await db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday));
  const [weekRev]   = await db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek));
  const [monthRev]  = await db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(gte(ordersTable.createdAt, startOfMonth));

  const [activeOrders]       = await db.select({ count: count() }).from(ordersTable)
    .where(sql`${ordersTable.status} IN ('received','being_prepared','ready_for_pickup')`);
  const [totalUsers]         = await db.select({ count: count() }).from(usersTable);
  const [pendingStaff]       = await db.select({ count: count() }).from(staffProfilesTable)
    .where(eq(staffProfilesTable.approvedByAdmin, false));
  const [pendingWholesale]   = await db.select({ count: count() }).from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.status, 'pending'));
  const [totalWholesale]     = await db.select({ count: count() }).from(wholesaleAccountsTable);
  const [totalProducts]      = await db.select({ count: count() }).from(productsTable);

  return res.json({
    data: {
      orders: {
        total:  totalOrders.count,
        today:  todayOrders.count,
        week:   weekOrders.count,
        active: activeOrders.count,
      },
      revenue: {
        today: Number(todayRev.total ?? 0),
        week:  Number(weekRev.total  ?? 0),
        month: Number(monthRev.total ?? 0),
      },
      users: {
        total:          totalUsers.count,
        pendingStaff:   pendingStaff.count,
        pendingWholesale: pendingWholesale.count,
        totalWholesale: totalWholesale.count,
        totalProducts:  totalProducts.count,
      },
    },
  });
});

// ── All orders ───────────────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(200);
  return res.json({ data: orders });
});

router.patch('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['received','being_prepared','ready_for_pickup','out_for_delivery','completed','cancelled','refunded'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const [updated] = await db.update(ordersTable).set({ status, updatedAt: new Date() }).where(eq(ordersTable.id, id)).returning();
  return res.json({ data: updated });
});

// ── All users ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const staffProfiles = await db.select().from(staffProfilesTable);
  const wholesaleAccounts = await db.select().from(wholesaleAccountsTable);
  const spMap = Object.fromEntries(staffProfiles.map(s => [s.userId, s]));
  const waMap = Object.fromEntries(wholesaleAccounts.map(w => [w.userId, w]));
  const result = users.map(u => ({
    ...u,
    passwordHash: undefined,
    staffProfile:      spMap[u.id] ?? null,
    wholesaleAccount:  waMap[u.id] ?? null,
  }));
  return res.json({ data: result });
});

// ── Staff approval ───────────────────────────────────────────────────────────
router.patch('/staff/:userId/approve', async (req, res) => {
  const { userId } = req.params;
  const { approved } = req.body;
  const [updated] = await db.update(staffProfilesTable)
    .set({ approvedByAdmin: approved !== false })
    .where(eq(staffProfilesTable.userId, userId))
    .returning();
  return res.json({ data: updated });
});

// ── Wholesale approval ───────────────────────────────────────────────────────
router.patch('/wholesale/:accountId/status', async (req, res) => {
  const { accountId } = req.params;
  const { status } = req.body;
  if (!['approved', 'pending', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ status })
    .where(eq(wholesaleAccountsTable.id, accountId))
    .returning();
  return res.json({ data: updated });
});

// ── Products ─────────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.name);
  return res.json({ data: products });
});

router.patch('/products/:id', async (req, res) => {
  const { id } = req.params;
  const updates: Record<string, any> = {};
  const allowed = ['name','description','priceCents','wholesalePriceCents','isAvailable','isActive','category','isNew','isFeatured'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  return res.json({ data: updated });
});

// ── Store settings ───────────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  await db.insert(storeSettingsTable).values([
    { key: 'geo_radius_meters', value: '20' },
    { key: 'shop_lat',          value: '-33.8349' },
    { key: 'shop_lng',          value: '150.9942' },
    { key: 'store_open',        value: 'true' },
    { key: 'daily_special',     value: 'Cookie & Cream Sandwich' },
  ]).onConflictDoNothing();
  const rows = await db.select().from(storeSettingsTable);
  return res.json({ data: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

router.patch('/settings', async (req, res) => {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await db.insert(storeSettingsTable).values({ key, value, updatedBy: req.user!.id })
      .onConflictDoUpdate({ target: storeSettingsTable.key, set: { value, updatedAt: new Date(), updatedBy: req.user!.id } });
  }
  const rows = await db.select().from(storeSettingsTable);
  return res.json({ data: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

// ── Wholesale accounts list ──────────────────────────────────────────────────
router.get('/wholesale', async (req, res) => {
  const accounts = await db.select().from(wholesaleAccountsTable).orderBy(desc(wholesaleAccountsTable.createdAt));
  return res.json({ data: accounts });
});

export default router;
