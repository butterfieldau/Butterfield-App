import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { computeOrderTotal } from '../lib/orderPricing.js';
import { validateDiscountCode } from '../lib/discountUtils.js';

const router = Router();
router.use(requireAuth);

router.post('/validate', async (req, res) => {
  const { code, items, orderType } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Discount code is required.' });
  }
  if (!items?.length) {
    return res.status(400).json({ error: 'Cart items are required.' });
  }

  try {
    const base = await computeOrderTotal(items, orderType ?? 'pickup', 0, 'card');
    const validated = await validateDiscountCode(
      code,
      req.user!.id,
      req.user!.role,
      base.subtotalCents,
      orderType ?? 'pickup',
    );
    return res.json({ valid: true, ...validated });
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? 'Invalid discount code.' });
  }
});

export default router;
