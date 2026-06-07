import { Router } from 'express';
import { randomUUID } from 'crypto';
import {
  db, ordersTable, customerProfilesTable, usersTable, productsTable,
} from '@workspace/db';
import { eq, and, desc, gte, sql, or, count, sum } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  applyCoffeeStamps,
  getOrCreateCustomerLoyaltyProfile,
  parseLoyaltyQrPayload,
  recordLoyaltyPoints,
} from '../lib/loyaltyIdentity.js';
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
      } catch (err) {
        posSchemaReady = null;
        throw err;
      }
    })();
  }
  return posSchemaReady;
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

    const profile = await getOrCreateCustomerLoyaltyProfile(resolvedUserId, user.name);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
      }],
    });
  }

  // Direct userId lookup
  if (userId) {
    const uid = String(userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    const profile = await getOrCreateCustomerLoyaltyProfile(uid, user.name);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
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
      COALESCE(cp.loyalty_tier, 'blue') AS loyalty_tier
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
  }>;

  return res.json({
    data: users.map(u => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      loyaltyPoints: Number(u.loyalty_points),
      stampCount: Number(u.stamp_count),
      loyaltyTier: u.loyalty_tier,
    })),
  });
});

// ── POST /pos/orders — create a POS order ────────────────────────────────────
router.post('/orders', async (req, res) => {
  await ensurePosSchemaReady();

  const {
    items: rawItems,
    orderType,
    paymentMethod,
    amountTenderedCents,
    customerId,
    discountCode,
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
  const discountAmountCents = 0; // discount codes validated separately in future
  const totalCents = Math.max(0, subtotalCents - discountAmountCents);

  const orderId = randomUUID();
  const orderNumber = await generateOrderNumber();
  const pointsEarned = Math.floor(totalCents / 100);

  // Use raw SQL so we can write the new `source` and `staff_user_id` columns
  await db.execute(sql`
    INSERT INTO orders (
      id, order_number, user_id, status, type, notes, total_cents,
      items, loyalty_points_earned, loyalty_points_used, discount_cents, discount_code,
      stripe_payment_status, source, staff_user_id, created_at, updated_at
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
      ${discountCode ?? null},
      'paid',
      'pos',
      ${req.user!.id},
      now(),
      now()
    )
  `);

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
