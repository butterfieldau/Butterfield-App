import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import {
  claimedRewardsTable,
  customerProfilesTable,
  db,
  ordersTable,
  productsTable,
  staffProfilesTable,
  staffShiftsTable,
  staffStoreAssignmentsTable,
  staffTaskHistoryTable,
  staffTasksTable,
  storesTable,
  usersTable,
} from '@workspace/db';
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { notifyUser } from '../lib/notificationService.js';
import { recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { recordAuditLog } from '../lib/auditLog.js';
import { ensureShopDisplaySchemaReady } from '../lib/ensureShopDisplaySchemaReady.js';
import { countCoffeeItemsFromOrderItems } from '../lib/orderLoyaltyUtils.js';
import { refundOrderStripePayment } from '../lib/stripeRefunds.js';

const router = Router();
router.use(requireRole('shop_display'));

const ORDER_STATUS_ALERTS: Record<string, string> = {
  being_prepared: 'Your order is being prepared. ☕',
  ready_for_pickup: 'Your order is ready for pickup! 🎉',
  out_for_delivery: 'Your order is on its way! 🚚',
  completed: 'Your order is complete. Thanks for visiting! 🍪',
  cancelled: 'Your order has been cancelled. A refund has been initiated where applicable.',
};

const ACTIVE_ORDER_RANK: Record<string, number> = {
  received: 0,
  being_prepared: 1,
  ready_for_pickup: 2,
  out_for_delivery: 3,
  completed: 4,
  cancelled: 5,
  refunded: 6,
};

async function getDisplayPermissions(userId: string): Promise<string[]> {
  const rows = await db.execute(sql`SELECT permissions FROM shop_display_profiles WHERE user_id = ${userId}`);
  const row = (rows as any)[0] ?? (rows as any).rows?.[0];
  if (!row) return [];
  try { return JSON.parse(row.permissions ?? '[]'); } catch { return []; }
}

router.get('/me', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    role: usersTable.role,
    status: usersTable.status,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, req.user!.id));

  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));

  const permissions = await getDisplayPermissions(req.user!.id);

  return res.json({
    data: {
      ...user,
      storeIds: assignments.map((a) => a.storeId),
      permissions,
    },
  });
});

router.get('/store', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  if (assignments.length === 0) return res.json({ data: [] });
  const storeIds = assignments.map((a) => a.storeId);
  const stores = await db.select({
    id: storesTable.id,
    name: storesTable.name,
    address: storesTable.address,
    suburb: storesTable.suburb,
    status: storesTable.status,
    printerIp: storesTable.printerIp,
    printerPort: storesTable.printerPort,
    printerBrand: storesTable.printerBrand,
    autoPrint: storesTable.autoPrint,
    geofenceRadius: storesTable.geofenceRadius,
    latitude: storesTable.latitude,
    longitude: storesTable.longitude,
    phone: storesTable.phone,
    dailySpecial: storesTable.dailySpecial,
  }).from(storesTable).where(inArray(storesTable.id, storeIds));
  return res.json({ data: stores });
});

router.get('/orders', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const assignedStoreIds = assignments.map((assignment) => assignment.storeId);
  const ordersQuery = assignedStoreIds.length > 0
    ? db.select().from(ordersTable)
        .where(or(inArray(ordersTable.storeId, assignedStoreIds), isNull(ordersTable.storeId)))
        .orderBy(desc(ordersTable.createdAt)).limit(150)
    : db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(150);

  const [orders, users] = await Promise.all([
    ordersQuery,
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
    }).from(usersTable),
  ]);

  const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
  const data = orders
    .map((order) => ({
      ...order,
      customerName: userMap[order.userId]?.name ?? 'Customer',
      customerEmail: userMap[order.userId]?.email ?? '',
      customerPhone: userMap[order.userId]?.phone ?? '',
    }))
    .sort((a, b) => {
      const rankDiff = (ACTIVE_ORDER_RANK[a.status] ?? 99) - (ACTIVE_ORDER_RANK[b.status] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      const leftTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : new Date(a.createdAt).getTime();
      const rightTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : new Date(b.createdAt).getTime();
      return rightTime - leftTime;
    });

  return res.json({ data });
});

router.patch('/orders/:id/status', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { id } = req.params;
  const { status } = req.body ?? {};
  const allowed = ['received', 'being_prepared', 'ready_for_pickup', 'completed', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status for shop display mode.' });
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Order not found.' });

  const previousStatus = existing.status;
  const [updated] = await db.update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: 'Order not found.' });

  const msg = ORDER_STATUS_ALERTS[status];
  if (msg) {
    notifyUser(existing.userId, 'order_status', 'Butterfield Cookies', msg, {
      orderId: id,
      status,
      screen: '/(customer)/orders',
    }).catch(() => {});
  }

  const isCancellingNow = status === 'cancelled' && previousStatus !== 'cancelled' && previousStatus !== 'refunded';
  if (isCancellingNow) {
    try {
      await db.update(claimedRewardsTable)
        .set({ status: 'available', redeemedAt: null, orderId: null })
        .where(and(
          eq(claimedRewardsTable.orderId, updated.id),
          eq(claimedRewardsTable.status, 'redeemed'),
        ));
    } catch (err: any) {
      req.log.error({ err, orderId: updated.id }, 'Failed to restore claimed reward on shop display cancellation');
    }

    if (updated.loyaltyPointsEarned > 0) {
      try {
        await recordLoyaltyPoints({
          userId: updated.userId,
          pointsDelta: -updated.loyaltyPointsEarned,
          orderId: updated.id,
          description: 'Order cancelled from shop display — points reversed',
        });
      } catch (err: any) {
        req.log.error({ err, orderId: updated.id }, 'Failed to reverse loyalty points on shop display cancellation');
      }
    }

    try {
      const coffeeStampCount = await countCoffeeItemsFromOrderItems(updated.items);
      if (coffeeStampCount > 0) {
        await reverseCoffeeStamps({
          userId: updated.userId,
          stampsToRemove: coffeeStampCount,
          source: 'order_cancel',
          orderId: updated.id,
          description: 'Order cancelled from shop display — coffee stamps reversed',
        });
      }
    } catch (err: any) {
      req.log.error({ err, orderId: updated.id }, 'Failed to reverse coffee stamps on shop display cancellation');
    }

    try {
      await refundOrderStripePayment({
        orderId: updated.id,
        stripePaymentIntentId: updated.stripePaymentIntentId ?? null,
        stripePaymentStatus: updated.stripePaymentStatus ?? null,
        log: req.log,
      });
    } catch (err: any) {
      req.log.warn({ err, orderId: updated.id }, 'Stripe refund failed or skipped on shop display cancellation');
    }
  }

  await recordAuditLog({
    actor: req.user,
    entityType: 'order',
    entityId: updated.id,
    action: 'shop_display_order_status_changed',
    before: { status: previousStatus },
    after: { status: updated.status },
    metadata: { orderType: updated.type },
  });

  return res.json({ data: updated });
});

router.get('/tasks', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { category } = req.query;
  const baseQuery = db.select().from(staffTasksTable);
  const tasks = category
    ? await baseQuery.where(eq(staffTasksTable.category, category as any)).orderBy(staffTasksTable.sortOrder)
    : await baseQuery.orderBy(staffTasksTable.sortOrder);
  return res.json({ data: tasks });
});

router.patch('/tasks/:id/complete', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { isCompleted, notes } = req.body ?? {};
  const [task] = await db.update(staffTasksTable).set({
    isCompleted: isCompleted ?? true,
    completedBy: (isCompleted ?? true) ? req.user!.name : null,
    completedAt: (isCompleted ?? true) ? new Date() : null,
  }).where(eq(staffTasksTable.id, req.params.id)).returning();

  if (!task) return res.status(404).json({ error: 'Task not found.' });

  await db.insert(staffTaskHistoryTable).values({
    id: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    taskCategory: task.category,
    completedByUserId: req.user!.id,
    completedByName: req.user!.name,
    completedByRole: req.user!.role,
    completionStatus: (isCompleted ?? true) ? 'completed' : 'reopened',
    notes: notes ?? null,
  });

  await recordAuditLog({
    actor: req.user,
    entityType: 'task',
    entityId: task.id,
    action: (isCompleted ?? true) ? 'shop_display_task_completed' : 'shop_display_task_reopened',
    after: { isCompleted: task.isCompleted, completedBy: task.completedBy },
    metadata: { category: task.category },
  });

  return res.json({ data: task });
});

router.get('/tasks/history', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { from, to } = req.query;
  const conditions: any[] = [];
  if (typeof from === 'string') conditions.push(gte(staffTaskHistoryTable.createdAt, new Date(from)));
  if (typeof to === 'string') conditions.push(sql`${staffTaskHistoryTable.createdAt} <= ${new Date(to)}`);
  const history = conditions.length > 0
    ? await db.select().from(staffTaskHistoryTable).where(and(...conditions)).orderBy(desc(staffTaskHistoryTable.createdAt)).limit(200)
    : await db.select().from(staffTaskHistoryTable).orderBy(desc(staffTaskHistoryTable.createdAt)).limit(200);
  return res.json({ data: history });
});

// ── Products (permission-gated) ───────────────────────────────────────────
router.get('/products', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const permissions = await getDisplayPermissions(req.user!.id);
  if (!permissions.includes('products')) {
    return res.status(403).json({ error: 'Products access not enabled for this display.' });
  }
  const products = await db.select().from(productsTable).orderBy((productsTable as any).name);
  return res.json({ data: products });
});

// ── Customer lookup (permission-gated) ────────────────────────────────────
router.get('/customers', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const permissions = await getDisplayPermissions(req.user!.id);
  if (!permissions.includes('customers')) {
    return res.status(403).json({ error: 'Customer lookup not enabled for this display.' });
  }
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length < 2) return res.json({ data: [] });

  const term = `%${search}%`;
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    phone: usersTable.phone,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .where(and(
      eq(usersTable.role, 'customer'),
      or(
        ilike(usersTable.name, term),
        ilike(usersTable.email, term),
        ilike(usersTable.phone, term),
      ),
    ))
    .limit(30);

  if (users.length === 0) return res.json({ data: [] });

  const userIds = users.map((u) => u.id);
  const profiles = await db.select().from(customerProfilesTable).where(inArray(customerProfilesTable.userId, userIds));
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  const data = users.map((u) => {
    const p = profileMap[u.id];
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      loyaltyPoints: p?.loyaltyPoints ?? 0,
      loyaltyTier: p?.loyaltyTier ?? 'bronze',
      stampCount: p?.coffeeStampCount ?? p?.stampCount ?? 0,
      freeCoffeeRewards: p?.freeCoffeeRewards ?? 0,
      totalVisits: p?.totalVisits ?? 0,
      totalSpentCents: p?.totalSpentCents ?? 0,
      createdAt: u.createdAt,
    };
  });

  return res.json({ data });
});

// ── Staff assigned to same store (for PIN clock screen) ───────────────────
router.get('/staff-assigned', async (req, res) => {
  await ensureShopDisplaySchemaReady();

  // Determine which store(s) this shop display is assigned to
  const myAssignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const storeIds = myAssignments.map((a) => a.storeId);

  let eligibleIds: string[] = [];

  if (storeIds.length > 0) {
    // Store-based: only show staff assigned to the same store(s) as this display
    const staffAssignments = await db.select({ staffId: staffStoreAssignmentsTable.staffId })
      .from(staffStoreAssignmentsTable)
      .where(and(
        inArray(staffStoreAssignmentsTable.storeId, storeIds),
        eq(staffStoreAssignmentsTable.isActive, true),
      ));
    eligibleIds = [...new Set(staffAssignments.map((a) => a.staffId))];
    if (eligibleIds.length === 0) return res.json({ data: [] });
  }
  // If no store assigned to this display, fall through with eligibleIds = []
  // and the profile query below will fetch all staff (setup / unassigned fallback)

  const profileQuery = db.select({
    userId: staffProfilesTable.userId,
    employeeId: staffProfilesTable.employeeId,
    position: staffProfilesTable.position,
    clockPin: staffProfilesTable.clockPin,
    approvedByAdmin: staffProfilesTable.approvedByAdmin,
    isManager: staffProfilesTable.isManager,
  }).from(staffProfilesTable);

  const rawProfiles = eligibleIds.length > 0
    ? await profileQuery.where(inArray(staffProfilesTable.userId, eligibleIds))
    : await profileQuery;

  // Only keep staff with a PIN and that are approved (approvedByAdmin OR isManager)
  const eligibleProfiles = rawProfiles.filter((p) => p.clockPin && (p.approvedByAdmin || p.isManager));
  if (eligibleProfiles.length === 0) return res.json({ data: [] });

  const finalIds = eligibleProfiles.map((p) => p.userId);
  const profileMap = Object.fromEntries(eligibleProfiles.map((p) => [p.userId, p]));

  const staffUsers = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    role: usersTable.role,
  }).from(usersTable)
    .where(and(
      inArray(usersTable.id, finalIds),
      or(eq(usersTable.role, 'staff'), eq(usersTable.role, 'manager')),
    ));

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const activeShifts = await db.select({
    userId: staffShiftsTable.userId,
    id: staffShiftsTable.id,
    clockIn: staffShiftsTable.clockIn,
  }).from(staffShiftsTable)
    .where(and(
      inArray(staffShiftsTable.userId, finalIds),
      isNull(staffShiftsTable.clockOut),
      gte(staffShiftsTable.clockIn, dayStart),
    ));
  const shiftMap = Object.fromEntries(activeShifts.map((s) => [s.userId, s]));

  const data = staffUsers
    .map((u) => {
      const p = profileMap[u.id];
      const shift = shiftMap[u.id];
      return {
        userId: u.id,
        name: u.name,
        employeeId: p?.employeeId ?? '',
        position: p?.position ?? (u.role === 'manager' ? 'manager' : 'crew'),
        isClockedIn: Boolean(shift),
        shiftId: shift?.id ?? null,
        shiftStart: shift?.clockIn?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return res.json({ data });
});

// ── PIN-based clock in / out ───────────────────────────────────────────────
router.post('/staff-clock', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { staffId, pin } = req.body ?? {};
  if (!staffId || !pin) {
    return res.status(400).json({ error: 'staffId and pin are required.' });
  }

  const [staffUser] = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.id, staffId), or(eq(usersTable.role, 'staff'), eq(usersTable.role, 'manager'))));
  if (!staffUser) return res.status(404).json({ error: 'Staff member not found.' });

  const [profile] = await db.select({ clockPin: staffProfilesTable.clockPin, approvedByAdmin: staffProfilesTable.approvedByAdmin })
    .from(staffProfilesTable)
    .where(eq(staffProfilesTable.userId, staffId));

  if (!profile?.clockPin) {
    return res.status(403).json({ error: 'No PIN set for this staff member.' });
  }
  if (!profile.approvedByAdmin) {
    return res.status(403).json({ error: 'Staff account not approved.' });
  }

  const valid = await bcrypt.compare(String(pin), profile.clockPin);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [openShift] = await db.select()
    .from(staffShiftsTable)
    .where(and(
      eq(staffShiftsTable.userId, staffId),
      isNull(staffShiftsTable.clockOut),
      gte(staffShiftsTable.clockIn, dayStart),
    ));

  if (openShift) {
    const clockOut = new Date();
    const msWorked = clockOut.getTime() - openShift.clockIn.getTime();
    const hoursWorked = (msWorked / 3600000).toFixed(2);
    await db.update(staffShiftsTable)
      .set({ clockOut, hoursWorked })
      .where(eq(staffShiftsTable.id, openShift.id));

    return res.json({ data: { clocked: 'out', name: staffUser.name, shiftId: openShift.id, hoursWorked } });
  } else {
    const shiftId = randomUUID();
    await db.insert(staffShiftsTable).values({
      id: shiftId,
      userId: staffId,
      clockIn: now,
    });
    return res.json({ data: { clocked: 'in', name: staffUser.name, shiftId } });
  }
});

export default router;
