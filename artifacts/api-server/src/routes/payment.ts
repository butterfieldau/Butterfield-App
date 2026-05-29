import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { prepareRetailCheckout } from '../lib/retailCheckout.js';

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
  const { items: rawItems, orderType, discountCode, paymentMethod, claimedRewardId, loyaltyPointsUsed } = req.body;

  if (paymentMethod === 'pay_at_pickup') {
    return res.status(400).json({ error: 'Pay at pickup orders do not require a Stripe payment intent.' });
  }

  let validatedDiscountCode: string | null = null;
  let claimedLoyaltyPoints = 0;
  let rewardDiscountCents = 0;
  let totalDiscountCents = 0;
  let computed: { totalCents: number };
  try {
    ({
      validatedDiscountCode,
      claimedLoyaltyPoints,
      claimedRewardDiscountCents: rewardDiscountCents,
      totalDiscountCents,
      computed,
    } = await prepareRetailCheckout({
      userId: req.user!.id,
      userRole: req.user!.role,
      rawItems,
      orderType,
      paymentMethod: 'card',
      discountCode,
      claimedRewardId,
      loyaltyPointsUsed,
      markClaimAppliedToCart: true,
    }));
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not validate discount code' });
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
        loyaltyPointsUsed: String(claimedLoyaltyPoints),
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
