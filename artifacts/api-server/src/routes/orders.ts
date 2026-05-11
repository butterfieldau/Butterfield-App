import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, ordersTable, customerProfilesTable, loyaltyTransactionsTable, storeSettingsTable } from '@workspace/db';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { notifyRole, notifyUser } from '../lib/notificationService.js';
import { computeOrderTotal } from '../lib/orderPricing.js';

const router = Router();

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
  const { items, type, scheduledFor, notes, stripePaymentIntentId, loyaltyPointsUsed, deliveryAddress, deliveryPostcode, deliveryState } = req.body;
  if (!items?.length) {
    return res.status(400).json({ error: 'Items are required' });
  }

  // ── Sydney-only delivery enforcement ─────────────────────────────────────
  if (type === 'delivery') {
    const state = (deliveryState ?? '').toString().trim().toUpperCase();
    const pc    = parseInt((deliveryPostcode ?? '').toString().trim(), 10);
    if (state !== 'NSW' || isNaN(pc) || pc < 2000 || pc > 2999) {
      return res.status(400).json({ error: 'Delivery is only available within Sydney (NSW postcodes 2000–2999).' });
    }
  }

  // ── Validate loyalty points claimed ───────────────────────────────────────
  let claimedLoyaltyPoints = Math.max(0, Math.floor(loyaltyPointsUsed ?? 0));
  if (claimedLoyaltyPoints > 0) {
    const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
    if (!profile || profile.loyaltyPoints < claimedLoyaltyPoints) {
      return res.status(400).json({ error: 'Insufficient loyalty points' });
    }
  }

  // ── Server-side price computation (client totals are not trusted) ─────────
  let computed: Awaited<ReturnType<typeof computeOrderTotal>>;
  try {
    computed = await computeOrderTotal(
      items,
      type === 'delivery' ? 'delivery' : 'pickup',
      claimedLoyaltyPoints,
    );
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  const authorativeTotalCents = computed.totalCents;
  const authorativeDiscountCents = computed.discountCents;

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
  // When a payment intent ID is supplied, the server MUST verify with Stripe that:
  //   1. The intent has not already been used to create another order (replay guard)
  //   2. The intent belongs to the authenticated user (metadata.userId)
  //   3. The intent has status 'succeeded'
  //   4. The charged amount matches the server-computed total (within 1 cent)
  // Any failure rejects the order — the client cannot self-certify payment.
  let stripePaymentStatus: 'pending' | 'paid' = 'pending';
  if (stripePaymentIntentId) {
    // ── Replay guard: reject if this PI is already linked to any order ────
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

  // ── Insert order with server-authoritative values ─────────────────────────
  // The DB has a partial unique index on stripe_payment_intent_id (WHERE NOT NULL).
  // This is the hard, atomic guard against replay — any concurrent request that
  // races past the pre-check above will be caught here with a 23505 violation.
  const orderId = randomUUID();
  const pointsEarned = Math.floor(authorativeTotalCents / 100);
  let order: typeof ordersTable.$inferSelect;
  try {
    const [inserted] = await db.insert(ordersTable).values({
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
      loyaltyPointsEarned: stripePaymentStatus === 'paid' ? pointsEarned : 0,
      loyaltyPointsUsed: stripePaymentStatus === 'paid' ? claimedLoyaltyPoints : 0,
      discountCents: authorativeDiscountCents,
      deliveryAddress,
    }).returning();
    order = inserted;
  } catch (err: any) {
    if (err?.code === '23505' && err?.constraint_name?.includes('stripe_payment_intent_id')) {
      return res.status(409).json({ error: 'Payment intent has already been used' });
    }
    throw err;
  }

  // ── Update customer loyalty profile — only for confirmed paid orders ───────
  // Pending/unpaid orders do not award loyalty points or increment spend, to
  // prevent loyalty inflation via unverified payment claims.
  if (stripePaymentStatus === 'paid') {
    const [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, req.user!.id));
    if (profile) {
      const newPoints = profile.loyaltyPoints + pointsEarned - claimedLoyaltyPoints;
      const newSpent = profile.totalSpentCents + authorativeTotalCents;
      const newTier = newSpent >= 100000 ? 'platinum' : newSpent >= 50000 ? 'gold' : newSpent >= 15000 ? 'silver' : 'bronze';
      await db.update(customerProfilesTable).set({
        loyaltyPoints: Math.max(0, newPoints),
        totalSpentCents: newSpent,
        loyaltyTier: newTier,
        totalVisits: profile.totalVisits + 1,
        stampCount: (profile.stampCount + 1) % 10,
      }).where(eq(customerProfilesTable.userId, req.user!.id));
      await db.insert(loyaltyTransactionsTable).values({
        id: randomUUID(),
        userId: req.user!.id,
        points: pointsEarned,
        type: 'earn',
        description: `Order #${orderId.slice(0, 8)}`,
        referenceId: orderId,
      });
    }
  }

  // ── Notify staff of new order (fire-and-forget) ───────────────────────────
  const itemCount = Array.isArray(items) ? items.length : 1;
  notifyRole('staff', 'new_order', 'New Order In', `${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(authorativeTotalCents / 100).toFixed(2)} · ${type === 'delivery' ? 'Delivery' : 'Pickup'}`,
    { orderId, screen: '/(staff)/orders' }).catch(() => {});

  notifyUser(req.user!.id, 'order_confirmed', 'Order Received 🍪', 'We\'ve got your order and will have it ready soon!',
    { orderId, screen: '/(customer)/orders' }).catch(() => {});

  return res.status(201).json({ data: order });
});

// ── Status updates are restricted to staff and management roles ───────────
// Customers must not be able to advance or cancel their own orders or others'.
router.patch(
  '/:id/status',
  requireRole('staff', 'director', 'manager', 'master'),
  async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const [order] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.id, String(req.params.id)))
      .returning();

    const STATUS_MSG: Record<string, string> = {
      being_prepared:   'Your order is being prepared. ☕',
      ready_for_pickup: 'Your order is ready for pickup! 🎉',
      out_for_delivery: 'Your order is on its way! 🚚',
      completed:        'Your order is complete. Thanks for visiting! 🍪',
      cancelled:        'Your order has been cancelled.',
      refunded:         'Your order has been refunded.',
    };
    const msg = STATUS_MSG[status];
    if (order && msg) {
      notifyUser(order.userId, 'order_status', 'Butterfield Cookies', msg,
        { orderId: order.id, status, screen: '/(customer)/orders' }).catch(() => {});
    }

    return res.json({ data: order });
  },
);

export default router;
