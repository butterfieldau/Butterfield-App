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
  wholesaleOrdersTable,
} from '@workspace/db';
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, sum } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { notifyUser } from '../lib/notificationService.js';
import { applyCoffeeStamps, recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { recordAuditLog } from '../lib/auditLog.js';
import { ensureShopDisplaySchemaReady } from '../lib/ensureShopDisplaySchemaReady.js';
import { countCoffeeItemsFromOrderItems, getOutstandingCoffeeStampsForOrder, hasAwardedCoffeeStampsForOrder } from '../lib/orderLoyaltyUtils.js';
import { refundOrderStripePayment } from '../lib/stripeRefunds.js';
import {
  getLinklyPublicConfig,
  pairLinklyPinPad,
  recoverOrPollTransaction,
  saveLinklyConfig,
  startPurchaseTransaction,
} from '../lib/linklyCloud.js';

const router = Router();
router.use(requireRole('shop_display'));

function getPublicBaseUrl(req: any): string | null {
  if (process.env.LINKLY_NOTIFICATION_BASE_URL) return process.env.LINKLY_NOTIFICATION_BASE_URL.replace(/\/+$/, '');
  if (process.env.EXPO_PUBLIC_DOMAIN) return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  if (domain) return `https://${domain}`;
  const host = req.headers?.['x-forwarded-host'] ?? req.headers?.host;
  if (!host) return null;
  const protocol = req.headers?.['x-forwarded-proto'] ?? 'https';
  return `${protocol}://${Array.isArray(host) ? host[0] : host}`;
}

function buildLinklyNotificationUrl(req: any, sessionId: string): string | null {
  const baseUrl = getPublicBaseUrl(req);
  return baseUrl ? `${baseUrl}/api/linkly/notifications/${encodeURIComponent(sessionId)}` : null;
}

const TERMINAL_STATUSES_SD = new Set(['completed', 'cancelled', 'refunded']);

function getShopDisplayAllowedNextStatuses(
  currentStatus: string,
  orderType: string,
  scheduledFor: Date | null,
): Set<string> {
  const isQuickPickup = orderType === 'pickup' && !scheduledFor;
  const isStandardPickup = orderType === 'pickup' && !!scheduledFor;
  const isDelivery = orderType === 'delivery';

  const transitions: Record<string, string[]> = isQuickPickup
    ? { received: ['being_prepared'], being_prepared: ['completed'] }
    : isStandardPickup
    ? { scheduled: ['accepted'], accepted: ['being_prepared'], being_prepared: ['ready_for_pickup'], ready_for_pickup: ['completed'] }
    : isDelivery
    ? { scheduled: ['accepted'], accepted: ['being_prepared'], being_prepared: ['out_for_delivery'], out_for_delivery: ['completed'] }
    : {};

  const allowed = new Set<string>(transitions[currentStatus] ?? []);
  if (!TERMINAL_STATUSES_SD.has(currentStatus)) {
    allowed.add('cancelled');
  }
  return allowed;
}

function getShopDisplayStatusAlert(
  status: string,
  orderType: string,
  scheduledFor: Date | null,
): string | null {
  const isQuickPickup = orderType === 'pickup' && !scheduledFor;
  const isDelivery = orderType === 'delivery';

  if (status === 'cancelled') return 'Your order has been cancelled. A refund has been initiated where applicable.';

  if (isQuickPickup) {
    if (status === 'being_prepared') return "We're making your order now — won't be long! ☕";
    if (status === 'completed')      return 'Your order is ready — come pick it up! 🎉';
  } else if (isDelivery) {
    if (status === 'accepted')         return "Your delivery is confirmed — we'll start preparing it on the day.";
    if (status === 'being_prepared')   return 'Your order is being prepared. ☕';
    if (status === 'out_for_delivery') return 'Your order is on its way! 🚚';
    if (status === 'completed')        return 'Your order has been delivered! Enjoy 🍪';
  } else {
    if (status === 'accepted')         return "Your pickup slot is confirmed. We'll prepare it ahead of time.";
    if (status === 'being_prepared')   return 'Your order is being prepared. ☕';
    if (status === 'ready_for_pickup') return 'Your order is ready for pickup! 🎉';
    if (status === 'completed')        return 'Your order has been collected. Thanks for visiting! 🍪';
  }
  return null;
}

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
    autoDrawer: storesTable.autoDrawer,
    drawerPin: storesTable.drawerPin,
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
        .where(and(
          sql`source != 'pos'`,
          or(inArray(ordersTable.storeId, assignedStoreIds), isNull(ordersTable.storeId)),
        ))
        .orderBy(desc(ordersTable.createdAt)).limit(150)
    : db.select().from(ordersTable).where(sql`source != 'pos'`).orderBy(desc(ordersTable.createdAt)).limit(150);

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

  const allValidStatuses = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'scheduled', 'accepted'];
  if (!allValidStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status for shop display mode.' });
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ error: 'Order not found.' });

  const previousStatus = existing.status;

  // Enforce per-type transitions
  const allowed = getShopDisplayAllowedNextStatuses(previousStatus, existing.type, existing.scheduledFor);
  if (!allowed.has(status)) {
    return res.status(400).json({
      error: `Cannot transition from '${previousStatus}' to '${status}' for this order type.`,
    });
  }

  const [updated] = await db.update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: 'Order not found.' });

  const msg = getShopDisplayStatusAlert(status, existing.type, existing.scheduledFor);
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
      // Only reverse stamps if the order was previously completed — stamps are
      // only awarded at completion, so a cancelled-before-completion order cannot
      // have stamps to reverse. This guards against draining stamps that belong
      // to a different completed order when an uncompleted order is cancelled.
      if (previousStatus === 'completed') {
        const outstandingStampCount = await getOutstandingCoffeeStampsForOrder(updated.id);
        req.log.info({ orderId: updated.id, userId: updated.userId, status, previousStatus, outstandingStampCount }, 'Shop display coffee stamp reversal check');
        if (outstandingStampCount > 0) {
          await reverseCoffeeStamps({
            userId: updated.userId,
            stampsToRemove: outstandingStampCount,
            source: 'order_cancel',
            orderId: updated.id,
            description: 'Order cancelled from shop display — coffee stamps reversed',
          });
        }
      } else {
        req.log.info({ orderId: updated.id, userId: updated.userId, status, previousStatus }, 'Shop display coffee stamp reversal skipped — order was never completed');
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

  // ── Award coffee stamps only when the order is completed ─────────────────
  // Shop Display drives the real App Sales workflow, so the completion rule
  // is enforced here as well: one stamp per coffee, once, at completed.
  const isCompletion = status === 'completed';
  if (isCompletion && !isCancellingNow) {
    try {
      const coffeeCount = await countCoffeeItemsFromOrderItems(updated.items);
      req.log.info({ orderId: updated.id, userId: updated.userId, status, previousStatus, coffeeCount }, 'Shop display coffee stamp completion check');
      if (coffeeCount > 0) {
        if (!(await hasAwardedCoffeeStampsForOrder(updated.id))) {
          await applyCoffeeStamps({
            userId: updated.userId,
            stampsToAdd: coffeeCount,
            source: 'in_app_order',
            orderId: updated.id,
            description: `Coffee completed — Order #${updated.id.slice(0, 8)}`,
          });
        }
      }
    } catch (err: any) {
      req.log.error({ err, orderId: updated.id }, 'Failed to award coffee stamps on shop display order completion');
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

  const { startUtc: dayStart } = sydneyDateToUtcBounds(getSydneyTodayStr());
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

// ── PIN lockout constants ─────────────────────────────────────────────────
const PIN_WINDOW_SECS  = 60;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECS = 5 * 60;

// ── DB-backed lockout helpers ─────────────────────────────────────────────
async function checkPinLockout(userId: string): Promise<{ locked: boolean }> {
  const rows = await db.execute(sql`
    SELECT locked_until FROM pin_lockouts
    WHERE user_id = ${userId}
      AND locked_until IS NOT NULL
      AND locked_until > now()
  `);
  const hits = (rows as any).rows ?? (rows as any) ?? [];
  return { locked: hits.length > 0 };
}

async function recordPinFailure(userId: string): Promise<{ nowLocked: boolean }> {
  // Reset counter if last attempt was outside the window, then increment.
  await db.execute(sql`
    INSERT INTO pin_lockouts (user_id, failed_attempts, last_attempt_at, updated_at)
    VALUES (${userId}, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      failed_attempts = CASE
        WHEN pin_lockouts.last_attempt_at < now() - (${PIN_WINDOW_SECS} || ' seconds')::interval
        THEN 1
        ELSE pin_lockouts.failed_attempts + 1
      END,
      locked_until = CASE
        WHEN (CASE
          WHEN pin_lockouts.last_attempt_at < now() - (${PIN_WINDOW_SECS} || ' seconds')::interval
          THEN 1
          ELSE pin_lockouts.failed_attempts + 1
        END) >= ${PIN_MAX_ATTEMPTS}
        THEN now() + (${PIN_LOCKOUT_SECS} || ' seconds')::interval
        ELSE NULL
      END,
      last_attempt_at = now(),
      updated_at = now()
  `);

  const rows = await db.execute(sql`
    SELECT locked_until FROM pin_lockouts
    WHERE user_id = ${userId} AND locked_until IS NOT NULL AND locked_until > now()
  `);
  const hits = (rows as any).rows ?? (rows as any) ?? [];
  return { nowLocked: hits.length > 0 };
}

async function clearPinLockout(userId: string): Promise<void> {
  await db.execute(sql`
    UPDATE pin_lockouts
    SET failed_attempts = 0, locked_until = NULL, last_attempt_at = NULL, updated_at = now()
    WHERE user_id = ${userId}
  `);
}

// ── PIN-based clock in / out ───────────────────────────────────────────────
router.post('/staff-clock', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { staffId, pin } = req.body ?? {};
  if (!staffId || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'staffId and a 4-digit pin are required.' });
  }

  // DB-backed lockout check — before touching user data
  const { locked: alreadyLocked } = await checkPinLockout(staffId);
  if (alreadyLocked) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }

  // Store-scope authorization: target staffId must share a store with this display
  const displayAssignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const displayStoreIds = displayAssignments.map((a) => a.storeId);

  if (displayStoreIds.length > 0) {
    const sharedAssignment = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
      .from(staffStoreAssignmentsTable)
      .where(and(
        eq(staffStoreAssignmentsTable.staffId, staffId),
        eq(staffStoreAssignmentsTable.isActive, true),
        inArray(staffStoreAssignmentsTable.storeId, displayStoreIds),
      ))
      .limit(1);
    if (sharedAssignment.length === 0) {
      return res.status(403).json({ error: 'Staff member is not assigned to this store.' });
    }
  }
  // If display has no store assignments (setup mode), fall through — no store restriction

  // Fetch user + profile (including settings_pin_hash as unified POS PIN fallback)
  const [[staffUser], profileRows] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(and(eq(usersTable.id, staffId), or(eq(usersTable.role, 'staff'), eq(usersTable.role, 'manager')))),
    db.execute(sql`
      SELECT clock_pin, settings_pin_hash, approved_by_admin, is_manager
      FROM staff_profiles WHERE user_id = ${staffId} LIMIT 1
    `),
  ]);
  const profile = ((profileRows as any).rows ?? (profileRows as any) ?? [])[0] as {
    clock_pin: string | null; settings_pin_hash: string | null;
    approved_by_admin: boolean | null; is_manager: boolean | null;
  } | undefined;

  // Use clock_pin if set, otherwise fall back to settings_pin_hash (unified POS PIN)
  const pinHash = profile?.clock_pin ?? profile?.settings_pin_hash ?? null;
  const isEligible = !!staffUser && !!pinHash &&
    (profile?.approved_by_admin === true || profile?.is_manager === true || staffUser.role === 'manager');
  const pinValid = isEligible ? await bcrypt.compare(pin, pinHash!) : false;

  if (!pinValid) {
    // Record each failed attempt + audit log (actor = shop_display device, not target staff)
    const { nowLocked } = await recordPinFailure(staffId);
    await recordAuditLog({
      actor: req.user as any,
      entityType: 'staff_profile',
      entityId: staffId,
      action: nowLocked ? 'clock_pin_lockout' : 'clock_pin_failed',
      metadata: {
        targetStaffId: staffId,
        targetStaffName: staffUser?.name ?? 'unknown',
        reason: nowLocked
          ? `Locked after ${PIN_MAX_ATTEMPTS} failed attempts in ${PIN_WINDOW_SECS}s`
          : 'Failed PIN attempt',
        lockoutSecs: nowLocked ? PIN_LOCKOUT_SECS : undefined,
      },
    });
    if (nowLocked) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    }
    // Generic response — do not reveal whether user/PIN/approval is missing
    return res.status(401).json({ error: 'Invalid PIN.' });
  }

  // Success — clear lockout counter
  await clearPinLockout(staffId);

  const now = new Date();
  const { startUtc: dayStart } = sydneyDateToUtcBounds(getSydneyTodayStr());

  // Also look for any open shift regardless of day — catches cross-midnight shifts
  const [openShift] = await db.select()
    .from(staffShiftsTable)
    .where(and(
      eq(staffShiftsTable.userId, staffId),
      isNull(staffShiftsTable.clockOut),
    ));

  if (openShift) {
    const clockOut = new Date();
    const msWorked = clockOut.getTime() - openShift.clockIn.getTime();
    const hoursWorked = (msWorked / 3600000).toFixed(2);
    await db.update(staffShiftsTable)
      .set({ clockOut, hoursWorked })
      .where(eq(staffShiftsTable.id, openShift.id));

    return res.json({ data: { clocked: 'out', name: staffUser!.name, shiftId: openShift.id, hoursWorked } });
  } else {
    // Only allow clocking in if the shift would be within today (Sydney time)
    if (now < dayStart) {
      return res.status(400).json({ error: 'Cannot clock in — store day has not started yet.' });
    }
    const shiftId = randomUUID();
    const clockInStoreId = displayStoreIds.length > 0
      ? (displayAssignments.find(a =>
          displayStoreIds.includes(a.storeId)
        )?.storeId ?? null)
      : null;
    await db.insert(staffShiftsTable).values({
      id: shiftId,
      userId: staffId,
      clockIn: now,
      storeId: clockInStoreId,
    });
    return res.json({ data: { clocked: 'in', name: staffUser!.name, shiftId } });
  }
});

// ── Today's shifts (for real-time sync polling) ────────────────────────────
router.get('/shifts/today', async (req, res) => {
  await ensureShopDisplaySchemaReady();

  const myAssignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const storeIds = myAssignments.map((a) => a.storeId);

  let eligibleIds: string[] = [];
  if (storeIds.length > 0) {
    const staffAssignments = await db.select({ staffId: staffStoreAssignmentsTable.staffId })
      .from(staffStoreAssignmentsTable)
      .where(and(
        inArray(staffStoreAssignmentsTable.storeId, storeIds),
        eq(staffStoreAssignmentsTable.isActive, true),
      ));
    eligibleIds = [...new Set(staffAssignments.map((a) => a.staffId))];
    // If this display is store-scoped but no staff are assigned, return nothing
    if (eligibleIds.length === 0) return res.json({ data: [] });
  }

  const { startUtc: dayStart } = sydneyDateToUtcBounds(getSydneyTodayStr());

  // Build scoped WHERE — filter by userId AND storeId where possible
  const shiftWhere = eligibleIds.length > 0
    ? and(
        inArray(staffShiftsTable.userId, eligibleIds),
        gte(staffShiftsTable.clockIn, dayStart),
        // Also scope by storeId when the shift has one recorded
        or(isNull(staffShiftsTable.storeId), inArray(staffShiftsTable.storeId, storeIds)),
      )
    : gte(staffShiftsTable.clockIn, dayStart); // setup mode: display has no store assignments

  const shiftsQuery = db.select({
    id: staffShiftsTable.id,
    userId: staffShiftsTable.userId,
    clockIn: staffShiftsTable.clockIn,
    clockOut: staffShiftsTable.clockOut,
    hoursWorked: staffShiftsTable.hoursWorked,
    storeId: staffShiftsTable.storeId,
  }).from(staffShiftsTable).where(shiftWhere);

  const [shifts, profiles, users] = await Promise.all([
    shiftsQuery,
    db.select({
      userId: staffProfilesTable.userId,
      position: staffProfilesTable.position,
      employeeId: staffProfilesTable.employeeId,
      approvedByAdmin: staffProfilesTable.approvedByAdmin,
      isManager: staffProfilesTable.isManager,
      clockPin: staffProfilesTable.clockPin,
    }).from(staffProfilesTable),
    db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(or(eq(usersTable.role, 'staff'), eq(usersTable.role, 'manager'))),
  ]);

  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const data = shifts
    .filter((s) => {
      const p = profileMap[s.userId];
      const u = userMap[s.userId];
      return u && p && p.clockPin && (p.approvedByAdmin || p.isManager || u.role === 'manager');
    })
    .map((s) => {
      const u = userMap[s.userId];
      const p = profileMap[s.userId];
      return {
        shiftId: s.id,
        userId: s.userId,
        name: u?.name ?? '',
        position: p?.position ?? '',
        employeeId: p?.employeeId ?? '',
        clockIn: s.clockIn.toISOString(),
        clockOut: s.clockOut ? s.clockOut.toISOString() : null,
        hoursWorked: s.hoursWorked ?? null,
        isActive: s.clockOut == null,
      };
    })
    .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());

  return res.json({ data });
});

// ── In-memory transaction binding (sessionId → orderId + device) ──────────────
interface EftposSession {
  orderId: string;
  deviceUserId: string;
  createdAt: number;
}
const activeSessions = new Map<string, EftposSession>();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, s] of activeSessions.entries()) {
    if (s.createdAt < cutoff) activeSessions.delete(id);
  }
}, 60_000).unref();

// ── Verify settings PIN (director/manager/master PIN, system-wide)
router.post('/verify-settings-pin', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { pin } = req.body ?? {};
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'A 4-digit PIN is required.' });
  }

  // Accept any director/manager/master — check settings_pin_hash first,
  // then fall back to clock_pin so directors can use their existing PIN
  // without needing a separate settings PIN configured.
  const rows = await db.execute(sql`
    SELECT sp.settings_pin_hash, sp.clock_pin
    FROM staff_profiles sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.role IN ('manager', 'director', 'master')
  `);
  const profiles = (rows as any).rows ?? (rows as any) ?? [];

  for (const row of profiles) {
    if (row.settings_pin_hash) {
      const valid = await bcrypt.compare(String(pin), row.settings_pin_hash);
      if (valid) return res.json({ granted: true });
    } else if (row.clock_pin) {
      const valid = await bcrypt.compare(String(pin), row.clock_pin);
      if (valid) return res.json({ granted: true });
    }
  }
  return res.json({ granted: false });
});

// ── Linkly device config ───────────────────────────────────────────────────────
router.get('/linkly', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const data = await getLinklyPublicConfig(req.user!.id);
  return res.json({ data });
});

router.patch('/linkly', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const {
    linklyEnabled,
    environment,
    linklyUsername,
    linklyPassword,
    linklyPairingCode,
    linklyPosName,
    linklyPosVersion,
    linklyPosId,
    linklyPosVendorId,
  } = req.body ?? {};
  await saveLinklyConfig(req.user!.id, {
    linklyEnabled,
    environment,
    linklyUsername,
    linklyPassword,
    linklyPairingCode,
    linklyPosName,
    linklyPosVersion,
    linklyPosId,
    linklyPosVendorId,
  });
  return res.json({ success: true });
});

// ── Linkly proxy — test connection ────────────────────────────────────────────
router.post('/linkly/test', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  try {
    const paired = await pairLinklyPinPad(req.user!.id);
    return res.json({ success: true, terminalId: paired.terminalId ?? null });
  } catch (err: any) {
    req.log.warn({ err: err?.message }, 'Linkly test connection error');
    return res.status(400).json({ error: err?.message ?? 'Linkly pairing failed.' });
  }
});

// ── Linkly proxy — initiate transaction ──────────────────────────────────────
router.post('/linkly/transaction', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { orderId } = req.body ?? {};
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });

  // Validate order exists, is unpaid, and belongs to a store assigned to this device
  const [order] = await db.select({
    id: ordersTable.id,
    totalCents: ordersTable.totalCents,
    stripePaymentStatus: ordersTable.stripePaymentStatus,
    storeId: (ordersTable as any).storeId,
  }).from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.stripePaymentStatus === 'succeeded' || (order as any).paymentStatus === 'paid') {
    return res.status(400).json({ error: 'Order is already paid.' });
  }

  // Scope check: device can only charge orders in its assigned stores
  if (order.storeId) {
    const assignedRows = await db.execute(sql`
      SELECT 1 FROM staff_store_assignments
      WHERE staff_id = ${req.user!.id} AND store_id = ${order.storeId} AND is_active = true LIMIT 1
    `);
    const assigned = (assignedRows as any).rows ?? (assignedRows as any) ?? [];
    if (assigned.length === 0) {
      return res.status(403).json({ error: 'This order is not in a store assigned to this display.' });
    }
  }

  const sessionId = randomUUID();
  const amountCents = order.totalCents ?? 0;
  const txnRef = `BF${String(order.id).replace(/-/g, '').slice(0, 10).toUpperCase()}`;

  try {
    await startPurchaseTransaction({
      userId: req.user!.id,
      sessionId,
      amountCents,
      txnRef,
      operatorId: req.user!.id,
      operatorName: req.user!.name ?? req.user!.email ?? 'Display',
      orderId,
      source: 'shop_display',
      notificationUrl: buildLinklyNotificationUrl(req, sessionId),
    });
    // Bind this session to the order and device — poll endpoint will enforce this binding
    activeSessions.set(sessionId, { orderId, deviceUserId: req.user!.id, createdAt: Date.now() });

    return res.json({ data: { sessionId, amountCents, txnRef } });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly transaction initiation error');
    return res.status(400).json({ error: err?.message ?? 'Could not reach Linkly Cloud.' });
  }
});

// ── Linkly proxy — poll transaction status ────────────────────────────────────
router.get('/linkly/transaction/:sessionId', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { sessionId } = req.params;

  // Verify session was created by this device and extract the authoritative orderId
  const binding = activeSessions.get(sessionId);
  if (!binding) return res.status(404).json({ error: 'Session not found or expired.' });
  if (binding.deviceUserId !== req.user!.id) return res.status(403).json({ error: 'Session belongs to a different device.' });
  const boundOrderId = binding.orderId;

  try {
    const status = await recoverOrPollTransaction(req.user!.id, sessionId);

    // On approval: update order using the server-bound orderId only (never trust client-supplied value)
    if (status.success && status.complete) {
      try {
        await db.update(ordersTable)
          .set({
            stripePaymentStatus: 'succeeded',
            paymentMethodType: 'linkly_eftpos',
            status: 'being_prepared',
            updatedAt: new Date(),
          } as any)
          .where(eq(ordersTable.id, boundOrderId));
        activeSessions.delete(sessionId);
      } catch (updateErr: any) {
        req.log.error({ updateErr, orderId: boundOrderId }, 'Failed to update order after Linkly approval');
      }
    } else if (status.complete) {
      // Declined — clean up binding
      activeSessions.delete(sessionId);
    }

    return res.json({
      data: {
        sessionId: status.sessionId,
        txnRef: status.txnRef,
        status: status.status,
        responseCode: status.responseCode,
        responseText: status.responseText,
        approved: status.success,
        complete: status.complete,
        authCode: status.authCode,
        rrn: status.rrn,
        stan: status.stan,
        catid: status.catid,
        caid: status.caid,
        rfn: status.rfn,
        ref: status.ref,
        receiptText: status.receiptText ?? null,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly poll error');
    return res.json({ data: { status: 'pending', responseText: 'Checking terminal status…', approved: false, complete: false } });
  }
});

// ── Linkly proxy — cancel transaction ────────────────────────────────────────
router.delete('/linkly/transaction/:sessionId', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { sessionId } = req.params;

  // Verify device ownership before allowing cancellation
  const binding = activeSessions.get(sessionId);
  if (binding && binding.deviceUserId !== req.user!.id) {
    return res.status(403).json({ error: 'Session belongs to a different device.' });
  }
  activeSessions.delete(sessionId);

  return res.json({ success: true });
});

// ── Printer config — device-local printer settings ───────────────────────────
router.get('/printer-config', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const rows = await db.execute(sql`
    SELECT printer_ip, printer_port, printer_brand, auto_print, auto_drawer, drawer_pin
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!row) {
    return res.json({ data: { printerIp: null, printerPort: 9100, printerBrand: 'epson', autoPrint: false, autoDrawer: false, drawerPin: 0 } });
  }
  return res.json({
    data: {
      printerIp: row.printer_ip ?? null,
      printerPort: row.printer_port ?? 9100,
      printerBrand: row.printer_brand ?? 'epson',
      autoPrint: row.auto_print ?? false,
      autoDrawer: row.auto_drawer ?? false,
      drawerPin: (row.drawer_pin === 1 ? 1 : 0) as 0 | 1,
    },
  });
});

router.patch('/printer-config', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { printerIp, printerPort, printerBrand, autoPrint, autoDrawer, drawerPin } = req.body ?? {};

  await db.execute(sql`
    INSERT INTO shop_display_profiles (user_id, permissions, printer_ip, printer_port, printer_brand, auto_print, auto_drawer, drawer_pin)
    VALUES (
      ${req.user!.id}, '[]',
      ${printerIp ?? null},
      ${printerPort ?? 9100},
      ${printerBrand ?? 'epson'},
      ${autoPrint ?? false},
      ${autoDrawer ?? false},
      ${drawerPin === 1 ? 1 : 0}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      printer_ip    = CASE WHEN ${printerIp !== undefined} THEN ${printerIp ?? null}          ELSE shop_display_profiles.printer_ip    END,
      printer_port  = CASE WHEN ${printerPort !== undefined} THEN ${printerPort ?? 9100}      ELSE shop_display_profiles.printer_port  END,
      printer_brand = CASE WHEN ${printerBrand !== undefined} THEN ${printerBrand ?? 'epson'} ELSE shop_display_profiles.printer_brand END,
      auto_print    = CASE WHEN ${autoPrint !== undefined} THEN ${autoPrint ?? false}          ELSE shop_display_profiles.auto_print    END,
      auto_drawer   = CASE WHEN ${autoDrawer !== undefined} THEN ${autoDrawer ?? false}        ELSE shop_display_profiles.auto_drawer   END,
      drawer_pin    = CASE WHEN ${drawerPin !== undefined} THEN ${drawerPin === 1 ? 1 : 0}    ELSE shop_display_profiles.drawer_pin    END,
      updated_at    = NOW()
  `);

  return res.json({ success: true });
});

router.get('/store-printer-config', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  if (assignments.length === 0) return res.json({ data: null });

  const storeId = assignments[0].storeId;
  const [store] = await db.select({
    printerIp: storesTable.printerIp,
    printerPort: storesTable.printerPort,
    printerBrand: storesTable.printerBrand,
    autoPrint: storesTable.autoPrint,
    autoDrawer: storesTable.autoDrawer,
    drawerPin: storesTable.drawerPin,
  }).from(storesTable).where(eq(storesTable.id, storeId));

  if (!store) return res.json({ data: null });
  return res.json({
    data: {
      printerIp: store.printerIp ?? null,
      printerPort: store.printerPort ?? 9100,
      printerBrand: store.printerBrand ?? 'epson',
      autoPrint: store.autoPrint ?? false,
      autoDrawer: store.autoDrawer ?? false,
      drawerPin: ((store.drawerPin ?? 0) === 1 ? 1 : 0) as 0 | 1,
    },
  });
});

// ── Printer bytes — device opens TCP socket, server just builds ESC/POS ──────
// Mirrors /director/printer/bytes but accessible to shop_display role.
// ── Analytics helpers (Sydney-timezone-correct) ───────────────────────────────
/** Returns today's date in Australia/Sydney as a YYYY-MM-DD string. */
function getSydneyTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

/**
 * Converts a Sydney-local YYYY-MM-DD date to UTC start/end timestamps for DB queries.
 * Probes Sydney's UTC offset at 02:00 UTC of the given calendar date to handle DST correctly.
 * Australia/Sydney is always on the hour (+10 AEST or +11 AEDT), never :30.
 */
function sydneyDateToUtcBounds(dateStr: string): { startUtc: Date; endUtc: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 2, 0, 0)); // 02:00 UTC = midday Sydney
  const sydHour = parseInt(
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false }).format(probe),
    10,
  );
  const utcOffsetHours = sydHour - 2; // e.g. 12-2=10 (AEST), 13-2=11 (AEDT)
  // Date.UTC handles negative hours: Date.UTC(y,m,d,-10) = 14:00 UTC of previous day = Sydney midnight
  const startUtc = new Date(Date.UTC(y, m - 1, d, -utcOffsetHours, 0, 0));
  const endUtc = new Date(startUtc.getTime() + 86400_000 - 1);
  return { startUtc, endUtc };
}

/** Add `days` calendar days to a YYYY-MM-DD string and return the new string. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  const yy = result.getUTCFullYear();
  const mm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(result.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const permissions = await getDisplayPermissions(req.user!.id);
  if (!permissions.includes('dashboard')) {
    return res.status(403).json({ error: 'Dashboard permission required' });
  }

  // Scope to assigned stores (mirrors /orders route)
  const assignments = await db.select({ storeId: staffStoreAssignmentsTable.storeId })
    .from(staffStoreAssignmentsTable)
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  const assignedStoreIds = assignments.map(a => a.storeId);

  // Optional storeId filter: must be one of the assigned stores
  const { range = 'day', date, storeId } = req.query as { range?: string; date?: string; storeId?: string };
  const requestedStoreId = typeof storeId === 'string' && storeId.length > 0 ? storeId : null;
  const isValidStoreId = requestedStoreId && (assignedStoreIds.length === 0 || assignedStoreIds.includes(requestedStoreId));

  let storeFilter: ReturnType<typeof and> | ReturnType<typeof or> | undefined;
  if (isValidStoreId) {
    storeFilter = eq(ordersTable.storeId, requestedStoreId!);
  } else if (assignedStoreIds.length > 0) {
    storeFilter = or(inArray(ordersTable.storeId, assignedStoreIds), isNull(ordersTable.storeId));
  } else {
    storeFilter = undefined;
  }

  // Reference date: Sydney-local YYYY-MM-DD (from param or today in Sydney)
  const refDateStr = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : getSydneyTodayStr();

  let periodStart: Date;
  let periodEnd: Date;
  let prevStart: Date;
  let prevEnd: Date;
  let chartBuckets: { label: string; startMs: number; endMs: number }[];

  if (range === 'week') {
    // Find Monday of the week containing refDateStr (Sydney local day-of-week)
    const [ry, rm, rd] = refDateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(ry, rm - 1, rd)).getUTCDay(); // 0=Sun
    const mondayDiff = dow === 0 ? -6 : 1 - dow;
    const mondayStr = addDaysToDateStr(refDateStr, mondayDiff);
    const sundayStr = addDaysToDateStr(mondayStr, 6);
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekBuckets = dayLabels.map((label, i) => {
      const { startUtc, endUtc } = sydneyDateToUtcBounds(addDaysToDateStr(mondayStr, i));
      return { label, startMs: startUtc.getTime(), endMs: endUtc.getTime() };
    });
    ({ startUtc: periodStart } = sydneyDateToUtcBounds(mondayStr));
    ({ endUtc: periodEnd } = sydneyDateToUtcBounds(sundayStr));
    ({ startUtc: prevStart } = sydneyDateToUtcBounds(addDaysToDateStr(mondayStr, -7)));
    ({ endUtc: prevEnd } = sydneyDateToUtcBounds(addDaysToDateStr(sundayStr, -7)));
    chartBuckets = weekBuckets;
  } else if (range === 'month') {
    const [ry, rm] = refDateStr.split('-').map(Number);
    const monthStartStr = `${ry}-${String(rm).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(ry, rm, 0)).getUTCDate();
    const monthEndStr = `${ry}-${String(rm).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const prevMonthEnd = new Date(Date.UTC(ry, rm - 1, 0));
    const pmy = prevMonthEnd.getUTCFullYear(), pmm = prevMonthEnd.getUTCMonth() + 1;
    const prevDays = prevMonthEnd.getUTCDate();
    const prevMonthStartStr = `${pmy}-${String(pmm).padStart(2, '0')}-01`;
    const prevMonthEndStr = `${pmy}-${String(pmm).padStart(2, '0')}-${String(prevDays).padStart(2, '0')}`;
    ({ startUtc: periodStart } = sydneyDateToUtcBounds(monthStartStr));
    ({ endUtc: periodEnd } = sydneyDateToUtcBounds(monthEndStr));
    ({ startUtc: prevStart } = sydneyDateToUtcBounds(prevMonthStartStr));
    ({ endUtc: prevEnd } = sydneyDateToUtcBounds(prevMonthEndStr));
    chartBuckets = Array.from({ length: daysInMonth }, (_, i) => {
      const dayStr = `${ry}-${String(rm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      const { startUtc, endUtc } = sydneyDateToUtcBounds(dayStr);
      return { label: String(i + 1), startMs: startUtc.getTime(), endMs: endUtc.getTime() };
    });
  } else {
    // day: one Sydney calendar day split into 24 hourly buckets
    ({ startUtc: periodStart, endUtc: periodEnd } = sydneyDateToUtcBounds(refDateStr));
    ({ startUtc: prevStart, endUtc: prevEnd } = sydneyDateToUtcBounds(addDaysToDateStr(refDateStr, -1)));
    chartBuckets = Array.from({ length: 24 }, (_, h) => ({
      label: String(h).padStart(2, '0'),
      startMs: periodStart.getTime() + h * 3600_000,
      endMs: periodStart.getTime() + (h + 1) * 3600_000 - 1,
    }));
  }

  // ── Fast path: past-date day queries served from pre-computed daily summaries ─
  // Avoids full orders table scan at high POS volume. Falls through to live query
  // when no summary row exists (today, first day after deploy, or gap dates).
  //
  // Scope rules: only activate fast path when the store scope is unambiguous.
  //   • isValidStoreId   → use per-store summary (explicit store in query)
  //   • assignedStoreIds.length === 0 → global user; use global summary (store_id='')
  //   • assignedStoreIds.length > 0, no storeId → fall through to live scoped query
  //     so storeFilter (which correctly includes all assigned stores) is applied.
  // This ensures store-assigned users never receive over-broad global totals.
  const canUseFastPath = isValidStoreId || assignedStoreIds.length === 0;
  if (range === 'day' && refDateStr !== getSydneyTodayStr() && canUseFastPath) {
    const summaryStoreId = isValidStoreId ? requestedStoreId! : '';
    const prevDateStr = addDaysToDateStr(refDateStr, -1);

    const [summaryRows, prevSummaryRows, liveAppOrders, livePrevAppOrders, liveWholesale, livePrevWholesale] =
      await Promise.all([
        db.execute(sql`
          SELECT * FROM pos_daily_summaries
          WHERE date = ${refDateStr} AND store_id = ${summaryStoreId}
          LIMIT 1
        `),
        db.execute(sql`
          SELECT total_sales_cents FROM pos_daily_summaries
          WHERE date = ${prevDateStr} AND store_id = ${summaryStoreId}
          LIMIT 1
        `),
        // Non-POS (app) orders for current period — small bounded set
        db.select({
          totalCents: ordersTable.totalCents,
          discountCents: ordersTable.discountCents,
          paymentMethodType: ordersTable.paymentMethodType,
          items: ordersTable.items,
        }).from(ordersTable).where(and(
          gte(ordersTable.createdAt, periodStart),
          lte(ordersTable.createdAt, periodEnd),
          sql`orders.source != 'pos'`,
          sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
          storeFilter,
        )),
        // Non-POS (app) orders for previous period
        db.select({ totalCents: ordersTable.totalCents })
          .from(ordersTable).where(and(
            gte(ordersTable.createdAt, prevStart),
            lte(ordersTable.createdAt, prevEnd),
            sql`orders.source != 'pos'`,
            sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
            storeFilter,
          )),
        // Wholesale orders for current period
        db.select({ totalCents: wholesaleOrdersTable.totalCents, items: wholesaleOrdersTable.items })
          .from(wholesaleOrdersTable).where(and(
            gte(wholesaleOrdersTable.createdAt, periodStart),
            lte(wholesaleOrdersTable.createdAt, periodEnd),
            sql`${wholesaleOrdersTable.status} NOT IN ('cancelled','refunded')`,
          )),
        // Wholesale orders for previous period
        db.select({ totalCents: wholesaleOrdersTable.totalCents })
          .from(wholesaleOrdersTable).where(and(
            gte(wholesaleOrdersTable.createdAt, prevStart),
            lte(wholesaleOrdersTable.createdAt, prevEnd),
            sql`${wholesaleOrdersTable.status} NOT IN ('cancelled','refunded')`,
          )),
      ]);

    const summary = ((summaryRows as any).rows ?? (summaryRows as any))[0];

    if (summary) {
      const prevSummary = ((prevSummaryRows as any).rows ?? (prevSummaryRows as any))[0];

      const posCents = Number(summary.total_sales_cents ?? 0);
      const appCents = liveAppOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
      const wholesaleCents = liveWholesale.reduce((s, o) => s + (o.totalCents ?? 0), 0);
      const totalCents = posCents + appCents + wholesaleCents;

      const posCount = Number(summary.transaction_count ?? 0);
      const transactionCount = posCount + liveAppOrders.length + liveWholesale.length;
      const avgSpendCents = transactionCount > 0 ? Math.round(totalCents / transactionCount) : 0;

      const prevPosCents = Number(prevSummary?.total_sales_cents ?? 0);
      const prevAppCents = livePrevAppOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
      const prevWholesaleCents = livePrevWholesale.reduce((s, o) => s + (o.totalCents ?? 0), 0);
      const prevPeriodTotalCents = prevPosCents + prevAppCents + prevWholesaleCents;

      // Hourly chart from pre-computed 24-element array (POS only)
      const rawHourly = summary.hourly_totals;
      const hourlyArr: number[] = Array.isArray(rawHourly) ? rawHourly
        : (typeof rawHourly === 'string' ? JSON.parse(rawHourly) : Array(24).fill(0));
      const chartData = chartBuckets.map((b, i) => ({
        label: b.label,
        valueCents: hourlyArr[i] ?? 0,
        prevValueCents: 0,
      }));

      // Top sellers from pre-computed summary (POS only — dominant channel)
      const rawTop = summary.top_products;
      const topSellers: any[] = Array.isArray(rawTop) ? rawTop
        : (typeof rawTop === 'string' ? JSON.parse(rawTop) : []);

      // Tender types from pre-computed breakdown (POS only — app/wholesale invoiced separately)
      const rawTender = summary.tender_breakdown;
      const tenderBreakdown: Record<string, number> =
        (rawTender && typeof rawTender === 'object' && !Array.isArray(rawTender)) ? rawTender
        : (typeof rawTender === 'string' ? JSON.parse(rawTender) : {});
      const tenderTypes = Object.entries(tenderBreakdown)
        .map(([type, cents]) => ({
          type,
          count: 0,
          pct: posCents > 0 ? Math.round((Number(cents) / posCents) * 100) : 0,
        }))
        .sort((a, b) => b.pct - a.pct);

      const discountedCents =
        Number(summary.discount_total_cents ?? 0) +
        liveAppOrders.reduce((s, o) => s + (o.discountCents ?? 0), 0);

      return res.json({
        data: {
          totalCents,
          prevPeriodTotalCents,
          transactionCount,
          avgSpendCents,
          itemsSold: Number(summary.items_sold ?? 0),
          cancelledCents: Number(summary.cancelled_cents ?? 0),
          discountedCents,
          channelBreakdown: { appCents, posCents, wholesaleCents },
          chartData,
          topSellers,
          tenderTypes,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        },
      });
    }
    // No pre-computed row found → fall through to full live scan below
  }

  // ── Live (full scan) path — used for today and any date missing a summary ──
  // Pull orders + wholesale for both periods in parallel (orders are store-scoped)
  const [currentOrders, prevOrders, currentWholesale, prevWholesale] = await Promise.all([
    db.select({
      id: ordersTable.id,
      totalCents: ordersTable.totalCents,
      discountCents: ordersTable.discountCents,
      paymentMethodType: ordersTable.paymentMethodType,
      items: ordersTable.items,
      status: ordersTable.status,
      source: sql<string>`orders.source`,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(and(
      gte(ordersTable.createdAt, periodStart),
      lte(ordersTable.createdAt, periodEnd),
      storeFilter,
    )),
    db.select({
      totalCents: ordersTable.totalCents,
      source: sql<string>`orders.source`,
      createdAt: ordersTable.createdAt,
    }).from(ordersTable).where(and(
      gte(ordersTable.createdAt, prevStart),
      lte(ordersTable.createdAt, prevEnd),
      sql`${ordersTable.status} NOT IN ('cancelled','refunded')`,
      storeFilter,
    )),
    db.select({
      id: wholesaleOrdersTable.id,
      totalCents: wholesaleOrdersTable.totalCents,
      items: wholesaleOrdersTable.items,
      status: wholesaleOrdersTable.status,
      createdAt: wholesaleOrdersTable.createdAt,
    }).from(wholesaleOrdersTable).where(and(
      gte(wholesaleOrdersTable.createdAt, periodStart),
      lte(wholesaleOrdersTable.createdAt, periodEnd),
    )),
    db.select({
      totalCents: wholesaleOrdersTable.totalCents,
      createdAt: wholesaleOrdersTable.createdAt,
    }).from(wholesaleOrdersTable).where(and(
      gte(wholesaleOrdersTable.createdAt, prevStart),
      lte(wholesaleOrdersTable.createdAt, prevEnd),
      sql`${wholesaleOrdersTable.status} NOT IN ('cancelled','refunded')`,
    )),
  ]);

  const validOrders = currentOrders.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  const cancelledOrders = currentOrders.filter(o => o.status === 'cancelled' || o.status === 'refunded');
  const validWholesale = currentWholesale.filter(o => o.status !== 'cancelled' && o.status !== 'refunded');

  // Channel breakdown
  const appCents = validOrders.filter(o => o.source !== 'pos').reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const posCents = validOrders.filter(o => o.source === 'pos').reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const wholesaleCents = validWholesale.reduce((s, o) => s + (o.totalCents ?? 0), 0);

  const totalCents = appCents + posCents + wholesaleCents;
  const transactionCount = validOrders.length + validWholesale.length;
  const avgSpendCents = transactionCount > 0 ? Math.round(totalCents / transactionCount) : 0;
  const cancelledCents = cancelledOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const discountedCents = validOrders.reduce((s, o) => s + (o.discountCents ?? 0), 0);
  const prevPeriodTotalCents =
    prevOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0) +
    prevWholesale.reduce((s, o) => s + (o.totalCents ?? 0), 0);

  // Items sold + top sellers (all channels)
  let itemsSold = 0;
  const productMap = new Map<string, { name: string; units: number; revenueCents: number }>();
  for (const order of [...validOrders, ...validWholesale]) {
    const items = Array.isArray(order.items) ? order.items as any[] : [];
    for (const item of items) {
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const price = Number(item.unitPriceCents ?? item.priceCents ?? 0) * qty;
      itemsSold += qty;
      const name = String(item.name ?? item.productName ?? 'Unknown');
      const ex = productMap.get(name);
      if (ex) { ex.units += qty; ex.revenueCents += price; }
      else productMap.set(name, { name, units: qty, revenueCents: price });
    }
  }

  const topSellers = [...productMap.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 6)
    .map(p => ({
      name: p.name,
      units: p.units,
      revenueCents: p.revenueCents,
      pct: totalCents > 0 ? Math.round((p.revenueCents / totalCents) * 100) : 0,
    }));

  // Tender types (orders only — wholesale invoiced separately)
  const tenderMap = new Map<string, number>();
  for (const order of validOrders) {
    const t = (order.paymentMethodType ?? '').toLowerCase();
    const key = t === 'cash' ? 'Cash'
      : (t === 'card' || t === 'eftpos' || t === 'credit_card' || t.includes('card') || t === 'stripe') ? 'Card'
      : t === 'split' ? 'Split'
      : t === 'loyalty' ? 'Loyalty'
      : t ? t.charAt(0).toUpperCase() + t.slice(1)
      : 'Other';
    tenderMap.set(key, (tenderMap.get(key) ?? 0) + 1);
  }
  const tenderTypes = [...tenderMap.entries()]
    .map(([type, cnt]) => ({ type, count: cnt, pct: transactionCount > 0 ? Math.round((cnt / transactionCount) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Chart data — combined total across all channels
  const prevOffset = periodStart.getTime() - prevStart.getTime();
  const chartData = chartBuckets.map(b => {
    const curr =
      validOrders
        .filter(o => { const t = new Date(o.createdAt).getTime(); return t >= b.startMs && t <= b.endMs; })
        .reduce((s, o) => s + (o.totalCents ?? 0), 0) +
      validWholesale
        .filter(o => { const t = new Date(o.createdAt).getTime(); return t >= b.startMs && t <= b.endMs; })
        .reduce((s, o) => s + (o.totalCents ?? 0), 0);
    const prev =
      prevOrders
        .filter(o => { const t = new Date(o.createdAt).getTime() + prevOffset; return t >= b.startMs && t <= b.endMs; })
        .reduce((s, o) => s + (o.totalCents ?? 0), 0) +
      prevWholesale
        .filter(o => { const t = new Date(o.createdAt).getTime() + prevOffset; return t >= b.startMs && t <= b.endMs; })
        .reduce((s, o) => s + (o.totalCents ?? 0), 0);
    return { label: b.label, valueCents: curr, prevValueCents: prev };
  });

  return res.json({
    data: {
      totalCents,
      prevPeriodTotalCents,
      transactionCount,
      avgSpendCents,
      itemsSold,
      cancelledCents,
      discountedCents,
      channelBreakdown: { appCents, posCents, wholesaleCents },
      chartData,
      topSellers,
      tenderTypes,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    },
  });
});

router.post('/printer/bytes', async (req, res) => {
  try {
    const { buildReceiptBytes, buildRegisterSummaryBytes, buildLinklyReceiptBytes, buildOpenDrawerBytes, buildStarOpenDrawerBytes } = await import('../lib/printer.js');
    const { job } = req.body as { job?: any };
    const brand: 'epson' | 'star' = job?.printerBrand === 'star' ? 'star' : 'epson';
    if (job?.jobType === 'open_drawer') {
      const pin: 0 | 1 = job?.drawerPin === 1 ? 1 : 0;
      const bytes = brand === 'star' ? buildStarOpenDrawerBytes(pin) : buildOpenDrawerBytes(pin);
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    if (job?.jobType === 'register_summary') {
      const bytes = buildRegisterSummaryBytes({
        title: typeof job?.title === 'string' ? job.title : 'Daily Register Summary',
        lines: Array.isArray(job?.lines) ? job.lines : [],
        printerBrand: brand,
      });
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    if (job?.jobType === 'linkly_receipt') {
      const bytes = buildLinklyReceiptBytes({
        title: typeof job?.title === 'string' ? job.title : 'Linkly Receipt',
        lines: Array.isArray(job?.lines) ? job.lines : [],
        printerBrand: brand,
      });
      return res.json({ data: { bytes: bytes.toString('base64') } });
    }
    const isRealJob = job && job.orderId && job.orderId !== 'test-0000-0000-0000' && Array.isArray(job.items) && job.items.length > 0;
    const printJob = isRealJob
      ? (job as import('../lib/printer.js').PrintJob)
      : {
          orderId:             'test-0000-0000-0000',
          customerName:        req.user!.name,
          type:                'pickup' as const,
          items:               [
            { name: 'Choc Chip Cookie', quantity: 2, unitPriceCents: 500 },
            { name: 'Flat White',       quantity: 1, unitPriceCents: 550 },
          ],
          totalCents:          1550,
          loyaltyPointsEarned: 15,
          notes:               'Test print — Butterfield POS',
          printerBrand:        brand,
        };
    const bytes = buildReceiptBytes(printJob);
    return res.json({ data: { bytes: bytes.toString('base64') } });
  } catch (err: any) {
    req.log.error({ err }, 'printer bytes error');
    return res.status(500).json({ error: 'Failed to build receipt bytes' });
  }
});

export default router;
