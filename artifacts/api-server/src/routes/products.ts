import { Router } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const router = Router();

router.get('/', async (_req, res) => {
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
            'active', pr.active,
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

router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT p.*, json_agg(pr.*) FILTER (WHERE pr.id IS NOT NULL) as prices
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.id = ${req.params.id} AND p.active = true
      GROUP BY p.id
    `);
    if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
    return res.json({ data: result.rows[0] });
  } catch {
    return res.status(404).json({ error: 'Product not found' });
  }
});

export default router;
