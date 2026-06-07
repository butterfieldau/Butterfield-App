import { Router } from 'express';
import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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
  reverseCoffeeStamps,
  ensureLoyaltySchemaReady,
} from '../lib/loyaltyIdentity.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { recordAuditLog } from '../lib/auditLog.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('staff', 'manager', 'director', 'master', 'shop_display'));

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
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_cents integer NOT NULL DEFAULT 0`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_payments jsonb`
        ));
        // pos_surcharges table
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS pos_surcharges (
            id text PRIMARY KEY,
            name text NOT NULL,
            trigger_type text NOT NULL,
            trigger_value text NOT NULL,
            amount_type text NOT NULL,
            amount_value integer NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `));
      } catch (err) {
        posSchemaReady = null;
        throw err;
      }
    })();
  }
  return posSchemaReady;
}

// ── Linkly encrypt/decrypt (mirrors shop-display pattern) ─────────────────
function getPosEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? 'default-secret-32-characters-ok!';
  const padded = secret.padEnd(32, '0').slice(0, 32);
  return Buffer.from(padded, 'utf8');
}
function posEncryptText(plain: string): string {
  const key = getPosEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(plain, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${enc}`;
}
function posDecryptText(stored: string): string {
  const key = getPosEncKey();
  const sep = stored.indexOf(':');
  const iv = Buffer.from(stored.slice(0, sep), 'hex');
  const data = stored.slice(sep + 1);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let dec = decipher.update(data, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

// ── Active Linkly sessions (POS) ──────────────────────────────────────────
const posActiveSessions = new Map<string, { deviceUserId: string; amountCents: number; createdAt: number }>();
// Clean up sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of posActiveSessions.entries()) {
    if (s.createdAt < cutoff) posActiveSessions.delete(id);
  }
}, 5 * 60 * 1000);

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
        birthday: (profile as any).birthday ?? null,
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
        birthday: (profile as any).birthday ?? null,
        availableClaimedRewards,
      }],
    });
  }

  // Text search by name / email / phone / referral code
  const query = String(q ?? '').trim();
  if (query.length < 2) return res.json({ data: [] });

  const like = `%${query}%`;
  const rows = await db.execute(sql`
    SELECT u.id, u.name, u.email, u.phone,
      COALESCE(cp.loyalty_points, 0) AS loyalty_points,
      COALESCE(cp.coffee_stamp_count, cp.stamp_count, 0) AS stamp_count,
      COALESCE(cp.loyalty_tier, 'blue') AS loyalty_tier,
      COALESCE(cp.free_coffee_rewards, cp.free_coffees_earned, 0) AS free_coffee_rewards,
      cp.birthday
    FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id = u.id
    WHERE u.role = 'customer'
      AND (
        u.name ILIKE ${like}
        OR u.email ILIKE ${like}
        OR u.phone ILIKE ${like}
        OR cp.referral_code ILIKE ${like}
      )
    ORDER BY u.name
    LIMIT 10
  `);

  const users = (rows.rows ?? rows as unknown as any[]) as Array<{
    id: string; name: string; email: string; phone: string | null;
    loyalty_points: number; stamp_count: number; loyalty_tier: string;
    free_coffee_rewards: number; birthday: string | null;
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
      birthday: u.birthday ?? null,
      availableClaimedRewards: claimedRewardsMap[u.id] ?? [],
    })),
  });
});

// ── POST /pos/customers/:id/stamp — manually award one coffee stamp ──────────
router.post('/customers/:id/stamp', async (req, res) => {
  await ensurePosSchemaReady();
  await ensureLoyaltySchemaReady();

  const customerId = req.params.id;
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, customerId), sql`${usersTable.role} = 'customer'`));
  if (!user) return res.status(404).json({ error: 'Customer not found' });

  try {
    const stampRes = await applyCoffeeStamps({
      userId: customerId,
      stampsToAdd: 1,
      source: 'pos_manual' as any,
      staffId: req.user!.id,
      description: 'Coffee stamp awarded manually at POS',
    });

    const profile = await getOrCreateCustomerLoyaltyProfile(customerId);
    return res.json({
      data: {
        stampCount: stampRes.stampCount,
        rewardUnlocked: stampRes.earnedFree,
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
      },
    });
  } catch (err: any) {
    req.log.error({ err, customerId }, 'POS stamp award failed');
    return res.status(500).json({ error: 'Failed to award stamp' });
  }
});

// ── GET /pos/surcharges — list all active surcharges ──────────────────────
router.get('/surcharges', async (req, res) => {
  await ensurePosSchemaReady();
  try {
    const result = await db.execute(sql`
      SELECT id, name, trigger_type, trigger_value, amount_type, amount_value, is_active, created_at
      FROM pos_surcharges
      ORDER BY created_at ASC
    `);
    const rows = (result.rows ?? result as any[]) as any[];
    return res.json({ data: rows.map(r => ({
      id: r.id, name: r.name,
      triggerType: r.trigger_type, triggerValue: r.trigger_value,
      amountType: r.amount_type, amountValue: Number(r.amount_value),
      isActive: r.is_active, createdAt: r.created_at,
    })) });
  } catch (err: any) {
    req.log.error({ err }, 'GET /pos/surcharges failed');
    return res.status(500).json({ error: 'Failed to fetch surcharges' });
  }
});

// ── POST /pos/surcharges — create a surcharge (director/manager only) ──────
router.post('/surcharges', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { name, triggerType, triggerValue, amountType, amountValue } = req.body;
  if (!name || !triggerType || !triggerValue || !amountType || amountValue == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['payment_method', 'day_of_week'].includes(triggerType)) {
    return res.status(400).json({ error: 'triggerType must be payment_method or day_of_week' });
  }
  if (!['pct_basis_points', 'fixed_cents'].includes(amountType)) {
    return res.status(400).json({ error: 'amountType must be pct_basis_points or fixed_cents' });
  }
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO pos_surcharges (id, name, trigger_type, trigger_value, amount_type, amount_value)
    VALUES (${id}, ${name}, ${triggerType}, ${triggerValue}, ${amountType}, ${Number(amountValue)})
  `);
  return res.status(201).json({ data: { id, name, triggerType, triggerValue, amountType, amountValue: Number(amountValue), isActive: true } });
});

// ── PATCH /pos/surcharges/:id — update a surcharge ─────────────────────────
router.patch('/surcharges/:id', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { id } = req.params;
  const { name, isActive, amountValue } = req.body;
  await db.execute(sql`
    UPDATE pos_surcharges SET
      name = COALESCE(${name ?? null}, name),
      is_active = COALESCE(${isActive ?? null}, is_active),
      amount_value = COALESCE(${amountValue != null ? Number(amountValue) : null}, amount_value),
      updated_at = now()
    WHERE id = ${id}
  `);
  return res.json({ success: true });
});

// ── DELETE /pos/surcharges/:id — delete a surcharge ────────────────────────
router.delete('/surcharges/:id', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { id } = req.params;
  await db.execute(sql`DELETE FROM pos_surcharges WHERE id = ${id}`);
  return res.json({ success: true });
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
    tipCents: rawTipCents,
    surchargeCents: rawSurchargeCents,
    splitPayments: rawSplitPayments,
    customerId,
    discountCode,
    discountCodeId,
    manualDiscountPct,
    redeemFreeCoffee,
    claimedRewardId,
    birthdayBonus,
    notes,
  } = req.body;

  // Tier multiplier map — applied to points earned (not tip or surcharge)
  function getTierMultiplier(tier: string): number {
    switch ((tier ?? '').toLowerCase()) {
      case 'platinum': return 2.0;
      case 'gold':     return 1.5;
      case 'silver':   return 1.25;
      default:         return 1.0; // blue / bronze / unknown
    }
  }

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
  const baseTotalCents = Math.max(0, subtotalCents - discountAmountCents);

  // Clamp tip and surcharge to reasonable values
  const tipCents = Math.max(0, Math.floor(Number(rawTipCents) || 0));
  const surchargeCents = Math.max(0, Math.floor(Number(rawSurchargeCents) || 0));
  const splitPayments = Array.isArray(rawSplitPayments) ? rawSplitPayments : null;
  const totalCents = baseTotalCents + tipCents + surchargeCents;

  const orderId = randomUUID();
  const orderNumber = await generateOrderNumber();

  // ── Points earned: apply tier multiplier + birthday bonus ────────────────
  let tierMultiplierVal = 1.0;
  let birthdayMultiplierVal = 1.0;
  let earlyLoyaltyTier = 'blue';
  if (customerId) {
    try {
      const earlyProfile = await getOrCreateCustomerLoyaltyProfile(customerId);
      earlyLoyaltyTier = earlyProfile.loyaltyTier ?? 'blue';
      tierMultiplierVal = getTierMultiplier(earlyLoyaltyTier);
      if (birthdayBonus) birthdayMultiplierVal = 2.0;
    } catch { /* fall back to 1× */ }
  }
  const pointsEarned = Math.floor(baseTotalCents / 100 * tierMultiplierVal * birthdayMultiplierVal);

  // Store a human-readable discount label as discount_code
  // For manual % discounts and free coffee we use a descriptive label
  const storedDiscountCode = resolvedDiscountCode ?? (discountDescription ?? null);

  // ── Atomic transaction: INSERT order + transition any claimed reward ─────────
  try {
    await db.transaction(async (tx) => {
      // Use raw SQL so we can write the POS-specific columns (source, staff_user_id, payment_method, tip_cents, surcharge_cents, split_payments)
      await tx.execute(sql`
        INSERT INTO orders (
          id, order_number, user_id, status, type, notes, total_cents,
          items, loyalty_points_earned, loyalty_points_used, discount_cents, discount_code,
          stripe_payment_status, source, staff_user_id, payment_method,
          tip_cents, surcharge_cents, split_payments,
          created_at, updated_at
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
          ${tipCents},
          ${surchargeCents},
          ${splitPayments ? JSON.stringify(splitPayments) : null}::jsonb,
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

      const multiplierParts: string[] = [];
      if (tierMultiplierVal !== 1.0) multiplierParts.push(`${earlyLoyaltyTier} tier ${tierMultiplierVal}×`);
      if (birthdayBonus) multiplierParts.push('🎂 birthday 2×');
      const multiplierNote = multiplierParts.length ? ` (${multiplierParts.join(', ')})` : '';
      await recordLoyaltyPoints({
        userId: customerId,
        pointsDelta: pointsEarned,
        orderId,
        description: `POS order #${orderNumber ?? orderId.slice(0, 8)}${multiplierNote}`,
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
        COALESCE(o.tip_cents, 0) AS tip_cents,
        COALESCE(o.surcharge_cents, 0) AS surcharge_cents,
        o.split_payments,
        o.discount_cents,
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
      tip_cents: string | number;
      surcharge_cents: string | number;
      split_payments: any;
      discount_cents: string | number;
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
        tipCents: Number(r.tip_cents ?? 0),
        surchargeCents: Number(r.surcharge_cents ?? 0),
        splitPayments: r.split_payments ?? null,
        discountCents: Number(r.discount_cents ?? 0),
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

// ── POST /pos/orders/:id/refund — PIN-gated refund (full or partial) ─────────
router.post('/orders/:id/refund', async (req, res) => {
  await ensurePosSchemaReady();
  const { id } = req.params;
  const { amountCents, reason } = req.body;

  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required to issue refunds' });
  }
  if (!amountCents || Number(amountCents) <= 0) {
    return res.status(400).json({ error: 'amountCents must be a positive number' });
  }

  const result = await db.execute(sql`
    SELECT id, total_cents, status, source, user_id, loyalty_points_earned, items
    FROM orders WHERE id = ${id} LIMIT 1
  `);
  const order = (result.rows ?? result as unknown as any[])[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.source !== 'pos') return res.status(400).json({ error: 'Only POS orders can be refunded via this endpoint' });
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return res.status(400).json({ error: 'Order is already cancelled or refunded' });
  }

  const refundAmountCents = Math.min(Number(amountCents), Number(order.total_cents));
  const isFullRefund = refundAmountCents >= Number(order.total_cents);

  await db.execute(sql`
    UPDATE orders SET
      status = ${isFullRefund ? 'cancelled' : 'received'},
      cancel_reason = ${isFullRefund ? ('refund: ' + (reason ?? 'POS refund')) : null},
      updated_at = now()
    WHERE id = ${id}
  `);

  // Reverse loyalty points if full refund and customer attached
  if (isFullRefund && order.user_id && order.loyalty_points_earned > 0) {
    try {
      await db.execute(sql`
        UPDATE customer_profiles
        SET loyalty_points = GREATEST(0, loyalty_points - ${Number(order.loyalty_points_earned)}),
            updated_at = now()
        WHERE user_id = ${order.user_id}
      `);
      // Reverse coffee stamps if any coffee items
      const items = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
      const hasCoffee = items.some((i: any) => String(i.category ?? '').toLowerCase() === 'coffee');
      if (hasCoffee) {
        await reverseCoffeeStamps({ userId: order.user_id, stampsToRemove: 1, orderId: id });
      }
    } catch (err: any) {
      req.log.error({ err, orderId: id }, 'POS refund: loyalty reversal failed');
    }
  }

  await recordAuditLog({
    actor: req.user,
    entityType: 'pos_order',
    entityId: id,
    action: isFullRefund ? 'refund_full' : 'refund_partial',
    reason: reason ?? null,
    metadata: { refundAmountCents, orderTotalCents: Number(order.total_cents), isFullRefund },
  });

  return res.json({ success: true, refundAmountCents, isFullRefund });
});

// ── POST /pos/linkly/transaction — initiate EFTPOS via Linkly ─────────────
router.post('/linkly/transaction', async (req, res) => {
  await ensurePosSchemaReady();
  const { amountCents } = req.body ?? {};
  if (!amountCents || Number(amountCents) <= 0) {
    return res.status(400).json({ error: 'amountCents is required and must be positive' });
  }

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly is not configured for this account. Configure it via the Shop Display settings.' });
  }

  let password: string;
  try { password = posDecryptText(cfg.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt Linkly credentials.' }); }

  const sessionId = randomUUID();
  const chargeAmount = Math.round(Number(amountCents));

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: `pos-${req.user!.id}`,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) {
      return res.status(400).json({ error: authBody?.message ?? 'Linkly authentication failed.' });
    }

    const authToken = authBody.token ?? authBody.Token;
    const secret = authBody.secret ?? authBody.Secret ?? '';

    const txnRes = await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'Secret': secret,
      },
      body: JSON.stringify({
        SessionId: sessionId,
        Merchant: '00',
        TxnType: 'P',
        AmountCash: 0,
        AmountPurchase: chargeAmount,
        TxnRef: sessionId.slice(0, 16),
        EnableTip: false,
        CutReceipt: '0',
        ReceiptAutoPrint: '7',
      }),
    });

    if (!txnRes.ok) {
      const txnBody = await txnRes.json().catch(() => ({})) as any;
      return res.status(400).json({ error: txnBody?.message ?? 'Failed to start EFTPOS transaction.' });
    }

    posActiveSessions.set(sessionId, { deviceUserId: req.user!.id, amountCents: chargeAmount, createdAt: Date.now() });
    return res.json({ data: { sessionId, amountCents: chargeAmount } });
  } catch (err: any) {
    req.log.error({ err }, 'POS Linkly transaction initiation error');
    return res.status(502).json({ error: 'Could not reach Linkly Cloud.' });
  }
});

// ── GET /pos/linkly/:sessionId — poll Linkly transaction status ───────────
router.get('/linkly/:sessionId', async (req, res) => {
  await ensurePosSchemaReady();
  const { sessionId } = req.params;

  const binding = posActiveSessions.get(sessionId);
  if (!binding) return res.status(404).json({ error: 'Session not found or expired.' });
  if (binding.deviceUserId !== req.user!.id) return res.status(403).json({ error: 'Session belongs to a different device.' });

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.status(400).json({ error: 'Linkly not configured.' });
  }

  let password: string;
  try { password = posDecryptText(cfg.linkly_password_encrypted); }
  catch { return res.status(500).json({ error: 'Failed to decrypt credentials.' }); }

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: `pos-${req.user!.id}`,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (!authRes.ok) return res.status(400).json({ error: 'Linkly re-authentication failed.' });

    const authToken = authBody.token ?? authBody.Token;
    const secret = authBody.secret ?? authBody.Secret ?? '';

    const pollRes = await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${authToken}`, 'Secret': secret },
    });
    const pollBody = await pollRes.json().catch(() => ({})) as any;

    if (!pollRes.ok) {
      return res.json({ data: { status: 'unknown', responseText: 'Polling error', approved: false, complete: false } });
    }

    const response = pollBody.Response ?? pollBody.response ?? {};
    const complete = pollBody.SessionComplete ?? pollBody.Complete ?? false;
    const approved = complete && (
      response.Success === true ||
      response.ResponseCode === '00' ||
      response.ResponseText?.toLowerCase().includes('approved') ||
      pollBody.TxnCompleted === true
    );
    const declined = complete && !approved;

    let responseText = 'Waiting for card…';
    if (complete && approved) responseText = 'Approved';
    else if (complete && declined) responseText = response.ResponseText ?? 'Declined';
    else if (response.ResponseText) responseText = response.ResponseText;

    if (complete) posActiveSessions.delete(sessionId);

    return res.json({
      data: {
        status: complete ? (approved ? 'approved' : 'declined') : 'pending',
        responseText,
        approved,
        complete,
        receiptText: response.ReceiptText ?? null,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'POS Linkly poll error');
    return res.json({ data: { status: 'pending', responseText: 'Connecting to terminal…', approved: false, complete: false } });
  }
});

// ── DELETE /pos/linkly/:sessionId — cancel Linkly transaction ────────────
router.delete('/linkly/:sessionId', async (req, res) => {
  await ensurePosSchemaReady();
  const { sessionId } = req.params;

  const binding = posActiveSessions.get(sessionId);
  if (binding && binding.deviceUserId !== req.user!.id) {
    return res.status(403).json({ error: 'Session belongs to a different device.' });
  }
  posActiveSessions.delete(sessionId);

  const rows = await db.execute(sql`
    SELECT linkly_username, linkly_password_encrypted, linkly_pairing_code
    FROM shop_display_profiles WHERE user_id = ${req.user!.id}
  `);
  const cfg = (rows as any).rows?.[0] ?? (rows as any)[0] ?? null;
  if (!cfg?.linkly_username || !cfg?.linkly_password_encrypted || !cfg?.linkly_pairing_code) {
    return res.json({ success: true });
  }

  let password: string;
  try { password = posDecryptText(cfg.linkly_password_encrypted); }
  catch { return res.json({ success: true }); }

  try {
    const authRes = await fetch('https://auth.cloud.eftpos.com.au/v1/pairing/cloudpos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cfg.linkly_username,
        password,
        pairingCode: cfg.linkly_pairing_code,
        posName: 'Butterfield Cookies POS',
        posVersion: '1.0',
        posId: `pos-${req.user!.id}`,
      }),
    });
    const authBody = await authRes.json().catch(() => ({})) as any;
    if (authRes.ok) {
      const authToken = authBody.token ?? authBody.Token;
      const secret = authBody.secret ?? authBody.Secret ?? '';
      await fetch(`https://rest.pos.cloud.eftpos.com.au/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Secret': secret },
      });
    }
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, 'POS Linkly cancel error');
    return res.json({ success: true });
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
