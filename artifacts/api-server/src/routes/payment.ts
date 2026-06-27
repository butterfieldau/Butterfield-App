import { Router } from 'express';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';
import { prepareRetailCheckout } from '../lib/retailCheckout.js';

const router = Router();

async function getOrCreateStripeCustomer(userId: string, email: string, name: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      stripeCustomerId: usersTable.stripeCustomerId,
      email: usersTable.email,
      name: usersTable.name,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    throw new Error('User not found');
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const { getUncachableStripeClient } = await import('../stripeClient.js');
  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });

  await db
    .update(usersTable)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  return customer.id;
}

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

router.get('/methods', async (req, res) => {
  try {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const [customer, methods] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
    ]);

    const defaultPaymentMethodId =
      !('deleted' in customer) && typeof customer.invoice_settings.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : null;

    return res.json({
      data: methods.data.map((method) => ({
        id: method.id,
        brand: method.card?.brand ?? 'card',
        last4: method.card?.last4 ?? '0000',
        expMonth: method.card?.exp_month ?? null,
        expYear: method.card?.exp_year ?? null,
        isDefault: method.id === defaultPaymentMethodId,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, 'Could not load saved payment methods');
    return res.status(500).json({ error: 'Could not load saved payment methods' });
  }
});

router.post('/methods', async (req, res) => {
  const { paymentMethodId, setAsDefault } = req.body ?? {};
  if (!paymentMethodId) {
    return res.status(400).json({ error: 'paymentMethodId is required.' });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();

    const attached = await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }

    return res.status(201).json({
      data: {
        id: attached.id,
        brand: attached.card?.brand ?? 'card',
        last4: attached.card?.last4 ?? '0000',
        expMonth: attached.card?.exp_month ?? null,
        expYear: attached.card?.exp_year ?? null,
        isDefault: Boolean(setAsDefault),
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'Could not save payment method');
    return res.status(400).json({ error: err?.message ?? 'Could not save payment method' });
  }
});

router.patch('/methods/:id/default', async (req, res) => {
  try {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: req.params.id },
    });
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, 'Could not set default payment method');
    return res.status(400).json({ error: err?.message ?? 'Could not set default payment method' });
  }
});

router.delete('/methods/:id', async (req, res) => {
  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    await stripe.paymentMethods.detach(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, 'Could not remove payment method');
    return res.status(400).json({ error: err?.message ?? 'Could not remove payment method' });
  }
});

router.post('/payment-intent', async (req, res) => {
  const {
    items: rawItems,
    orderType,
    discountCode,
    paymentMethod,
    claimedRewardId,
    loyaltyPointsUsed,
    savePaymentMethod,
    useFreeCoffeeReward,
  } = req.body;

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
      useFreeCoffeeReward: useFreeCoffeeReward === true,
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
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: 'aud',
      customer: customerId,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      setup_future_usage: savePaymentMethod ? 'off_session' : undefined,
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
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-04-22.dahlia' },
    );
    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      customerId,
      customerEphemeralKeySecret: ephemeralKey.secret,
      amountCents: computed.totalCents,
      discountAmountCents: totalDiscountCents,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Payment intent creation failed');
    return res.status(500).json({ error: 'Payment processing unavailable. Please try again.' });
  }
});

router.post('/confirm-saved-method', async (req, res) => {
  const {
    items: rawItems,
    orderType,
    discountCode,
    claimedRewardId,
    loyaltyPointsUsed,
    paymentMethodId,
    useFreeCoffeeReward,
  } = req.body ?? {};

  if (!paymentMethodId) {
    return res.status(400).json({ error: 'paymentMethodId is required.' });
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
      useFreeCoffeeReward: useFreeCoffeeReward === true,
    }));
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not validate checkout' });
  }

  if (computed.totalCents === 0) {
    return res.json({
      paymentRequired: false,
      paymentIntentId: null,
      clientSecret: null,
      amountCents: 0,
      discountAmountCents: totalDiscountCents,
    });
  }

  try {
    const customerId = await getOrCreateStripeCustomer(req.user!.id, req.user!.email, req.user!.name);
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: 'aud',
      customer: customerId,
      payment_method: paymentMethodId,
      payment_method_types: ['card'],
      confirmation_method: 'manual',
      confirm: true,
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
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amountCents: computed.totalCents,
      discountAmountCents: totalDiscountCents,
      requiresAction: intent.status === 'requires_action',
      success: intent.status === 'succeeded',
    });
  } catch (err: any) {
    req.log.error({ err }, 'Saved-card confirmation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not charge saved card' });
  }
});

router.post('/confirm-intent', async (req, res) => {
  const { paymentIntentId } = req.body ?? {};
  if (!paymentIntentId) {
    return res.status(400).json({ error: 'paymentIntentId is required.' });
  }

  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.confirm(paymentIntentId);
    return res.json({
      success: intent.status === 'succeeded',
      requiresAction: intent.status === 'requires_action',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Final payment confirmation failed');
    return res.status(400).json({ error: err?.message ?? 'Could not finalize payment' });
  }
});

router.post('/cancel-intent', async (req, res) => {
  const { paymentIntentId } = req.body ?? {};
  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    return res.status(400).json({ error: 'paymentIntentId is required.' });
  }

  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.cancel(paymentIntentId);
    return res.json({ cancelled: intent.status === 'canceled', paymentIntentId: intent.id });
  } catch (err: any) {
    req.log.warn({ err, paymentIntentId }, 'Could not cancel payment intent (may already be resolved)');
    return res.json({ cancelled: false, paymentIntentId });
  }
});

export default router;
