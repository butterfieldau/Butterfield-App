import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { computeOrderTotal } from '../lib/orderPricing.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { db, claimedRewardsTable, loyaltyRewardsTable } from '@workspace/db';
import { eq, and, inArray, sql } from 'drizzle-orm';

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

  let totalDiscountCents = 0;
  let validatedDiscountCode: string | null = null;
  let rewardDiscountCents = 0;
  // Strip any client-supplied isFreeReward flags — only the server may set this
  let enrichedItems = (items as any[] ?? []).map(({ isFreeReward: _f, ...rest }: any) => rest);

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

    // Enforce expiry — atomically transition to expired and reject
    if (claimedRow.expiresAt && claimedRow.expiresAt < new Date()) {
      await db.execute(
        sql`UPDATE claimed_rewards SET status='expired' WHERE id=${claimedRewardId} AND user_id=${req.user!.id} AND status IN ('available','applied_to_cart')`
      );
      return res.status(400).json({ error: 'This reward has expired' });
    }

    const [rewardRow] = await db.select({ rewardType: loyaltyRewardsTable.rewardType, linkedProductId: loyaltyRewardsTable.linkedProductId, name: loyaltyRewardsTable.name })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, claimedRow.rewardId));

    const rewardType = rewardRow?.rewardType ?? 'item_reward';
    const rewardName = rewardRow?.name ?? 'Free Reward';
    if (rewardType === 'money_voucher') {
      rewardDiscountCents = claimedRow.voucherValueCents ?? 0;
    } else if (rewardType === 'item_reward') {
      // Grant exactly ONE free unit — never make multi-quantity lines entirely free
      const lid = rewardRow?.linkedProductId ?? null;
      if (lid) {
        const existingIdx = enrichedItems.findIndex((i: any) => i.productId === lid && !i.isFreeReward);
        if (existingIdx >= 0) {
          const existingQty = Math.max(1, Math.floor(enrichedItems[existingIdx].quantity ?? 1));
          if (existingQty === 1) {
            enrichedItems[existingIdx] = { ...enrichedItems[existingIdx], isFreeReward: true };
          } else {
            enrichedItems[existingIdx] = { ...enrichedItems[existingIdx], quantity: existingQty - 1 };
            enrichedItems = [...enrichedItems, { productId: lid, name: rewardName, quantity: 1, isFreeReward: true }];
          }
        } else {
          // Item not in cart — inject as new free line (handles empty-cart reward checkout)
          enrichedItems = [...enrichedItems, { productId: lid, name: rewardName, quantity: 1, isFreeReward: true }];
        }
      } else {
        // No linked product — inject named placeholder
        enrichedItems = [...enrichedItems, { productId: `reward:${claimedRow.id}`, name: rewardName, quantity: 1, isFreeReward: true }];
      }
    }

    // Idempotently transition claim to applied_to_cart so server tracks checkout state
    if (claimedRow.status === 'available') {
      await db.execute(
        sql`UPDATE claimed_rewards SET status='applied_to_cart' WHERE id=${claimedRewardId} AND user_id=${req.user!.id} AND status='available'`
      );
    }
  }

  // Items must be present at this point — either client-supplied or injected by reward
  if (!enrichedItems.length) {
    return res.status(400).json({ error: 'Items are required to create a payment intent' });
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

  // Free orders (e.g. item_reward with empty cart) skip Stripe entirely
  if (computed.totalCents === 0) {
    return res.json({
      paymentRequired: false,
      clientSecret: null,
      paymentIntentId: null,
      amountCents: 0,
      discountAmountCents: totalDiscountCents,
    });
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
