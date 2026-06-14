import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ordersTable, customerProfilesTable, storeSettingsTable, discountCodesTable, discountCodeUsagesTable, claimedRewardsTable, storesTable, usersTable } from '@workspace/db';
import { eq, desc, sql, and, inArray, isNull } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { sendNotification, notifyUser } from '../lib/notificationService.js';
import { sendEmail, buildOrderConfirmationEmail, buildOrderReceiptEmail } from '../lib/emailService.js';
import { applyCoffeeStamps, getOrCreateCustomerLoyaltyProfile, LOYALTY_POINT_VALUE_CENTS, recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { countCoffeeItemsFromOrderItems, hasAwardedCoffeeStampsForOrder } from '../lib/orderLoyaltyUtils.js';
import { computeLoyaltyTierFromSpend } from '../lib/loyaltyTierSettings.js';
import { prepareRetailCheckout } from '../lib/retailCheckout.js';
import { ensureStoreConfigSchemaReady } from '../lib/ensureStoreConfigSchemaReady.js';
import { refundOrderStripePayment } from '../lib/stripeRefunds.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { getAllowedNextStatuses, getStatusMessage } from '../lib/orderStatusTransitions.js';

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
    channelId: 'butterfield-staff',
  });
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
  await ensureStoreConfigSchemaReady();
  const {
    items: rawItems, type, scheduledFor, notes, stripePaymentIntentId, loyaltyPointsUsed,
    deliveryAddress, deliveryPostcode, deliveryState, paymentMethod,
    discountCode, discountCodeId: clientDiscountCodeId, paymentMethodType,
    claimedRewardId, storeId, contactName, contactPhone, contactEmail,
    useFreeCoffeeReward,
  } = req.body;

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

  let items: any[];
  let claimedLoyaltyPoints = 0;
  let discountCodeAmountCents = 0;
  let validatedDiscountCodeId: string | null = null;
  let validatedDiscountCode: string | null = null;
  let claimedRewardData: { id: string; rewardType: string; linkedProductId: string | null; voucherValueCents: number | null } | null = null;
  let authorativeTotalCents = 0;
  let authorativeDiscountCents = 0;
  let computed: any;
  let resolvedOrderType: 'pickup' | 'delivery' = type === 'delivery' ? 'delivery' : 'pickup';
  let resolvedPaymentMethod: 'card' | 'pay_at_pickup' = paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card';
  let freeCoffeeRewardUsed = false;
  try {
    ({
      items,
      resolvedOrderType,
      resolvedPaymentMethod,
      claimedLoyaltyPoints,
      discountCodeAmountCents,
      validatedDiscountCodeId,
      validatedDiscountCode,
      claimedRewardData,
      authorativeTotalCents,
      authorativeDiscountCents,
      computed,
      freeCoffeeRewardUsed,
    } = await prepareRetailCheckout({
      userId: req.user!.id,
      userRole: req.user!.role,
      rawItems,
      orderType: type,
      paymentMethod,
      discountCode,
      claimedRewardId,
      loyaltyPointsUsed,
      markClaimAppliedToCart: false,
      useFreeCoffeeReward: useFreeCoffeeReward === true,
    }));
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  if (paymentMethod === 'pay_at_pickup' && stripePaymentIntentId) {
    return res.status(400).json({ error: 'Pay at pickup orders should not include a Stripe payment intent.' });
  }

  let resolvedStoreId: string | null = storeId ? String(storeId) : null;
  if (resolvedOrderType === 'pickup') {
    if (!resolvedStoreId) {
      const [profile] = await db.select({
        preferredStoreId: customerProfilesTable.preferredStoreId,
      }).from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
      resolvedStoreId = profile?.preferredStoreId ?? null;
    }
    if (!resolvedStoreId) {
      const [fallbackStore] = await db.select({ id: storesTable.id })
        .from(storesTable)
        .where(and(
          isNull(storesTable.deletedAt),
          eq(storesTable.pickupAvailable, true),
          eq(storesTable.status, 'open'),
        ))
        .orderBy(storesTable.sortOrder, storesTable.name);
      resolvedStoreId = fallbackStore?.id ?? null;
    }
  }

  let selectedStore: typeof storesTable.$inferSelect | null = null;
  if (resolvedStoreId) {
    const [store] = await db.select().from(storesTable).where(and(eq(storesTable.id, resolvedStoreId), isNull(storesTable.deletedAt)));
    selectedStore = store ?? null;
    if (!selectedStore) {
      return res.status(400).json({ error: 'Selected store could not be found.' });
    }
    if (resolvedOrderType === 'pickup' && !selectedStore.pickupAvailable) {
      return res.status(400).json({ error: 'This store is not currently accepting pickup orders.' });
    }
    if (resolvedOrderType === 'pickup' && selectedStore.status !== 'open') {
      return res.status(400).json({ error: 'This store is not currently open for pickup orders.' });
    }
  }

  // ── Cutoff time enforcement ────────────────────────────────────────────────
  const settingsRows = await db.select().from(storeSettingsTable);
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const cutoffTime = selectedStore?.orderCutoffTime ?? settings['order_cutoff_time'] ?? '';
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
  const orderNumber = await generateOrderNumber();
  const pointsEarned = Math.floor(authorativeTotalCents / 100);
  let order!: typeof ordersTable.$inferSelect;
  const isPaid = stripePaymentStatus === 'paid' || stripePaymentStatus === 'free' || stripePaymentStatus === 'pay_at_pickup';

  // An order requires acceptance (starts as 'scheduled') if:
  // - It is a delivery order (any delivery needs staff to confirm), or
  // - It is a pickup with a scheduledFor time (standard pickup, not ASAP)
  // Quick pickup (pickup + no scheduledFor) starts as 'received' and goes straight to preparation.
  const requiresAcceptance = resolvedOrderType === 'delivery' || (resolvedOrderType === 'pickup' && !!scheduledFor);
  // Keep isFutureDelivery for backwards-compatible notification branching
  const isFutureDelivery = requiresAcceptance;

  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(ordersTable).values({
        id: orderId,
        orderNumber,
        userId: req.user!.id,
        status: requiresAcceptance ? ('scheduled' as any) : 'received',
        type: resolvedOrderType,
        storeId: resolvedStoreId,
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
        contactName: contactName ?? null,
        contactPhone: contactPhone ?? null,
        contactEmail: contactEmail ?? null,
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

      // Atomic decrement of free coffee rewards
      if (freeCoffeeRewardUsed) {
        const decremented = await tx.update(customerProfilesTable)
          .set({
            freeCoffeeRewards: sql`${customerProfilesTable.freeCoffeeRewards} - 1`,
            freeCoffeesEarned: sql`GREATEST(0, ${customerProfilesTable.freeCoffeesEarned} - 1)`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(customerProfilesTable.userId, req.user!.id),
            sql`${customerProfilesTable.freeCoffeeRewards} > 0`,
          ))
          .returning({ freeCoffeeRewards: customerProfilesTable.freeCoffeeRewards });
        if (decremented.length === 0) {
          throw new Error('FREE_COFFEE_INSUFFICIENT');
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
    if (err?.message === 'FREE_COFFEE_INSUFFICIENT') {
      return res.status(409).json({ error: 'No free coffee rewards available. Please remove the free coffee option and try again.' });
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
        const newTier = await computeLoyaltyTierFromSpend(newSpent);
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

      }
    } catch (err: any) {
      req.log.error({ err, orderId }, 'Post-order loyalty update failed');
    }
  }

  // ── Notify staff and customer of the new order ────────────────────────────
  const itemCount = Array.isArray(items) ? items.length : 1;
  if (requiresAcceptance) {
    const scheduledDateLabel = scheduledFor
      ? new Date(scheduledFor).toLocaleDateString('en-AU', {
          timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short',
        })
      : null;
    const orderTypeLabel = resolvedOrderType === 'delivery' ? 'Delivery' : 'Pickup';
    const datePart = scheduledDateLabel ? ` ${scheduledDateLabel}` : '';
    void sendNotificationToInternalTeam(
      'new_scheduled_order',
      `Scheduled ${orderTypeLabel} Order`,
      `${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(authorativeTotalCents / 100).toFixed(2)} · ${orderTypeLabel}${datePart} — needs acceptance`,
      { orderId, screen: '/(director)/orders', filter: 'scheduled' },
    ).catch((err) => req.log.warn({ err, orderId }, 'Scheduled order internal notification failed'));

    const customerMsg = scheduledDateLabel
      ? `Your ${resolvedOrderType === 'delivery' ? 'delivery' : 'pickup'} for ${scheduledDateLabel} has been placed and is awaiting confirmation.`
      : 'Your order has been placed and is awaiting confirmation.';
    void notifyUser(
      req.user!.id,
      'order_scheduled',
      'Order Placed',
      customerMsg,
      { orderId, screen: `/(customer)/track/${orderId}` },
    ).catch((err) => req.log.warn({ err, orderId }, 'Scheduled order customer notification failed'));
  } else {
    // Quick pickup — immediate, no acceptance needed
    void sendNotificationToInternalTeam(
      'new_order',
      'New Order In',
      `${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(authorativeTotalCents / 100).toFixed(2)} · Pickup`,
      { orderId, screen: '/(staff)/orders' },
    ).catch((err) => req.log.warn({ err, orderId }, 'Internal order notification failed'));

    void notifyUser(
      req.user!.id,
      'order_confirmed',
      'Order Received',
      'We\'ve got your order and will have it ready soon!',
      { orderId, screen: `/(customer)/track/${orderId}` },
    ).catch((err) => req.log.warn({ err, orderId }, 'Customer order notification failed'));
  }

  // ── Send order confirmation email ─────────────────────────────────────────
  void (async () => {
    try {
      const [user] = await db
        .select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, req.user!.id));
      if (user?.email) {
        const orderItems = Array.isArray(order.items) ? (order.items as any[]) : [];
        const appDomain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? process.env.REPLIT_DEV_DOMAIN ?? null;
        const emailItems = orderItems.map((i: any) => {
          const priceEntry = computed.itemizedCents.find(
            (ic: any) => ic.productId === i.productId && (ic.variantId ?? null) === (i.variantId ?? null),
          );
          return {
            name: i.name ?? 'Item',
            quantity: i.quantity ?? 1,
            isFreeReward: i.isFreeReward ?? false,
            unitPriceCents: priceEntry?.unitCents,
            lineCents: priceEntry?.lineCents,
          };
        });
        const html = buildOrderConfirmationEmail({
          customerName: user.name,
          orderNumber: order.orderNumber ?? '',
          shortOrderId: order.id.slice(-6).toUpperCase(),
          items: emailItems,
          totalCents: order.totalCents,
          loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
          orderType: order.type as 'pickup' | 'delivery',
          scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
          storeName: selectedStore?.name ?? null,
          date: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          trackingUrl: appDomain ? `https://${appDomain}` : null,
          paymentMethodType: resolvedPaymentMethod,
        });
        const emailSubject = resolvedPaymentMethod === 'pay_at_pickup'
          ? `Order Received — Pay at Pickup · #${order.orderNumber || order.id.slice(-6).toUpperCase()}`
          : `Order confirmed — #${order.orderNumber || order.id.slice(-6).toUpperCase()}`;
        await sendEmail({
          to: user.email,
          subject: emailSubject,
          html,
        });
      }
    } catch (err) {
      req.log.warn({ err, orderId: order.id }, 'Order confirmation email failed');
    }
  })();

  return res.status(201).json({ data: order });
});

// ── Status updates are restricted to staff and management roles ───────────
router.patch(
  '/:id/status',
  requireRole('staff', 'director', 'manager', 'master'),
  async (req, res) => {
    const { status } = req.body;
    const allValidStatuses = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'refunded', 'scheduled', 'accepted'];
    if (!allValidStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Read current order (type + status + scheduledFor) BEFORE updating
    const [currentOrder] = await db
      .select({
        id: ordersTable.id,
        status: ordersTable.status,
        type: ordersTable.type,
        scheduledFor: ordersTable.scheduledFor,
      })
      .from(ordersTable)
      .where(eq(ordersTable.id, String(req.params.id)));
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const previousStatus = currentOrder.status;

    // Enforce type-aware transitions (cancel/refund are always override-allowed)
    const allowed = getAllowedNextStatuses(previousStatus, currentOrder.type, currentOrder.scheduledFor);
    if (!allowed.has(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${previousStatus}' to '${status}' for this order type.`,
      });
    }

    const [order] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.id, String(req.params.id)))
      .returning();

    const msg = getStatusMessage(status, currentOrder.type, currentOrder.scheduledFor);
    if (order && msg) {
      notifyUser(order.userId, 'order_status', 'Butterfield Cookies', msg,
        { orderId: order.id, status, screen: `/(customer)/track/${order.id}` }).catch(() => {});
    }

    // ── Award coffee stamps only when the order is completed ───────────────────
    // App Sales coffee stamps must not be granted on acceptance, preparation,
    // or ready-for-pickup. They are earned exactly once when the order reaches
    // the terminal "completed" state.
    const isCompletion = status === 'completed';
    if (isCompletion && order) {
      try {
        const coffeeCount = await countCoffeeItemsFromOrderItems(order.items);
        if (coffeeCount > 0) {
          if (!(await hasAwardedCoffeeStampsForOrder(order.id))) {
            await applyCoffeeStamps({
              userId: order.userId,
              stampsToAdd: coffeeCount,
              source: 'in_app_order',
              orderId: order.id,
              description: `Coffee completed — Order #${order.id.slice(0, 8)}`,
            });
          }
        }
      } catch (err: any) {
        req.log.error({ err, orderId: order.id }, 'Failed to award coffee stamps on order completion');
      }
    }

    // ── Send receipt email when order is completed ────────────────────────────
    if (status === 'completed' && order) {
      void (async () => {
        try {
          const [user] = await db
            .select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, order.userId));
          if (user?.email) {
            const [profile] = await db
              .select({ loyaltyPoints: customerProfilesTable.loyaltyPoints })
              .from(customerProfilesTable)
              .where(eq(customerProfilesTable.userId, order.userId));
            const orderItems = Array.isArray(order.items) ? (order.items as any[]) : [];
            const appDomain = process.env.REPLIT_DOMAINS?.split(',')[0] ?? process.env.REPLIT_DEV_DOMAIN ?? null;
            const receiptEmailItems = orderItems.map((i: any) => ({
              name: i.name ?? 'Item',
              quantity: i.quantity ?? 1,
              isFreeReward: i.isFreeReward ?? false,
              unitPriceCents: typeof i.unitPriceCents === 'number' ? i.unitPriceCents : undefined,
              lineCents: typeof i.lineCents === 'number'
                ? i.lineCents
                : (typeof i.unitPriceCents === 'number' ? i.unitPriceCents * (i.quantity ?? 1) : undefined),
            }));
            const html = buildOrderReceiptEmail({
              customerName: user.name,
              orderNumber: order.orderNumber ?? '',
              shortOrderId: order.id.slice(-6).toUpperCase(),
              items: receiptEmailItems,
              totalCents: order.totalCents,
              loyaltyPointsEarned: order.loyaltyPointsEarned ?? 0,
              loyaltyPointsBalance: profile?.loyaltyPoints ?? 0,
              orderType: order.type as 'pickup' | 'delivery',
              scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
              date: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
              orderUrl: appDomain ? `https://${appDomain}` : null,
            });
            await sendEmail({
              to: user.email,
              subject: `Your Butterfield receipt — #${order.orderNumber || order.id.slice(-6).toUpperCase()}`,
              html,
            });
          }
        } catch (err) {
          req.log.warn({ err, orderId: order.id }, 'Order receipt email failed');
        }
      })();
    }

    // ── On cancellation: restore claimed reward + reverse loyalty points earned ──
    // Guard: only run once — skip if order was already cancelled before this call
    const isCancelOrRefund = (status === 'cancelled' || status === 'refunded');
    const wasAlreadyCancelledOrRefunded = previousStatus === 'cancelled' || previousStatus === 'refunded';
    if (isCancelOrRefund && !wasAlreadyCancelledOrRefunded && order) {
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
            description: `Order ${status} — points reversed`,
          });
        } catch (err: any) {
          req.log.error({ err, orderId: order.id }, 'Failed to reverse loyalty points on order cancellation');
        }
      }

      try {
        const coffeeStampCount = await countCoffeeItemsFromOrderItems(order.items);
        if (coffeeStampCount > 0) {
          // Only reverse stamps if they were actually awarded for this order.
          // Stamps are now awarded at the fulfillment milestone (ready/completed),
          // so cancellations before that point must not reverse anything.
          if (await hasAwardedCoffeeStampsForOrder(order.id)) {
            await reverseCoffeeStamps({
              userId: order.userId,
              stampsToRemove: coffeeStampCount,
              source: status === 'refunded' ? 'order_refund' : 'order_cancel',
              orderId: order.id,
              description: `Order ${status} — coffee stamps reversed`,
            });
          }
        }
      } catch (err: any) {
        req.log.error({ err, orderId: order.id }, 'Failed to reverse coffee stamps on order cancellation');
      }

      try {
        await refundOrderStripePayment({
          orderId: order.id,
          stripePaymentIntentId: order.stripePaymentIntentId ?? null,
          stripePaymentStatus: order.stripePaymentStatus ?? null,
          log: req.log,
        });
      } catch (err: any) {
        req.log.warn({ err, orderId: order.id }, 'Stripe refund failed or skipped on order cancellation');
      }
    }

    return res.json({ data: order });
  },
);

export default router;
