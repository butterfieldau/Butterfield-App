import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, staffRosterTable, usersTable, staffProfilesTable } from '@workspace/db';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';

const router = Router();
// Directors and masters pass through unconditionally; managers require timesheets permission.
router.use(requireRole('director', 'manager', 'master'));
router.use(requireManagerPermission('timesheets'));

// GET /director/roster?weekStart=YYYY-MM-DD
router.get('/roster', async (req, res) => {
  const { weekStart } = req.query as Record<string, string>;

  let shifts;
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    const d = new Date(weekStart);
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const endStr = weekEnd.toISOString().slice(0, 10);
    shifts = await db.select({
      id: staffRosterTable.id,
      userId: staffRosterTable.userId,
      date: staffRosterTable.date,
      startTime: staffRosterTable.startTime,
      endTime: staffRosterTable.endTime,
      role: staffRosterTable.role,
      notes: staffRosterTable.notes,
      isConfirmed: staffRosterTable.isConfirmed,
      confirmedAt: staffRosterTable.confirmedAt,
      createdBy: staffRosterTable.createdBy,
      createdAt: staffRosterTable.createdAt,
      updatedAt: staffRosterTable.updatedAt,
    }).from(staffRosterTable)
      .where(and(gte(staffRosterTable.date, weekStart), lte(staffRosterTable.date, endStr)))
      .orderBy(staffRosterTable.date, staffRosterTable.startTime);
  } else {
    shifts = await db.select().from(staffRosterTable)
      .orderBy(desc(staffRosterTable.date), staffRosterTable.startTime)
      .limit(200);
  }

  const userIds = [...new Set(shifts.map(s => s.userId))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(eq(usersTable.id, userIds[0]!))
        .then(async (first) => {
          const rest = await Promise.all(
            userIds.slice(1).map(uid =>
              db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid))
            )
          );
          return [first, ...rest].flat().flat();
        })
    : [];
  const nameMap = Object.fromEntries(users.map(u => [u.id, u.name ?? '']));

  return res.json({
    data: shifts.map(s => ({ ...s, userName: nameMap[s.userId] ?? null })),
  });
});

// POST /director/roster
router.post('/roster', async (req, res) => {
  const { userId, date, startTime, endTime, role, notes } = req.body;
  if (!userId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'userId, date, startTime, endTime are required.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))            return res.status(400).json({ error: 'date must be YYYY-MM-DD.' });
  if (!/^\d{2}:\d{2}$/.test(startTime))               return res.status(400).json({ error: 'startTime must be HH:MM.' });
  if (!/^\d{2}:\d{2}$/.test(endTime))                 return res.status(400).json({ error: 'endTime must be HH:MM.' });

  const [shift] = await db.insert(staffRosterTable).values({
    id: randomUUID(),
    userId,
    date,
    startTime,
    endTime,
    role: role ?? 'crew',
    notes: notes ?? null,
    isConfirmed: false,
    createdBy: req.user!.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  return res.status(201).json({ data: { ...shift, userName: user?.name ?? null } });
});

// PATCH /director/roster/:id
router.patch('/roster/:id', async (req, res) => {
  const { id } = req.params;
  const { userId, date, startTime, endTime, role, notes, isConfirmed } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (userId    !== undefined) updates.userId    = userId;
  if (date      !== undefined) updates.date      = date;
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime   !== undefined) updates.endTime   = endTime;
  if (role      !== undefined) updates.role      = role;
  if (notes     !== undefined) updates.notes     = notes;
  if (isConfirmed !== undefined) {
    updates.isConfirmed = isConfirmed;
    if (isConfirmed) updates.confirmedAt = new Date();
  }

  const [shift] = await db.update(staffRosterTable).set(updates).where(eq(staffRosterTable.id, id)).returning();
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });

  const uid = userId ?? shift.userId;
  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
  return res.json({ data: { ...shift, userName: user?.name ?? null } });
});

// DELETE /director/roster/:id
router.delete('/roster/:id', async (req, res) => {
  const [shift] = await db.delete(staffRosterTable).where(eq(staffRosterTable.id, req.params.id)).returning();
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });
  return res.json({ success: true });
});

// GET /director/roster/staff — list staff available to roster
router.get('/roster/staff', async (req, res) => {
  const staffRows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    position: staffProfilesTable.position,
  }).from(staffProfilesTable)
    .leftJoin(usersTable, eq(staffProfilesTable.userId, usersTable.id));

  return res.json({
    data: staffRows.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      position: s.position,
    })),
  });
});

export default router;
