import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ordersTable, customerProfilesTable, storeSettingsTable, discountCodesTable, discountCodeUsagesTable, claimedRewardsTable, storesTable, usersTable, staffProfilesTable } from '@workspace/db';
import { eq, desc, sql, and, inArray, isNull } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { sendNotification, notifyUser } from '../lib/notificationService.js';
import { sendEmail, buildOrderConfirmationEmail, buildOrderReceiptEmail } from '../lib/emailService.js';
import { applyCoffeeStamps, calculateLoyaltyPointsForEligibleSpend, ensureLoyaltySchemaReady, getOrCreateCustomerLoyaltyProfile, recordLoyaltyPoints, reverseCoffeeStamps } from '../lib/loyaltyIdentity.js';
import { countCoffeeItemsFromOrderItems, getOutstandingCoffeeStampsForOrder, hasAwardedCoffeeStampsForOrder } from '../lib/orderLoyaltyUtils.js';
import { refreshCustomerAnnualLoyaltyTier } from '../lib/loyaltyTierSettings.js';
import { prepareRetailCheckout } from '../lib/retailCheckout.js';
import { ensureStoreConfigSchemaReady } from '../lib/ensureStoreConfigSchemaReady.js';
import { refundOrderStripePayment, refundStripePaymentIntentAmount } from '../lib/stripeRefunds.js';
import { notifyRole } from '../lib/notificationService.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { getAllowedNextStatuses, getStatusMessage } from '../lib/orderStatusTransitions.js';
import { buildConfirmationSavings } from '../lib/orderConfirmationSavings.js';
import { getSydneyNow } from '../lib/sydneyTime.js';

const router = Router();

async function sendNotificationToInternalTeam(
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  // Directors / managers / masters always receive order notifications.
  const internalUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, ['director', 'manager', 'master']));

  // Staff: only those explicitly granted canViewOrders.
  const authorisedStaff = await db
    .select({ id: staffProfilesTable.userId })
    .from(staffProfilesTable)
    .where(eq(staffProfilesTable.canViewOrders, true));

  const userIds = [
    ...new Set([
      ...internalUsers.map((u) => u.id),
      ...authorisedStaff.map((u) => u.id),
    ]),
  ];

  if (userIds.length === 0) return;

  return sendNotification({
    userIds,
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
  await ensureLoyaltySchemaReady();
  const {
    items: rawItems, type, scheduledFor, notes, stripePaymentIntentId, loyaltyPointsUsed,
    deliveryAddress, deliveryPostcode, deliveryState, paymentMethod,
    discountCode, discountCodeId: clientDiscountCodeId, paymentMethodType,
    claimedRewardId, storeId, contactName, contactPhone, contactEmail,
    useFreeCoffeeReward, tableNumber,
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

  // ── Table order validation ─────────────────────────────────────────────────
  if (type === 'table') {
    if (!tableNumber || typeof tableNumber !== 'string' || !tableNumber.trim()) {
      return res.status(400).json({ error: 'tableNumber is required for table orders.' });
    }
    if (!storeId || typeof storeId !== 'string' || !storeId.trim()) {
      return res.status(400).json({ error: 'storeId is required for table orders.' });
    }
  }

  let items: any[];
  let claimedLoyaltyPoints = 0;
  let discountCodeAmountCents = 0;
  let validatedDiscountCodeId: string | null = null;
  let validatedDiscountCode: string | null = null;
  let claimedRewardData: { id: string; rewardType: string; rewardName: string; linkedProductId: string | null; voucherValueCents: number | null } | null = null;
  let authorativeTotalCents = 0;
  let authorativeDiscountCents = 0;
  let tierEligibleSpendCents = 0;
  let computed: any;
  let resolvedOrderType: 'pickup' | 'delivery' | 'table' = type === 'delivery' ? 'delivery' : type === 'table' ? 'table' : 'pickup';
  let resolvedPaymentMethod: 'card' | 'pay_at_pickup' = paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card';
  let freeCoffeeRewardUsed = false;
  let claimedRewardDiscountCents = 0;
  let freeCoffeeDiscountCents = 0;
  let birthdayCookieDiscountCents = 0;
  try {
    // Table orders are priced identically to pickup (no delivery fee).
    // We pass the resolved checkout type ('pickup') separately from the DB order type ('table')
    // so prepareRetailCheckout applies the right fee logic without overwriting resolvedOrderType.
    const checkoutOrderType = resolvedOrderType === 'table' ? 'pickup' : resolvedOrderType;
    ({
      items,
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
      claimedRewardDiscountCents,
      freeCoffeeDiscountCents,
      birthdayCookieDiscountCents,
    } = await prepareRetailCheckout({
      userId: req.user!.id,
      userRole: req.user!.role,
      rawItems,
      orderType: checkoutOrderType,
      paymentMethod,
      discountCode,
      claimedRewardId,
      loyaltyPointsUsed,
      markClaimAppliedToCart: false,
      useFreeCoffeeReward: useFreeCoffeeReward === true,
    }));
    // Qualifying spend is the gross catalog subtotal, excluding delivery and
    // payment fees. Reward-funded free items remain qualifying purchases.
    tierEligibleSpendCents = Math.max(
      0,
      computed.subtotalCents + freeCoffeeDiscountCents + birthdayCookieDiscountCents,
    );
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  // Enrich stored item JSONB with server-computed unitCents + lineCents.
  // This ensures analytics queries on the items column always find reliable price
  // data regardless of what the client sent — critical for Build a Box items whose
  // virtual productId has no catalog entry to fall back on.
  items = items.map((item: any, idx: number) => {
    const priced = computed.itemizedCents[idx];
    if (!priced) return item;
    return {
      ...item,
      unitCents: priced.unitCents,
      lineCents: priced.lineCents,
      unitPriceCents: priced.unitCents,
      totalPriceCents: priced.lineCents,
    };
  });

  if (paymentMethod === 'pay_at_pickup' && stripePaymentIntentId) {
    return res.status(400).json({ error: 'Pay at pickup orders should not include a Stripe payment intent.' });
  }

  // ── Build a Box slot-count validation ─────────────────────────────────────
  for (const item of items) {
    const pid = (item.productId ?? '') as string;
    const boxMatch = /^build-a-box-(\d+)$/.exec(pid);
    if (!boxMatch) continue;

    const declaredSize = parseInt(boxMatch[1], 10);
    const selectedOptions = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];
    const boxContents = (selectedOptions as Array<{ groupId?: string; optionName?: string }>)
      .filter(o => o.groupId === 'box-contents');

    let filledSlots = 0;
    for (const opt of boxContents) {
      // optionName format: "N× Cookie Name" (× is U+00D7) or plain "N× ..."
      const qtyMatch = /^(\d+)[×x]/.exec(opt.optionName ?? '');
      if (qtyMatch) {
        filledSlots += parseInt(qtyMatch[1], 10);
      } else {
        filledSlots += 1;
      }
    }

    if (filledSlots !== declaredSize) {
      return res.status(400).json({
        error: `Box contents don't match the selected box size (expected ${declaredSize} cookies, got ${filledSlots}).`,
      });
    }
  }

  let resolvedStoreId: string | null = storeId ? String(storeId) : null;
  if (resolvedOrderType === 'pickup' || resolvedOrderType === 'table') {
    if (!resolvedStoreId) {
      const [profile] = await db.select({
        preferredStoreId: customerProfilesTable.preferredStoreId,
      }).from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
      resolvedStoreId = profile?.preferredStoreId ?? null;
    }
    if (!resolvedStoreId && resolvedOrderType === 'pickup') {
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
    const syd  = getSydneyNow();
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

  // Reject card orders that omit a payment intent — prevents unpaid orders from being created.
  if (resolvedPaymentMethod === 'card' && authorativeTotalCents > 0 && !stripePaymentIntentId) {
    return res.status(400).json({ error: 'A Stripe payment intent is required for card payments.' });
  }

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
  const pointsEarned = calculateLoyaltyPointsForEligibleSpend(tierEligibleSpendCents);
  let order!: typeof ordersTable.$inferSelect;
  const isPaid = stripePaymentStatus === 'paid' || stripePaymentStatus === 'free' || stripePaymentStatus === 'pay_at_pickup';

  // An order requires acceptance (starts as 'scheduled') if:
  // - It is a delivery order (any delivery needs staff to confirm), or
  // - It is a pickup with a scheduledFor time (standard pickup, not ASAP)
  // Quick pickup (pickup + no scheduledFor) and table orders start as 'received' — immediate preparation.
  const requiresAcceptance = resolvedOrderType === 'delivery' || (resolvedOrderType === 'pickup' && !!scheduledFor);
  // Keep isFutureDelivery for backwards-compatible notification branching
  const isFutureDelivery = requiresAcceptance;
  // DB schema constrains type to 'pickup' | 'delivery'; table orders store as 'pickup' in that
  // column and are distinguished by source='dine_in' + tableNumber.
  const dbOrderType: 'pickup' | 'delivery' = resolvedOrderType === 'delivery' ? 'delivery' : 'pickup';

  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(ordersTable).values({
        id: orderId,
        orderNumber,
        userId: req.user!.id,
        status: requiresAcceptance ? ('scheduled' as any) : 'received',
        type: dbOrderType,
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
        tierEligibleSpendCents,
        discountCode: validatedDiscountCode,
        discountCodeId: validatedDiscountCodeId,
        paymentMethodType: paymentMethodType as string ?? null,
        deliveryAddress,
        contactName: contactName ?? null,
        contactPhone: contactPhone ?? null,
        contactEmail: contactEmail ?? null,
        source: resolvedOrderType === 'table' ? 'dine_in' : 'customer_app',
        tableNumber: resolvedOrderType === 'table' ? (tableNumber as string) : null,
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
        await db.update(customerProfilesTable).set({
          totalSpentCents: profile.totalSpentCents + authorativeTotalCents,
          totalVisits: profile.totalVisits + 1,
          updatedAt: new Date(),
        }).where(eq(customerProfilesTable.userId, req.user!.id));

        // Earning and spending are distinct wallet transactions. Neither changes
        // annual tier qualification, which is rebuilt from eligible orders below.
        await recordLoyaltyPoints({
          userId: req.user!.id,
          pointsDelta: pointsEarned,
          orderId,
          description: `Order #${orderId.slice(0, 8)} — fixed rewards earning`,
        });
        if (claimedLoyaltyPoints > 0) {
          await recordLoyaltyPoints({
            userId: req.user!.id,
            pointsDelta: -claimedLoyaltyPoints,
            orderId,
            description: `Order #${orderId.slice(0, 8)} — points redeemed`,
          });
        }
        await refreshCustomerAnnualLoyaltyTier(req.user!.id);
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
          weekday: 'short', day: 'numeric', month: 'short',
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

  } else {
    // Quick pickup or table order — immediate, no acceptance needed
    const immediateTypeLabel = resolvedOrderType === 'table'
      ? `Table ${tableNumber as string}`
      : 'Pickup';
    void sendNotificationToInternalTeam(
      'new_order',
      'New Order In',
      `${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(authorativeTotalCents / 100).toFixed(2)} · ${immediateTypeLabel}`,
      { orderId, screen: '/(staff)/orders' },
    ).catch((err) => req.log.warn({ err, orderId }, 'Internal order notification failed'));
  }

  // ── Compute reward savings for email / response ────────────────────────────
  const emailRewardSavingsCents = claimedRewardDiscountCents > 0
    ? claimedRewardDiscountCents
    : birthdayCookieDiscountCents > 0
      ? birthdayCookieDiscountCents
      : freeCoffeeDiscountCents > 0
        ? freeCoffeeDiscountCents
        : 0;
  const emailRewardName = claimedRewardData?.rewardName
    ?? (freeCoffeeRewardUsed ? 'Free Coffee' : null);

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
        // Use index-based mapping: order.items and computed.itemizedCents are derived from
        // the same items array in the same order. Using .find() by productId+variantId fails
        // when a cookie line is split into paid + free portions (both share the same ids) —
        // .find() returns the first (paid) entry for both, giving the free item a non-zero price.
        const emailItems = orderItems.map((i: any, idx: number) => {
          const priceEntry = computed.itemizedCents[idx];
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
          rewardSavingsCents: emailRewardSavingsCents > 0 ? emailRewardSavingsCents : null,
          rewardName: emailRewardName,
          orderType: (resolvedOrderType === 'table' ? 'pickup' : resolvedOrderType) as 'pickup' | 'delivery',
          scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
          storeName: selectedStore?.name ?? null,
          date: new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          trackingUrl: appDomain ? `https://${appDomain}` : null,
          paymentMethodType: resolvedPaymentMethod,
        });
        const emailSubject = resolvedPaymentMethod === 'pay_at_pickup'
          ? `Order Received — Pay at Pickup · #${order.orderNumber || order.id.slice(-6).toUpperCase()}`
          : `Order confirmed — #${order.orderNumber || order.id.slice(-6).toUpperCase()}`;
        const { success: confirmEmailSent, error: confirmEmailErr } = await sendEmail({
          to: user.email,
          subject: emailSubject,
          html,
        });
        if (!confirmEmailSent) {
          req.log.error({ orderId: order.id, to: user.email, template: 'order_confirmation', error: confirmEmailErr }, 'Order confirmation email failed to send');
        }
      }
    } catch (err) {
      req.log.warn({ err, orderId: order.id }, 'Order confirmation email failed');
    }
  })();

  const { rewardSavingsCents, freeCoffeeDiscountCents: confirmFreeCoffeeCents } =
    buildConfirmationSavings({ claimedRewardDiscountCents, birthdayCookieDiscountCents, freeCoffeeDiscountCents });

  const rewardName = claimedRewardData?.rewardName
    ?? (freeCoffeeRewardUsed ? 'Free Coffee' : null);

  return res.status(201).json({
    data: order,
    rewardSavingsCents,
    freeCoffeeDiscountCents: confirmFreeCoffeeCents,
    rewardName: rewardName ?? undefined,
  });
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
        req.log.info({ orderId: order.id, userId: order.userId, status, previousStatus, coffeeCount }, 'Orders route coffee stamp completion check');
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
              orderType: ((order.type as string) === 'table' ? 'pickup' : order.type) as 'pickup' | 'delivery',
              scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
              date: new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
              orderUrl: appDomain ? `https://${appDomain}` : null,
            });
            const { success: receiptSent, error: receiptErr } = await sendEmail({
              to: user.email,
              subject: `Your Butterfield receipt — #${order.orderNumber || order.id.slice(-6).toUpperCase()}`,
              html,
            });
            if (!receiptSent) {
              req.log.error({ orderId: order.id, to: user.email, template: 'order_receipt', error: receiptErr }, 'Order receipt email failed to send');
            }
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
      if (order.loyaltyPointsUsed > 0) {
        try {
          await recordLoyaltyPoints({
            userId: order.userId,
            pointsDelta: order.loyaltyPointsUsed,
            orderId: order.id,
            description: `Order ${status} — redeemed points restored`,
          });
        } catch (err: any) {
          req.log.error({ err, orderId: order.id }, 'Failed to restore redeemed points on order cancellation');
        }
      }

      try {
        // Only reverse stamps if the order was previously completed — stamps are
        // only awarded at completion, so a cancelled-before-completion order cannot
        // have stamps to reverse. This guards against draining stamps that belong
        // to a different completed order when an uncompleted order is cancelled.
        if (previousStatus === 'completed') {
          const outstandingStampCount = await getOutstandingCoffeeStampsForOrder(order.id);
          req.log.info({ orderId: order.id, userId: order.userId, status, previousStatus, outstandingStampCount }, 'Orders route coffee stamp reversal check');
          if (outstandingStampCount > 0) {
            await reverseCoffeeStamps({
              userId: order.userId,
              stampsToRemove: outstandingStampCount,
              source: status === 'refunded' ? 'order_refund' : 'order_cancel',
              orderId: order.id,
              description: `Order ${status} — coffee stamps reversed`,
            });
          }
        } else {
          req.log.info({ orderId: order.id, userId: order.userId, status, previousStatus }, 'Orders route coffee stamp reversal skipped — order was never completed');
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
      try {
        await refreshCustomerAnnualLoyaltyTier(order.userId);
      } catch (err: any) {
        req.log.error({ err, orderId: order.id }, 'Failed to refresh annual tier after order cancellation');
      }
    }

    return res.json({ data: order });
  },
);

// ── Order modification approval / decline (customer-facing) ─────────────────

// POST /:id/approve-modification — customer accepts proposed changes
router.post(
  '/:id/approve-modification',
  requireAuth,
  async (req, res) => {
    const { id } = req.params;
    const userId = (req as any).user?.id as string;

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.userId !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (order.status !== ('pending_customer_approval' as any)) {
      return res.status(400).json({ error: 'Order is not awaiting customer approval.' });
    }

    const expiresAt: Date | null = order.modificationExpiresAt ?? null;
    if (expiresAt && new Date() > expiresAt) {
      return res.status(400).json({ error: 'Modification approval window has expired.' });
    }

    const modifiedItems = order.modifiedItems;
    if (!modifiedItems) return res.status(400).json({ error: 'No modified items found.' });

    // Calculate new total from the server-stored re-priced items
    const newTotalCents = Array.isArray(modifiedItems)
      ? (modifiedItems as any[]).reduce((sum: number, i: any) => sum + (Number(i.lineCents ?? i.totalPriceCents ?? 0)), 0)
      : order.totalCents;
    // Approved changes replace the basket used for annual tier qualification.
    // These stored item totals are server-repriced product values and exclude
    // delivery/payment fees just like initial checkout qualification.
    const finalTierEligibleSpendCents = Array.isArray(modifiedItems)
      ? Math.max(0, (modifiedItems as any[]).reduce(
        (sum: number, item: any) => sum + Number(item.lineCents ?? item.totalPriceCents ?? 0),
        0,
      ))
      : (order.tierEligibleSpendCents ?? order.totalCents);

    const deltaCents: number = order.modificationTotalDeltaCents ?? 0;

    // Issue partial Stripe refund if the new total is lower
    if (deltaCents < 0 && order.stripePaymentStatus === 'succeeded' && order.stripePaymentIntentId) {
      try {
        await refundStripePaymentIntentAmount({
          stripePaymentIntentId: order.stripePaymentIntentId,
          amountCents: Math.abs(deltaCents),
        });
      } catch (err: any) {
        req.log.warn({ err, orderId: id }, 'Partial Stripe refund failed on modification approval');
      }
    }

    // Determine what status to revert to
    const revertStatus = (order.type === 'pickup' && !order.scheduledFor) ? 'received' : 'scheduled';

    const [updated] = await db.update(ordersTable).set({
      items: modifiedItems as any,
      totalCents: newTotalCents,
      tierEligibleSpendCents: finalTierEligibleSpendCents,
      status: revertStatus as any,
      originalItems: null,
      modifiedItems: null,
      modificationReason: null,
      modificationExpiresAt: null,
      modificationTotalDeltaCents: null,
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id)).returning();
    await refreshCustomerAnnualLoyaltyTier(order.userId);

    // Notify staff
    notifyRole(
      'director',
      'order_modification_accepted',
      'Customer Accepted Order Changes',
      `Order ${id.slice(0, 8)} — customer accepted the changes, back in queue`,
      { orderId: id, screen: '/(director)/orders' },
    ).catch(() => {});

    return res.json({ data: updated });
  },
);

// POST /:id/decline-modification — customer cancels after seeing proposed changes
router.post(
  '/:id/decline-modification',
  requireAuth,
  async (req, res) => {
    const { id } = req.params;
    const userId = (req as any).user?.id as string;

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.userId !== userId) return res.status(403).json({ error: 'Forbidden.' });
    if (order.status !== ('pending_customer_approval' as any)) {
      return res.status(400).json({ error: 'Order is not awaiting customer approval.' });
    }

    const [updated] = await db.update(ordersTable).set({
      status: 'cancelled' as any,
      cancelReason: 'Customer declined order modification',
      originalItems: null,
      modifiedItems: null,
      modificationReason: null,
      modificationExpiresAt: null,
      modificationTotalDeltaCents: null,
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, id)).returning();
    await refreshCustomerAnnualLoyaltyTier(order.userId);

    // Issue full Stripe refund
    try {
      await refundOrderStripePayment({
        orderId: id,
        stripePaymentIntentId: order.stripePaymentIntentId ?? null,
        stripePaymentStatus: order.stripePaymentStatus ?? null,
        log: req.log,
      });
    } catch (err: any) {
      req.log.warn({ err, orderId: id }, 'Stripe refund failed on modification decline');
    }

    // Notify staff
    notifyRole(
      'director',
      'order_modification_declined',
      'Customer Declined Order Changes',
      `Order ${id.slice(0, 8)} was cancelled — customer declined the modification`,
      { orderId: id, screen: '/(director)/orders' },
    ).catch(() => {});

    return res.json({ data: updated });
  },
);

export default router;
