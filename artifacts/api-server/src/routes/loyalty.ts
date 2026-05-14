import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, loyaltyRewardsTable, loyaltyRedemptionsTable, customerProfilesTable, loyaltyActivityLogTable, usersTable } from '@workspace/db';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  applyCoffeeStamps,
  buildLoyaltyQrPayload,
  ensureLoyaltySchemaReady,
  getOrCreateCustomerLoyaltyProfile,
  parseLoyaltyQrPayload,
  recordLoyaltyPoints,
} from '../lib/loyaltyIdentity.js';

const router = Router();
void ensureLoyaltySchemaReady();

router.get('/profile', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const profile = await getOrCreateCustomerLoyaltyProfile(req.user!.id, req.user!.name);

  // Always recompute tier from totalSpentCents so it is the single source of truth.
  // This corrects any stale data (e.g. seeded demo accounts or missed order updates).
  const correctTier =
    profile.totalSpentCents >= 100000 ? 'platinum' :
    profile.totalSpentCents >= 50000  ? 'gold'     :
    profile.totalSpentCents >= 15000  ? 'silver'   : 'bronze';

  if (correctTier !== profile.loyaltyTier) {
    await db.update(customerProfilesTable)
      .set({ loyaltyTier: correctTier })
      .where(eq(customerProfilesTable.userId, req.user!.id));
    const recentActivity = await db.select().from(loyaltyActivityLogTable)
      .where(eq(loyaltyActivityLogTable.customerId, req.user!.id))
      .orderBy(desc(loyaltyActivityLogTable.createdAt))
      .limit(20);
    return res.json({
      data: {
        ...profile,
        userId: req.user!.id,
        customerName: req.user!.name ?? 'Customer',
        customerEmail: req.user!.email ?? '',
        loyaltyTier: correctTier,
        coffeeStampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        freeCoffeeRewards: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        freeCoffeesEarned: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
        loyaltyQrToken: profile.loyaltyQrToken ?? null,
        qrPayload: buildLoyaltyQrPayload(profile.loyaltyQrToken),
        recentActivity,
      },
    });
  }

  const recentActivity = await db.select().from(loyaltyActivityLogTable)
    .where(eq(loyaltyActivityLogTable.customerId, req.user!.id))
    .orderBy(desc(loyaltyActivityLogTable.createdAt))
    .limit(20);

  return res.json({
    data: {
      ...profile,
      userId: req.user!.id,
      customerName: req.user!.name ?? 'Customer',
      customerEmail: req.user!.email ?? '',
      coffeeStampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
      freeCoffeeRewards: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
      stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
      freeCoffeesEarned: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
      loyaltyQrToken: profile.loyaltyQrToken ?? null,
      qrPayload: buildLoyaltyQrPayload(profile.loyaltyQrToken),
      recentActivity,
    },
  });
});

router.get('/transactions', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const txns = await db.select().from(loyaltyActivityLogTable)
    .where(eq(loyaltyActivityLogTable.customerId, req.user!.id))
    .orderBy(desc(loyaltyActivityLogTable.createdAt))
    .limit(50);
  return res.json({
    data: txns.map((txn) => ({
      id: txn.id,
      points: txn.pointsDelta,
      type: txn.activityType,
      description: txn.description,
      createdAt: txn.createdAt,
      orderId: txn.orderId,
      coffeeStampsDelta: txn.coffeeStampsDelta,
      freeCoffeeRewardsDelta: txn.freeCoffeeRewardsDelta,
    })),
  });
});

router.get('/rewards', async (_req, res) => {
  const rewards = await db.select().from(loyaltyRewardsTable)
    .where(and(eq(loyaltyRewardsTable.isActive, true), isNull(loyaltyRewardsTable.deletedAt)));
  return res.json({ data: rewards });
});

router.post('/redeem', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { rewardId } = req.body;
  const [reward] = await db.select().from(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, rewardId));
  if (!reward) return res.status(404).json({ error: 'Reward not found' });

  const profile = await getOrCreateCustomerLoyaltyProfile(req.user!.id, req.user!.name);
  if (profile.loyaltyPoints < reward.pointsCost) {
    return res.status(400).json({ error: 'Not enough points' });
  }
  await recordLoyaltyPoints({
    userId: req.user!.id,
    pointsDelta: -reward.pointsCost,
    orderId: null,
    description: `Redeemed: ${reward.name}`,
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
  await ensureLoyaltySchemaReady();
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

// ── POST /loyalty/scan-stamp — staff scans customer QR to award a coffee stamp
const STAMP_GOAL = 6;

router.post('/lookup', requireRole('staff', 'director', 'manager'), async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { qrPayload, loyaltyQrToken } = req.body ?? {};
  const parsed = parseLoyaltyQrPayload(qrPayload ?? loyaltyQrToken ?? '');
  if (!parsed) return res.status(400).json({ error: 'QR payload required' });

  let profile = null;

  if (parsed.token) {
    [profile] = await db.select().from(customerProfilesTable)
      .where(eq(customerProfilesTable.loyaltyQrToken, parsed.token));
  }

  if (!profile && parsed.userId && parsed.referralCode) {
    [profile] = await db.select().from(customerProfilesTable)
      .where(and(
        eq(customerProfilesTable.userId, parsed.userId),
        eq(customerProfilesTable.referralCode, parsed.referralCode),
      ));
  }

  if (!profile) return res.status(404).json({ error: 'Customer not found or QR code mismatch' });

  const [userRow] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, profile.userId));
  const recentActivity = await db.select().from(loyaltyActivityLogTable)
    .where(eq(loyaltyActivityLogTable.customerId, profile.userId))
    .orderBy(desc(loyaltyActivityLogTable.createdAt))
    .limit(10);

  return res.json({
    data: {
      customerName: userRow?.name ?? 'Customer',
      customerEmail: userRow?.email ?? '',
      loyaltyPoints: profile.loyaltyPoints,
      coffeeStampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
      freeCoffeeRewards: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
      stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
      freeCoffeesEarned: profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0,
      loyaltyQrToken: profile.loyaltyQrToken ?? null,
      qrPayload: buildLoyaltyQrPayload(profile.loyaltyQrToken),
      recentActivity,
    },
  });
});

router.post('/scan-stamp', requireRole('staff', 'director', 'manager'), async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { qrPayload, loyaltyQrToken, quantity } = req.body ?? {};
  const parsed = parseLoyaltyQrPayload(qrPayload ?? loyaltyQrToken ?? '');
  if (!parsed) return res.status(400).json({ error: 'QR payload required' });

  let profile = null;
  if (parsed.token) {
    [profile] = await db.select().from(customerProfilesTable)
      .where(eq(customerProfilesTable.loyaltyQrToken, parsed.token));
  }
  if (!profile && parsed.userId && parsed.referralCode) {
    [profile] = await db.select().from(customerProfilesTable)
      .where(and(
        eq(customerProfilesTable.userId, parsed.userId),
        eq(customerProfilesTable.referralCode, parsed.referralCode),
      ));
  }
  if (!profile) return res.status(404).json({ error: 'Customer not found or QR code mismatch' });

  const stampsToAdd = Math.max(1, Math.floor(Number(quantity ?? 1) || 1));
  const result = await applyCoffeeStamps({
    userId: profile.userId,
    staffId: req.user!.id,
    stampsToAdd,
    source: 'staff_scan',
    description: stampsToAdd > 1
      ? `Coffee stamps added (${stampsToAdd})`
      : `Coffee stamp added`,
  });

  return res.json({ data: result });
});

// ── GET /loyalty/ensure-qr — self-healing: ensures the current customer has a QR token
router.get('/ensure-qr', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const profile = await getOrCreateCustomerLoyaltyProfile(req.user!.id, req.user!.name);
  return res.json({
    data: {
      loyaltyQrToken: profile.loyaltyQrToken,
      qrPayload: buildLoyaltyQrPayload(profile.loyaltyQrToken),
    },
  });
});

router.post('/rewards', requireRole('director', 'manager'), async (req, res) => {
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
