import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, announcementsTable, favouritesTable, feedbackTable, waitlistsTable, storeSettingsTable, homeSpecialsTable } from '@workspace/db';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// ── Public store status (no auth) ────────────────────────────────────────────
function computeStoreStatus(manualOverride: boolean): {
  isOpen: boolean; openUntil: string | null; opensAt: string | null;
} {
  if (!manualOverride) return { isOpen: false, openUntil: null, opensAt: null };

  const syd  = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const day  = syd.getDay();   // 0=Sun
  const mins = syd.getHours() * 60 + syd.getMinutes();

  // Trading hours (minutes since midnight)
  // Mon–Wed (1-3): 6:30am–3pm  AND  5pm–9pm
  // Thu–Sat (4-6): 6:30am–10pm
  // Sun    (0):    8am–10pm
  type Span = { open: number; close: number };
  const spans: Record<number, Span[]> = {
    0: [{ open: 480, close: 1320 }],
    1: [{ open: 390, close: 900 }, { open: 1020, close: 1260 }],
    2: [{ open: 390, close: 900 }, { open: 1020, close: 1260 }],
    3: [{ open: 390, close: 900 }, { open: 1020, close: 1260 }],
    4: [{ open: 390, close: 1320 }],
    5: [{ open: 390, close: 1320 }],
    6: [{ open: 390, close: 1320 }],
  };

  const fmt = (m: number) => {
    const h = Math.floor(m / 60), mn = m % 60;
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return mn === 0 ? `${h12}${suffix}` : `${h12}:${String(mn).padStart(2, '0')}${suffix}`;
  };

  const todaySpans = spans[day] ?? [];
  for (const s of todaySpans) {
    if (mins >= s.open && mins < s.close) return { isOpen: true, openUntil: fmt(s.close), opensAt: null };
  }

  // Find next opening time (today first, then scan ahead up to 7 days)
  for (let d = 0; d <= 7; d++) {
    const checkDay = (day + d) % 7;
    const daySpans = spans[checkDay] ?? [];
    for (const s of daySpans) {
      if (d === 0 && s.open <= mins) continue; // already passed today
      const daysLabel = d === 0 ? 'today' : d === 1 ? 'tomorrow' : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][checkDay];
      return { isOpen: false, openUntil: null, opensAt: `${fmt(s.open)} ${daysLabel}` };
    }
  }
  return { isOpen: false, openUntil: null, opensAt: null };
}

// ── Public homepage content ───────────────────────────────────────────────────
router.get('/home-content', async (_req, res) => {
  const [settingsRows, specials] = await Promise.all([
    db.select().from(storeSettingsTable),
    db.select().from(homeSpecialsTable)
      .where(eq(homeSpecialsTable.isActive, true))
      .orderBy(asc(homeSpecialsTable.sortOrder), asc(homeSpecialsTable.createdAt)),
  ]);
  const s = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  return res.json({
    data: {
      hero: {
        bgColor:          s['hero_bg_color']         ?? '#40C0F2',
        imageUrl:         s['hero_image_url']         ?? null,
        campaignTag:      s['hero_campaign_tag']      ?? '🍪 DAILY SPECIAL',
        campaignTitle:    s['hero_campaign_title']    ?? 'Cookie & Cream Sandwich',
        campaignSubtitle: s['hero_campaign_subtitle'] ?? 'Two warm cookies + vanilla cream',
        buttonText:       s['hero_button_text']       ?? 'Order now',
        buttonLink:       s['hero_button_link']       ?? 'menu',
      },
      promo: {
        imageUrl: s['promo_image_url'] ?? null,
        title:    s['promo_title']     ?? null,
        subtitle: s['promo_subtitle']  ?? null,
      },
      specials,
    },
  });
});

router.get('/store-status', async (_req, res) => {
  const rows = await db.select().from(storeSettingsTable);
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const manualOverride = settings['store_open'] !== 'false';
  const status = computeStoreStatus(manualOverride);
  return res.json({ data: { ...status, manualOverride } });
});

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
