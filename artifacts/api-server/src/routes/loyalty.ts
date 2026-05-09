import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, loyaltyTransactionsTable, loyaltyRewardsTable, loyaltyRedemptionsTable, customerProfilesTable } from '@workspace/db';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

router.get('/profile', requireAuth, async (req, res) => {
  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  return res.json({ data: profile });
});

router.get('/transactions', requireAuth, async (req, res) => {
  const txns = await db.select().from(loyaltyTransactionsTable)
    .where(eq(loyaltyTransactionsTable.userId, req.user!.id))
    .orderBy(desc(loyaltyTransactionsTable.createdAt))
    .limit(50);
  return res.json({ data: txns });
});

router.get('/rewards', async (_req, res) => {
  const rewards = await db.select().from(loyaltyRewardsTable)
    .where(and(eq(loyaltyRewardsTable.isActive, true), isNull(loyaltyRewardsTable.deletedAt)));
  return res.json({ data: rewards });
});

router.post('/redeem', requireAuth, async (req, res) => {
  const { rewardId } = req.body;
  const [reward] = await db.select().from(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, rewardId));
  if (!reward) return res.status(404).json({ error: 'Reward not found' });

  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (profile.loyaltyPoints < reward.pointsCost) {
    return res.status(400).json({ error: 'Not enough points' });
  }
  await db.update(customerProfilesTable)
    .set({ loyaltyPoints: profile.loyaltyPoints - reward.pointsCost })
    .where(eq(customerProfilesTable.userId, req.user!.id));
  await db.insert(loyaltyTransactionsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    points: -reward.pointsCost,
    type: 'redeem',
    description: `Redeemed: ${reward.name}`,
    referenceId: rewardId,
  });
  const [redemption] = await db.insert(loyaltyRedemptionsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    rewardId,
    pointsSpent: reward.pointsCost,
  }).returning();
  return res.json({ data: redemption, reward });
});

router.patch('/birthday', requireAuth, async (req, res) => {
  const { birthday } = req.body;
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return res.status(400).json({ error: 'Birthday must be in YYYY-MM-DD format' });
  }
  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  // Once a birthday is set it is locked — contact admin to change it
  if (profile.birthday) {
    return res.status(403).json({ error: 'Birthday is already set and cannot be changed through the app. Please contact hello@butterfield.com.au to update it.' });
  }
  await db.update(customerProfilesTable).set({ birthday }).where(eq(customerProfilesTable.userId, req.user!.id));
  return res.json({ data: { birthday } });
});

router.post('/rewards', requireRole('staff'), async (req, res) => {
  const { name, description, pointsCost, category, isAppOnly } = req.body;
  const [reward] = await db.insert(loyaltyRewardsTable).values({
    id: randomUUID(),
    name,
    description,
    pointsCost,
    category: category ?? 'food',
    isAppOnly: isAppOnly ?? false,
  }).returning();
  return res.status(201).json({ data: reward });
});

export default router;
