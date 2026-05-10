import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, announcementsTable, favouritesTable, feedbackTable, waitlistsTable, storeSettingsTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// ── Live context: weather + holidays (4-hour server-side cache) ───────────────

const SYD_LAT  = -33.8688;
const SYD_LNG  = 151.2093;
const CACHE_MS = 30 * 60 * 1000; // 30 minutes — keeps weather accurate throughout the day

interface WeatherData {
  temp: number;
  apparentTemp: number;
  condition: 'clear' | 'cloudy' | 'foggy' | 'rainy' | 'showery' | 'stormy';
  emoji: string;
  description: string;
}

export interface LiveContext {
  weather: WeatherData | null;
  publicHoliday: string | null;
  islamicHoliday: string | null;
  isRamadan: boolean;
  hijriDay: number;
  hijriMonth: number;
  hijriYear: number;
  fetchedAt: number;
}

let contextCache: { data: LiveContext; fetchedAt: number } | null = null;

function wmoToCondition(code: number): Pick<WeatherData, 'condition' | 'emoji' | 'description'> {
  if (code === 0)              return { condition: 'clear',   emoji: '☀️',  description: 'Clear sky' };
  if (code <= 3)               return { condition: 'cloudy',  emoji: '⛅',  description: 'Partly cloudy' };
  if (code <= 48)              return { condition: 'foggy',   emoji: '🌫️', description: 'Foggy' };
  if (code <= 67)              return { condition: 'rainy',   emoji: '🌧️', description: 'Rain' };
  if (code <= 77)              return { condition: 'rainy',   emoji: '❄️',  description: 'Snow' };
  if (code <= 82)              return { condition: 'showery', emoji: '🌦️', description: 'Showers' };
  return                              { condition: 'stormy',  emoji: '⛈️',  description: 'Thunderstorm' };
}

function getIslamicHoliday(month: number, day: number, isRamadan: boolean): string | null {
  if (month === 1  && day === 1)  return 'Islamic New Year';
  if (month === 3  && day === 12) return 'Mawlid al-Nabi';
  if (month === 7  && day === 27) return "Isra' wal Mi'raj";
  if (month === 8  && day === 15) return "Laylat al-Bara'ah";
  if (month === 9  && day === 27) return 'Laylat al-Qadr';
  if (month === 10 && day === 1)  return 'Eid al-Fitr';
  if (month === 12 && day === 10) return 'Eid al-Adha';
  return null;
}

async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function fetchLiveContext(): Promise<LiveContext> {
  const now = new Date();
  const sydStr = now.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit', year: 'numeric' });
  // sydStr = "DD/MM/YYYY"
  const [dd, mm, yyyy] = sydStr.split('/');
  const todayISO = `${yyyy}-${mm}-${dd}`;

  let weather: WeatherData | null = null;
  let publicHoliday: string | null = null;
  let islamicHoliday: string | null = null;
  let isRamadan = false;
  let hijriDay = 0, hijriMonth = 0, hijriYear = 0;

  // 1. Open-Meteo weather (no API key needed)
  try {
    const wRes = await fetchWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${SYD_LAT}&longitude=${SYD_LNG}&current=temperature_2m,apparent_temperature,weather_code&timezone=Australia%2FSydney`,
    );
    if (wRes.ok) {
      const wJson = await wRes.json() as any;
      const cur = wJson?.current;
      if (cur) {
        const { condition, emoji, description } = wmoToCondition(cur.weather_code ?? 0);
        weather = {
          temp:         Math.round(cur.temperature_2m ?? 20),
          apparentTemp: Math.round(cur.apparent_temperature ?? 20),
          condition, emoji, description,
        };
      }
    }
  } catch { /* graceful fallback */ }

  // 2. Australian public holidays (date.nager.at — no API key)
  try {
    const hRes = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${yyyy}/AU`);
    if (hRes.ok) {
      const holidays = await hRes.json() as Array<{ date: string; name: string; counties: string[] | null }>;
      const match = holidays.find(h => {
        if (h.date !== todayISO) return false;
        if (!h.counties) return true; // national
        return h.counties.some(c => c === 'AU-NSW');
      });
      if (match) publicHoliday = match.name;
    }
  } catch { /* graceful fallback */ }

  // 3. AlAdhan Hijri calendar (no API key)
  try {
    const aRes = await fetchWithTimeout(`https://api.aladhan.com/v1/gToH?date=${dd}-${mm}-${yyyy}`);
    if (aRes.ok) {
      const aJson = await aRes.json() as any;
      const hijri = aJson?.data?.hijri;
      if (hijri) {
        hijriDay   = parseInt(hijri.day, 10);
        hijriMonth = parseInt(hijri.month?.number ?? '0', 10);
        hijriYear  = parseInt(hijri.year, 10);
        isRamadan  = hijriMonth === 9;
        islamicHoliday = getIslamicHoliday(hijriMonth, hijriDay, isRamadan);
      }
    }
  } catch { /* graceful fallback */ }

  return { weather, publicHoliday, islamicHoliday, isRamadan, hijriDay, hijriMonth, hijriYear, fetchedAt: Date.now() };
}

async function getLiveContext(): Promise<LiveContext> {
  const now = Date.now();
  if (contextCache && (now - contextCache.fetchedAt) < CACHE_MS) return contextCache.data;
  const data = await fetchLiveContext();
  contextCache = { data, fetchedAt: now };
  return data;
}

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

// ── Live context endpoint (weather + holidays, 4-hour cache) ─────────────────
router.get('/context', async (_req, res) => {
  const ctx = await getLiveContext();
  return res.json({ data: ctx });
});

router.get('/welcome-config', async (_req, res) => {
  const [row] = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, 'welcome_background'));
  return res.json({ data: { welcomeBackground: row?.value ?? null } });
});

router.get('/store-status', async (_req, res) => {
  const rows = await db.select().from(storeSettingsTable);
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const manualOverride = settings['store_open'] !== 'false';
  const cutoffTime = settings['order_cutoff_time'] ?? '';
  const status = computeStoreStatus(manualOverride);

  let ordersCutoff = false;
  if (cutoffTime) {
    const syd   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    const mins  = syd.getHours() * 60 + syd.getMinutes();
    const [ch, cm] = cutoffTime.split(':').map(Number);
    if (!isNaN(ch) && !isNaN(cm)) ordersCutoff = mins >= (ch * 60 + cm);
  }

  return res.json({ data: { ...status, manualOverride, orderCutoffTime: cutoffTime || null, ordersCutoff } });
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
    and(eq(favouritesTable.userId, req.user!.id), eq(favouritesTable.productStripeId, String(req.params.productId)))
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

// ── Public home banner ────────────────────────────────────────────────────────
router.get('/home-banner', async (_req, res) => {
  const rows = await db.select().from(storeSettingsTable).where(eq(storeSettingsTable.key, 'home_banner'));
  if (!rows.length) return res.json({ data: null });
  try {
    const config = JSON.parse(rows[0].value);
    if (!config.isActive) return res.json({ data: null });
    return res.json({ data: config });
  } catch {
    return res.json({ data: null });
  }
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
