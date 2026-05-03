import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, staffShiftsTable, staffTasksTable, staffWastageTable, staffIssuesTable, staffLeaveRequestsTable, staffProfilesTable, usersTable, ordersTable } from '@workspace/db';
import { eq, desc, isNull, and, gte } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';

const router = Router();
router.use(requireRole('staff'));

router.post('/shifts/clock-in', async (req, res) => {
  const existing = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Already clocked in', shift: existing[0] });
  }
  const [shift] = await db.insert(staffShiftsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    clockIn: new Date(),
    unpaidBreakMins: 0,
  }).returning();
  return res.status(201).json({ data: shift });
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
  const hrs = Math.floor(paidMins / 60);
  const mins = paidMins % 60;
  const [shift] = await db.update(staffShiftsTable)
    .set({ clockOut: now, hoursWorked: `${hrs}h ${mins}m`, unpaidBreakMins: unpaidMins })
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
  const shifts = await db.select().from(staffShiftsTable)
    .where(eq(staffShiftsTable.userId, req.user!.id))
    .orderBy(desc(staffShiftsTable.clockIn))
    .limit(20);
  return res.json({ data: shifts });
});

router.get('/tasks', async (req, res) => {
  const { category } = req.query;
  let query = db.select().from(staffTasksTable);
  if (category) {
    const tasks = await db.select().from(staffTasksTable).where(eq(staffTasksTable.category, category as any));
    return res.json({ data: tasks });
  }
  const tasks = await query.orderBy(staffTasksTable.sortOrder);
  return res.json({ data: tasks });
});

router.patch('/tasks/:id/complete', async (req, res) => {
  const { isCompleted } = req.body;
  const [task] = await db.update(staffTasksTable).set({
    isCompleted: isCompleted ?? true,
    completedBy: isCompleted ? req.user!.name : null,
    completedAt: isCompleted ? new Date() : null,
  }).where(eq(staffTasksTable.id, req.params.id)).returning();
  return res.json({ data: task });
});

router.post('/wastage', async (req, res) => {
  const { productName, quantity, unit, reason, estimatedCostCents, notes } = req.body;
  if (!productName || !quantity || !reason) {
    return res.status(400).json({ error: 'Product, quantity and reason are required' });
  }
  const [entry] = await db.insert(staffWastageTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    productName,
    quantity,
    unit: unit ?? 'units',
    reason,
    estimatedCostCents,
    notes,
  }).returning();
  return res.status(201).json({ data: entry });
});

router.get('/wastage', async (req, res) => {
  const entries = await db.select().from(staffWastageTable).orderBy(desc(staffWastageTable.createdAt)).limit(50);
  return res.json({ data: entries });
});

router.post('/issues', async (req, res) => {
  const { title, description, category, priority } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  const [issue] = await db.insert(staffIssuesTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    title,
    description,
    category: category ?? 'general',
    priority: priority ?? 'medium',
    status: 'open',
  }).returning();
  return res.status(201).json({ data: issue });
});

router.post('/leave', async (req, res) => {
  const { startDate, endDate, type, reason } = req.body;
  if (!startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'Start date, end date and reason are required' });
  }
  const [leave] = await db.insert(staffLeaveRequestsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    startDate,
    endDate,
    type: type ?? 'annual',
    reason,
    status: 'pending',
  }).returning();
  return res.status(201).json({ data: leave });
});

router.get('/orders', async (req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(100);
  return res.json({ data: orders });
});

router.get('/profile', async (req, res) => {
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  return res.json({ data: profile ?? null });
});

router.patch('/profile/hourly-rate', async (req, res) => {
  const { userId, hourlyRateCents } = req.body;
  if (!hourlyRateCents || typeof hourlyRateCents !== 'number') {
    return res.status(400).json({ error: 'hourlyRateCents must be a number' });
  }
  const targetId = userId ?? req.user!.id;
  const [profile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, req.user!.id));
  if (!profile?.isManager && targetId !== req.user!.id) {
    return res.status(403).json({ error: 'Only managers can update other staff rates' });
  }
  const [updated] = await db.update(staffProfilesTable)
    .set({ hourlyRateCents })
    .where(eq(staffProfilesTable.userId, targetId))
    .returning();
  return res.json({ data: updated });
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
