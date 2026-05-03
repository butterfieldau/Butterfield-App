import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, announcementsTable, favouritesTable, feedbackTable, waitlistsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/announcements', requireAuth, async (req, res) => {
  const role = req.user!.role;
  const all = await db.select().from(announcementsTable).where(eq(announcementsTable.isActive, true));
  const filtered = all.filter(a => a.targetRoles.includes(role) || a.targetRoles.includes('all'));
  return res.json({ data: filtered });
});

router.get('/favourites', requireAuth, async (req, res) => {
  const favs = await db.select().from(favouritesTable).where(eq(favouritesTable.userId, req.user!.id));
  return res.json({ data: favs });
});

router.post('/favourites', requireAuth, async (req, res) => {
  const { productStripeId } = req.body;
  if (!productStripeId) return res.status(400).json({ error: 'Product ID required' });
  try {
    await db.insert(favouritesTable).values({
      userId: req.user!.id,
      productStripeId,
    });
    return res.status(201).json({ success: true });
  } catch {
    return res.status(409).json({ error: 'Already favourited' });
  }
});

router.delete('/favourites/:productId', requireAuth, async (req, res) => {
  await db.delete(favouritesTable).where(
    and(eq(favouritesTable.userId, req.user!.id), eq(favouritesTable.productStripeId, req.params.productId))
  );
  return res.json({ success: true });
});

router.post('/feedback', requireAuth, async (req, res) => {
  const { category, message, rating, orderId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const [fb] = await db.insert(feedbackTable).values({
    id: randomUUID(),
    userId: req.user!.id,
    category: category ?? 'general',
    message,
    rating,
    orderId,
  }).returning();
  return res.status(201).json({ data: fb });
});

router.post('/waitlist', requireAuth, async (req, res) => {
  const { productStripeId } = req.body;
  if (!productStripeId) return res.status(400).json({ error: 'Product ID required' });
  try {
    const [entry] = await db.insert(waitlistsTable).values({
      id: randomUUID(),
      userId: req.user!.id,
      productStripeId,
    }).returning();
    return res.status(201).json({ data: entry });
  } catch {
    return res.status(409).json({ error: 'Already on waitlist' });
  }
});

export default router;
