import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { computeOrderTotal } from '../lib/orderPricing.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { db, claimedRewardsTable, loyaltyRewardsTable } from '@workspace/db';
import { eq, and, inArray } from 'drizzle-orm';

const router = Router();

router.get('/config', async (_req, res) => {
  try {
    const { getStripePublishableKey } = await import('../stripeClient.js');
    const publishableKey = await getStripePublishableKey();
    return res.json({
      data: {
        publishableKey,
        merchantDisplayName: 'Butterfield Cookies',
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message ?? 'Could not load Stripe config',
    });
  }
});

router.use(requireAuth);

router.post('/payment-intent', async (req, res) => {
  const { items, orderType, discountCode, paymentMethod, claimedRewardId } = req.body;

  if (paymentMethod === 'pay_at_pickup') {
    return res.status(400).json({ error: 'Pay at pickup orders do not require a Stripe payment intent.' });
  }

  if (!items?.length) {
    return res.status(400).json({ error: 'Items are required to create a payment intent' });
  }

  let totalDiscountCents = 0;
  let validatedDiscountCode: string | null = null;
  let rewardDiscountCents = 0;
  // Strip any client-supplied isFreeReward flags — only the server may set this
  let enrichedItems = (items as any[]).map(({ isFreeReward: _f, ...rest }: any) => rest);

  // ── Validate claimed reward and apply its effect to pricing ───────────────
  if (claimedRewardId && typeof claimedRewardId === 'string') {
    const claimRows = await db.select().from(claimedRewardsTable)
      .where(and(
        eq(claimedRewardsTable.userId, req.user!.id),
        inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
      ));
    const claimedRow = claimRows.find(r => r.id === claimedRewardId);

    if (!claimedRow) {
      return res.status(400).json({ error: 'Claimed reward not found or already used' });
    }

    const [rewardRow] = await db.select({ rewardType: loyaltyRewardsTable.rewardType, linkedProductId: loyaltyRewardsTable.linkedProductId })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, claimedRow.rewardId));

    const rewardType = rewardRow?.rewardType ?? 'item_reward';
    if (rewardType === 'money_voucher') {
      rewardDiscountCents = claimedRow.voucherValueCents ?? 0;
    } else if (rewardType === 'item_reward' && rewardRow?.linkedProductId) {
      // Add the free item to the items list for pricing — isFreeReward=true so it's priced at $0
      enrichedItems = [...items, { productId: rewardRow.linkedProductId, quantity: 1, isFreeReward: true }];
    }
  }

  try {
    const base = await computeOrderTotal(enrichedItems, orderType ?? 'pickup', 0, 'card');

    if (discountCode && typeof discountCode === 'string') {
      const validated = await validateDiscountCode(
        discountCode,
        req.user!.id,
        req.user!.role,
        base.subtotalCents,
        orderType ?? 'pickup',
      );
      totalDiscountCents = validated.discountAmountCents;
      validatedDiscountCode = validated.code;
    }
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not validate discount code' });
  }

  totalDiscountCents += rewardDiscountCents;

  let computed: Awaited<ReturnType<typeof computeOrderTotal>>;
  try {
    computed = await computeOrderTotal(
      enrichedItems,
      orderType ?? 'pickup',
      totalDiscountCents,
      'card',
    );
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total' });
  }

  if (computed.totalCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least 50 cents' });
  }

  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user!.id,
        computedAmountCents: String(computed.totalCents),
        discountCode: validatedDiscountCode ?? '',
        discountCents: String(totalDiscountCents),
        claimedRewardId: claimedRewardId ?? '',
        rewardDiscountCents: String(rewardDiscountCents),
      },
    });
    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amountCents: computed.totalCents,
      discountAmountCents: totalDiscountCents,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Payment intent creation failed');
    return res.status(500).json({ error: 'Payment processing unavailable. Please try again.' });
  }
});

export default router;
