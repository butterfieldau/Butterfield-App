import { Router } from 'express';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

// ── Encryption helpers (AES-256-CBC, key derived from SESSION_SECRET) ─────────
import { createHash } from 'crypto';

function getEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set — cannot encrypt/decrypt Linkly credentials.');
  return createHash('sha256').update(secret).digest();
}

function encryptText(plain: string): string {
  const key = getEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${enc}`;
}

function decryptText(stored: string): string {
  const key = getEncKey();
  const sep = stored.indexOf(':');
  const iv = Buffer.from(stored.slice(0, sep), 'hex');
  const data = stored.slice(sep + 1);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let dec = decipher.update(data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

// ── Verify settings PIN (uses clock-in PIN, scoped to stores assigned to device)
router.post('/verify-settings-pin', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { pin } = req.body ?? {};
  if (!pin || !/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'A 4-digit PIN is required.' });
  }

  // Require this device to have at least one store assigned via staff_store_assignments —
  // unassigned displays have no organisational context and cannot be unlocked.
  const storeRows = await db.execute(sql`
    SELECT store_id FROM staff_store_assignments
    WHERE staff_id = ${req.user!.id} AND is_active = true LIMIT 10
  `);
  const deviceStoreRows = (storeRows as any).rows ?? (storeRows as any) ?? [];
  if (deviceStoreRows.length === 0) {
    return res.json({ granted: false, reason: 'No store assigned to this display.' });
  }
  const deviceStoreIds: string[] = deviceStoreRows.map((r: any) => r.store_id);

  // Accept only dedicated settings PINs of manager/director/master accounts
  // who share at least one store assignment with this device.
  const rows = await db.execute(sql`
    SELECT sp.settings_pin_hash
    FROM staff_profiles sp
    INNER JOIN users u ON u.id = sp.user_id
    INNER JOIN staff_store_assignments ssa ON ssa.staff_id = sp.user_id AND ssa.is_active = true
    WHERE u.role IN ('manager', 'director', 'master')
      AND sp.settings_pin_hash IS NOT NULL
      AND ssa.store_id = ANY(${deviceStoreIds}::text[])
  `);
  const profiles = (rows as any).rows ?? (rows as any) ?? [];

  for (const row of profiles) {
    const valid = await bcrypt.compare(String(pin), row.settings_pin_hash);
    if (valid) return res.json({ granted: true });
  }
  return res.json({ granted: false });
});

// ── Linkly device config ───────────────────────────────────────────────────────
router.get('/linkly', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const rows = await db.execute(sql`
    SELECT linkly_enabled, linkly_username, linkly_pairing_code, linkly_terminal_id,
           CASE WHEN linkly_password_encrypted IS NOT NULL THEN true ELSE false END AS has_password
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!row) {
    return res.json({ data: { linklyEnabled: false, linklyUsername: null, linklyPairingCode: null, linklyTerminalId: null, hasPassword: false, linklyConfigComplete: false } });
  }
  const linklyConfigComplete = !!(row.linkly_username && row.has_password && row.linkly_pairing_code);
  return res.json({
    data: {
      linklyEnabled: row.linkly_enabled ?? false,
      linklyUsername: row.linkly_username ?? null,
      linklyPairingCode: row.linkly_pairing_code ?? null,
      linklyTerminalId: row.linkly_terminal_id ?? null,
      hasPassword: row.has_password ?? false,
      linklyConfigComplete,
    },
  });
});

router.patch('/linkly', async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { linklyEnabled, linklyUsername, linklyPassword, linklyPairingCode } = req.body ?? {};

  const encPassword = linklyPassword ? encryptText(String(linklyPassword)) : undefined;

  await db.execute(sql`
    INSERT INTO shop_display_profiles (user_id, permissions, linkly_enabled, linkly_username, linkly_password_encrypted, linkly_pairing_code, linkly_terminal_id)
    VALUES (
      ${req.user!.id}, '[]',
      ${linklyEnabled ?? false},
      ${linklyUsername ?? null},
      ${encPassword ?? null},
      ${linklyPairingCode ?? null},
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      linkly_enabled = COALESCE(${linklyEnabled ?? null}, shop_display_profiles.linkly_enabled),
      linkly_username = CASE WHEN ${linklyUsername !== undefined} THEN ${linklyUsername ?? null} ELSE shop_display_profiles.linkly_username END,
      linkly_password_encrypted = CASE WHEN ${encPassword !== undefined} THEN ${encPassword ?? null} ELSE shop_display_profiles.linkly_password_encrypted END,
      linkly_pairing_code = CASE WHEN ${linklyPairingCode !== undefined} THEN ${linklyPairingCode ?? null} ELSE shop_display_profiles.linkly_pairing_code END,
      updated_at = NOW()
  `);

  return res.json({ success: true });
});

// ── Linkly proxy — test connection ────────────────────────────────────────────
router.post('/linkly/test', async (req, res) => {
  await ensureShopDisplaySchemaReady();

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const row = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!row?.linkly_username || !row?.linkly_password_encrypted || !row?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly credentials not configured on this device.' });
  }

  let password: string;
  try { password = decryptText(row.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt stored password.' }); }

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: row.linkly_username,
        password,
        pairingCode: row.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: req.user!.id,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) {
      return res.status(400).json({ error: authBody?.message ?? authBody?.error ?? 'Linkly authentication failed.' });
    }

    const terminalId = authBody.terminalId ?? authBody.terminal_id ?? authBody.TerminalId ?? null;
    if (terminalId) {
      await db.execute(sql`
        UPDATE shop_display_profiles SET linkly_terminal_id = ${terminalId} WHERE user_id = ${req.user!.id}
      `);
    }

    return res.json({ success: true, terminalId });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly test connection error');
    return res.status(502).json({ error: 'Could not reach Linkly Cloud. Check your network and try again.' });
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

  // Get Linkly config for this device
  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code, linkly_terminal_id
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly is not configured on this device.' });
  }

  let password: string;
  try { password = decryptText(cfg.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt stored password.' }); }

  const sessionId = randomUUID();
  const amountCents = order.totalCents ?? 0;

  try {
    // Authenticate first
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: req.user!.id,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) {
      return res.status(400).json({ error: authBody?.message ?? 'Linkly authentication failed.' });
    }

    const authToken = authBody.token ?? authBody.Token;
    const secret = authBody.secret ?? authBody.Secret ?? '';

    // Initiate transaction
    const txnRes = await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'Secret': secret,
      },
      body: JSON.stringify({
        SessionId: sessionId,
        Merchant: '00',
        TxnType: 'P',
        AmountCash: 0,
        AmountPurchase: amountCents,
        TxnRef: orderId.slice(0, 16),
        EnableTip: false,
        CutReceipt: '0',
        ReceiptAutoPrint: '7',
      }),
    });

    if (!txnRes.ok) {
      const txnBody = await txnRes.json().catch(() => ({})) as any;
      return res.status(400).json({ error: txnBody?.message ?? 'Failed to start EFTPOS transaction.' });
    }

    // Bind this session to the order and device — poll endpoint will enforce this binding
    activeSessions.set(sessionId, { orderId, deviceUserId: req.user!.id, createdAt: Date.now() });

    return res.json({ data: { sessionId, amountCents } });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly transaction initiation error');
    return res.status(502).json({ error: 'Could not reach Linkly Cloud.' });
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

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly not configured.' });
  }

  let password: string;
  try { password = decryptText(cfg.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt password.' }); }

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: req.user!.id,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) return res.status(400).json({ error: 'Linkly re-authentication failed.' });

    const authToken = authBody.token ?? authBody.Token;
    const secret = authBody.secret ?? authBody.Secret ?? '';

    const pollRes = await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Secret': secret,
      },
    });
    const pollBody = await pollRes.json().catch(() => ({})) as any;

    if (!pollRes.ok) {
      return res.json({ data: { status: 'unknown', responseText: 'Polling error', approved: false } });
    }

    const response = pollBody.Response ?? pollBody.response ?? {};
    const success = pollBody.SessionComplete ?? pollBody.Complete ?? false;
    const approved = success && (
      response.Success === true ||
      response.ResponseCode === '00' ||
      response.ResponseText?.toLowerCase().includes('approved') ||
      pollBody.TxnCompleted === true
    );
    const declined = success && !approved;

    let statusText = 'Waiting for card…';
    if (success && approved) statusText = 'Approved';
    else if (success && declined) statusText = 'Declined';
    else if (response.ResponseText) statusText = response.ResponseText;

    // On approval: update order using the server-bound orderId only (never trust client-supplied value)
    if (approved) {
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
    } else if (success) {
      // Declined — clean up binding
      activeSessions.delete(sessionId);
    }

    return res.json({
      data: {
        status: success ? (approved ? 'approved' : 'declined') : 'pending',
        responseText: statusText,
        approved,
        complete: success,
        receiptText: response.ReceiptText ?? null,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly poll error');
    return res.json({ data: { status: 'pending', responseText: 'Connecting to terminal…', approved: false, complete: false } });
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

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly not configured.' });
  }

  let password: string;
  try { password = decryptText(cfg.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt password.' }); }

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: req.user!.id,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) return res.status(400).json({ error: 'Linkly re-authentication failed.' });

    const authToken = authBody.token ?? authBody.Token;
    const secret = authBody.secret ?? authBody.Secret ?? '';

    await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Secret': secret,
      },
    });

    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, 'Linkly cancel error');
    return res.json({ success: true });
  }
});

export default router;
