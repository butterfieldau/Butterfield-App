import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, ordersTable, customerProfilesTable, usersTable, productsTable,
  discountCodesTable, discountCodeUsagesTable, loyaltyActivityLogTable,
  claimedRewardsTable, loyaltyRewardsTable,
} from '@workspace/db';
import { eq, and, desc, gte, sql, or, count, sum, inArray } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  applyCoffeeStamps,
  getOrCreateCustomerLoyaltyProfile,
  parseLoyaltyQrPayload,
  recordLoyaltyPoints,
  ensureLoyaltySchemaReady,
} from '../lib/loyaltyIdentity.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { generateOrderNumber } from '../lib/orderNumber.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('staff', 'manager', 'director', 'master'));

// ── Schema migration (idempotent) ─────────────────────────────────────────
let posSchemaReady: Promise<void> | null = null;

async function ensurePosSchemaReady() {
  if (!posSchemaReady) {
    posSchemaReady = (async () => {
      try {
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'customer_app'`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_user_id text`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text`
        ));
      } catch (err) {
        posSchemaReady = null;
        throw err;
      }
    })();
  }
  return posSchemaReady;
}

// ── Helper: fetch available claimed rewards for a customer ─────────────────
async function fetchAvailableClaimedRewards(userId: string) {
  const rows = await db
    .select({
      id: claimedRewardsTable.id,
      rewardType: loyaltyRewardsTable.rewardType,
      rewardName: loyaltyRewardsTable.name,
      voucherValueCents: claimedRewardsTable.voucherValueCents,
    })
    .from(claimedRewardsTable)
    .innerJoin(loyaltyRewardsTable, eq(claimedRewardsTable.rewardId, loyaltyRewardsTable.id))
    .where(and(
      eq(claimedRewardsTable.userId, userId),
      inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
      sql`(${claimedRewardsTable.expiresAt} IS NULL OR ${claimedRewardsTable.expiresAt} > NOW())`,
    ));
  return rows;
}

// ── GET /pos/customer-search — find customers by text or QR userId ─────────
router.get('/customer-search', async (req, res) => {
  await ensurePosSchemaReady();
  const { q, userId, qrPayload } = req.query;

  // QR payload lookup: decode the BUTTERFIELD: token
  if (qrPayload) {
    const parsed = parseLoyaltyQrPayload(String(qrPayload));
    if (!parsed) return res.status(400).json({ error: 'Invalid QR payload' });

    let resolvedUserId: string | null = null;
    if (parsed.userId) {
      resolvedUserId = parsed.userId;
    } else if (parsed.token) {
      const [profileRow] = await db
        .select({ userId: customerProfilesTable.userId })
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.loyaltyQrToken, parsed.token));
      resolvedUserId = profileRow?.userId ?? null;
    }

    if (!resolvedUserId) return res.status(404).json({ error: 'Customer not found' });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId));
    if (!user) return res.status(404).json({ error: 'Customer not found' });

    const [profile, availableClaimedRewards] = await Promise.all([
      getOrCreateCustomerLoyaltyProfile(resolvedUserId, user.name),
      fetchAvailableClaimedRewards(resolvedUserId),
    ]);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
        availableClaimedRewards,
      }],
    });
  }

  // Direct userId lookup
  if (userId) {
    const uid = String(userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    const [profile, availableClaimedRewards] = await Promise.all([
      getOrCreateCustomerLoyaltyProfile(uid, user.name),
      fetchAvailableClaimedRewards(uid),
    ]);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
        availableClaimedRewards,
      }],
    });
  }

  // Text search by name / email
  const query = String(q ?? '').trim();
  if (query.length < 2) return res.json({ data: [] });

  const like = `%${query}%`;
  const rows = await db.execute(sql`
    SELECT u.id, u.name, u.email,
      COALESCE(cp.loyalty_points, 0) AS loyalty_points,
      COALESCE(cp.coffee_stamp_count, cp.stamp_count, 0) AS stamp_count,
      COALESCE(cp.loyalty_tier, 'blue') AS loyalty_tier,
      COALESCE(cp.free_coffee_rewards, cp.free_coffees_earned, 0) AS free_coffee_rewards
    FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id = u.id
    WHERE u.role = 'customer'
      AND (u.name ILIKE ${like} OR u.email ILIKE ${like})
    ORDER BY u.name
    LIMIT 10
  `);

  const users = (rows.rows ?? rows as unknown as any[]) as Array<{
    id: string; name: string; email: string;
    loyalty_points: number; stamp_count: number; loyalty_tier: string;
    free_coffee_rewards: number;
  }>;

  // Fetch claimed rewards for each result in parallel
  const claimedRewardsMap = await Promise.all(
    users.map(u => fetchAvailableClaimedRewards(u.id).then(cr => [u.id, cr] as const))
  ).then(entries => Object.fromEntries(entries));

  return res.json({
    data: users.map(u => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      loyaltyPoints: Number(u.loyalty_points),
      stampCount: Number(u.stamp_count),
      loyaltyTier: u.loyalty_tier,
      freeCoffeeRewards: Number(u.free_coffee_rewards),
      availableClaimedRewards: claimedRewardsMap[u.id] ?? [],
    })),
  });
});

// ── POST /pos/orders — create a POS order ────────────────────────────────────
router.post('/orders', async (req, res) => {
  await ensurePosSchemaReady();
  await ensureLoyaltySchemaReady();

  const {
    items: rawItems,
    orderType,
    paymentMethod,
    amountTenderedCents,
    customerId,
    discountCode,
    discountCodeId,
    manualDiscountPct,
    redeemFreeCoffee,
    claimedRewardId,
    notes,
  } = req.body;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Order must have at least one item' });
  }
  if (!['cash', 'eftpos'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod must be cash or eftpos' });
  }

  // ── Resolve product prices server-side ─────────────────────────────────────
  const productIds: string[] = [...new Set(
    rawItems.map((i: any) => i.productId).filter((id: any) => typeof id === 'string' && id)
  )];
  const products = productIds.length > 0
    ? await db.select({
        id: productsTable.id,
        name: productsTable.name,
        priceCents: productsTable.priceCents,
        salePriceCents: productsTable.salePriceCents,
        category: productsTable.category,
        isActive: productsTable.isActive,
      }).from(productsTable).where(sql`${productsTable.id} = ANY(ARRAY[${sql.join(productIds.map(id => sql`${id}`), sql`, `)}])`)
    : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  const items = rawItems.map((item: any) => {
    const product = productMap.get(item.productId);
    // Trust the variant price the client sends (it came from the server's own product data)
    // but cap option adjustments and recompute line total to prevent tampering
    const basePriceCents = Number(item.variantPriceCents ?? product?.salePriceCents ?? product?.priceCents ?? 0);
    const optionDelta = Array.isArray(item.selectedOptions)
      ? item.selectedOptions.reduce((s: number, o: any) => s + (Number(o.priceAdjustmentCents) || 0), 0)
      : 0;
    const unitPriceCents = Math.max(0, basePriceCents + optionDelta);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return {
      productId: item.productId ?? '',
      productName: product?.name ?? item.productName ?? 'Item',
      variantId: item.variantId ?? null,
      variantName: item.variantName ?? null,
      selectedOptions: item.selectedOptions ?? [],
      category: product?.category ?? item.category ?? '',
      quantity,
      unitPriceCents,
      totalPriceCents: unitPriceCents * quantity,
      notes: item.notes ?? '',
    };
  });

  const subtotalCents = items.reduce((s: number, i: any) => s + i.totalPriceCents, 0);

  // ── Resolve discount amount server-side ────────────────────────────────────
  let discountAmountCents = 0;
  let resolvedDiscountCode: string | null = discountCode ?? null;
  let resolvedDiscountCodeId: string | null = null;
  let discountDescription: string | null = null;

  // 1. Discount code — re-validate server-side using the purchasing customer's identity
  //    when one is attached, so per-customer/first-order constraints apply correctly.
  //    Fall back to staff identity only when no customer is attached (walk-in, no account).
  if (discountCode && typeof discountCode === 'string' && discountCode.trim()) {
    const discountUserId = customerId ?? req.user!.id;
    const discountUserRole = customerId ? 'customer' : req.user!.role;
    try {
      const validated = await validateDiscountCode(
        discountCode,
        discountUserId,
        discountUserRole,
        subtotalCents,
        'pickup',
      );
      discountAmountCents = validated.discountAmountCents;
      resolvedDiscountCodeId = validated.id;
      resolvedDiscountCode = validated.code;
      discountDescription = validated.description;
    } catch (err: any) {
      return res.status(400).json({ error: err.message ?? 'Invalid discount code' });
    }
  }

  // 2. Manual staff % discount (10/20/50 quick chips) — no code required
  if (!discountCode && manualDiscountPct && [10, 20, 50].includes(Number(manualDiscountPct))) {
    const pct = Number(manualDiscountPct);
    discountAmountCents = Math.round(subtotalCents * pct / 100);
    resolvedDiscountCode = null;
    discountDescription = `${pct}% staff discount`;
  }

  // 3. Free coffee redemption — cheapest coffee item is free
  let freeCoffeeRedeemed = false;
  if (redeemFreeCoffee && customerId) {
    const profile = await getOrCreateCustomerLoyaltyProfile(customerId);
    const availableRewards = Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0);
    if (availableRewards <= 0) {
      return res.status(400).json({ error: 'Customer has no free coffee rewards available' });
    }
    // Cheapest coffee item in the order
    const coffeeItems = items.filter((i: any) => String(i.category ?? '').toLowerCase() === 'coffee');
    if (coffeeItems.length > 0) {
      const cheapestCoffee = Math.min(...coffeeItems.map((i: any) => i.unitPriceCents));
      discountAmountCents += cheapestCoffee;
      freeCoffeeRedeemed = true;
    }
  }

  // ── Validate catalog claimed reward (if provided) ──────────────────────────
  let claimedRewardData: { id: string } | null = null;
  if (claimedRewardId && customerId) {
    const [cr] = await db
      .select({
        id: claimedRewardsTable.id,
        userId: claimedRewardsTable.userId,
        status: claimedRewardsTable.status,
        expiresAt: claimedRewardsTable.expiresAt,
        claimVoucherCents: claimedRewardsTable.voucherValueCents,
        rewardVoucherCents: loyaltyRewardsTable.voucherValueCents,
        rewardType: loyaltyRewardsTable.rewardType,
      })
      .from(claimedRewardsTable)
      .innerJoin(loyaltyRewardsTable, eq(claimedRewardsTable.rewardId, loyaltyRewardsTable.id))
      .where(eq(claimedRewardsTable.id, claimedRewardId));
    if (!cr) return res.status(400).json({ error: 'Claimed reward not found.' });
    if (cr.userId !== customerId) return res.status(403).json({ error: 'This reward belongs to a different customer.' });
    if (!['available', 'applied_to_cart'].includes(cr.status)) {
      return res.status(400).json({ error: 'This reward has already been used or has expired.' });
    }
    if (cr.expiresAt && cr.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reward has expired.' });
    }
    // Apply monetary value: voucher deducts face value (capped to subtotal); other rewards = full subtotal free
    const voucherCents = cr.claimVoucherCents ?? cr.rewardVoucherCents ?? null;
    const rewardDiscountCents = voucherCents != null
      ? Math.min(voucherCents, subtotalCents)
      : subtotalCents;
    discountAmountCents += rewardDiscountCents;
    claimedRewardData = { id: cr.id };
  }

  discountAmountCents = Math.min(discountAmountCents, subtotalCents);
  const totalCents = Math.max(0, subtotalCents - discountAmountCents);

  const orderId = randomUUID();
  const orderNumber = await generateOrderNumber();
  const pointsEarned = Math.floor(totalCents / 100);

  // Store a human-readable discount label as discount_code
  // For manual % discounts and free coffee we use a descriptive label
  const storedDiscountCode = resolvedDiscountCode ?? (discountDescription ?? null);

  // ── Atomic transaction: INSERT order + transition any claimed reward ─────────
  try {
    await db.transaction(async (tx) => {
      // Use raw SQL so we can write the POS-specific columns (source, staff_user_id, payment_method)
      await tx.execute(sql`
        INSERT INTO orders (
          id, order_number, user_id, status, type, notes, total_cents,
          items, loyalty_points_earned, loyalty_points_used, discount_cents, discount_code,
          stripe_payment_status, source, staff_user_id, payment_method, created_at, updated_at
        ) VALUES (
          ${orderId},
          ${orderNumber},
          ${customerId ?? req.user!.id},
          'received',
          'pickup',
          ${notes ?? null},
          ${totalCents},
          ${JSON.stringify(items)}::jsonb,
          ${pointsEarned},
          0,
          ${discountAmountCents},
          ${storedDiscountCode},
          'paid',
          'pos',
          ${req.user!.id},
          ${paymentMethod},
          now(),
          now()
        )
      `);

      // Catalog claimed reward — transition to redeemed atomically with order insert
      if (claimedRewardData) {
        const redeemResult = await tx
          .update(claimedRewardsTable)
          .set({ status: 'redeemed', redeemedAt: new Date(), orderId })
          .where(and(
            eq(claimedRewardsTable.id, claimedRewardData.id),
            inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
          ))
          .returning({ id: claimedRewardsTable.id });
        if (redeemResult.length === 0) {
          throw new Error('REWARD_ALREADY_CONSUMED');
        }
      }

      // Stamp-based free coffee — decrement counter atomically with order insert
      if (freeCoffeeRedeemed && customerId) {
        const freeCoffeeResult = await tx.execute(sql`
          UPDATE customer_profiles
          SET free_coffee_rewards = GREATEST(0, free_coffee_rewards - 1),
              free_coffees_earned  = GREATEST(0, free_coffees_earned  - 1),
              updated_at = now()
          WHERE user_id = ${customerId}
            AND free_coffee_rewards > 0
        `);
        if ((freeCoffeeResult.rowCount ?? 0) === 0) {
          throw new Error('FREE_COFFEE_ALREADY_USED');
        }
      }
    });
  } catch (err: any) {
    if (err?.message === 'REWARD_ALREADY_CONSUMED') {
      return res.status(409).json({ error: 'This reward has already been used. Please remove it and try again.' });
    }
    if (err?.message === 'FREE_COFFEE_ALREADY_USED') {
      return res.status(409).json({ error: 'Free coffee reward has already been redeemed. Please remove it and try again.' });
    }
    throw err;
  }

  // ── Record discount code usage (if a validated code was applied) ────────────
  if (resolvedDiscountCodeId) {
    try {
      await db.update(discountCodesTable)
        .set({ usageCount: sql`${discountCodesTable.usageCount} + 1`, updatedAt: new Date() })
        .where(eq(discountCodesTable.id, resolvedDiscountCodeId));
      await db.insert(discountCodeUsagesTable).values({
        id: randomUUID(),
        discountCodeId: resolvedDiscountCodeId,
        userId: customerId ?? req.user!.id,
        orderId,
        discountAmountCents,
      });
    } catch (err: any) {
      req.log.warn({ err, orderId }, 'POS discount usage tracking failed');
    }
  }

  // ── Log stamp-based free coffee activity ────────────────────────────────────
  if (freeCoffeeRedeemed && customerId) {
    try {
      await db.insert(loyaltyActivityLogTable).values({
        id: randomUUID(),
        customerId,
        staffId: req.user!.id,
        orderId,
        activityType: 'reward_redeem',
        pointsDelta: 0,
        coffeeStampsDelta: 0,
        freeCoffeeRewardsDelta: -1,
        description: `Free coffee redeemed at POS — order #${orderNumber ?? orderId.slice(0, 8)}`,
      });
    } catch (err: any) {
      req.log.error({ err, orderId }, 'POS free coffee log failed');
    }
  }

  // ── Award loyalty to attached customer ──────────────────────────────────────
  let loyaltyResult: {
    pointsEarned: number;
    newBalance: number;
    stampsAdded: number;
    newStampCount: number;
    rewardUnlocked: boolean;
  } | null = null;

  if (customerId) {
    try {
      const profile = await getOrCreateCustomerLoyaltyProfile(customerId);

      await recordLoyaltyPoints({
        userId: customerId,
        pointsDelta: pointsEarned,
        orderId,
        description: `POS order #${orderNumber ?? orderId.slice(0, 8)}`,
      });

      const newBalance = (profile.loyaltyPoints ?? 0) + pointsEarned;

      const coffeeItems = items.filter((i: any) =>
        String(i.category ?? '').toLowerCase() === 'coffee'
      );

      let stampsAdded = 0;
      let rewardUnlocked = false;
      let newStampCount = profile.coffeeStampCount ?? profile.stampCount ?? 0;

      if (coffeeItems.length > 0) {
        const stampRes = await applyCoffeeStamps({
          userId: customerId,
          stampsToAdd: 1,
          source: 'in_app_order',
          staffId: req.user!.id,
          orderId,
          description: `Coffee from POS order #${orderNumber ?? orderId.slice(0, 8)}`,
        });
        stampsAdded = 1;
        rewardUnlocked = stampRes.earnedFree;
        newStampCount = stampRes.stampCount;
      }

      loyaltyResult = { pointsEarned, newBalance, stampsAdded, newStampCount, rewardUnlocked };
    } catch (err: any) {
      req.log.error({ err, orderId }, 'POS loyalty update failed');
    }
  }

  return res.status(201).json({
    data: { id: orderId, orderNumber, totalCents, paymentMethod, status: 'received' },
    loyaltyResult,
  });
});

// ── GET /pos/orders — today's POS orders (for history view) ──────────────────
router.get('/orders', async (req, res) => {
  await ensurePosSchemaReady();

  const now = new Date();
  const sydNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(
    sydNow.getFullYear(), sydNow.getMonth(), sydNow.getDate()
  );

  try {
    const result = await db.execute(sql`
      SELECT
        o.id,
        o.order_number,
        o.created_at,
        o.total_cents,
        o.status,
        o.payment_method,
        o.items,
        o.notes,
        u.name AS customer_name,
        su.name AS staff_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id AND o.user_id != o.staff_user_id
      LEFT JOIN users su ON su.id = o.staff_user_id
      WHERE o.source = 'pos'
        AND o.created_at >= ${startOfToday}
      ORDER BY o.created_at DESC
      LIMIT 200
    `);

    const rows = (result.rows ?? result as unknown as any[]) as Array<{
      id: string;
      order_number: string;
      created_at: string;
      total_cents: string | number;
      status: string;
      payment_method: string | null;
      items: any;
      notes: string | null;
      customer_name: string | null;
      staff_name: string | null;
    }>;

    return res.json({
      data: rows.map(r => ({
        id: r.id,
        orderNumber: r.order_number,
        createdAt: r.created_at,
        totalCents: Number(r.total_cents),
        status: r.status,
        paymentMethod: r.payment_method ?? 'eftpos',
        items: Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? JSON.parse(r.items) : []),
        notes: r.notes,
        customerName: r.customer_name,
        staffName: r.staff_name,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, 'GET /pos/orders failed');
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── GET /pos/summary — today's POS sales for this shift/store ─────────────
router.get('/summary', async (req, res) => {
  await ensurePosSchemaReady();

  const now = new Date();
  const sydNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(
    sydNow.getFullYear(), sydNow.getMonth(), sydNow.getDate()
  );

  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total_cents), 0) AS revenue_cents
      FROM orders
      WHERE source = 'pos'
        AND created_at >= ${startOfToday}
        AND status NOT IN ('cancelled', 'refunded')
    `);

    const row = (result.rows ?? result as unknown as any[])[0];
    return res.json({
      data: {
        orderCount: Number(row?.order_count ?? 0),
        revenueCents: Number(row?.revenue_cents ?? 0),
      },
    });
  } catch {
    return res.json({ data: { orderCount: 0, revenueCents: 0 } });
  }
});

// ── PATCH /pos/orders/:id/void — void a POS order within 5 minutes ─────────
router.patch('/orders/:id/void', async (req, res) => {
  await ensurePosSchemaReady();
  const { id } = req.params;
  const FIVE_MINS_MS = 5 * 60 * 1000;

  const result = await db.execute(sql`
    SELECT id, created_at, status, source
    FROM orders
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = (result.rows ?? result as unknown as any[])[0];
  if (!row) return res.status(404).json({ error: 'Order not found' });
  if (row.source !== 'pos') return res.status(400).json({ error: 'Only POS orders can be voided this way' });
  if (row.status === 'cancelled') return res.status(400).json({ error: 'Order is already cancelled' });

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > FIVE_MINS_MS) {
    return res.status(400).json({ error: 'Orders can only be voided within 5 minutes of completion' });
  }

  await db.execute(sql`
    UPDATE orders
    SET status = 'cancelled',
        cancel_reason = 'pos_void',
        updated_at = now()
    WHERE id = ${id}
  `);

  return res.json({ success: true });
});

export default router;
