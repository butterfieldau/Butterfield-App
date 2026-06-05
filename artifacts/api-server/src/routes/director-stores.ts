import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, storesTable, storeOpeningHoursTable, staffStoreAssignmentsTable,
  staffShiftsTable, staffProfilesTable, usersTable,
} from '@workspace/db';
import { eq, and, desc, isNull, isNotNull, lte } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { ensureStoreConfigSchemaReady } from '../lib/ensureStoreConfigSchemaReady.js';

const router = Router();
const STORE_DELETE_GRACE_MS = 24 * 60 * 60 * 1000;

async function purgeExpiredDeletedStores() {
  const now = new Date();
  const expired = await db.select({ id: storesTable.id })
    .from(storesTable)
    .where(and(isNotNull(storesTable.deletedAt), lte(storesTable.purgeAt, now)));

  if (expired.length === 0) return;

  for (const store of expired) {
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
}

router.use(async (_req, _res, next) => {
  try {
    await ensureStoreConfigSchemaReady();
    await purgeExpiredDeletedStores();
    next();
  } catch (error) {
    next(error);
  }
});
router.use(requireRole('director', 'master', 'manager'));
// No global requireManagerPermission here — this router is mounted before the main
// director router, so a global guard would block managers on ALL /director/* paths
// (tasks, orders, etc.) that are handled by other routers. Write routes below use
// inline role checks; reads are accessible to all manager roles.

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Store CRUD ────────────────────────────────────────────────────────────────

router.get('/stores', async (_req, res) => {
  const stores = await db.select().from(storesTable).orderBy(storesTable.sortOrder, storesTable.name);
  return res.json({ data: stores });
});

router.get('/stores/:id', async (req, res) => {
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, req.params.id));
  if (!store) return res.status(404).json({ error: 'Store not found.' });
  const hours = await db.select().from(storeOpeningHoursTable)
    .where(eq(storeOpeningHoursTable.storeId, store.id));
  const assignments = await db.select({
    id: staffStoreAssignmentsTable.id,
    staffId: staffStoreAssignmentsTable.staffId,
    isPrimary: staffStoreAssignmentsTable.isPrimary,
    isActive: staffStoreAssignmentsTable.isActive,
    name: usersTable.name,
    email: usersTable.email,
    position: staffProfilesTable.position,
  }).from(staffStoreAssignmentsTable)
    .leftJoin(usersTable, eq(staffStoreAssignmentsTable.staffId, usersTable.id))
    .leftJoin(staffProfilesTable, eq(staffStoreAssignmentsTable.staffId, staffProfilesTable.userId))
    .where(eq(staffStoreAssignmentsTable.storeId, store.id));
  return res.json({ data: { ...store, openingHours: hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek), assignments } });
});

router.post('/stores', async (req, res) => {
  if (req.user!.role === 'manager') return res.status(403).json({ error: 'Managers cannot create stores.' });
  const {
    name, slug, address, suburb, state, postcode, country = 'Australia',
    latitude, longitude, geofenceRadius = 100, phone, email, website, imageUrl,
    printerIp, printerPort = 9100, orderCutoffTime, dailySpecial,
    status = 'open', pickupAvailable = true, deliveryAvailable = false,
    publicNotes, internalNotes, sortOrder = 0,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const finalSlug = slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [store] = await db.insert(storesTable).values({
    id: randomUUID(), name, slug: finalSlug, address, suburb, state, postcode, country,
    latitude, longitude, geofenceRadius, phone, email, website, imageUrl,
    printerIp, printerPort, orderCutoffTime, dailySpecial, status,
    pickupAvailable, deliveryAvailable, publicNotes, internalNotes, sortOrder,
  }).returning();
  return res.status(201).json({ data: store });
});

router.patch('/stores/:id', requireManagerPermission('settings'), async (req, res) => {
  if (req.user!.role === 'manager') return res.status(403).json({ error: 'Managers cannot edit stores.' });
  const allowed = [
    'name','slug','address','suburb','state','postcode','country',
    'latitude','longitude','geofenceRadius','phone','email','website','imageUrl',
    'printerIp','printerPort','orderCutoffTime','dailySpecial',
    'status','pickupAvailable','deliveryAvailable','publicNotes','internalNotes','sortOrder',
  ];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const [updated] = await db.update(storesTable).set(updates).where(eq(storesTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Store not found.' });
  return res.json({ data: updated });
});

router.delete('/stores/:id', requireManagerPermission('settings'), async (req, res) => {
  if (req.user!.role === 'manager') return res.status(403).json({ error: 'Managers cannot delete stores.' });
  const [existing] = await db.select().from(storesTable).where(eq(storesTable.id, req.params.id));
  if (!existing) return res.status(404).json({ error: 'Store not found.' });
  const now = new Date();
  const purgeAt = new Date(now.getTime() + STORE_DELETE_GRACE_MS);
  const [updated] = await db.update(storesTable)
    .set({
      preDeleteStatus: existing.status,
      status: 'closed',
      deletedAt: now,
      purgeAt,
      updatedAt: now,
    })
    .where(eq(storesTable.id, req.params.id)).returning();
  return res.json({ success: true, data: updated });
});

router.post('/stores/:id/restore', requireManagerPermission('settings'), async (req, res) => {
  if (req.user!.role === 'manager') return res.status(403).json({ error: 'Managers cannot restore stores.' });
  const [existing] = await db.select().from(storesTable).where(eq(storesTable.id, req.params.id));
  if (!existing) return res.status(404).json({ error: 'Store not found.' });
  if (!existing.deletedAt) return res.status(400).json({ error: 'Store is not pending deletion.' });

  const [updated] = await db.update(storesTable)
    .set({
      status: (existing.preDeleteStatus as typeof existing.status | null) ?? 'open',
      preDeleteStatus: null,
      deletedAt: null,
      purgeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(storesTable.id, req.params.id))
    .returning();

  return res.json({ success: true, data: updated });
});

// ── Opening Hours ─────────────────────────────────────────────────────────────

router.get('/stores/:id/hours', async (req, res) => {
  const hours = await db.select().from(storeOpeningHoursTable)
    .where(eq(storeOpeningHoursTable.storeId, req.params.id))
    .orderBy(storeOpeningHoursTable.dayOfWeek);
  return res.json({ data: hours });
});

// Bulk replace opening hours for a store (7 rows, one per day)
router.put('/stores/:id/hours', requireManagerPermission('settings'), async (req, res) => {
  const { id } = req.params;
  const { hours } = req.body as { hours: { dayOfWeek: number; openTime?: string; closeTime?: string; isClosed?: boolean; notes?: string }[] };
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours must be an array.' });

  await db.delete(storeOpeningHoursTable).where(eq(storeOpeningHoursTable.storeId, id));
  if (hours.length > 0) {
    await db.insert(storeOpeningHoursTable).values(
      hours.map(h => ({
        id: randomUUID(),
        storeId: id,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime ?? null,
        closeTime: h.closeTime ?? null,
        isClosed: h.isClosed ?? false,
        notes: h.notes ?? null,
      }))
    );
  }
  const updated = await db.select().from(storeOpeningHoursTable)
    .where(eq(storeOpeningHoursTable.storeId, id)).orderBy(storeOpeningHoursTable.dayOfWeek);
  return res.json({ data: updated });
});

// ── Staff-Store Assignments ───────────────────────────────────────────────────

router.get('/staff/:userId/store-assignments', async (req, res) => {
  const rows = await db.select({
    id: staffStoreAssignmentsTable.id,
    staffId: staffStoreAssignmentsTable.staffId,
    storeId: staffStoreAssignmentsTable.storeId,
    isPrimary: staffStoreAssignmentsTable.isPrimary,
    isActive: staffStoreAssignmentsTable.isActive,
    storeName: storesTable.name,
    storeSuburb: storesTable.suburb,
    storeStatus: storesTable.status,
    createdAt: staffStoreAssignmentsTable.createdAt,
  }).from(staffStoreAssignmentsTable)
    .leftJoin(storesTable, eq(staffStoreAssignmentsTable.storeId, storesTable.id))
    .where(eq(staffStoreAssignmentsTable.staffId, req.params.userId));
  return res.json({ data: rows });
});

router.post('/store-assignments', requireManagerPermission('settings'), async (req, res) => {
  const { staffId, storeId, isPrimary = false } = req.body;
  if (!staffId || !storeId) return res.status(400).json({ error: 'staffId and storeId are required.' });

  // If isPrimary, clear other primary assignments for this staff member
  if (isPrimary) {
    await db.update(staffStoreAssignmentsTable)
      .set({ isPrimary: false })
      .where(eq(staffStoreAssignmentsTable.staffId, staffId));
  }

  const [row] = await db.insert(staffStoreAssignmentsTable).values({
    id: randomUUID(), staffId, storeId, isPrimary, isActive: true,
  }).returning();
  return res.status(201).json({ data: row });
});

router.patch('/store-assignments/:id', requireManagerPermission('settings'), async (req, res) => {
  const { isPrimary, isActive } = req.body;
  const updates: Record<string, any> = {};
  if (typeof isPrimary === 'boolean') updates.isPrimary = isPrimary;
  if (typeof isActive  === 'boolean') updates.isActive  = isActive;

  // If setting as primary, clear others for same staff member first
  if (isPrimary) {
    const [existing] = await db.select().from(staffStoreAssignmentsTable).where(eq(staffStoreAssignmentsTable.id, req.params.id));
    if (existing) {
      await db.update(staffStoreAssignmentsTable)
        .set({ isPrimary: false })
        .where(eq(staffStoreAssignmentsTable.staffId, existing.staffId));
    }
  }

  const [updated] = await db.update(staffStoreAssignmentsTable)
    .set(updates).where(eq(staffStoreAssignmentsTable.id, req.params.id)).returning();
  if (!updated) return res.status(404).json({ error: 'Assignment not found.' });
  return res.json({ data: updated });
});

router.delete('/store-assignments/:id', requireManagerPermission('settings'), async (req, res) => {
  await db.delete(staffStoreAssignmentsTable).where(eq(staffStoreAssignmentsTable.id, req.params.id));
  return res.json({ success: true });
});

// ── Director Clock Override ───────────────────────────────────────────────────

router.post('/clock-override', async (req, res) => {
  if (!['director', 'master'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only directors can override clock events.' });
  }
  const { userId, action, storeId, reason, latitude, longitude } = req.body;
  if (!userId || !action || !reason) {
    return res.status(400).json({ error: 'userId, action, and reason are required.' });
  }

  if (action === 'clock-in') {
    const existing = await db.select().from(staffShiftsTable)
      .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
    if (existing.length > 0) return res.status(400).json({ error: 'Staff member is already clocked in.' });

    const [shift] = await db.insert(staffShiftsTable).values({
      id: randomUUID(), userId, clockIn: new Date(),
      storeId: storeId ?? null,
      clockInLat: latitude ?? null, clockInLng: longitude ?? null,
      wasOverride: true, overrideReason: reason, approvedBy: req.user!.id,
      unpaidBreakMins: 0,
    }).returning();
    return res.status(201).json({ data: shift });
  }

  if (action === 'clock-out') {
    const [active] = await db.select().from(staffShiftsTable)
      .where(and(eq(staffShiftsTable.userId, userId), isNull(staffShiftsTable.clockOut)));
    if (!active) return res.status(400).json({ error: 'No active shift found for this staff member.' });

    const now = new Date();
    const ms = now.getTime() - active.clockIn.getTime();
    const totalMins = Math.floor(ms / 60000);
    const paidMins = Math.max(0, totalMins - (active.unpaidBreakMins ?? 0));
    const hrs = Math.floor(paidMins / 60);
    const mins = paidMins % 60;

    const [shift] = await db.update(staffShiftsTable)
      .set({
        clockOut: now, hoursWorked: `${hrs}h ${mins}m`,
        clockOutLat: latitude ?? null, clockOutLng: longitude ?? null,
        wasOverride: true,
        overrideReason: active.overrideReason ? active.overrideReason + ' | ' + reason : reason,
        approvedBy: req.user!.id,
      })
      .where(eq(staffShiftsTable.id, active.id)).returning();
    return res.json({ data: shift });
  }

  return res.status(400).json({ error: 'action must be clock-in or clock-out.' });
});

// ── Clock events report ───────────────────────────────────────────────────────

router.get('/clock-events', async (req, res) => {
  const { storeId, from, to } = req.query;
  let q = db.select({
    id: staffShiftsTable.id,
    userId: staffShiftsTable.userId,
    storeId: staffShiftsTable.storeId,
    clockIn: staffShiftsTable.clockIn,
    clockOut: staffShiftsTable.clockOut,
    hoursWorked: staffShiftsTable.hoursWorked,
    clockInLat: staffShiftsTable.clockInLat,
    clockInLng: staffShiftsTable.clockInLng,
    clockInDistanceMeters: staffShiftsTable.clockInDistanceMeters,
    clockOutLat: staffShiftsTable.clockOutLat,
    clockOutLng: staffShiftsTable.clockOutLng,
    clockOutDistanceMeters: staffShiftsTable.clockOutDistanceMeters,
    wasOverride: staffShiftsTable.wasOverride,
    overrideReason: staffShiftsTable.overrideReason,
    approvedBy: staffShiftsTable.approvedBy,
    staffName: usersTable.name,
    staffEmail: usersTable.email,
    storeName: storesTable.name,
  }).from(staffShiftsTable)
    .leftJoin(usersTable, eq(staffShiftsTable.userId, usersTable.id))
    .leftJoin(storesTable, eq(staffShiftsTable.storeId, storesTable.id))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(200).$dynamic();

  const data = await q;
  return res.json({ data });
});

export default router;
