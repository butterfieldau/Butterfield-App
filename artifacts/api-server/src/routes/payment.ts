import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { computeOrderTotal } from '../lib/orderPricing.js';

const router = Router();
router.use(requireAuth);

router.post('/payment-intent', async (req, res) => {
  const { items, orderType, discountCents, paymentMethod } = req.body;

  if (paymentMethod === 'pay_at_pickup') {
    return res.status(400).json({ error: 'Pay at pickup orders do not require a Stripe payment intent.' });
  }
  if (orderType === 'delivery' && paymentMethod === 'pay_at_pickup') {
    return res.status(400).json({ error: 'Pay at pickup is only available for pickup orders.' });
  }

  if (!items?.length) {
    return res.status(400).json({ error: 'Items are required to create a payment intent' });
  }

  let computed: Awaited<ReturnType<typeof computeOrderTotal>>;
  try {
    computed = await computeOrderTotal(
      items,
      orderType ?? 'pickup',
      discountCents ?? 0,
      paymentMethod === 'pay_at_pickup' ? 'pay_at_pickup' : 'card',
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
      },
    });
    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amountCents: computed.totalCents,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Payment intent creation failed');
    return res.status(500).json({ error: 'Payment processing unavailable. Please try again.' });
  }
});

export default router;
