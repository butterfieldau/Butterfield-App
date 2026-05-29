import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, staffShiftsTable, staffTasksTable, staffTaskHistoryTable, staffWastageTable, staffIssuesTable, staffLeaveRequestsTable, staffProfilesTable, usersTable, ordersTable, wholesaleOrdersTable, wholesaleAccountsTable, storeSettingsTable, staffStoreAssignmentsTable, storesTable } from '@workspace/db';
import { eq, desc, isNull, and, gte, lte, sql } from 'drizzle-orm';

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
import { requireRole } from '../middlewares/auth.js';

const router = Router();
router.use(requireRole('staff', 'manager'));

const SHOP_LAT_DEFAULT  = -33.8349;
const SHOP_LNG_DEFAULT  = 150.9942;
const RADIUS_DEFAULT    = 20;

async function ensureGeoDefaults() {
  await db.insert(storeSettingsTable).values([
    { key: 'geo_radius_meters', value: String(RADIUS_DEFAULT) },
    { key: 'shop_lat',          value: String(SHOP_LAT_DEFAULT) },
    { key: 'shop_lng',          value: String(SHOP_LNG_DEFAULT) },
  ]).onConflictDoNothing();
}

router.get('/settings/geo', async (req, res) => {
  await ensureGeoDefaults();
  const rows = await db.select().from(storeSettingsTable);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return res.json({
    data: {
      shopLat:      parseFloat(map['shop_lat']          ?? String(SHOP_LAT_DEFAULT)),
      shopLng:      parseFloat(map['shop_lng']          ?? String(SHOP_LNG_DEFAULT)),
      radiusMeters: parseInt(  map['geo_radius_meters'] ?? String(RADIUS_DEFAULT)),
    },
  });
});

router.patch('/settings/geo', async (req, res) => {
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  if (!profile?.isManager) {
    return res.status(403).json({ error: 'Only managers can update geo settings.' });
  }
  const { radiusMeters } = req.body;
  if (typeof radiusMeters !== 'number' || radiusMeters < 5 || radiusMeters > 500) {
    return res.status(400).json({ error: 'Radius must be between 5 and 500 meters.' });
  }
  await ensureGeoDefaults();
  await db.update(storeSettingsTable)
    .set({ value: String(radiusMeters), updatedAt: new Date(), updatedBy: req.user!.id })
    .where(eq(storeSettingsTable.key, 'geo_radius_meters'));
  return res.json({ data: { radiusMeters } });
});

// Staff's assigned stores (for geofence UI)
router.get('/my-store-assignments', async (req, res) => {
  const rows = await db.select({
    id: staffStoreAssignmentsTable.id,
    storeId: staffStoreAssignmentsTable.storeId,
    isPrimary: staffStoreAssignmentsTable.isPrimary,
    isActive: staffStoreAssignmentsTable.isActive,
    name: storesTable.name,
    suburb: storesTable.suburb,
    address: storesTable.address,
    latitude: storesTable.latitude,
    longitude: storesTable.longitude,
    geofenceRadius: storesTable.geofenceRadius,
    status: storesTable.status,
  }).from(staffStoreAssignmentsTable)
    .leftJoin(storesTable, eq(staffStoreAssignmentsTable.storeId, storesTable.id))
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
  return res.json({ data: rows });
});

router.post('/shifts/clock-in', async (req, res) => {
  const { storeId: bodyStoreId, latitude, longitude } = req.body ?? {};

  const existing = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Already clocked in', shift: existing[0] });
  }

  // Check if demo account — bypass geo enforcement
  const [userRow] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, req.user!.id));
  const isDemoAccount = !!userRow?.email && (
    userRow.email.endsWith('@demo.com') || userRow.email.includes('+demo')
  );

  // Fetch active store assignments for this staff member
  const assignments = await db.select({
    id: staffStoreAssignmentsTable.id,
    storeId: staffStoreAssignmentsTable.storeId,
    isPrimary: staffStoreAssignmentsTable.isPrimary,
    latitude: storesTable.latitude,
    longitude: storesTable.longitude,
    geofenceRadius: storesTable.geofenceRadius,
    storeName: storesTable.name,
  }).from(staffStoreAssignmentsTable)
    .leftJoin(storesTable, eq(staffStoreAssignmentsTable.storeId, storesTable.id))
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, req.user!.id),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));

  let finalStoreId: string | null = bodyStoreId ?? null;
  let distanceMeters: number | null = null;

  if (!isDemoAccount) {
    if (assignments.length === 0) {
      return res.status(403).json({ error: 'No active store assignment was found for this account. Ask a director or master to assign you to a store before clocking in.' });
    }
    if (latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Location is required. Please enable location access to clock in.' });
    }

    // Load global geo settings as fallback for stores that have no coordinates set.
    // The director configures lat/lng/radius in the Settings screen (store_settings table).
    // Per-store values in the stores table take priority; global values are the fallback.
    await ensureGeoDefaults();
    const geoRows = await db.select().from(storeSettingsTable);
    const geoMap = Object.fromEntries(geoRows.map(r => [r.key, r.value]));
    const fallbackLat    = parseFloat(geoMap['shop_lat']          ?? String(SHOP_LAT_DEFAULT));
    const fallbackLng    = parseFloat(geoMap['shop_lng']          ?? String(SHOP_LNG_DEFAULT));
    const fallbackRadius = parseInt(  geoMap['geo_radius_meters'] ?? String(RADIUS_DEFAULT));

    const measured = assignments.map(a => {
      const effLat = (a.latitude  != null && !isNaN(a.latitude))  ? a.latitude  : fallbackLat;
      const effLng = (a.longitude != null && !isNaN(a.longitude)) ? a.longitude : fallbackLng;
      return {
        ...a,
        radiusMeters: a.geofenceRadius ?? fallbackRadius,
        distance: haversineMeters(latitude, longitude, effLat, effLng),
      };
    }).sort((a, b) => a.distance - b.distance);

    if (bodyStoreId) {
      const selected = measured.find(a => a.storeId === bodyStoreId);
      if (!selected) {
        return res.status(403).json({ error: 'That store is not assigned to your account. Please choose one of your assigned stores.' });
      }
      if (selected.distance > selected.radiusMeters) {
        return res.status(403).json({
          error: `You are ${Math.round(selected.distance)}m from ${selected.storeName}. You must be within ${selected.radiusMeters}m to clock in.`,
          distanceMeters: Math.round(selected.distance),
        });
      }
      finalStoreId = selected.storeId;
      distanceMeters = Math.round(selected.distance);
    } else {
      const matched = measured.find(a => a.distance <= a.radiusMeters);
      if (!matched) {
        const nearest = measured[0];
        return res.status(403).json({
          error: `You are ${Math.round(nearest.distance)}m from ${nearest.storeName}. You must be within ${nearest.radiusMeters}m to clock in.`,
          distanceMeters: Math.round(nearest.distance),
        });
      }
      finalStoreId = matched.storeId;
      distanceMeters = Math.round(matched.distance);
    }
  }

  const [shift] = await db.insert(staffShiftsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    clockIn: new Date(),
    storeId: finalStoreId,
    clockInLat: latitude ?? null,
    clockInLng: longitude ?? null,
    clockInDistanceMeters: distanceMeters,
    unpaidBreakMins: 0,
  }).returning();

  const storeName = assignments.find(a => a.storeId === finalStoreId)?.storeName ?? null;
  return res.status(201).json({ data: { ...shift, storeName } });
});

router.post('/shifts/clock-out', async (req, res) => {
  const { unpaidBreakMins } = req.body;
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  if (!active) return res.status(400).json({ error: 'No active shift found' });
  const now = new Date();
  const ms = now.getTime() - active.clockIn.getTime();
  const totalMins = Math.floor(ms / 60000);
  const unpaidMins = typeof unpaidBreakMins === 'number' ? unpaidBreakMins : 0;
  const paidMins = Math.max(0, totalMins - unpaidMins);
  const { latitude: coLat, longitude: coLng } = req.body ?? {};
  const clockOutDist = (coLat != null && coLng != null && active.storeId)
    ? await (async () => {
        const [store] = await db.select({ latitude: storesTable.latitude, longitude: storesTable.longitude })
          .from(storesTable).where(eq(storesTable.id, active.storeId!));
        return (store?.latitude != null && store?.longitude != null) ? Math.round(haversineMeters(coLat, coLng, store.latitude, store.longitude)) : null;
      })()
    : null;

  const [shift] = await db.update(staffShiftsTable)
    .set({
      clockOut: now, hoursWorked: (paidMins / 60).toFixed(2), unpaidBreakMins: unpaidMins,
      clockOutLat: coLat ?? null, clockOutLng: coLng ?? null, clockOutDistanceMeters: clockOutDist,
    })
    .where(eq(staffShiftsTable.id, active.id))
    .returning();
  return res.json({ data: shift });
});

router.get('/shifts/current', async (req, res) => {
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  return res.json({ data: active ?? null });
});

router.get('/shifts/stats', async (req, res) => {
  const [profile] = await db.select().from(staffProfilesTable)
    .where(eq(staffProfilesTable.userId, req.user!.id));
  const hourlyRateCents = profile?.hourlyRateCents ?? 2200;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(todayStart);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);

  const allShifts = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), gte(staffShiftsTable.clockIn, weekStart)));

  const todayShifts = allShifts.filter(s => new Date(s.clockIn) >= todayStart && s.clockOut);
  const weekShifts = allShifts.filter(s => s.clockOut);

  const sumPaidMins = (shifts: typeof allShifts) =>
    shifts.reduce((sum, s) => {
      const ms = new Date(s.clockOut!).getTime() - new Date(s.clockIn).getTime();
      const total = Math.floor(ms / 60000);
      return sum + Math.max(0, total - (s.unpaidBreakMins ?? 0));
    }, 0);

  const todayMins = sumPaidMins(todayShifts);
  const weekMins = sumPaidMins(weekShifts);
  const todayEarningsCents = Math.round((todayMins / 60) * hourlyRateCents);
  const weekEarningsCents = Math.round((weekMins / 60) * hourlyRateCents);

  return res.json({
    data: { hourlyRateCents, todayMins, todayEarningsCents, weekMins, weekEarningsCents },
  });
});

router.get('/shifts', async (req, res) => {
  const { from, to } = req.query;
  const conditions: any[] = [eq(staffShiftsTable.userId, req.user!.id)];
  if (from) conditions.push(gte(staffShiftsTable.clockIn, new Date(from as string)));
  if (to) conditions.push(lte(staffShiftsTable.clockIn, new Date(to as string)));
  const shifts = await db.select().from(staffShiftsTable)
    .where(and(...conditions))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(100);
  return res.json({ data: shifts });
});

router.get('/timesheet', async (req, res) => {
  const [myProfile] = await db.select().from(staffProfilesTable)
    .where(eq(staffProfilesTable.userId, req.user!.id));

  const { from, to, userId: targetUserId } = req.query;

  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const fromDate = from ? new Date(from as string) : weekStart;
  const toDate = to ? new Date(to as string) : weekEnd;

  const isManagerOrDirector = myProfile?.isManager;

  if (isManagerOrDirector) {
    const staffList = await db.select({
      userId: staffProfilesTable.userId,
      name: usersTable.name,
      position: staffProfilesTable.position,
      hourlyRateCents: staffProfilesTable.hourlyRateCents,
      isManager: staffProfilesTable.isManager,
    }).from(staffProfilesTable)
      .leftJoin(usersTable, eq(staffProfilesTable.userId, usersTable.id));

    const target = targetUserId as string | undefined;
    const shiftConditions: any[] = [
      gte(staffShiftsTable.clockIn, fromDate),
      lte(staffShiftsTable.clockIn, toDate),
    ];
    if (target) shiftConditions.push(eq(staffShiftsTable.userId, target));

    const shifts = await db.select({
      id: staffShiftsTable.id,
      userId: staffShiftsTable.userId,
      clockIn: staffShiftsTable.clockIn,
      clockOut: staffShiftsTable.clockOut,
      hoursWorked: staffShiftsTable.hoursWorked,
      unpaidBreakMins: staffShiftsTable.unpaidBreakMins,
      name: usersTable.name,
      hourlyRateCents: staffProfilesTable.hourlyRateCents,
      position: staffProfilesTable.position,
    }).from(staffShiftsTable)
      .leftJoin(staffProfilesTable, eq(staffShiftsTable.userId, staffProfilesTable.userId))
      .leftJoin(usersTable, eq(staffShiftsTable.userId, usersTable.id))
      .where(and(...shiftConditions))
      .orderBy(desc(staffShiftsTable.clockIn));

    return res.json({ data: shifts, staff: staffList, isManager: true, profile: myProfile });
  } else {
    const shifts = await db.select().from(staffShiftsTable)
      .where(and(
        eq(staffShiftsTable.userId, req.user!.id),
        gte(staffShiftsTable.clockIn, fromDate),
        lte(staffShiftsTable.clockIn, toDate),
      ))
      .orderBy(desc(staffShiftsTable.clockIn));
    return res.json({ data: shifts, profile: myProfile, isManager: false });
  }
});

router.get('/tasks', async (req, res) => {
  const { category } = req.query;
  const userId = req.user!.id;
  const visibilityFilter = sql`(${staffTasksTable.assignedToUserId} IS NULL OR ${staffTasksTable.assignedToUserId} = ${userId})`;
  if (category) {
    const tasks = await db.select().from(staffTasksTable).where(
      and(eq(staffTasksTable.category, category as any), visibilityFilter)
    );
    return res.json({ data: tasks });
  }
  const tasks = await db.select().from(staffTasksTable).where(visibilityFilter).orderBy(staffTasksTable.sortOrder);
  return res.json({ data: tasks });
});

router.patch('/tasks/:id/complete', async (req, res) => {
  const { isCompleted } = req.body;
  const [task] = await db.update(staffTasksTable).set({
    isCompleted: isCompleted ?? true,
    completedBy: isCompleted ? req.user!.name : null,
    completedAt: isCompleted ? new Date() : null,
  }).where(eq(staffTasksTable.id, req.params.id)).returning();
  if (task) {
    await db.insert(staffTaskHistoryTable).values({
      id: randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      taskCategory: task.category,
      completedByUserId: req.user!.id,
      completedByName: req.user!.name,
      completedByRole: req.user!.role,
      completionStatus: (isCompleted ?? true) ? 'completed' : 'reopened',
    });
  }
  return res.json({ data: task });
});

router.post('/wastage', async (req, res) => {
  const { productName, quantity, unit, reason, estimatedCostCents, notes } = req.body;
  if (!productName || !quantity || !reason) {
    return res.status(400).json({ error: 'Product, quantity and reason are required' });
  }
  const parsedEstimatedCostCents =
    estimatedCostCents == null || estimatedCostCents === ''
      ? null
      : Number.isFinite(Number(estimatedCostCents)) && Number(estimatedCostCents) >= 0
        ? Math.round(Number(estimatedCostCents))
        : NaN;
  if (Number.isNaN(parsedEstimatedCostCents)) {
    return res.status(400).json({ error: 'estimatedCostCents must be a valid positive amount' });
  }
  const [entry] = await db.insert(staffWastageTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    productName, quantity, unit: unit ?? 'units', reason, estimatedCostCents: parsedEstimatedCostCents, notes,
  }).returning();
  return res.status(201).json({ data: entry });
});

router.get('/wastage', async (req, res) => {
  const entries = await db.select().from(staffWastageTable).orderBy(desc(staffWastageTable.createdAt)).limit(50);
  return res.json({ data: entries });
});

router.post('/issues', async (req, res) => {
  const { title, description, category, priority } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });
  const [issue] = await db.insert(staffIssuesTable).values({
    id: randomUUID(), userId: req.user!.id, title, description,
    category: category ?? 'general', priority: priority ?? 'medium', status: 'open',
  }).returning();
  return res.status(201).json({ data: issue });
});

router.post('/leave', async (req, res) => {
  const { startDate, endDate, type, reason } = req.body;
  if (!startDate || !endDate || !reason) return res.status(400).json({ error: 'Start date, end date and reason are required' });
  const [leave] = await db.insert(staffLeaveRequestsTable).values({
    id: randomUUID(), userId: req.user!.id, startDate, endDate,
    type: type ?? 'annual', reason, status: 'pending',
  }).returning();
  return res.status(201).json({ data: leave });
});

router.get('/orders', async (req, res) => {
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  if (!profile?.canViewOrders) {
    return res.status(403).json({ error: 'You do not have permission to view orders.' });
  }
  const [customerOrders, wholesaleOrders, allUsers, wsAccounts] = await Promise.all([
    db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(100),
    db.select().from(wholesaleOrdersTable).orderBy(desc(wholesaleOrdersTable.createdAt)).limit(50),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable),
    db.select({ id: wholesaleAccountsTable.id, userId: wholesaleAccountsTable.userId, companyName: wholesaleAccountsTable.companyName }).from(wholesaleAccountsTable),
  ]);
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u]));
  const wsMap   = Object.fromEntries(wsAccounts.map(w => [w.userId, w]));
  const all = [
    ...customerOrders.map(o => ({
      ...o,
      orderSource:  'customer' as const,
      customerName: userMap[o.userId]?.name ?? null,
    })),
    ...wholesaleOrders.map(wo => ({
      ...wo,
      type:         'wholesale',
      orderSource:  'wholesale' as const,
      customerName: wsMap[wo.userId]?.companyName ?? userMap[wo.userId]?.name ?? null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 150);
  return res.json({ data: all });
});

router.get('/profile', async (req, res) => {
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  return res.json({ data: profile ?? null });
});


router.get('/members', async (req, res) => {
  const [myProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  if (!myProfile?.isManager) return res.status(403).json({ error: 'Managers only' });
  const members = await db.select({
    userId: staffProfilesTable.userId,
    employeeId: staffProfilesTable.employeeId,
    position: staffProfilesTable.position,
    isManager: staffProfilesTable.isManager,
    hourlyRateCents: staffProfilesTable.hourlyRateCents,
    name: usersTable.name,
    email: usersTable.email,
  }).from(staffProfilesTable).leftJoin(usersTable, eq(staffProfilesTable.userId, usersTable.id));
  return res.json({ data: members });
});

export default router;
