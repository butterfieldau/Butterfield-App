import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ordersTable, customerProfilesTable, storeSettingsTable, productsTable, discountCodesTable, discountCodeUsagesTable, claimedRewardsTable, loyaltyRewardsTable } from '@workspace/db';
import { eq, desc, inArray, sql, and } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { sendNotification, notifyUser } from '../lib/notificationService.js';
import { computeOrderTotal } from '../lib/orderPricing.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { applyCoffeeStamps, computeLoyaltyTier, getOrCreateCustomerLoyaltyProfile, LOYALTY_POINT_VALUE_CENTS, recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';

const router = Router();

function sendNotificationToInternalTeam(
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  return sendNotification({
    roles: ['staff', 'manager', 'director', 'master'],
    type,
    title,
    body,
    data,
  });
}

async function countCoffeeItemsFromOrderItems(items: unknown) {
  const orderItems = Array.isArray(items) ? items as any[] : [];
  const orderProductIds = Array.from(new Set(
    orderItems
      .map((item) => item?.productId)
      .filter((productId: unknown): productId is string => Boolean(productId && typeof productId === 'string')),
  ));
  const products = orderProductIds.length > 0
    ? await db.select({ id: productsTable.id, category: productsTable.category })
      .from(productsTable)
      .where(inArray(productsTable.id, orderProductIds))
    : [];
  const coffeeIds = new Set(
    products.filter((product) => String(product.category ?? '').toLowerCase() === 'coffee').map((product) => product.id),
  );
  return orderItems.reduce((sum: number, item: any) => {
    const qty = Math.max(1, Math.floor(Number(item?.quantity ?? 1) || 1));
    return coffeeIds.has(item?.productId) ? sum + qty : sum;
  }, 0);
}

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
  const {
    items: rawItems, type, scheduledFor, notes, stripePaymentIntentId, loyaltyPointsUsed,
    deliveryAddress, deliveryPostcode, deliveryState, paymentMethod,
    discountCode, discountCodeId: clientDiscountCodeId, paymentMethodType,
    claimedRewardId,
  } = req.body;

  // Strip any client-supplied isFreeReward flags — only the server may inject this after validating a claim
  const items: any[] = (rawItems ?? []).map(({ isFreeReward: _f, ...rest }: any) => rest);

  // ── Sydney-only delivery enforcement ─────────────────────────────────────
  if (type === 'delivery') {
    const state = (deliveryState ?? '').toString().trim().toUpperCase();
    const pc    = parseInt((deliveryPostcode ?? '').toString().trim(), 10);
    if (state !== 'NSW' || isNaN(pc) || pc < 2000 || pc > 2999) {
      return res.status(400).json({ error: 'Delivery is only available within Sydney (NSW postcodes 2000–2999).' });
    }
  }

  if (paymentMethod === 'pay_at_pickup' && type !== 'pickup') {
    return res.status(400).json({ error: 'Pay at pickup is only available for pickup orders.' });
  }

  // ── Validate loyalty points claimed ───────────────────────────────────────
  let claimedLoyaltyPoints = Math.max(0, Math.floor(loyaltyPointsUsed ?? 0));
  if (claimedLoyaltyPoints > 0) {
    const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
    if (!profile || profile.loyaltyPoints < claimedLoyaltyPoints) {
      return res.status(400).json({ error: 'Insufficient loyalty points' });
    }
  }

  // ── Validate claimed reward ────────────────────────────────────────────────
  let claimedRewardDiscountCents = 0;
  let claimedRewardData: { id: string; rewardType: string; linkedProductId: string | null; voucherValueCents: number | null } | null = null;

  if (claimedRewardId && typeof claimedRewardId === 'string') {
    const [claimedRow] = await db
      .select({
        id: claimedRewardsTable.id,
        userId: claimedRewardsTable.userId,
        status: claimedRewardsTable.status,
        voucherValueCents: claimedRewardsTable.voucherValueCents,
        rewardId: claimedRewardsTable.rewardId,
        expiresAt: claimedRewardsTable.expiresAt,
      })
      .from(claimedRewardsTable)
      .where(and(
        eq(claimedRewardsTable.id, claimedRewardId),
        eq(claimedRewardsTable.userId, req.user!.id),
        inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
      ));

    if (!claimedRow) {
      return res.status(400).json({ error: 'Claimed reward not found or already used' });
    }

    // Enforce expiry — atomically transition to expired and reject
    if (claimedRow.expiresAt && claimedRow.expiresAt < new Date()) {
      await db.update(claimedRewardsTable)
        .set({ status: 'expired' })
        .where(and(
          eq(claimedRewardsTable.id, claimedRow.id),
          inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
        ));
      return res.status(400).json({ error: 'This reward has expired' });
    }

    const [rewardRow] = await db
      .select({ rewardType: loyaltyRewardsTable.rewardType, linkedProductId: loyaltyRewardsTable.linkedProductId, name: loyaltyRewardsTable.name })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, claimedRow.rewardId));

    const rewardType = rewardRow?.rewardType ?? 'item_reward';
    const linkedProductId = rewardRow?.linkedProductId ?? null;
    const rewardName = rewardRow?.name ?? 'Free Reward';

    if (rewardType === 'money_voucher') {
      claimedRewardDiscountCents = claimedRow.voucherValueCents ?? 0;
    } else if (rewardType === 'item_reward') {
      if (linkedProductId) {
        // Grant exactly ONE free unit — never make multi-quantity lines entirely free
        const existingIdx = items.findIndex((i: any) => i.productId === linkedProductId && !i.isFreeReward);
        if (existingIdx >= 0) {
          const existingQty = Math.max(1, Math.floor(items[existingIdx].quantity ?? 1));
          if (existingQty === 1) {
            // Single unit in cart — mark the whole line free (preserve/set name)
            items[existingIdx] = { ...items[existingIdx], name: items[existingIdx].name ?? rewardName, isFreeReward: true };
          } else {
            // Multiple units — reduce paid quantity by 1 and add a separate free unit
            items[existingIdx] = { ...items[existingIdx], quantity: existingQty - 1 };
            items.push({ productId: linkedProductId, name: rewardName, quantity: 1, isFreeReward: true });
          }
        } else {
          // Item not in cart — inject as a new free line (handles empty-cart reward checkout)
          items.push({ productId: linkedProductId, name: rewardName, quantity: 1, isFreeReward: true });
        }
      } else {
        // No linked product (e.g. "any item" reward) — inject a named placeholder
        items.push({ productId: `reward:${claimedRow.id}`, name: rewardName, quantity: 1, isFreeReward: true });
      }
    }

    claimedRewardData = { id: claimedRow.id, rewardType, linkedProductId, voucherValueCents: claimedRow.voucherValueCents };
  }

  // Items must be present at this point — either from client or injected by the free-item reward above
  if (!items.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  // ── Server-side discount code validation (client value is not trusted) ────
  let discountCodeAmountCents = 0;
  let validatedDiscountCodeId: string | null = null;
  let validatedDiscountCode: string | null = null;

  const resolvedOrderType: 'pickup' | 'delivery' = type === 'delivery' ? 'delivery' : 'pickup';
  const resolvedPaymentMethod = paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card';

  if (discountCode && typeof discountCode === 'string') {
    try {
      const base = await computeOrderTotal(items, resolvedOrderType, 0, 'card');
      const validated = await validateDiscountCode(
        discountCode,
        req.user!.id,
        req.user!.role,
        base.subtotalCents,
        resolvedOrderType,
      );
      discountCodeAmountCents = validated.discountAmountCents;
      validatedDiscountCodeId = validated.id;
      validatedDiscountCode = validated.code;
    } catch (err: any) {
      return res.status(400).json({ error: err.message ?? 'Invalid discount code.' });
    }
  }

  // ── Server-side price computation (client totals are not trusted) ─────────
  const baseDiscountCents = discountCodeAmountCents + claimedRewardDiscountCents;
  let previewWithoutPoints: Awaited<ReturnType<typeof computeOrderTotal>>;
  try {
    previewWithoutPoints = await computeOrderTotal(
      items,
      resolvedOrderType,
      baseDiscountCents,
      resolvedPaymentMethod,
    );
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  claimedLoyaltyPoints = Math.min(
    claimedLoyaltyPoints,
    Math.floor(previewWithoutPoints.totalCents / LOYALTY_POINT_VALUE_CENTS),
  );

  const loyaltyDiscountCents = claimedLoyaltyPoints * LOYALTY_POINT_VALUE_CENTS;
  const totalDiscountCents = loyaltyDiscountCents + baseDiscountCents;
  let computed: Awaited<ReturnType<typeof computeOrderTotal>>;
  try {
    computed = await computeOrderTotal(
      items,
      resolvedOrderType,
      totalDiscountCents,
      resolvedPaymentMethod,
    );
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  const authorativeTotalCents = computed.totalCents;
  const authorativeDiscountCents = computed.discountCents;

  if (paymentMethod === 'pay_at_pickup' && stripePaymentIntentId) {
    return res.status(400).json({ error: 'Pay at pickup orders should not include a Stripe payment intent.' });
  }

  // ── Cutoff time enforcement ────────────────────────────────────────────────
  const settingsRows = await db.select().from(storeSettingsTable);
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const cutoffTime = settings['order_cutoff_time'] ?? '';
  if (cutoffTime) {
    const syd  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    const mins = syd.getHours() * 60 + syd.getMinutes();
    const [ch, cm] = cutoffTime.split(':').map(Number);
    if (!isNaN(ch) && !isNaN(cm) && mins >= ch * 60 + cm) {
      const h12 = ch > 12 ? ch - 12 : ch === 0 ? 12 : ch;
      const suffix = ch < 12 ? 'am' : 'pm';
      const mn = cm > 0 ? `:${String(cm).padStart(2, '0')}` : '';
      return res.status(400).json({ error: `Orders are closed after ${h12}${mn}${suffix}. Please order again tomorrow.` });
    }
  }

  // ── Stripe payment intent verification ────────────────────────────────────
  let stripePaymentStatus: 'pending' | 'paid' | 'pay_at_pickup' | 'free' =
    authorativeTotalCents === 0 ? 'free'
    : paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup'
    : 'pending';

  if (stripePaymentIntentId) {
    const [existingOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.stripePaymentIntentId, stripePaymentIntentId as string));
    if (existingOrder) {
      return res.status(409).json({ error: 'Payment intent has already been used' });
    }

    try {
      const { getUncachableStripeClient } = await import('../stripeClient.js');
      const stripe = await getUncachableStripeClient();
      const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId as string);

      if (pi.metadata?.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Payment intent does not belong to this user' });
      }
      if (pi.status !== 'succeeded') {
        return res.status(400).json({ error: `Payment has not been completed (status: ${pi.status})` });
      }
      if (pi.currency !== 'aud') {
        return res.status(400).json({ error: 'Payment currency is not AUD' });
      }
      if (Math.abs(pi.amount - authorativeTotalCents) > 1) {
        return res.status(400).json({ error: 'Payment amount does not match order total' });
      }
      stripePaymentStatus = 'paid';
    } catch (err: any) {
      req.log.error({ err, stripePaymentIntentId }, 'Stripe PI verification failed');
      return res.status(400).json({ error: 'Payment verification failed. Please try again.' });
    }
  }

  // ── Insert order + mark reward redeemed atomically ────────────────────────
  // Both must succeed together: if the claim is already consumed, the order is rolled back.
  const orderId = randomUUID();
  const pointsEarned = Math.floor(authorativeTotalCents / 100);
  let order!: typeof ordersTable.$inferSelect;
  const isPaid = stripePaymentStatus === 'paid' || stripePaymentStatus === 'free' || stripePaymentStatus === 'pay_at_pickup';
  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(ordersTable).values({
        id: orderId,
        userId: req.user!.id,
        status: 'received',
        type: type ?? 'pickup',
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        notes,
        totalCents: authorativeTotalCents,
        stripePaymentIntentId: stripePaymentIntentId ?? null,
        stripePaymentStatus,
        items,
        loyaltyPointsEarned: isPaid ? pointsEarned : 0,
        loyaltyPointsUsed: isPaid ? claimedLoyaltyPoints : 0,
        discountCents: authorativeDiscountCents,
        discountCode: validatedDiscountCode,
        discountCodeId: validatedDiscountCodeId,
        paymentMethodType: paymentMethodType as string ?? null,
        deliveryAddress,
      }).returning();
      order = inserted;

      // Claim transition inside the same transaction — rolls back order if claim is gone
      if (claimedRewardData) {
        const redeemResult = await tx.update(claimedRewardsTable)
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
    });
  } catch (err: any) {
    if (err?.code === '23505' && err?.constraint_name?.includes('stripe_payment_intent_id')) {
      return res.status(409).json({ error: 'Payment intent has already been used' });
    }
    if (err?.message === 'REWARD_ALREADY_CONSUMED') {
      return res.status(409).json({ error: 'This reward has already been used. Please remove it and try again.' });
    }
    throw err;
  }

  // ── Record discount code usage ─────────────────────────────────────────────
  if (validatedDiscountCodeId && validatedDiscountCode && discountCodeAmountCents > 0) {
    try {
      await db
        .update(discountCodesTable)
        .set({ usageCount: sql`${discountCodesTable.usageCount} + 1`, updatedAt: new Date() })
        .where(eq(discountCodesTable.id, validatedDiscountCodeId));
      await db.insert(discountCodeUsagesTable).values({
        id: randomUUID(),
        discountCodeId: validatedDiscountCodeId,
        userId: req.user!.id,
        orderId,
        discountAmountCents: discountCodeAmountCents,
      });
    } catch (usageErr) {
      req.log.error({ usageErr, orderId }, 'Failed to record discount code usage');
    }
  }

  // ── Update customer loyalty profile ────────────────────────────────────────
  if (isPaid) {
    try {
      const profile = await getOrCreateCustomerLoyaltyProfile(req.user!.id, req.user!.name);
      if (profile) {
        const newSpent = profile.totalSpentCents + authorativeTotalCents;
        const newTier = computeLoyaltyTier(newSpent);
        await db.update(customerProfilesTable).set({
          totalSpentCents: newSpent,
          loyaltyTier: newTier,
          totalVisits: profile.totalVisits + 1,
          updatedAt: new Date(),
        }).where(eq(customerProfilesTable.userId, req.user!.id));

        await recordLoyaltyPoints({
          userId: req.user!.id,
          pointsDelta: pointsEarned - claimedLoyaltyPoints,
          orderId,
          description: `Order #${orderId.slice(0, 8)}`,
        });

        const orderProductIds = Array.from(new Set(
          items
            .map((item: any) => item.productId)
            .filter((productId: unknown): productId is string => Boolean(productId && typeof productId === 'string')),
        )) as string[];
        const products = orderProductIds.length > 0
          ? await db.select({ id: productsTable.id, category: productsTable.category })
            .from(productsTable)
            .where(inArray(productsTable.id, orderProductIds))
          : [];
        const coffeeIds = new Set(
          products.filter((product) => String(product.category ?? '').toLowerCase() === 'coffee').map((product) => product.id),
        );
        const coffeeCount = items.reduce((sum: number, item: any) => {
          const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1) || 1));
          return coffeeIds.has(item.productId) ? sum + qty : sum;
        }, 0);
        if (coffeeCount > 0) {
          await applyCoffeeStamps({
            userId: req.user!.id,
            stampsToAdd: coffeeCount,
            source: 'in_app_order',
            orderId,
            description: `Coffee purchase from order #${orderId.slice(0, 8)}`,
          });
        }
      }
    } catch (err: any) {
      req.log.error({ err, orderId }, 'Post-order loyalty update failed');
    }
  }

  // ── Notify staff and customer of the new order ────────────────────────────
  const itemCount = Array.isArray(items) ? items.length : 1;
  void sendNotificationToInternalTeam(
    'new_order',
    'New Order In',
    `${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(authorativeTotalCents / 100).toFixed(2)} · ${type === 'delivery' ? 'Delivery' : 'Pickup'}`,
    { orderId, screen: '/(staff)/orders' },
  ).catch((err) => req.log.warn({ err, orderId }, 'Internal order notification failed'));

  void notifyUser(
    req.user!.id,
    'order_confirmed',
    'Order Received',
    'We\'ve got your order and will have it ready soon!',
    { orderId, screen: '/(customer)/orders' },
  ).catch((err) => req.log.warn({ err, orderId }, 'Customer order notification failed'));

  return res.status(201).json({ data: order });
});

// ── Status updates are restricted to staff and management roles ───────────
router.patch(
  '/:id/status',
  requireRole('staff', 'director', 'manager', 'master'),
  async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Read current status BEFORE updating so we can guard idempotent side-effects
    const [currentOrder] = await db
      .select({ id: ordersTable.id, status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, String(req.params.id)));
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const previousStatus = currentOrder.status;

    const [order] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.id, String(req.params.id)))
      .returning();

    const STATUS_MSG: Record<string, string> = {
      being_prepared:   'Your order is being prepared.',
      ready_for_pickup: 'Your order is ready for pickup!',
      out_for_delivery: 'Your order is on its way!',
      completed:        'Your order is complete. Thanks for visiting!',
      cancelled:        'Your order has been cancelled.',
      refunded:         'Your order has been refunded.',
    };
    const msg = STATUS_MSG[status];
    if (order && msg) {
      notifyUser(order.userId, 'order_status', 'Butterfield Cookies', msg,
        { orderId: order.id, status, screen: '/(customer)/orders' }).catch(() => {});
    }

    // ── On cancellation: restore claimed reward + reverse loyalty points earned ──
    // Guard: only run once — skip if order was already cancelled before this call
    if (status === 'cancelled' && previousStatus !== 'cancelled' && order) {
      try {
        await db.update(claimedRewardsTable)
          .set({ status: 'available', redeemedAt: null, orderId: null })
          .where(and(
            eq(claimedRewardsTable.orderId, order.id),
            eq(claimedRewardsTable.status, 'redeemed'),
          ));
      } catch (err: any) {
        req.log.error({ err, orderId: order.id }, 'Failed to restore claimed reward on order cancellation');
      }
      // Reverse loyalty points earned from this order so the balance stays accurate
      if (order.loyaltyPointsEarned > 0) {
        try {
          await recordLoyaltyPoints({
            userId: order.userId,
            pointsDelta: -order.loyaltyPointsEarned,
            orderId: order.id,
            description: 'Order cancelled — points reversed',
          });
        } catch (err: any) {
          req.log.error({ err, orderId: order.id }, 'Failed to reverse loyalty points on order cancellation');
        }
      }

      try {
        const coffeeStampCount = await countCoffeeItemsFromOrderItems(order.items);
        if (coffeeStampCount > 0) {
          await reverseCoffeeStamps({
            userId: order.userId,
            stampsToRemove: coffeeStampCount,
            source: 'order_cancel',
            orderId: order.id,
            description: 'Order cancelled — coffee stamps reversed',
          });
        }
      } catch (err: any) {
        req.log.error({ err, orderId: order.id }, 'Failed to reverse coffee stamps on order cancellation');
      }
    }

    return res.json({ data: order });
  },
);

export default router;
