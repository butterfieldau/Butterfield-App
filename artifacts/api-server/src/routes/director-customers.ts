import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, usersTable, customerProfilesTable, ordersTable,
  wholesaleAccountsTable, userAddressesTable,
  customerNotesTable, customerBadgesTable, loyaltyTransactionsTable,
} from '@workspace/db';
import { eq, desc, count, sum, gte, and, inArray, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';

const router = Router();

// Apply role/permission checks per-route (not globally) so that requests
// destined for other /director routers can pass through without being blocked.
const allowedRoles = requireRole('director', 'manager', 'master');
const requireUsers = requireManagerPermission('users');

function getRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

// ── Badge computation ────────────────────────────────────────────────────────
function computeAutoBadges(
  orderCount: number,
  totalSpentCents: number,
  daysSinceLastOrder: number | null,
  isWholesale: boolean,
): string[] {
  if (isWholesale) return ['wholesale_partner'];
  const badges: string[] = [];
  if      (orderCount >= 15 || totalSpentCents >= 100000) badges.push('vip');
  else if (orderCount >= 5)  badges.push('loyal');
  else if (orderCount >= 2)  badges.push('returning');
  else                       badges.push('new');
  if (totalSpentCents >= 50000 && !badges.includes('vip')) badges.push('high_spend');
  if (orderCount >= 20) badges.push('frequent_buyer');
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 30 && orderCount > 0) badges.push('inactive');
  return badges;
}

// ── GET /director/customers/insights ─────────────────────────────────────────
router.get('/customers/insights', allowedRoles, requireUsers, async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [[totalCustomers], [newThisWeek], [totalWholesale], spenderData] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, 'customer')),
    db.select({ count: count() }).from(usersTable).where(
      and(eq(usersTable.role, 'customer'), gte(usersTable.createdAt, weekAgo))
    ),
    db.select({ count: count() }).from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.status, 'approved')),
    db.select({
      userId: customerProfilesTable.userId,
      totalSpentCents: customerProfilesTable.totalSpentCents,
      totalVisits: customerProfilesTable.totalVisits,
    }).from(customerProfilesTable).orderBy(desc(customerProfilesTable.totalSpentCents)).limit(5),
  ]);

  const topIds = spenderData.map(s => s.userId);
  const topUsers = topIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, topIds))
    : [];
  const nameMap = Object.fromEntries(topUsers.map(u => [u.id, u.name]));

  return res.json({
    data: {
      totalCustomers: totalCustomers.count,
      newThisWeek: newThisWeek.count,
      totalWholesale: totalWholesale.count,
      topSpenders: spenderData.map(s => ({
        userId: s.userId,
        name: nameMap[s.userId] ?? 'Unknown',
        totalSpentCents: s.totalSpentCents,
        totalVisits: s.totalVisits,
      })),
    },
  });
});

// ── GET /director/customers ───────────────────────────────────────────────────
router.get('/customers', allowedRoles, requireUsers, async (req, res) => {
  const { search = '', filter = 'all' } = req.query as Record<string, string>;

  const customers = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('customer', 'wholesale')`)
    .orderBy(desc(usersTable.createdAt))
    .limit(500);

  if (customers.length === 0) return res.json({ data: [] });

  const userIds = customers.map(c => c.id);

  const [profiles, orderStats, waList, manualBadges, defaultAddresses] = await Promise.all([
    db.select().from(customerProfilesTable).where(inArray(customerProfilesTable.userId, userIds)),
    db.select({
      userId:      ordersTable.userId,
      orderCount:  count(),
      totalCents:  sum(ordersTable.totalCents),
      lastOrderAt: sql<string>`MAX(${ordersTable.createdAt})::text`,
    }).from(ordersTable)
      .where(and(
        inArray(ordersTable.userId, userIds),
        sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
      ))
      .groupBy(ordersTable.userId),
    db.select().from(wholesaleAccountsTable).where(inArray(wholesaleAccountsTable.userId, userIds)),
    db.select().from(customerBadgesTable).where(inArray(customerBadgesTable.userId, userIds)),
    db.select().from(userAddressesTable).where(and(inArray(userAddressesTable.userId, userIds), eq(userAddressesTable.isDefault, true))),
  ]);

  const profileMap  = Object.fromEntries(profiles.map(p => [p.userId, p])) as Record<string, any>;
  const orderMap    = Object.fromEntries(orderStats.map(o => [o.userId, o]));
  const waMap       = Object.fromEntries(waList.map(w => [w.userId, w]));
  const addrMap     = Object.fromEntries(defaultAddresses.map(a => [a.userId, a]));
  const badgeMap:     Record<string, typeof manualBadges> = {};
  const badgeStrMap:  Record<string, string[]> = {};
  for (const b of manualBadges) {
    if (!badgeMap[b.userId])    badgeMap[b.userId]    = [];
    if (!badgeStrMap[b.userId]) badgeStrMap[b.userId] = [];
    badgeMap[b.userId].push(b);
    badgeStrMap[b.userId].push(b.badge);
  }

  const now = Date.now();
  let result = customers.map(c => {
    const od  = orderMap[c.id];
    const orderCount      = parseInt(String(od?.orderCount  ?? '0'));
    const totalSpentCents = parseInt(String(od?.totalCents  ?? '0'));
    const lastOrderAt     = od?.lastOrderAt ?? null;
    const daysSince       = lastOrderAt ? Math.floor((now - new Date(lastOrderAt).getTime()) / 86400000) : null;
    const wa = waMap[c.id] ?? null;
    const autoBadges   = computeAutoBadges(orderCount, totalSpentCents, daysSince, !!wa);
    const manualList   = badgeStrMap[c.id] ?? [];
    return {
      id: c.id, name: c.name, email: c.email, phone: c.phone, profileImage: c.profileImage,
      role: c.role, status: c.status, createdAt: c.createdAt, lastLogin: c.lastLogin,
      profile: profileMap[c.id] ?? null,
      emailMarketingOptIn: profileMap[c.id]?.emailMarketingOptIn ?? false,
      payAtPickupEnabled: profileMap[c.id]?.payAtPickupEnabled ?? false,
      suburb: addrMap[c.id]?.suburb ?? null,
      state: addrMap[c.id]?.state ?? null,
      orderCount, totalSpentCents, lastOrderAt, daysSinceLastOrder: daysSince,
      wholesaleAccount: wa,
      badges: [...new Set([...autoBadges, ...manualList])],
      manualBadges: badgeMap[c.id] ?? [],
    };
  });

  // Search
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.wholesaleAccount?.companyName?.toLowerCase().includes(q))
    );
  }

  // Filter
  if      (filter === 'retail')     result = result.filter(c => !c.wholesaleAccount);
  else if (filter === 'wholesale')  result = result.filter(c => !!c.wholesaleAccount);
  else if (filter === 'vip')        result = result.filter(c => c.badges.includes('vip'));
  else if (filter === 'loyal')      result = result.filter(c => c.badges.includes('loyal'));
  else if (filter === 'inactive')   result = result.filter(c => c.badges.includes('inactive') || c.status === 'inactive');
  else if (filter === 'high_spend') result = result.filter(c => c.badges.includes('high_spend'));
  else if (filter === 'flagged')    result = result.filter(c => c.badges.includes('needs_follow_up') || c.badges.includes('flagged'));

  return res.json({ data: result });
});

// ── GET /director/customers/:id ───────────────────────────────────────────────
router.get('/customers/:id', allowedRoles, requireUsers, async (req, res) => {
  const id = getRouteParam(req.params.id);

  const [[user], profile, orders, waList, addresses, notes, badges, loyaltyTxns, loyaltyAgg] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, id)),
    db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, id)),
    db.select().from(ordersTable).where(eq(ordersTable.userId, id)).orderBy(desc(ordersTable.createdAt)).limit(50),
    db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, id)),
    db.select().from(userAddressesTable).where(eq(userAddressesTable.userId, id)),
    db.select().from(customerNotesTable).where(eq(customerNotesTable.userId, id)).orderBy(desc(customerNotesTable.createdAt)),
    db.select().from(customerBadgesTable).where(eq(customerBadgesTable.userId, id)),
    db.select().from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, id)).orderBy(desc(loyaltyTransactionsTable.createdAt)).limit(20),
    db.select({
      type:  loyaltyTransactionsTable.type,
      total: sql<number>`coalesce(sum(${loyaltyTransactionsTable.points}), 0)`,
    })
      .from(loyaltyTransactionsTable)
      .where(eq(loyaltyTransactionsTable.userId, id))
      .groupBy(loyaltyTransactionsTable.type),
  ]);

  if (!user) return res.status(404).json({ error: 'Customer not found.' });

  const wa          = waList[0] ?? null;
  const validOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
  const totalSpentCents = validOrders.reduce((s, o) => s + o.totalCents, 0);
  const avgOrderCents   = validOrders.length > 0 ? Math.round(totalSpentCents / validOrders.length) : 0;
  const cancelledCount  = orders.filter(o => o.status === 'cancelled').length;
  const refundedCount   = orders.filter(o => o.status === 'refunded').length;
  const lastOrderAt     = orders[0]?.createdAt ?? null;
  const daysSince       = lastOrderAt ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000) : null;

  // Most-ordered products
  const freq: Record<string, number> = {};
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items as any[]) {
      if (item?.name) freq[item.name] = (freq[item.name] ?? 0) + (item.quantity ?? 1);
    }
  }
  const topProducts = Object.entries(freq)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));

  const autoBadges  = computeAutoBadges(orders.length, totalSpentCents, daysSince, !!wa);
  const manualList  = badges.map(b => b.badge);
  const allBadges   = [...new Set([...autoBadges, ...manualList])];

  const earnTypes = ['earn', 'bonus', 'birthday_bonus', 'referral'];
  const redeemTypes = ['redeem', 'expire'];
  const totalEarnedPoints   = loyaltyAgg.filter(r => earnTypes.includes(r.type)).reduce((s, r) => s + Number(r.total), 0);
  const totalRedeemedPoints = loyaltyAgg.filter(r => redeemTypes.includes(r.type)).reduce((s, r) => s + Math.abs(Number(r.total)), 0);

  return res.json({
    data: {
      id: user.id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage,
      role: user.role, status: user.status, createdAt: user.createdAt, lastLogin: user.lastLogin,
      profile: profile[0] ?? null,
      wholesaleAccount: wa,
      addresses,
      orders,
      orderStats: { orderCount: orders.length, totalSpentCents, avgOrderCents, cancelledCount, refundedCount, lastOrderAt, daysSinceLastOrder: daysSince, topProducts },
      notes,
      badges: allBadges,
      manualBadges: badges,
      loyaltyStats: { totalEarnedPoints, totalRedeemedPoints },
      loyaltyTransactions: loyaltyTxns,
    },
  });
});

// ── PATCH /director/customers/:id ─────────────────────────────────────────────
router.patch('/customers/:id', allowedRoles, requireUsers, async (req, res) => {
  const id = getRouteParam(req.params.id);
  const userAllowed = ['name', 'phone', 'email', 'status'] as const;
  const userUpdates: Record<string, any> = { updatedAt: new Date() };
  for (const key of userAllowed) {
    if (req.body[key] !== undefined) userUpdates[key] = req.body[key];
  }
  const ops: Promise<any>[] = [
    db.update(usersTable).set(userUpdates).where(eq(usersTable.id, id)).returning(),
  ];
  const profileUpdates: Record<string, any> = {};
  if (req.body.birthday !== undefined) profileUpdates.birthday = req.body.birthday || null;
  if (req.body.emailMarketingOptIn !== undefined) profileUpdates.emailMarketingOptIn = Boolean(req.body.emailMarketingOptIn);
  if (req.body.payAtPickupEnabled !== undefined) profileUpdates.payAtPickupEnabled = Boolean(req.body.payAtPickupEnabled);
  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updatedAt = new Date();
    ops.push(
      db.update(customerProfilesTable)
        .set(profileUpdates)
        .where(eq(customerProfilesTable.userId, id))
    );
  }
  const [[updated]] = await Promise.all(ops);
  const { passwordHash: _pw, ...safeUser } = updated;
  return res.json({ data: safeUser });
});

// ── POST /director/customers/:id/notes ────────────────────────────────────────
router.post('/customers/:id/notes', allowedRoles, requireUsers, async (req, res) => {
  const userId = getRouteParam(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Note content required.' });
  const [note] = await db.insert(customerNotesTable).values({
    id: randomUUID(), userId,
    authorId: req.user!.id, authorName: req.user!.name ?? 'Staff',
    content: content.trim(),
  }).returning();
  return res.status(201).json({ data: note });
});

// ── DELETE /director/customers/:id/notes/:noteId ──────────────────────────────
router.delete('/customers/:id/notes/:noteId', allowedRoles, requireUsers, async (req, res) => {
  const noteId = getRouteParam(req.params.noteId);
  await db.delete(customerNotesTable).where(eq(customerNotesTable.id, noteId));
  return res.json({ ok: true });
});

// ── POST /director/customers/:id/badges ───────────────────────────────────────
router.post('/customers/:id/badges', allowedRoles, requireUsers, async (req, res) => {
  const userId = getRouteParam(req.params.id);
  const { badge, note } = req.body;
  const VALID = ['vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer', 'inactive', 'at_risk', 'wholesale_partner'];
  if (!VALID.includes(badge)) return res.status(400).json({ error: 'Invalid badge.' });
  const [b] = await db.insert(customerBadgesTable).values({
    id: randomUUID(), userId,
    badge, addedByUserId: req.user!.id, note: note ?? null,
  }).returning();
  return res.status(201).json({ data: b });
});

// ── DELETE /director/customers/:id/badges/:badgeId ────────────────────────────
router.delete('/customers/:id/badges/:badgeId', allowedRoles, requireUsers, async (req, res) => {
  const badgeId = getRouteParam(req.params.badgeId);
  await db.delete(customerBadgesTable).where(eq(customerBadgesTable.id, badgeId));
  return res.json({ ok: true });
});

export default router;
