import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
router.use(requireAuth);

router.post('/payment-intent', async (req, res) => {
  const { amountCents, currency } = req.body;
  if (!amountCents || amountCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least 50 cents' });
  }
  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: currency ?? 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: { userId: req.user!.id },
    });
    return res.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err: any) {
    req.log.error({ err }, 'Payment intent creation failed');
    return res.status(500).json({ error: 'Payment processing unavailable. Please try again.' });
  }
});

export default router;
