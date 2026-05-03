import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, wholesaleOrdersTable, wholesaleAccountsTable } from '@workspace/db';
import { eq, desc, sql } from 'drizzle-orm';
import { requireRole } from '../middlewares/auth.js';

const router = Router();
router.use(requireRole('wholesale'));

router.get('/account', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Wholesale account not found' });
  return res.json({ data: account });
});

router.get('/products', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.active,
        p.metadata,
        p.images,
        json_agg(
          json_build_object(
            'id', pr.id,
            'unit_amount', pr.unit_amount,
            'currency', pr.currency,
            'metadata', pr.metadata
          )
        ) FILTER (WHERE pr.id IS NOT NULL) as prices
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      GROUP BY p.id, p.name, p.description, p.active, p.metadata, p.images
      ORDER BY p.name
    `);
    return res.json({ data: result.rows });
  } catch {
    return res.json({ data: [] });
  }
});

router.get('/orders', async (req, res) => {
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const orders = await db.select().from(wholesaleOrdersTable)
    .where(eq(wholesaleOrdersTable.accountId, account.id))
    .orderBy(desc(wholesaleOrdersTable.createdAt));
  return res.json({ data: orders });
});

router.get('/orders/:id', async (req, res) => {
  const [order] = await db.select().from(wholesaleOrdersTable).where(eq(wholesaleOrdersTable.id, req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  return res.json({ data: order });
});

router.post('/orders', async (req, res) => {
  const { items, poReference, notes, totalCents, deliveryType, scheduledDate } = req.body;
  if (!items || !totalCents) {
    return res.status(400).json({ error: 'Items and total are required' });
  }
  const [account] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, req.user!.id));
  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (account.status !== 'approved') {
    return res.status(403).json({ error: 'Your wholesale account is pending approval.' });
  }
  const [order] = await db.insert(wholesaleOrdersTable).values({
    id: randomUUID(),
    accountId: account.id,
    userId: req.user!.id,
    status: 'pending',
    poReference,
    items,
    notes,
    totalCents,
    deliveryType: deliveryType ?? 'pickup',
    scheduledDate,
  }).returning();
  return res.status(201).json({ data: order });
});

export default router;
