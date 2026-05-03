import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  db, usersTable, customerProfilesTable, staffProfilesTable,
  wholesaleAccountsTable, ordersTable, storeSettingsTable, productsTable,
  staffShiftsTable, staffIssuesTable, staffWastageTable, staffLeaveRequestsTable,
  feedbackTable,
} from '@workspace/db';
import { eq, desc, count, sum, gte, lte, isNull, isNotNull, and, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';

const router = Router();
router.use(requireRole('director'));

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
        totalProducts:    totalProducts.count,
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
    ...u, passwordHash: undefined,
    staffProfile:     spMap[u.id] ?? null,
    wholesaleAccount: waMap[u.id] ?? null,
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
  if (!['approved','pending','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const [updated] = await db.update(wholesaleAccountsTable)
    .set({ status }).where(eq(wholesaleAccountsTable.id, accountId)).returning();
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

export default router;
