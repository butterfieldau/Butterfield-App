import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, loyaltyRewardsTable, loyaltyRedemptionsTable, customerProfilesTable, loyaltyActivityLogTable, usersTable, claimedRewardsTable } from '@workspace/db';
import { eq, desc, and, isNull, sql, inArray } from 'drizzle-orm';
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

// ── GET /loyalty/claimed-rewards — customer's active claims (available + applied_to_cart) ──
router.get('/claimed-rewards', requireAuth, async (req, res) => {
  const claimed = await db
    .select({
      id: claimedRewardsTable.id,
      rewardId: claimedRewardsTable.rewardId,
      status: claimedRewardsTable.status,
      claimedAt: claimedRewardsTable.claimedAt,
      redeemedAt: claimedRewardsTable.redeemedAt,
      orderId: claimedRewardsTable.orderId,
      pointsSpent: claimedRewardsTable.pointsSpent,
      voucherValueCents: claimedRewardsTable.voucherValueCents,
      rewardName: loyaltyRewardsTable.name,
      rewardDescription: loyaltyRewardsTable.description,
      rewardType: loyaltyRewardsTable.rewardType,
      linkedProductId: loyaltyRewardsTable.linkedProductId,
    })
    .from(claimedRewardsTable)
    .leftJoin(loyaltyRewardsTable, eq(claimedRewardsTable.rewardId, loyaltyRewardsTable.id))
    .where(and(
      eq(claimedRewardsTable.userId, req.user!.id),
      inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
    ))
    .orderBy(desc(claimedRewardsTable.claimedAt));

  return res.json({ data: claimed });
});

// ── POST /loyalty/claimed-rewards/:id/apply — mark claim as applied to cart ──
// Idempotent: if already applied_to_cart, returns success.
router.post('/claimed-rewards/:id/apply', requireAuth, async (req, res) => {
  const claimId = String(req.params.id);
  const userId  = req.user!.id;

  // First check if it already exists at all and is owned by this user
  const [existing] = await db
    .select({ status: claimedRewardsTable.status })
    .from(claimedRewardsTable)
    .where(and(eq(claimedRewardsTable.id, claimId), eq(claimedRewardsTable.userId, userId)));

  if (!existing) return res.status(404).json({ error: 'Claimed reward not found' });
  if (existing.status === 'applied_to_cart') return res.json({ success: true }); // idempotent
  if (existing.status !== 'available') {
    return res.status(409).json({ error: `Cannot apply a reward with status: ${existing.status}` });
  }

  // Atomic conditional update — only transitions from 'available'
  await db.execute(
    sql`UPDATE claimed_rewards SET status='applied_to_cart' WHERE id=${claimId} AND user_id=${userId} AND status='available'`
  );
  return res.json({ success: true });
});

// ── POST /loyalty/claimed-rewards/:id/unapply — revert claim back to available ──
// Idempotent: if already available, returns success.
router.post('/claimed-rewards/:id/unapply', requireAuth, async (req, res) => {
  const claimId = String(req.params.id);
  const userId  = req.user!.id;

  const [existing] = await db
    .select({ status: claimedRewardsTable.status })
    .from(claimedRewardsTable)
    .where(and(eq(claimedRewardsTable.id, claimId), eq(claimedRewardsTable.userId, userId)));

  if (!existing) return res.status(404).json({ error: 'Claimed reward not found' });
  if (existing.status === 'available') return res.json({ success: true }); // idempotent
  if (existing.status !== 'applied_to_cart') {
    return res.status(409).json({ error: `Cannot unapply a reward with status: ${existing.status}` });
  }

  // Atomic conditional update — only transitions from 'applied_to_cart'
  await db.execute(
    sql`UPDATE claimed_rewards SET status='available' WHERE id=${claimId} AND user_id=${userId} AND status='applied_to_cart'`
  );
  return res.json({ success: true });
});

// ── POST /loyalty/redeem — claim a reward (deducts points, creates claimed_rewards row) ──
router.post('/redeem', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { rewardId } = req.body;
  const [reward] = await db.select().from(loyaltyRewardsTable)
    .where(and(eq(loyaltyRewardsTable.id, rewardId), isNull(loyaltyRewardsTable.deletedAt)));
  if (!reward) return res.status(404).json({ error: 'Reward not found' });
  if (!reward.isActive) return res.status(400).json({ error: 'This reward is no longer available' });
  if (!reward.customerRedeemable) return res.status(400).json({ error: 'This reward cannot be claimed through the app' });

  // Check stock
  if (reward.stock !== null && reward.stock <= 0) {
    return res.status(400).json({ error: 'This reward is out of stock' });
  }

  const profile = await getOrCreateCustomerLoyaltyProfile(req.user!.id, req.user!.name);
  if (profile.loyaltyPoints < reward.pointsCost) {
    return res.status(400).json({ error: 'Not enough points' });
  }

  // Deduct points atomically
  await recordLoyaltyPoints({
    userId: req.user!.id,
    pointsDelta: -reward.pointsCost,
    orderId: null,
    description: `Claimed: ${reward.name}`,
  });

  // Decrement stock if limited
  if (reward.stock !== null) {
    await db.update(loyaltyRewardsTable)
      .set({ stock: sql`GREATEST(${loyaltyRewardsTable.stock} - 1, 0)` })
      .where(eq(loyaltyRewardsTable.id, reward.id));
  }

  // Create the claimed reward row
  const [claimed] = await db.insert(claimedRewardsTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    rewardId,
    status: 'available',
    pointsSpent: reward.pointsCost,
    voucherValueCents: reward.voucherValueCents ?? null,
  }).returning();

  return res.json({
    data: {
      ...claimed,
      rewardName: reward.name,
      rewardDescription: reward.description,
      rewardType: reward.rewardType,
      linkedProductId: reward.linkedProductId,
    },
    reward,
  });
});

// ── DELETE /loyalty/claimed-rewards/:id — cancel a claim (restore points) ─────
router.delete('/claimed-rewards/:id', requireAuth, async (req, res) => {
  const claimUserId = req.user!.id;
  const claimRows = await db.select().from(claimedRewardsTable)
    .where(and(
      eq(claimedRewardsTable.userId, claimUserId),
      inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
    ))
    .limit(50);
  const [claimed] = claimRows.filter(r => r.id === req.params.id);
  if (!claimed) return res.status(404).json({ error: 'Claimed reward not found or already used' });

  // Cancel the claim
  await db.update(claimedRewardsTable)
    .set({ status: 'cancelled' })
    .where(eq(claimedRewardsTable.id, claimed.id));

  // Restore points
  await recordLoyaltyPoints({
    userId: req.user!.id,
    pointsDelta: claimed.pointsSpent,
    orderId: null,
    description: `Cancelled claim — points restored`,
  });

  // Restore stock if limited
  const [reward] = await db.select({ stock: loyaltyRewardsTable.stock, id: loyaltyRewardsTable.id })
    .from(loyaltyRewardsTable)
    .where(eq(loyaltyRewardsTable.id, claimed.rewardId));
  if (reward && reward.stock !== null) {
    await db.update(loyaltyRewardsTable)
      .set({ stock: sql`${loyaltyRewardsTable.stock} + 1` })
      .where(eq(loyaltyRewardsTable.id, reward.id));
  }

  return res.json({ success: true, pointsRestored: claimed.pointsSpent });
});

router.patch('/birthday', requireAuth, async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { birthday } = req.body;
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return res.status(400).json({ error: 'Birthday must be in YYYY-MM-DD format' });
  }
  const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
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
router.post('/use-free-coffee', requireRole('staff', 'director', 'manager'), async (req, res) => {
  await ensureLoyaltySchemaReady();
  const { qrPayload } = req.body ?? {};
  const parsed = parseLoyaltyQrPayload(qrPayload ?? '');
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
  if (!profile) return res.status(404).json({ error: 'Customer not found' });

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
  const { name, description, pointsCost, category, isAppOnly, rewardType, voucherValueCents, linkedProductId } = req.body;
  const [reward] = await db.insert(loyaltyRewardsTable).values({
    id: randomUUID(),
    name,
    description,
    pointsCost,
    category: category ?? 'food',
    isAppOnly: isAppOnly ?? false,
    rewardType: rewardType ?? 'item_reward',
    voucherValueCents: voucherValueCents ?? null,
    linkedProductId: linkedProductId ?? null,
  }).returning();
  return res.status(201).json({ data: reward });
});

export default router;
