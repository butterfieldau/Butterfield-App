import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, staffShiftsTable, staffTasksTable, staffWastageTable, staffIssuesTable, staffLeaveRequestsTable, staffProfilesTable, usersTable, ordersTable } from '@workspace/db';
import { eq, desc, isNull, and } from 'drizzle-orm';
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
  }).returning();
  return res.status(201).json({ data: shift });
});

router.post('/shifts/clock-out', async (req, res) => {
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  if (!active) return res.status(400).json({ error: 'No active shift found' });
  const now = new Date();
  const ms = now.getTime() - active.clockIn.getTime();
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const [shift] = await db.update(staffShiftsTable)
    .set({ clockOut: now, hoursWorked: `${hrs}h ${mins}m` })
    .where(eq(staffShiftsTable.id, active.id))
    .returning();
  return res.json({ data: shift });
});

router.get('/shifts/current', async (req, res) => {
  const [active] = await db.select().from(staffShiftsTable)
    .where(and(eq(staffShiftsTable.userId, req.user!.id), isNull(staffShiftsTable.clockOut)));
  return res.json({ data: active ?? null });
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

export default router;
