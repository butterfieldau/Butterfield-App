import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, loyaltyRewardsTable, loyaltyRedemptionsTable, customerProfilesTable, loyaltyActivityLogTable, usersTable } from '@workspace/db';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
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
      loyaltyPoints: profile.loyaltyPoints ?? 0,
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

  const [scanUserRow] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, profile.userId));

  const stampsToAdd = Math.max(1, Math.floor(Number(quantity ?? 1) || 1));
  const stampResult = await applyCoffeeStamps({
    userId: profile.userId,
    staffId: req.user!.id,
    stampsToAdd,
    source: 'staff_scan',
    description: stampsToAdd > 1
      ? `Coffee stamps added (${stampsToAdd})`
      : `Coffee stamp added`,
  });

  return res.json({
    data: {
      ...stampResult,
      customerEmail: scanUserRow?.email ?? '',
      loyaltyPoints: profile.loyaltyPoints ?? 0,
      qrPayload: buildLoyaltyQrPayload(profile.loyaltyQrToken),
    },
  });
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

// ── POST /loyalty/use-free-coffee — staff redeems one free coffee reward ─────
// Security: atomic UPDATE with WHERE free_coffee_rewards > 0 prevents any
// double-redemption even under concurrent requests. Staff JWT required.
router.post('/use-free-coffee', requireRole('staff', 'director', 'manager'), async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { qrPayload } = req.body ?? {};
  const parsed = parseLoyaltyQrPayload(qrPayload ?? '');
  if (!parsed) return res.status(400).json({ error: 'QR payload required' });

  // Resolve customer profile
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
  if (!profile) return res.status(404).json({ error: 'Customer not found' });

  // Atomic decrement — only succeeds if free_coffee_rewards > 0.
  // If two staff taps race, only one UPDATE will match the WHERE clause.
  const [updated] = await db.update(customerProfilesTable)
    .set({
      freeCoffeeRewards:  sql`GREATEST(${customerProfilesTable.freeCoffeeRewards} - 1, 0)`,
      freeCoffeesEarned:  sql`GREATEST(COALESCE(${customerProfilesTable.freeCoffeesEarned}, 0) - 1, 0)`,
      stampCount:         customerProfilesTable.coffeeStampCount,
      updatedAt:          new Date(),
    })
    .where(and(
      eq(customerProfilesTable.userId, profile.userId),
      sql`${customerProfilesTable.freeCoffeeRewards} > 0`,
    ))
    .returning();

  if (!updated) {
    return res.status(409).json({ error: 'No free coffee rewards available for this customer' });
  }

  const [userRow] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, profile.userId));

  // Full audit trail: who redeemed, which QR, when
  await db.insert(loyaltyActivityLogTable).values({
    id: randomUUID(),
    customerId: profile.userId,
    staffId: req.user!.id,
    loyaltyQrToken: profile.loyaltyQrToken ?? null,
    activityType: 'free_coffee_redeemed',
    pointsDelta: 0,
    coffeeStampsDelta: 0,
    freeCoffeeRewardsDelta: -1,
    description: `Free coffee redeemed by staff (${req.user!.name ?? req.user!.id})`,
  });

  return res.json({
    data: {
      customerName:       userRow?.name ?? 'Customer',
      customerEmail:      userRow?.email ?? '',
      loyaltyPoints:      updated.loyaltyPoints ?? 0,
      stampCount:         updated.coffeeStampCount ?? updated.stampCount ?? 0,
      freeCoffeeRewards:  updated.freeCoffeeRewards ?? 0,
      qrPayload:          buildLoyaltyQrPayload(profile.loyaltyQrToken),
      redeemedAt:         new Date().toISOString(),
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
