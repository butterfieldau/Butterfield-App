import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ordersTable, customerProfilesTable, loyaltyTransactionsTable } from '@workspace/db';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, req.user!.id))
    .orderBy(desc(ordersTable.createdAt));
  return res.json({ data: orders });
});

router.get('/:id', async (req, res) => {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.id));
  if (!order || order.userId !== req.user!.id) {
    return res.status(404).json({ error: 'Order not found' });
  }
  return res.json({ data: order });
});

router.post('/', async (req, res) => {
  const { items, type, scheduledFor, notes, totalCents, stripePaymentIntentId, loyaltyPointsUsed, discountCents, deliveryAddress } = req.body;
  if (!items || !totalCents) {
    return res.status(400).json({ error: 'Items and total are required' });
  }
  const orderId = randomUUID();
  const pointsEarned = Math.floor((totalCents - (discountCents ?? 0)) / 100);
  const [order] = await db.insert(ordersTable).values({
    id: orderId,
    userId: req.user!.id,
    status: 'received',
    type: type ?? 'pickup',
    scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    notes,
    totalCents,
    stripePaymentIntentId,
    stripePaymentStatus: stripePaymentIntentId ? 'paid' : 'pending',
    items,
    loyaltyPointsEarned: pointsEarned,
    loyaltyPointsUsed: loyaltyPointsUsed ?? 0,
    discountCents: discountCents ?? 0,
    deliveryAddress,
  }).returning();

  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
  if (profile) {
    const newPoints = profile.loyaltyPoints + pointsEarned - (loyaltyPointsUsed ?? 0);
    const newSpent = profile.totalSpentCents + totalCents;
    const newTier = newSpent >= 100000 ? 'platinum' : newSpent >= 50000 ? 'gold' : newSpent >= 15000 ? 'silver' : 'bronze';
    await db.update(customerProfilesTable).set({
      loyaltyPoints: Math.max(0, newPoints),
      totalSpentCents: newSpent,
      loyaltyTier: newTier,
      totalVisits: profile.totalVisits + 1,
      stampCount: (profile.stampCount + 1) % 10,
    }).where(eq(customerProfilesTable.userId, req.user!.id));
    await db.insert(loyaltyTransactionsTable).values({
      id: randomUUID(),
      userId: req.user!.id,
      points: pointsEarned,
      type: 'earn',
      description: `Order #${orderId.slice(0, 8)}`,
      referenceId: orderId,
    });
  }
  return res.status(201).json({ data: order });
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['received', 'being_prepared', 'ready_for_pickup', 'completed', 'cancelled', 'refunded'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const [order] = await db.update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, req.params.id))
    .returning();
  return res.json({ data: order });
});

export default router;
