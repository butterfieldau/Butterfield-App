import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  db, usersTable, customerProfilesTable, staffProfilesTable,
  wholesaleAccountsTable, wholesaleOrdersTable, ordersTable, storeSettingsTable, productsTable,
  staffShiftsTable, staffIssuesTable, staffWastageTable, staffLeaveRequestsTable,
  feedbackTable, loyaltyRewardsTable, announcementsTable, managerProfilesTable,
  wholesaleCardsTable,
} from '@workspace/db';
import { eq, desc, count, sum, gte, lte, lt, isNull, isNotNull, and, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { notifyUser } from '../lib/notificationService.js';

const router = Router();
router.use(requireRole('director', 'manager'));

// ── Enhanced Dashboard stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate());
  const startOfWeek  = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), 1);
  const longShiftCutoff = new Date(now.getTime() - 10 * 60 * 60 * 1000);
  const todayMMDD = `${String(sydneyNow.getMonth() + 1).padStart(2,'0')}-${String(sydneyNow.getDate()).padStart(2,'0')}`;

  const [
    [totalOrders], [todayOrders], [weekOrders],
    [todayRev], [weekRev], [monthRev],
    [activeOrders], [wholesaleOrders],
    [totalUsers], [pendingStaff], [pendingWholesale], [totalWholesale],
    [totalProducts], [soldOutProds], [lowStockProds],
    [clockedIn], [longShifts],
    [openIssues], [highIssues],
    [wastageToday], [wastageCostToday],
    [pendingLeave],
    [unreadFeedback],
  ] = await Promise.all([
    db.select({ count: count() }).from(ordersTable),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfToday), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfWeek),  sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfMonth), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ count: count() }).from(ordersTable).where(sql`${ordersTable.status} IN ('received','being_prepared','ready_for_pickup')`),
    db.select({ count: count() }).from(ordersTable).where(and(gte(ordersTable.createdAt, startOfToday), sql`${ordersTable.status} = 'received'`)),
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(staffProfilesTable).where(eq(staffProfilesTable.approvedByAdmin, false)),
    db.select({ count: count() }).from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.status, 'pending')),
    db.select({ count: count() }).from(wholesaleAccountsTable),
    db.select({ count: count() }).from(productsTable).where(eq(productsTable.isActive, true)),
    db.select({ count: count() }).from(productsTable).where(and(eq(productsTable.isSoldOut, true), eq(productsTable.isActive, true))),
    db.select({ count: count() }).from(productsTable).where(and(isNotNull(productsTable.stockCount), sql`${productsTable.stockCount} <= ${productsTable.lowStockThreshold}`, eq(productsTable.isActive, true))),
    db.select({ count: count() }).from(staffShiftsTable).where(isNull(staffShiftsTable.clockOut)),
    db.select({ count: count() }).from(staffShiftsTable).where(and(isNull(staffShiftsTable.clockOut), lte(staffShiftsTable.clockIn, longShiftCutoff))),
    db.select({ count: count() }).from(staffIssuesTable).where(eq(staffIssuesTable.status, 'open')),
    db.select({ count: count() }).from(staffIssuesTable).where(and(eq(staffIssuesTable.status, 'open'), sql`${staffIssuesTable.priority} IN ('high','urgent')`)),
    db.select({ count: count() }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfToday)),
    db.select({ total: sum(staffWastageTable.estimatedCostCents) }).from(staffWastageTable).where(gte(staffWastageTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(staffLeaveRequestsTable).where(eq(staffLeaveRequestsTable.status, 'pending')),
    db.select({ count: count() }).from(feedbackTable).where(eq(feedbackTable.isRead, false)),
  ]);

  // Birthday customers (birthday field stored as YYYY-MM-DD text, match MM-DD suffix)
  let birthdayCount = 0;
  try {
    const [bday] = await db.select({ count: count() }).from(customerProfilesTable)
      .where(sql`RIGHT(${customerProfilesTable.birthday}, 5) = ${todayMMDD}`);
    birthdayCount = bday.count;
  } catch {}

  return res.json({
    data: {
      orders: {
        total:        totalOrders.count,
        today:        todayOrders.count,
        week:         weekOrders.count,
        active:       activeOrders.count,
        wholesaleNew: wholesaleOrders.count,
      },
      revenue: {
        today: Number(todayRev.total  ?? 0),
        week:  Number(weekRev.total   ?? 0),
        month: Number(monthRev.total  ?? 0),
      },
      staff: {
        clockedIn:  clockedIn.count,
        longShifts: longShifts.count,
        pendingLeave: pendingLeave.count,
      },
      users: {
        total:            totalUsers.count,
        pendingStaff:     pendingStaff.count,
        pendingWholesale: pendingWholesale.count,
        totalWholesale:   totalWholesale.count,
      },
      products: {
        total:     totalProducts.count,
        soldOut:   soldOutProds.count,
        lowStock:  lowStockProds.count,
      },
      issues: {
        open:     openIssues.count,
        high:     highIssues.count,
      },
      wastage: {
        countToday: wastageToday.count,
        costToday:  Number(wastageCostToday.total ?? 0),
      },
      customers: {
        birthdayToday: birthdayCount,
        unreadFeedback: unreadFeedback.count,
      },
    },
  });
});

// ── Activity log ─────────────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  const [orders, issues, wastage, leave] = await Promise.all([
    db.select({
      id: ordersTable.id, createdAt: ordersTable.createdAt,
      status: ordersTable.status, totalCents: ordersTable.totalCents,
    }).from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(15),
    db.select({
      id: staffIssuesTable.id, createdAt: staffIssuesTable.createdAt,
      title: staffIssuesTable.title, priority: staffIssuesTable.priority,
      status: staffIssuesTable.status,
    }).from(staffIssuesTable).orderBy(desc(staffIssuesTable.createdAt)).limit(8),
    db.select({
      id: staffWastageTable.id, createdAt: staffWastageTable.createdAt,
      productName: staffWastageTable.productName, reason: staffWastageTable.reason,
    }).from(staffWastageTable).orderBy(desc(staffWastageTable.createdAt)).limit(6),
    db.select({
      id: staffLeaveRequestsTable.id, createdAt: staffLeaveRequestsTable.createdAt,
      type: staffLeaveRequestsTable.type, status: staffLeaveRequestsTable.status,
      startDate: staffLeaveRequestsTable.startDate,
    }).from(staffLeaveRequestsTable).orderBy(desc(staffLeaveRequestsTable.createdAt)).limit(5),
  ]);

  const events = [
    ...orders.map(o => ({ type: 'order',   id: o.id, title: `Order #${o.id.slice(-6).toUpperCase()}`, sub: `AUD $${((o.totalCents ?? 0) / 100).toFixed(2)} · ${o.status.replace(/_/g, ' ')}`, at: o.createdAt, icon: 'shopping-bag', color: '#40C0F2' })),
    ...issues.map(i => ({ type: 'issue',   id: i.id, title: `Issue: ${i.title}`, sub: `${i.priority} priority · ${i.status}`, at: i.createdAt, icon: 'alert-triangle', color: i.priority === 'urgent' || i.priority === 'high' ? '#EF4444' : '#F59E0B' })),
    ...wastage.map(w => ({ type: 'wastage', id: w.id, title: `Wastage: ${w.productName}`, sub: w.reason, at: w.createdAt, icon: 'trash-2', color: '#8B5CF6' })),
    ...leave.map(l => ({ type: 'leave',   id: l.id, title: `Leave request · ${l.type}`, sub: `From ${l.startDate} · ${l.status}`, at: l.createdAt, icon: 'calendar', color: '#22C55E' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);

  return res.json({ data: events });
});

// ── All orders (customer + wholesale merged, enriched with customer info) ─────
router.get('/orders', async (req, res) => {
  const [customerOrders, wholesaleOrders, allUsers, wsAccounts] = await Promise.all([
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(300),
    db.select().from(wholesaleOrdersTable).orderBy(desc(wholesaleOrdersTable.createdAt)).limit(150),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone }).from(usersTable),
    db.select({ id: wholesaleAccountsTable.id, userId: wholesaleAccountsTable.userId, companyName: wholesaleAccountsTable.companyName, abn: wholesaleAccountsTable.abn }).from(wholesaleAccountsTable),
  ]);
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const wsMap   = Object.fromEntries(wsAccounts.map(w => [w.userId, w]));
  const all = [
    ...customerOrders.map(o => ({
      ...o,
      orderSource:   'customer' as const,
      customerName:  userMap[o.userId]?.name  ?? null,
      customerEmail: userMap[o.userId]?.email ?? null,
      customerPhone: userMap[o.userId]?.phone ?? null,
    })),
    ...wholesaleOrders.map(wo => ({
      ...wo,
      type:          'wholesale',
      orderSource:   'wholesale' as const,
      customerName:  wsMap[wo.userId]?.companyName ?? userMap[wo.userId]?.name ?? null,
      customerEmail: userMap[wo.userId]?.email ?? null,
      customerPhone: userMap[wo.userId]?.phone ?? null,
      companyAbn:    wsMap[wo.userId]?.abn ?? null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 300);
  return res.json({ data: all });
});

router.patch('/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const CUSTOMER_VALID = ['received','being_prepared','ready_for_pickup','out_for_delivery','completed','cancelled','refunded'];
  const WHOLESALE_VALID = ['pending','processing','dispatched','delivered','cancelled'];

  const CUSTOMER_STATUS_MSG: Record<string, string> = {
    being_prepared:   'Your order is being prepared. ☕',
    ready_for_pickup: 'Your order is ready for pickup! 🎉',
    out_for_delivery: 'Your order is on its way! 🚚',
    completed:        'Your order is complete. Thanks for visiting! 🍪',
    cancelled:        'Your order has been cancelled.',
    refunded:         'Your order has been refunded.',
  };
  const WHOLESALE_STATUS_MSG: Record<string, string> = {
    processing: 'Your wholesale order is being processed.',
    dispatched: 'Your wholesale order has been dispatched. 🚚',
    delivered:  'Your wholesale order has been delivered. ✅',
    cancelled:  'Your wholesale order has been cancelled.',
  };

  const [customerOrder] = await db
    .select({ id: ordersTable.id, userId: ordersTable.userId })
    .from(ordersTable).where(eq(ordersTable.id, id));
  if (customerOrder) {
    if (!CUSTOMER_VALID.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const [updated] = await db.update(ordersTable).set({ status, updatedAt: new Date() }).where(eq(ordersTable.id, id)).returning();
    const msg = CUSTOMER_STATUS_MSG[status];
    if (msg) {
      notifyUser(customerOrder.userId, 'order_status', 'Butterfield Cookies', msg,
        { orderId: id, status, screen: '/(customer)/orders' }).catch(() => {});
    }
    return res.json({ data: updated });
  }

  const [wholesaleOrder] = await db
    .select({ id: wholesaleOrdersTable.id, userId: wholesaleOrdersTable.userId })
    .from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, id));
  if (wholesaleOrder) {
    if (!WHOLESALE_VALID.includes(status)) return res.status(400).json({ error: 'Invalid wholesale order status.' });
    const [updated] = await db.update(wholesaleOrdersTable).set({ status, updatedAt: new Date() }).where(eq(wholesaleOrdersTable.id, id)).returning();
    const msg = WHOLESALE_STATUS_MSG[status];
    if (msg) {
      notifyUser(wholesaleOrder.userId, 'order_status', 'Butterfield Wholesale', msg,
        { orderId: id, status, screen: '/(wholesale)/orders' }).catch(() => {});
    }
    return res.json({ data: { ...updated, orderSource: 'wholesale' } });
  }

  return res.status(404).json({ error: 'Order not found.' });
});

// ── All users ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  const staffProfiles = await db.select().from(staffProfilesTable);
  const wholesaleAccounts = await db.select().from(wholesaleAccountsTable);
  const spMap = Object.fromEntries(staffProfiles.map(s => [s.userId, s]));
  const waMap = Object.fromEntries(wholesaleAccounts.map(w => [w.userId, w]));
  const result = users.map(({ passwordHash: _pw, ...u }) => ({
    ...u,
    staffProfile:     spMap[u.id] ?? null,
    wholesaleAccount: waMap[u.id] ?? null,
  }));
  return res.json({ data: result });
});

// ── Staff member detail (GET + full PATCH) ───────────────────────────────────
router.get('/staff/:userId', async (req, res) => {
  const { userId } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, userId));
  const recentShifts = await db.select().from(staffShiftsTable)
    .where(eq(staffShiftsTable.userId, userId))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(10);
  const { passwordHash: _, ...safeUser } = user;
  return res.json({ data: { ...safeUser, staffProfile: profile ?? null, recentShifts } });
});

router.patch('/staff/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, email, phone, address, taxFileNumber, position, department, hourlyRateCents, employmentStatus } = req.body;

  const userUpdates: Record<string, any> = { updatedAt: new Date() };
  if (name  !== undefined) userUpdates.name  = String(name).trim();
  if (email !== undefined) userUpdates.email = String(email).trim().toLowerCase();
  if (phone !== undefined) userUpdates.phone = String(phone).trim() || null;
  if (Object.keys(userUpdates).length > 1) {
    await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, userId));
  }

  const profileUpdates: Record<string, any> = { updatedAt: new Date() };
  if (address         !== undefined) profileUpdates.address         = String(address).trim() || null;
  if (taxFileNumber   !== undefined) profileUpdates.taxFileNumber   = String(taxFileNumber).trim() || null;
  if (position        !== undefined) profileUpdates.position        = String(position).trim();
  if (department      !== undefined) profileUpdates.department      = String(department).trim();
  if (hourlyRateCents !== undefined) profileUpdates.hourlyRateCents = Number(hourlyRateCents);
  if (employmentStatus !== undefined) profileUpdates.employmentStatus = String(employmentStatus);
  if (Object.keys(profileUpdates).length > 1) {
    await db.update(staffProfilesTable).set(profileUpdates).where(eq(staffProfilesTable.userId, userId));
  }

  const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [updatedProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, userId));
  const { passwordHash: _, ...safeUser } = updatedUser;
  return res.json({ data: { ...safeUser, staffProfile: updatedProfile ?? null } });
});

// ── Director clock-in/out on behalf of a staff member ────────────────────────
router.post('/staff/:userId/clock-in', async (req, res) => {
  const { userId } = req.params;
  const existing = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Staff member is already clocked in.', shift: existing[0] });
  }
  const [shift] = await db.insert(staffShiftsTable).values({
    id: randomUUID(), userId, clockIn: new Date(), unpaidBreakMins: 0,
  }).returning();
  return res.status(201).json({ data: shift });
});

router.post('/staff/:userId/clock-out', async (req, res) => {
  const { userId } = req.params;
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
  if (!active) return res.status(400).json({ error: 'No active shift for this staff member.' });
  const now = new Date();
  const diffMs  = now.getTime() - active.clockIn.getTime();
  const hrs = (diffMs / 3_600_000).toFixed(2);
  const [shift] = await db.update(staffShiftsTable)
    .set({ clockOut: now, hoursWorked: hrs, unpaidBreakMins: 0 })
    .where(eq(staffShiftsTable.id, active.id)).returning();
  return res.json({ data: shift });
});

// ── Staff leave requests (per user) ──────────────────────────────────────────
router.get('/staff/:userId/leave', async (req, res) => {
  const rows = await db.select().from(staffLeaveRequestsTable)
    .where(eq(staffLeaveRequestsTable.userId, req.params.userId))
    .orderBy(desc(staffLeaveRequestsTable.createdAt))
    .limit(20);
  return res.json({ data: rows });
});

router.patch('/staff/leave/:leaveId/review', async (req, res) => {
  const { approved } = req.body;
  const newStatus = approved ? 'approved' : 'rejected';
  const [updated] = await db.update(staffLeaveRequestsTable)
    .set({ status: newStatus, reviewedBy: req.user!.id, reviewedAt: new Date() })
    .where(eq(staffLeaveRequestsTable.id, req.params.leaveId)).returning();
  if (!updated) return res.status(404).json({ error: 'Leave request not found.' });
  return res.json({ data: updated });
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
  if (!['approved','pending','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ status }).where(eq(wholesaleAccountsTable.id, accountId)).returning();
  return res.json({ data: updated });
});

// ── Wholesale account general update (credit limit, payment terms, delivery address, delivery fee) ──
router.patch('/wholesale/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const updates: Record<string, any> = {};
  if (req.body.creditLimitCents  !== undefined) updates.creditLimitCents  = Number(req.body.creditLimitCents);
  if (req.body.paymentTerms      !== undefined) updates.paymentTerms      = String(req.body.paymentTerms);
  if (req.body.deliveryAddress   !== undefined) updates.deliveryAddress   = String(req.body.deliveryAddress);
  if (req.body.deliveryFeeCents  !== undefined) updates.deliveryFeeCents  = Number(req.body.deliveryFeeCents);
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No updatable fields provided.' });
  const [updated] = await db.update(wholesaleAccountsTable).set(updates).where(eq(wholesaleAccountsTable.id, accountId)).returning();
  if (!updated) return res.status(404).json({ error: 'Wholesale account not found.' });
  return res.json({ data: updated });
});

// ── Products CRUD ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.sortOrder, productsTable.name);
  return res.json({ data: products });
});

router.post('/products', async (req, res) => {
  const {
    name, description, shortDescription, category, productType,
    priceCents, salePriceCents, costPriceCents, wholesalePriceCents, gstIncluded,
    sku, barcode, imageUrl,
    isAvailable, isFeatured, isNew, isWholesaleAvailable, isStaffOnly, isAppOnly,
    isLimitedDrop, isSoldOut, isComingSoon, isPickupOnly,
    tags, allergens, dietaryTags, ingredients, nutritionInfo,
    storageInstructions, servingInstructions,
    minOrderQty, maxOrderQty, leadTimeMins, availableDays, availableTimes,
    stockCount, lowStockThreshold, sortOrder,
  } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Product name is required.' });
  if (typeof priceCents !== 'number') return res.status(400).json({ error: 'Price is required.' });

  const [product] = await db.insert(productsTable).values({
    id: randomUUID(),
    name: name.trim(),
    description:        description        ?? '',
    shortDescription:   shortDescription   ?? null,
    category:           category           ?? 'cookies',
    productType:        productType        ?? 'standard',
    priceCents,
    salePriceCents:     salePriceCents     ?? null,
    costPriceCents:     costPriceCents     ?? null,
    wholesalePriceCents:wholesalePriceCents ?? null,
    gstIncluded:        gstIncluded        ?? true,
    sku:                sku                ?? null,
    barcode:            barcode            ?? null,
    imageUrl:           imageUrl           ?? null,
    isAvailable:        isAvailable        ?? true,
    isFeatured:         isFeatured         ?? false,
    isNew:              isNew              ?? false,
    isWholesaleAvailable: isWholesaleAvailable ?? true,
    isStaffOnly:        isStaffOnly        ?? false,
    isAppOnly:          isAppOnly          ?? false,
    isLimitedDrop:      isLimitedDrop      ?? false,
    isSoldOut:          isSoldOut          ?? false,
    isComingSoon:       isComingSoon        ?? false,
    isPickupOnly:       isPickupOnly        ?? false,
    tags:               tags               ? JSON.stringify(tags)         : null,
    allergens:          allergens          ? JSON.stringify(allergens)     : null,
    dietaryTags:        dietaryTags        ? JSON.stringify(dietaryTags)   : null,
    ingredients:        ingredients        ?? null,
    nutritionInfo:      nutritionInfo      ?? null,
    storageInstructions:storageInstructions ?? null,
    servingInstructions:servingInstructions ?? null,
    minOrderQty:        minOrderQty        ?? 1,
    maxOrderQty:        maxOrderQty        ?? null,
    leadTimeMins:       leadTimeMins        ?? null,
    availableDays:      availableDays       ? JSON.stringify(availableDays) : null,
    availableTimes:     availableTimes      ?? null,
    stockCount:         stockCount          ?? null,
    lowStockThreshold:  lowStockThreshold   ?? 10,
    sortOrder:          sortOrder           ?? 0,
  }).returning();
  return res.status(201).json({ data: product });
});

router.patch('/products/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = [
    'name','description','shortDescription','category','productType',
    'priceCents','salePriceCents','costPriceCents','wholesalePriceCents','gstIncluded',
    'sku','barcode','imageUrl',
    'isAvailable','isActive','isFeatured','isNew','isWholesaleAvailable','isStaffOnly',
    'isAppOnly','isLimitedDrop','isSoldOut','isComingSoon','isPickupOnly',
    'tags','allergens','dietaryTags','ingredients','nutritionInfo',
    'storageInstructions','servingInstructions',
    'minOrderQty','maxOrderQty','leadTimeMins','availableDays','availableTimes',
    'stockCount','lowStockThreshold','sortOrder',
  ];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });
  updates.updatedAt = new Date();
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  return res.json({ data: updated });
});

router.delete('/products/:id', async (req, res) => {
  await db.update(productsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(productsTable.id, req.params.id));
  return res.json({ success: true });
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

// ── Create staff account ─────────────────────────────────────────────────────
router.post('/create-staff', async (req, res) => {
  const { name, email, password, position, department, isManager, hourlyRateCents } = req.body;
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase().trim(), passwordHash: hash, role: 'staff' as any, name: name.trim() });
  const empId = `EMP-${Date.now().toString(36).toUpperCase()}`;
  const [profile] = await db.insert(staffProfilesTable).values({
    userId, employeeId: empId,
    position:   position?.trim()   ?? 'Crew',
    department: department?.trim() ?? 'floor',
    isManager:  isManager === true,
    approvedByAdmin: true,
    hourlyRateCents: typeof hourlyRateCents === 'number' ? hourlyRateCents : 2200,
  }).returning();
  return res.status(201).json({ data: { userId, email, name, role: 'staff', employeeId: empId, profile } });
});

// ── Create wholesale account ──────────────────────────────────────────────────
router.post('/create-wholesale', async (req, res) => {
  const { name, email, password, companyName, abn, phone } = req.body;
  if (!name?.trim() || !email?.trim() || !password?.trim() || !companyName?.trim()) {
    return res.status(400).json({ error: 'Name, email, password and company name are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase().trim(), passwordHash: hash, role: 'wholesale' as any, name: name.trim() });
  const accountId = randomUUID();
  const [account] = await db.insert(wholesaleAccountsTable).values({
    id: accountId, userId,
    companyName: companyName.trim(),
    abn:         abn?.trim()   ?? '',
    contactName: name.trim(),
    phone:       phone?.trim() ?? '',
    status:      'approved',
  }).returning();
  return res.status(201).json({ data: { userId, email, name, role: 'wholesale', account } });
});

// ── Rewards CRUD ──────────────────────────────────────────────────────────────
const REWARD_PURGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

router.get('/rewards', async (req, res) => {
  // Auto-purge hard-delete rewards older than 14 days
  const cutoff = new Date(Date.now() - REWARD_PURGE_MS);
  await db.delete(loyaltyRewardsTable)
    .where(and(isNotNull(loyaltyRewardsTable.deletedAt), lt(loyaltyRewardsTable.deletedAt, cutoff)));
  const rewards = await db.select().from(loyaltyRewardsTable).orderBy(loyaltyRewardsTable.pointsCost);
  return res.json({ data: rewards });
});

router.post('/rewards', async (req, res) => {
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Reward name is required.' });
  if (typeof b.pointsCost !== 'number') return res.status(400).json({ error: 'pointsCost must be a number.' });
  const [reward] = await db.insert(loyaltyRewardsTable).values({
    id:          randomUUID(),
    name:        b.name.trim(),
    description: b.description?.trim() ?? '',
    pointsCost:  b.pointsCost,
    category:    b.category ?? 'food',
    imageUrl:    b.imageUrl ?? null,
    isActive:    b.isActive !== false,
    isAppOnly:   b.isAppOnly === true,
    stock:       typeof b.stock === 'number' ? b.stock : null,
    expiresAt:   b.expiresAt ? new Date(b.expiresAt) : null,
  }).returning();
  return res.status(201).json({ data: reward });
});

router.patch('/rewards/:id', async (req, res) => {
  const b = req.body ?? {};
  const allowed = ['name','description','pointsCost','category','imageUrl','isActive','isAppOnly','stock'];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
  if (b.expiresAt !== undefined) updates.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(loyaltyRewardsTable).set(updates)
    .where(and(eq(loyaltyRewardsTable.id, req.params.id), isNull(loyaltyRewardsTable.deletedAt))).returning();
  if (!updated) return res.status(404).json({ error: 'Reward not found.' });
  return res.json({ data: updated });
});

// Soft-delete: set deletedAt timestamp (customer-facing /loyalty/rewards already filters deletedAt IS NULL)
router.delete('/rewards/:id', async (req, res) => {
  await db.update(loyaltyRewardsTable)
    .set({ isActive: false, deletedAt: new Date() })
    .where(eq(loyaltyRewardsTable.id, req.params.id));
  return res.json({ success: true });
});

// Restore a soft-deleted reward (clears deletedAt, re-activates)
router.post('/rewards/:id/restore', async (req, res) => {
  const [restored] = await db.update(loyaltyRewardsTable)
    .set({ deletedAt: null, isActive: true })
    .where(eq(loyaltyRewardsTable.id, req.params.id)).returning();
  if (!restored) return res.status(404).json({ error: 'Reward not found.' });
  return res.json({ data: restored });
});

// ── Announcements / Notifications CRUD ───────────────────────────────────────
router.get('/announcements', async (req, res) => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
  return res.json({ data: rows });
});

router.post('/announcements', async (req, res) => {
  const b = req.body ?? {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!b.body?.trim())  return res.status(400).json({ error: 'Body is required.' });
  const [announcement] = await db.insert(announcementsTable).values({
    id:          randomUUID(),
    title:       b.title.trim(),
    body:        b.body.trim(),
    targetRoles: Array.isArray(b.targetRoles) ? b.targetRoles : ['customer'],
    isActive:    b.isActive !== false,
    isPinned:    b.isPinned === true,
    imageUrl:    b.imageUrl ?? null,
    expiresAt:   b.expiresAt ? new Date(b.expiresAt) : null,
  }).returning();
  return res.status(201).json({ data: announcement });
});

router.patch('/announcements/:id', async (req, res) => {
  const b = req.body ?? {};
  const allowed = ['title','body','targetRoles','isActive','isPinned','imageUrl'];
  const updates: Record<string, any> = {};
  for (const k of allowed) if (b[k] !== undefined) updates[k] = b[k];
  if (b.expiresAt !== undefined) updates.expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update.' });
  const [updated] = await db.update(announcementsTable).set(updates)
    .where(eq(announcementsTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Announcement not found.' });
  return res.json({ data: updated });
});

router.delete('/announcements/:id', async (req, res) => {
  await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), sydneyNow.getDate());
  const startOfWeek  = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);
  const startOfMonth = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), 1);
  const start30      = new Date(startOfToday); start30.setDate(startOfToday.getDate() - 29);

  const [
    [todayRev], [weekRev], [monthRev],
    [todayCount], [weekCount], [monthCount],
    [todayAvg],
    typeRows, statusRows, recentOrders,
    feedbackRows, [unreadFeedback],
    [totalCustomers], [newCustomersWeek],
  ] = await Promise.all([
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfToday), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfWeek), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ total: sum(ordersTable.totalCents) }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfMonth), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfToday)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfWeek)),
    db.select({ count: count() }).from(ordersTable).where(gte(ordersTable.createdAt, startOfMonth)),
    db.select({ avg: sql<string>`AVG(${ordersTable.totalCents})` }).from(ordersTable)
      .where(and(gte(ordersTable.createdAt, startOfWeek), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`)),
    db.select({ type: ordersTable.type, count: count() }).from(ordersTable)
      .where(gte(ordersTable.createdAt, startOfMonth)).groupBy(ordersTable.type),
    db.select({ status: ordersTable.status, count: count() }).from(ordersTable)
      .where(gte(ordersTable.createdAt, startOfMonth)).groupBy(ordersTable.status),
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(5),
    db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt)).limit(20),
    db.select({ count: count() }).from(feedbackTable).where(eq(feedbackTable.isRead, false)),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.role, 'customer' as any)),
    db.select({ count: count() }).from(usersTable)
      .where(and(eq(usersTable.role, 'customer' as any), gte(usersTable.createdAt, startOfWeek))),
  ]);

  // Revenue per day for last 30 days
  const dailyRevRows = await db.select({
    day: sql<string>`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`,
    total: sum(ordersTable.totalCents),
    count: count(),
  }).from(ordersTable)
    .where(and(gte(ordersTable.createdAt, start30), sql`${ordersTable.status} NOT IN ('cancelled','refunded')`))
    .groupBy(sql`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`)
    .orderBy(sql`DATE_TRUNC('day', ${ordersTable.createdAt} AT TIME ZONE 'Australia/Sydney')`);

  return res.json({
    data: {
      revenue: {
        today: Number(todayRev.total ?? 0),
        week:  Number(weekRev.total  ?? 0),
        month: Number(monthRev.total ?? 0),
      },
      orders: {
        today: todayCount.count,
        week:  weekCount.count,
        month: monthCount.count,
        avgValueCents: Math.round(parseFloat(todayAvg.avg ?? '0')),
      },
      byType:   typeRows,
      byStatus: statusRows,
      dailyRevenue: dailyRevRows.map(r => ({
        day: r.day,
        totalCents: Number(r.total ?? 0),
        count: r.count,
      })),
      recentOrders,
      feedback: feedbackRows,
      unreadFeedback: unreadFeedback.count,
      customers: {
        total:   totalCustomers.count,
        newWeek: newCustomersWeek.count,
      },
    },
  });
});

// ── Timesheets ────────────────────────────────────────────────────────────────
router.get('/timesheets', async (req, res) => {
  const rows = await db
    .select({
      id:              staffShiftsTable.id,
      userId:          staffShiftsTable.userId,
      clockIn:         staffShiftsTable.clockIn,
      clockOut:        staffShiftsTable.clockOut,
      hoursWorked:     staffShiftsTable.hoursWorked,
      unpaidBreakMins: staffShiftsTable.unpaidBreakMins,
      approvedAt:      staffShiftsTable.approvedAt,
      approvedById:    staffShiftsTable.approvedById,
      createdAt:       staffShiftsTable.createdAt,
      name:            usersTable.name,
      email:           usersTable.email,
      position:        staffProfilesTable.position,
      isManager:       staffProfilesTable.isManager,
      hourlyRateCents: staffProfilesTable.hourlyRateCents,
    })
    .from(staffShiftsTable)
    .leftJoin(usersTable,         eq(usersTable.id,     staffShiftsTable.userId))
    .leftJoin(staffProfilesTable, eq(staffProfilesTable.userId, staffShiftsTable.userId))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(400);

  return res.json({ data: rows });
});

router.patch('/timesheets/:id', async (req, res) => {
  const { approve, clockIn, clockOut, unpaidBreakMins } = req.body as {
    approve?: boolean; clockIn?: string; clockOut?: string | null; unpaidBreakMins?: number;
  };

  const [existing] = await db.select().from(staffShiftsTable).where(eq(staffShiftsTable.id, req.params.id));
  if (!existing) return res.status(404).json({ error: 'Shift not found' });

  const updates: Partial<typeof staffShiftsTable.$inferSelect> = {};

  if (typeof approve === 'boolean') {
    updates.approvedAt   = approve ? new Date() : null;
    updates.approvedById = approve ? req.user!.id : null;
  }

  if (clockIn !== undefined)  updates.clockIn  = new Date(clockIn);
  if (clockOut !== undefined) updates.clockOut = clockOut ? new Date(clockOut) : null;
  if (typeof unpaidBreakMins === 'number') updates.unpaidBreakMins = unpaidBreakMins;

  const resolvedIn    = (updates.clockIn  ?? existing.clockIn) as Date;
  const resolvedOut   = (updates.clockOut !== undefined ? updates.clockOut : existing.clockOut) as Date | null;
  const resolvedBreak = updates.unpaidBreakMins ?? existing.unpaidBreakMins ?? 0;
  if (resolvedOut) {
    const diffMs  = resolvedOut.getTime() - resolvedIn.getTime();
    const breakMs = resolvedBreak * 60_000;
    updates.hoursWorked = Math.max(0, (diffMs - breakMs) / 3_600_000).toFixed(2);
  }

  const [updated] = await db.update(staffShiftsTable).set(updates).where(eq(staffShiftsTable.id, req.params.id)).returning();
  return res.json({ data: updated });
});

// ── Staff hub: all wastage, issues, leave (director/manager view) ─────────────
router.get('/wastage', async (req, res) => {
  const rows = await db
    .select({
      id: staffWastageTable.id,
      userId: staffWastageTable.userId,
      productName: staffWastageTable.productName,
      quantity: staffWastageTable.quantity,
      unit: staffWastageTable.unit,
      reason: staffWastageTable.reason,
      estimatedCostCents: staffWastageTable.estimatedCostCents,
      notes: staffWastageTable.notes,
      createdAt: staffWastageTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
    })
    .from(staffWastageTable)
    .leftJoin(usersTable, eq(staffWastageTable.userId, usersTable.id))
    .orderBy(desc(staffWastageTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

router.get('/issues', async (req, res) => {
  const rows = await db
    .select({
      id: staffIssuesTable.id,
      userId: staffIssuesTable.userId,
      title: staffIssuesTable.title,
      description: staffIssuesTable.description,
      category: staffIssuesTable.category,
      priority: staffIssuesTable.priority,
      status: staffIssuesTable.status,
      resolvedAt: staffIssuesTable.resolvedAt,
      createdAt: staffIssuesTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
    })
    .from(staffIssuesTable)
    .leftJoin(usersTable, eq(staffIssuesTable.userId, usersTable.id))
    .orderBy(desc(staffIssuesTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

router.patch('/issues/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const updates: any = { status };
  if (status === 'resolved' || status === 'closed') {
    updates.resolvedAt = new Date();
    updates.resolvedBy = req.user!.id;
  }
  const [updated] = await db.update(staffIssuesTable)
    .set(updates)
    .where(eq(staffIssuesTable.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Issue not found' });
  return res.json({ data: updated });
});

router.get('/leave', async (req, res) => {
  const rows = await db
    .select({
      id: staffLeaveRequestsTable.id,
      userId: staffLeaveRequestsTable.userId,
      startDate: staffLeaveRequestsTable.startDate,
      endDate: staffLeaveRequestsTable.endDate,
      type: staffLeaveRequestsTable.type,
      reason: staffLeaveRequestsTable.reason,
      status: staffLeaveRequestsTable.status,
      reviewedAt: staffLeaveRequestsTable.reviewedAt,
      createdAt: staffLeaveRequestsTable.createdAt,
      staffName: usersTable.name,
      staffEmail: usersTable.email,
    })
    .from(staffLeaveRequestsTable)
    .leftJoin(usersTable, eq(staffLeaveRequestsTable.userId, usersTable.id))
    .orderBy(desc(staffLeaveRequestsTable.createdAt))
    .limit(200);
  return res.json({ data: rows });
});

// ── Feedback management ───────────────────────────────────────────────────────
router.get('/feedback', async (req, res) => {
  const rows = await db.select().from(feedbackTable).orderBy(desc(feedbackTable.createdAt)).limit(100);
  return res.json({ data: rows });
});

router.patch('/feedback/:id/read', async (req, res) => {
  const [updated] = await db.update(feedbackTable).set({ isRead: true })
    .where(eq(feedbackTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Feedback not found.' });
  return res.json({ data: updated });
});

// ── Manager management ────────────────────────────────────────────────────────
// Only directors can manage manager accounts (managers can view their own profile)

function parsePerms(raw?: string | null): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

router.get('/managers', async (req, res) => {
  if (req.user?.role !== 'director') {
    return res.status(403).json({ error: 'Director only' });
  }
  const managers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    permissions: managerProfilesTable.permissions,
    notes: managerProfilesTable.notes,
    createdAt: managerProfilesTable.createdAt,
  }).from(managerProfilesTable)
    .leftJoin(usersTable, eq(usersTable.id, managerProfilesTable.userId))
    .orderBy(desc(managerProfilesTable.createdAt));

  return res.json({
    data: managers.map(m => ({
      ...m,
      permissions: parsePerms(m.permissions),
    })),
  });
});

router.post('/managers', async (req, res) => {
  if (req.user?.role !== 'director') return res.status(403).json({ error: 'Director only' });
  const { name, email, password, permissions = [], notes } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: 'manager', name });
  await db.insert(managerProfilesTable).values({
    userId,
    permissions: JSON.stringify(permissions),
    createdByUserId: req.user!.id,
    notes: notes ?? null,
  });
  return res.status(201).json({ data: { id: userId, name, email: email.toLowerCase(), permissions, notes } });
});

router.patch('/managers/:id/permissions', async (req, res) => {
  if (req.user?.role !== 'director') return res.status(403).json({ error: 'Director only' });
  const { permissions, notes } = req.body;
  const updates: Record<string, any> = {};
  if (Array.isArray(permissions)) updates.permissions = JSON.stringify(permissions);
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db.update(managerProfilesTable)
    .set(updates)
    .where(eq(managerProfilesTable.userId, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Manager not found' });
  return res.json({ data: { ...updated, permissions: parsePerms(updated.permissions) } });
});

router.delete('/managers/:id', async (req, res) => {
  if (req.user?.role !== 'director') return res.status(403).json({ error: 'Director only' });
  await db.delete(managerProfilesTable).where(eq(managerProfilesTable.userId, req.params.id));
  await db.update(usersTable).set({ role: 'staff' as any }).where(eq(usersTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Director: Wholesale Cards ─────────────────────────────────────────────────
router.get('/wholesale/:accountId/cards', async (req, res) => {
  const cards = await db.select().from(wholesaleCardsTable)
    .where(eq(wholesaleCardsTable.accountId, req.params.accountId))
    .orderBy(wholesaleCardsTable.createdAt);
  // Strip sensitive fields from the list — use the /reveal endpoint for full details
  const safe = cards.map(({ fullCardNumber: _f, cvv: _c, ...c }) => c);
  return res.json({ data: safe });
});

// ── Reveal full card details (director only, or manager if visibleToManager) ─
router.get('/wholesale-cards/:cardId/reveal', async (req, res) => {
  const [card] = await db.select().from(wholesaleCardsTable).where(eq(wholesaleCardsTable.id, req.params.cardId));
  if (!card) return res.status(404).json({ error: 'Card not found' });
  if (req.user?.role === 'manager' && !card.visibleToManager) {
    return res.status(403).json({ error: 'This card is not visible to managers.' });
  }
  return res.json({
    data: {
      id:             card.id,
      nameOnCard:     card.nameOnCard,
      cardBrand:      card.cardBrand,
      last4:          card.last4,
      expiry:         card.expiry,
      fullCardNumber: card.fullCardNumber,
      cvv:            card.cvv,
      isDefault:      card.isDefault,
    },
  });
});

router.patch('/wholesale-cards/:cardId/visibility', async (req, res) => {
  const { visibleToManager } = req.body;
  if (visibleToManager === undefined) return res.status(400).json({ error: 'visibleToManager required.' });
  const [updated] = await db.update(wholesaleCardsTable)
    .set({ visibleToManager: Boolean(visibleToManager) })
    .where(eq(wholesaleCardsTable.id, req.params.cardId))
    .returning();
  if (!updated) return res.status(404).json({ error: 'Card not found' });
  return res.json({ data: updated });
});

// ── App Sessions (hourly activity: logins + orders as proxy) ─────────────────
router.get('/sessions', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const [todayOrders, yesterdayOrders, todayLogins, yesterdayLogins] = await Promise.all([
      db.select({ createdAt: ordersTable.createdAt }).from(ordersTable)
        .where(gte(ordersTable.createdAt, todayStart)),
      db.select({ createdAt: ordersTable.createdAt }).from(ordersTable)
        .where(and(gte(ordersTable.createdAt, yesterdayStart), lte(ordersTable.createdAt, todayStart))),
      db.select({ lastLogin: usersTable.lastLogin }).from(usersTable)
        .where(and(isNotNull(usersTable.lastLogin), gte(usersTable.lastLogin as any, todayStart))),
      db.select({ lastLogin: usersTable.lastLogin }).from(usersTable)
        .where(and(isNotNull(usersTable.lastLogin), gte(usersTable.lastLogin as any, yesterdayStart), lte(usersTable.lastLogin as any, todayStart))),
    ]);

    const todayByHour = new Array(24).fill(0);
    const yesterdayByHour = new Array(24).fill(0);

    for (const o of todayOrders)     todayByHour[new Date(o.createdAt).getHours()]++;
    for (const o of yesterdayOrders) yesterdayByHour[new Date(o.createdAt).getHours()]++;
    for (const u of todayLogins)     if (u.lastLogin) todayByHour[new Date(u.lastLogin).getHours()]++;
    for (const u of yesterdayLogins) if (u.lastLogin) yesterdayByHour[new Date(u.lastLogin).getHours()]++;

    const totalToday     = todayByHour.reduce((a, b) => a + b, 0);
    const totalYesterday = yesterdayByHour.reduce((a, b) => a + b, 0);
    const pctChange      = totalYesterday > 0
      ? Math.round(((totalToday - totalYesterday) / totalYesterday) * 100)
      : null;
    const liveCount = todayLogins.filter(u =>
      u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 30 * 60 * 1000,
    ).length;

    res.json({
      data: {
        today:          todayByHour.map((count, hour) => ({ hour, count })),
        yesterday:      yesterdayByHour.map((count, hour) => ({ hour, count })),
        totalToday,
        totalYesterday,
        pctChange,
        liveCount,
      },
    });
  } catch (e) {
    req.log.error(e, 'sessions error');
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

export default router;
