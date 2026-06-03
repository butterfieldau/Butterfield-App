import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, usersTable, customerProfilesTable, ordersTable,
  wholesaleAccountsTable, userAddressesTable,
  customerNotesTable, customerBadgesTable, loyaltyTransactionsTable,
  notificationLogsTable,
} from '@workspace/db';
import { eq, desc, count, sum, gte, and, inArray, sql, lt, gt, isNotNull } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { sendNotification } from '../lib/notificationService.js';

const router = Router();

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
  const now   = new Date();
  const weekAgo  = new Date(Date.now() - 7 * 86400000);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const thirtyDaysAgo = monthAgo;

  const [[totalCustomers], [newThisMonth], [totalWholesale], spenderData,
    orderCounts, profileData] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, 'customer')),
    db.select({ count: count() }).from(usersTable).where(
      and(eq(usersTable.role, 'customer'), gte(usersTable.createdAt, monthAgo))
    ),
    db.select({ count: count() }).from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.status, 'approved')),
    db.select({
      userId: customerProfilesTable.userId,
      totalSpentCents: customerProfilesTable.totalSpentCents,
      totalVisits: customerProfilesTable.totalVisits,
    }).from(customerProfilesTable).orderBy(desc(customerProfilesTable.totalSpentCents)).limit(5),
    db.select({
      userId: ordersTable.userId,
      orderCount: count(),
      lastOrderAt: sql<string>`MAX(${ordersTable.createdAt})::text`,
      totalCents: sum(ordersTable.totalCents),
    }).from(ordersTable)
      .where(sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)
      .groupBy(ordersTable.userId),
    db.select({
      userId: customerProfilesTable.userId,
      loyaltyPoints: customerProfilesTable.loyaltyPoints,
      coffeeStampCount: customerProfilesTable.coffeeStampCount,
      stampCount: customerProfilesTable.stampCount,
    }).from(customerProfilesTable),
  ]);

  const topIds  = spenderData.map(s => s.userId);
  const topUsers = topIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, topIds))
    : [];
  const nameMap = Object.fromEntries(topUsers.map(u => [u.id, u.name]));

  // Compute metrics
  const orderMap: Record<string, { orderCount: number; lastOrderAt: string | null; totalCents: number }> = {};
  for (const r of orderCounts) {
    orderMap[r.userId] = {
      orderCount: parseInt(String(r.orderCount ?? 0)),
      lastOrderAt: r.lastOrderAt,
      totalCents: parseInt(String(r.totalCents ?? 0)),
    };
  }

  let repeatCustomers = 0, inactiveCount = 0, vipCount = 0;
  let totalSpendSum = 0, spendingCustomers = 0;

  for (const [uid, od] of Object.entries(orderMap)) {
    const daysSince = od.lastOrderAt
      ? Math.floor((Date.now() - new Date(od.lastOrderAt).getTime()) / 86400000) : null;
    const badges = computeAutoBadges(od.orderCount, od.totalCents, daysSince, false);
    if (od.orderCount >= 2) repeatCustomers++;
    if (badges.includes('inactive')) inactiveCount++;
    if (badges.includes('vip')) vipCount++;
    if (od.totalCents > 0) { totalSpendSum += od.totalCents; spendingCustomers++; }
  }

  const rewardsMemberCount  = profileData.filter(p => (p.loyaltyPoints ?? 0) > 0).length;
  const coffeeStampUserCount = profileData.filter(p => (p.coffeeStampCount ?? 0) > 0 || (p.stampCount ?? 0) > 0).length;
  const avgSpendCents = spendingCustomers > 0 ? Math.round(totalSpendSum / spendingCustomers) : 0;

  return res.json({
    data: {
      totalCustomers: totalCustomers.count,
      newThisMonth: newThisMonth.count,
      newThisWeek: 0,
      totalWholesale: totalWholesale.count,
      repeatCustomers,
      inactiveCount,
      vipCount,
      rewardsMemberCount,
      coffeeStampUserCount,
      avgSpendCents,
      topSpenders: spenderData.map(s => ({
        userId: s.userId,
        name: nameMap[s.userId] ?? 'Unknown',
        totalSpentCents: s.totalSpentCents,
        totalVisits: s.totalVisits,
      })),
    },
  });
});

// ── GET /director/customers/segments ─────────────────────────────────────────
router.get('/customers/segments', allowedRoles, requireUsers, async (req, res) => {
  const [customers, profiles, orderStats, waList, manualBadges] = await Promise.all([
    db.select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
      .from(usersTable)
      .where(sql`${usersTable.role} IN ('customer', 'wholesale')`),
    db.select({
      userId: customerProfilesTable.userId,
      loyaltyPoints: customerProfilesTable.loyaltyPoints,
      coffeeStampCount: customerProfilesTable.coffeeStampCount,
      stampCount: customerProfilesTable.stampCount,
    }).from(customerProfilesTable),
    db.select({
      userId: ordersTable.userId,
      orderCount: count(),
      totalCents: sum(ordersTable.totalCents),
      lastOrderAt: sql<string>`MAX(${ordersTable.createdAt})::text`,
      pickupCount: sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'pickup' THEN 1 ELSE 0 END)`,
      deliveryCount: sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'delivery' THEN 1 ELSE 0 END)`,
    }).from(ordersTable)
      .where(sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)
      .groupBy(ordersTable.userId),
    db.select({ userId: wholesaleAccountsTable.userId })
      .from(wholesaleAccountsTable)
      .where(eq(wholesaleAccountsTable.status, 'approved')),
    db.select().from(customerBadgesTable),
  ]);

  const profileMap  = Object.fromEntries(profiles.map(p => [p.userId, p]));
  const orderMap: Record<string, any> = Object.fromEntries(orderStats.map(o => [o.userId, {
    orderCount: parseInt(String(o.orderCount ?? 0)),
    totalCents: parseInt(String(o.totalCents ?? 0)),
    lastOrderAt: o.lastOrderAt,
    pickupCount: parseInt(String(o.pickupCount ?? 0)),
    deliveryCount: parseInt(String(o.deliveryCount ?? 0)),
  }]));
  const waSet = new Set(waList.map(w => w.userId));
  const badgeMap: Record<string, string[]> = {};
  for (const b of manualBadges) {
    if (!badgeMap[b.userId]) badgeMap[b.userId] = [];
    badgeMap[b.userId].push(b.badge);
  }

  const now = Date.now();
  const counts = {
    vip: 0, highSpenders: 0, inactive: 0, new: 0,
    coffeeRegulars: 0, rewardsMembers: 0, delivery: 0, pickup: 0, wholesale: 0,
  };

  for (const c of customers) {
    const od  = orderMap[c.id];
    const prof = profileMap[c.id];
    const isWholesale = waSet.has(c.id) || c.role === 'wholesale';
    const orderCount  = od?.orderCount ?? 0;
    const totalCents  = od?.totalCents ?? 0;
    const lastOrderAt = od?.lastOrderAt ?? null;
    const daysSince   = lastOrderAt ? Math.floor((now - new Date(lastOrderAt).getTime()) / 86400000) : null;
    const autoBadges  = computeAutoBadges(orderCount, totalCents, daysSince, isWholesale);
    const manualList  = badgeMap[c.id] ?? [];
    const allBadges   = new Set([...autoBadges, ...manualList]);

    if (isWholesale) { counts.wholesale++; continue; }
    if (allBadges.has('vip')) counts.vip++;
    if (allBadges.has('high_spend') || allBadges.has('vip')) counts.highSpenders++;
    if (allBadges.has('inactive')) counts.inactive++;
    if (allBadges.has('new') && !allBadges.has('returning') && !allBadges.has('loyal') && !allBadges.has('vip')) counts.new++;
    if ((prof?.coffeeStampCount ?? 0) > 0 || (prof?.stampCount ?? 0) > 0) counts.coffeeRegulars++;
    if ((prof?.loyaltyPoints ?? 0) > 0) counts.rewardsMembers++;
    if ((od?.deliveryCount ?? 0) > (od?.pickupCount ?? 0)) counts.delivery++;
    else if ((od?.pickupCount ?? 0) > 0) counts.pickup++;
  }

  const segments = [
    { key: 'vip',            label: 'VIP',             count: counts.vip,            icon: 'star',       color: '#7C3AED', description: '15+ orders or $1,000+ spend' },
    { key: 'high_spend',     label: 'High Spenders',   count: counts.highSpenders,   icon: 'trending-up',color: '#D97706', description: '$500+ total spend' },
    { key: 'inactive',       label: 'Inactive',        count: counts.inactive,       icon: 'clock',      color: '#EF4444', description: 'No order in 30+ days' },
    { key: 'new',            label: 'New',             count: counts.new,            icon: 'user-plus',  color: '#6B7280', description: '0–1 orders placed' },
    { key: 'coffee_regular', label: 'Coffee Regulars', count: counts.coffeeRegulars, icon: 'coffee',     color: '#92400E', description: 'Active coffee stamp users' },
    { key: 'rewards_member', label: 'Rewards Members', count: counts.rewardsMembers, icon: 'gift',       color: '#059669', description: 'Have earned loyalty points' },
    { key: 'delivery',       label: 'Delivery',        count: counts.delivery,       icon: 'truck',      color: '#0284C7', description: 'Prefer delivery orders' },
    { key: 'pickup',         label: 'Pickup',          count: counts.pickup,         icon: 'map-pin',    color: '#1493FF', description: 'Prefer in-store pickup' },
    { key: 'wholesale',      label: 'Wholesale',       count: counts.wholesale,      icon: 'briefcase',  color: '#22C55E', description: 'Approved wholesale accounts' },
  ];

  return res.json({ data: segments });
});

// ── POST /director/customers/segments/:segment/notify ─────────────────────────
router.post('/customers/segments/:segment/notify', allowedRoles, requireUsers, async (req, res) => {
  const segment = getRouteParam(req.params.segment);
  const { title, body } = req.body;
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body are required.' });

  // Resolve user IDs for this segment
  const [customers, profiles, orderStats, waList, manualBadges] = await Promise.all([
    db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable).where(sql`${usersTable.role} IN ('customer', 'wholesale')`),
    db.select({ userId: customerProfilesTable.userId, loyaltyPoints: customerProfilesTable.loyaltyPoints, coffeeStampCount: customerProfilesTable.coffeeStampCount, stampCount: customerProfilesTable.stampCount })
      .from(customerProfilesTable),
    db.select({
      userId: ordersTable.userId, orderCount: count(),
      totalCents: sum(ordersTable.totalCents),
      lastOrderAt: sql<string>`MAX(${ordersTable.createdAt})::text`,
      pickupCount: sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'pickup' THEN 1 ELSE 0 END)`,
      deliveryCount: sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'delivery' THEN 1 ELSE 0 END)`,
    }).from(ordersTable).where(sql`${ordersTable.status} NOT IN ('cancelled','refunded')`).groupBy(ordersTable.userId),
    db.select({ userId: wholesaleAccountsTable.userId }).from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.status, 'approved')),
    db.select().from(customerBadgesTable),
  ]);

  const profileMap = Object.fromEntries(profiles.map(p => [p.userId, p]));
  const orderMap: Record<string, any> = Object.fromEntries(orderStats.map(o => [o.userId, {
    orderCount: parseInt(String(o.orderCount ?? 0)),
    totalCents: parseInt(String(o.totalCents ?? 0)),
    lastOrderAt: o.lastOrderAt,
    pickupCount: parseInt(String(o.pickupCount ?? 0)),
    deliveryCount: parseInt(String(o.deliveryCount ?? 0)),
  }]));
  const waSet = new Set(waList.map(w => w.userId));
  const badgeMap: Record<string, string[]> = {};
  for (const b of manualBadges) {
    if (!badgeMap[b.userId]) badgeMap[b.userId] = [];
    badgeMap[b.userId].push(b.badge);
  }

  const now = Date.now();
  const targetIds: string[] = [];

  for (const c of customers) {
    const od = orderMap[c.id];
    const prof = profileMap[c.id];
    const isWholesale = waSet.has(c.id) || c.role === 'wholesale';
    const orderCount = od?.orderCount ?? 0;
    const totalCents = od?.totalCents ?? 0;
    const lastOrderAt = od?.lastOrderAt ?? null;
    const daysSince = lastOrderAt ? Math.floor((now - new Date(lastOrderAt).getTime()) / 86400000) : null;
    const autoBadges = computeAutoBadges(orderCount, totalCents, daysSince, isWholesale);
    const manualList = badgeMap[c.id] ?? [];
    const allBadges = new Set([...autoBadges, ...manualList]);

    let matches = false;
    if (segment === 'wholesale')      matches = isWholesale;
    else if (segment === 'vip')       matches = allBadges.has('vip');
    else if (segment === 'high_spend') matches = allBadges.has('high_spend') || allBadges.has('vip');
    else if (segment === 'inactive')  matches = allBadges.has('inactive');
    else if (segment === 'new')       matches = allBadges.has('new') && !allBadges.has('returning') && !allBadges.has('loyal') && !allBadges.has('vip');
    else if (segment === 'coffee_regular') matches = (prof?.coffeeStampCount ?? 0) > 0 || (prof?.stampCount ?? 0) > 0;
    else if (segment === 'rewards_member') matches = (prof?.loyaltyPoints ?? 0) > 0;
    else if (segment === 'delivery')  matches = (od?.deliveryCount ?? 0) > (od?.pickupCount ?? 0);
    else if (segment === 'pickup')    matches = (od?.pickupCount ?? 0) > 0 && (od?.pickupCount ?? 0) >= (od?.deliveryCount ?? 0);

    if (matches) targetIds.push(c.id);
  }

  if (targetIds.length === 0) return res.json({ ok: true, sent: 0, message: 'No customers in this segment.' });

  await sendNotification({
    userIds: targetIds,
    type: 'crm_segment',
    title: title.trim(),
    body: body.trim(),
    sentBy: req.user!.id,
    logTargetLabel: `segment:${segment}`,
  });

  // Insert per-recipient log rows so each customer's timeline shows this notification
  if (targetIds.length > 0) {
    const now = new Date();
    await db.insert(notificationLogsTable).values(
      targetIds.map(uid => ({
        id: randomUUID(),
        type: 'crm_segment',
        title: title.trim(),
        body: body.trim(),
        targetUserId: uid,
        targetRole: `segment:${segment}`,
        sentBy: req.user!.id,
        successCount: 0,
        sentAt: now,
      }))
    );
  }

  return res.json({ ok: true, sent: targetIds.length });
});

// ── GET /director/customers ───────────────────────────────────────────────────
router.get('/customers', allowedRoles, requireUsers, async (req, res) => {
  const {
    search = '', filter = 'all', segment = '',
    dateFrom = '', dateTo = '',
    minSpendCents = '', maxSpendCents = '',
    minOrders = '', maxOrders = '',
    lastOrderFrom = '', lastOrderTo = '',
    searchOrders = '',
  } = req.query as Record<string, string>;

  const customers = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.role} IN ('customer', 'wholesale')`)
    .orderBy(desc(usersTable.createdAt))
    .limit(500);

  if (customers.length === 0) return res.json({ data: [] });

  const userIds = customers.map(c => c.id);

  // Order-history keyword search: find userIds that have matching items
  let orderSearchUserIds: Set<string> | null = null;
  if (searchOrders.trim()) {
    const kw = `%${searchOrders.trim().toLowerCase()}%`;
    const matchingOrders = await db.select({ userId: ordersTable.userId })
      .from(ordersTable)
      .where(and(
        inArray(ordersTable.userId, userIds),
        sql`lower(${ordersTable.items}::text) LIKE ${kw}`,
      ));
    orderSearchUserIds = new Set(matchingOrders.map(o => o.userId));
  }

  const [profiles, orderStats, waList, manualBadges, defaultAddresses] = await Promise.all([
    db.select().from(customerProfilesTable).where(inArray(customerProfilesTable.userId, userIds)),
    db.select({
      userId:       ordersTable.userId,
      orderCount:   count(),
      totalCents:   sum(ordersTable.totalCents),
      lastOrderAt:  sql<string>`MAX(${ordersTable.createdAt})::text`,
      pickupCount:  sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'pickup' THEN 1 ELSE 0 END)`,
      deliveryCount:sql<number>`SUM(CASE WHEN ${ordersTable.type} = 'delivery' THEN 1 ELSE 0 END)`,
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
  const orderMap: Record<string, any>    = {};
  for (const o of orderStats) {
    orderMap[o.userId] = {
      orderCount: parseInt(String(o.orderCount ?? 0)),
      totalCents: parseInt(String(o.totalCents ?? 0)),
      lastOrderAt: o.lastOrderAt,
      pickupCount: parseInt(String(o.pickupCount ?? 0)),
      deliveryCount: parseInt(String(o.deliveryCount ?? 0)),
    };
  }
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
    const od  = orderMap[c.id] ?? {};
    const orderCount      = od.orderCount ?? 0;
    const totalSpentCents = od.totalCents ?? 0;
    const lastOrderAt     = od.lastOrderAt ?? null;
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
      pickupCount: od.pickupCount ?? 0, deliveryCount: od.deliveryCount ?? 0,
      wholesaleAccount: wa,
      badges: [...new Set([...autoBadges, ...manualList])],
      manualBadges: badgeMap[c.id] ?? [],
    };
  });

  // ── Search ────────────────────────────────────────────────────────────────
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.wholesaleAccount?.companyName?.toLowerCase().includes(q))
    );
  }

  // Order-history keyword search
  if (orderSearchUserIds !== null) {
    result = result.filter(c => orderSearchUserIds!.has(c.id));
  }

  // ── Date range (account registration) ────────────────────────────────────
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from.getTime())) result = result.filter(c => new Date(c.createdAt as any) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
    if (!isNaN(to.getTime())) result = result.filter(c => new Date(c.createdAt as any) <= to);
  }

  // ── Spend filters ─────────────────────────────────────────────────────────
  if (minSpendCents) {
    const min = parseInt(minSpendCents, 10);
    if (!isNaN(min)) result = result.filter(c => c.totalSpentCents >= min);
  }
  if (maxSpendCents) {
    const max = parseInt(maxSpendCents, 10);
    if (!isNaN(max)) result = result.filter(c => c.totalSpentCents <= max);
  }

  // ── Order count filters ───────────────────────────────────────────────────
  if (minOrders) {
    const min = parseInt(minOrders, 10);
    if (!isNaN(min)) result = result.filter(c => c.orderCount >= min);
  }
  if (maxOrders) {
    const max = parseInt(maxOrders, 10);
    if (!isNaN(max)) result = result.filter(c => c.orderCount <= max);
  }

  // ── Last order date filters ───────────────────────────────────────────────
  if (lastOrderFrom) {
    const from = new Date(lastOrderFrom);
    if (!isNaN(from.getTime())) result = result.filter(c => c.lastOrderAt && new Date(c.lastOrderAt) >= from);
  }
  if (lastOrderTo) {
    const to = new Date(lastOrderTo); to.setHours(23, 59, 59, 999);
    if (!isNaN(to.getTime())) result = result.filter(c => c.lastOrderAt && new Date(c.lastOrderAt) <= to);
  }

  // ── Legacy filter ─────────────────────────────────────────────────────────
  if      (filter === 'retail')     result = result.filter(c => !c.wholesaleAccount);
  else if (filter === 'wholesale')  result = result.filter(c => !!c.wholesaleAccount);
  else if (filter === 'vip')        result = result.filter(c => c.badges.includes('vip'));
  else if (filter === 'loyal')      result = result.filter(c => c.badges.includes('loyal'));
  else if (filter === 'inactive')   result = result.filter(c => c.badges.includes('inactive') || c.status === 'inactive');
  else if (filter === 'high_spend') result = result.filter(c => c.badges.includes('high_spend'));
  else if (filter === 'flagged')    result = result.filter(c => c.badges.includes('needs_follow_up') || c.badges.includes('flagged'));

  // ── Segment filter ────────────────────────────────────────────────────────
  if (segment && segment !== 'all') {
    result = result.filter(c => {
      const allBadges = new Set(c.badges);
      const isWholesale = !!c.wholesaleAccount;
      const prof = profileMap[c.id];
      if (segment === 'wholesale')       return isWholesale;
      if (segment === 'vip')             return allBadges.has('vip');
      if (segment === 'high_spend')      return allBadges.has('high_spend') || allBadges.has('vip');
      if (segment === 'inactive')        return allBadges.has('inactive');
      if (segment === 'new')             return allBadges.has('new') && !allBadges.has('returning') && !allBadges.has('loyal') && !allBadges.has('vip');
      if (segment === 'coffee_regular')  return (prof?.coffeeStampCount ?? 0) > 0 || (prof?.stampCount ?? 0) > 0;
      if (segment === 'rewards_member')  return (prof?.loyaltyPoints ?? 0) > 0;
      if (segment === 'delivery')        return c.deliveryCount > c.pickupCount;
      if (segment === 'pickup')          return c.pickupCount > 0 && c.pickupCount >= c.deliveryCount;
      return true;
    });
  }

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

  const wa = waList[0] ?? null;

  // Fetch wholesale orders if wholesale account exists
  let wholesaleOrderStats: {
    orderCount: number;
    totalValueCents: number;
    lastOrderAt: string | null;
    pendingInvoiceCents: number;
  } | null = null;

  if (wa) {
    const { wholesaleOrdersTable } = await import('@workspace/db');
    const [wsOrderStats] = await db
      .select({
        orderCount:       count(),
        totalValueCents:  sum(wholesaleOrdersTable.totalCents),
        lastOrderAt:      sql<string>`MAX(${wholesaleOrdersTable.createdAt})::text`,
        pendingInvoiceCents: sql<number>`COALESCE(SUM(CASE WHEN ${wholesaleOrdersTable.isPaid} = false THEN ${wholesaleOrdersTable.totalCents} ELSE 0 END), 0)`,
      })
      .from(wholesaleOrdersTable)
      .where(eq(wholesaleOrdersTable.accountId, wa.id));

    wholesaleOrderStats = {
      orderCount:       parseInt(String(wsOrderStats?.orderCount ?? 0)),
      totalValueCents:  parseInt(String(wsOrderStats?.totalValueCents ?? 0)),
      lastOrderAt:      wsOrderStats?.lastOrderAt ?? null,
      pendingInvoiceCents: parseInt(String(wsOrderStats?.pendingInvoiceCents ?? 0)),
    };
  }

  const validOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
  const totalSpentCents = validOrders.reduce((s, o) => s + o.totalCents, 0);
  const avgOrderCents   = validOrders.length > 0 ? Math.round(totalSpentCents / validOrders.length) : 0;
  const cancelledCount  = orders.filter(o => o.status === 'cancelled').length;
  const refundedCount   = orders.filter(o => o.status === 'refunded').length;
  const lastOrderAt     = orders[0]?.createdAt ?? null;
  const daysSince       = lastOrderAt ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000) : null;
  const pickupCount     = orders.filter(o => o.type === 'pickup').length;
  const deliveryCount   = orders.filter(o => o.type === 'delivery').length;

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

  let paymentMethods: Array<{
    id: string; brand: string; last4: string;
    expMonth: number | null; expYear: number | null; isDefault: boolean;
  }> = [];

  if (user.stripeCustomerId) {
    try {
      const { getUncachableStripeClient } = await import('../stripeClient.js');
      const stripe = await getUncachableStripeClient();
      const [customerRecord, stripeMethods] = await Promise.all([
        stripe.customers.retrieve(user.stripeCustomerId),
        stripe.paymentMethods.list({ customer: user.stripeCustomerId, type: 'card' }),
      ]);
      const defaultPaymentMethodId =
        !('deleted' in customerRecord) && typeof customerRecord.invoice_settings.default_payment_method === 'string'
          ? customerRecord.invoice_settings.default_payment_method
          : null;
      paymentMethods = stripeMethods.data.map((method) => ({
        id: method.id, brand: method.card?.brand ?? 'card', last4: method.card?.last4 ?? '0000',
        expMonth: method.card?.exp_month ?? null, expYear: method.card?.exp_year ?? null,
        isDefault: method.id === defaultPaymentMethodId,
      }));
    } catch (err) {
      req.log.warn({ err, userId: id }, 'Could not load Stripe payment method summaries for customer');
    }
  }

  return res.json({
    data: {
      id: user.id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage,
      role: user.role, status: user.status, createdAt: user.createdAt, lastLogin: user.lastLogin,
      profile: profile[0] ?? null,
      wholesaleAccount: wa ? {
        ...wa,
        orderStats: wholesaleOrderStats,
      } : null,
      addresses, orders,
      orderStats: { orderCount: orders.length, totalSpentCents, avgOrderCents, cancelledCount, refundedCount, lastOrderAt, daysSinceLastOrder: daysSince, topProducts, pickupCount, deliveryCount },
      notes, badges: allBadges, manualBadges: badges,
      loyaltyStats: { totalEarnedPoints, totalRedeemedPoints },
      loyaltyTransactions: loyaltyTxns,
      paymentMethods,
    },
  });
});

// ── GET /director/customers/:id/timeline ──────────────────────────────────────
router.get('/customers/:id/timeline', allowedRoles, requireUsers, async (req, res) => {
  const id = getRouteParam(req.params.id);
  const limit  = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
  const offset = parseInt(String(req.query.offset ?? '0'));

  const [[user], orders, loyaltyTxns, notes, notifLogs] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, id)),
    db.select().from(ordersTable).where(eq(ordersTable.userId, id)).orderBy(desc(ordersTable.createdAt)).limit(200),
    db.select().from(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, id)).orderBy(desc(loyaltyTransactionsTable.createdAt)).limit(200),
    db.select().from(customerNotesTable).where(eq(customerNotesTable.userId, id)).orderBy(desc(customerNotesTable.createdAt)).limit(100),
    db.select().from(notificationLogsTable).where(eq(notificationLogsTable.targetUserId, id)).orderBy(desc(notificationLogsTable.sentAt)).limit(50),
  ]);

  if (!user) return res.status(404).json({ error: 'Customer not found.' });

  type TimelineEvent = { type: string; date: string; summary: string; meta: Record<string, any> };
  const events: TimelineEvent[] = [];

  for (const o of orders) {
    const items = Array.isArray(o.items) ? o.items as any[] : [];
    const count  = items.reduce((s, i) => s + (i.quantity ?? 1), 0);
    let summary = `Order placed — ${count} item${count !== 1 ? 's' : ''} · $${(o.totalCents / 100).toFixed(2)}`;
    if (o.status === 'cancelled') summary = `Order cancelled · $${(o.totalCents / 100).toFixed(2)}`;
    else if (o.status === 'refunded') summary = `Order refunded · $${(o.totalCents / 100).toFixed(2)}`;
    events.push({
      type: 'order',
      date: (o.createdAt as any)?.toISOString?.() ?? String(o.createdAt),
      summary,
      meta: { orderId: o.id, status: o.status, totalCents: o.totalCents, orderType: o.type, itemCount: count },
    });
  }

  for (const t of loyaltyTxns) {
    const pts = t.points ?? 0;
    const prefix = pts >= 0 ? '+' : '';
    if (t.type === 'note_deleted') {
      events.push({
        type: 'note_deleted',
        date: (t.createdAt as any)?.toISOString?.() ?? String(t.createdAt),
        summary: t.description ?? 'Note deleted',
        meta: { noteId: t.referenceId },
      });
      continue;
    }
    const isStamp = t.type === 'stamp' || t.description?.toLowerCase().includes('stamp');
    events.push({
      type: isStamp ? 'stamp' : 'loyalty',
      date: (t.createdAt as any)?.toISOString?.() ?? String(t.createdAt),
      summary: t.description ?? `${prefix}${pts} points`,
      meta: { points: pts, txnType: t.type, referenceId: t.referenceId },
    });
  }

  for (const n of notes) {
    events.push({
      type: 'note',
      date: (n.createdAt as any)?.toISOString?.() ?? String(n.createdAt),
      summary: `Note added by ${n.authorName}`,
      meta: { content: n.content, authorName: n.authorName, noteId: n.id },
    });
  }

  for (const n of notifLogs) {
    events.push({
      type: 'notification',
      date: (n.sentAt as any)?.toISOString?.() ?? String(n.sentAt),
      summary: `Push sent: ${n.title}`,
      meta: { title: n.title, body: n.body, successCount: n.successCount },
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total  = events.length;
  const paged  = events.slice(offset, offset + limit);

  return res.json({ data: paged, total, offset, limit });
});

// ── POST /director/customers/:id/stamps/adjust ────────────────────────────────
router.post('/customers/:id/stamps/adjust', allowedRoles, requireUsers, async (req, res) => {
  const userId = getRouteParam(req.params.id);
  const { amount, reason } = req.body;
  const delta = parseInt(String(amount ?? 0));
  if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'amount must be a non-zero integer.' });
  if (!reason?.trim()) return res.status(400).json({ error: 'reason is required.' });

  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId));
  if (!profile) return res.status(404).json({ error: 'Customer profile not found.' });

  const newCount = Math.max(0, (profile.coffeeStampCount ?? 0) + delta);
  await Promise.all([
    db.update(customerProfilesTable)
      .set({ coffeeStampCount: newCount, updatedAt: new Date() })
      .where(eq(customerProfilesTable.userId, userId)),
    db.insert(loyaltyTransactionsTable).values({
      id: randomUUID(), userId,
      points: 0,
      type: 'stamp',
      description: `${delta > 0 ? '+' : ''}${delta} coffee stamp${Math.abs(delta) !== 1 ? 's' : ''} — ${reason.trim()} (by ${req.user!.name ?? 'staff'})`,
      referenceId: null,
    }),
  ]);

  return res.json({ ok: true, newStampCount: newCount });
});

// ── POST /director/customers/:id/notify ───────────────────────────────────────
router.post('/customers/:id/notify', allowedRoles, requireUsers, async (req, res) => {
  const userId = getRouteParam(req.params.id);
  const { title, body } = req.body;
  if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body are required.' });

  await sendNotification({
    userId,
    type: 'crm_direct',
    title: title.trim(),
    body: body.trim(),
    sentBy: req.user!.id,
  });

  return res.json({ ok: true });
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
  const userId = getRouteParam(req.params.id);
  const noteId = getRouteParam(req.params.noteId);

  // Capture note before deletion so we can write an audit event
  const [note] = await db.select().from(customerNotesTable).where(eq(customerNotesTable.id, noteId));

  await db.delete(customerNotesTable).where(eq(customerNotesTable.id, noteId));

  // Record a note_deleted audit event in loyalty transactions
  if (note) {
    const preview = (note.content ?? '').slice(0, 80) + (note.content && note.content.length > 80 ? '…' : '');
    await db.insert(loyaltyTransactionsTable).values({
      id: randomUUID(), userId,
      points: 0,
      type: 'note_deleted',
      description: `Note deleted by ${req.user!.name ?? 'staff'}: "${preview}"`,
      referenceId: noteId,
    });
  }

  return res.json({ ok: true });
});

// ── POST /director/customers/:id/badges ───────────────────────────────────────
router.post('/customers/:id/badges', allowedRoles, requireUsers, async (req, res) => {
  const userId = getRouteParam(req.params.id);
  const { badge, note } = req.body;
  const VALID = ['vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer', 'inactive', 'at_risk', 'wholesale_partner', 'issue', 'regular', 'birthday_offer'];
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
