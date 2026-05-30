import { Router } from 'express';
import { db, storesTable, storeOpeningHoursTable } from '@workspace/db';
import { inArray, eq, ne, isNull, and, isNotNull, lte } from 'drizzle-orm';
import { ensureStoreConfigSchemaReady } from '../lib/ensureStoreConfigSchemaReady.js';

const router = Router();
async function purgeExpiredDeletedStores() {
  const now = new Date();
  const expired = await db.select({ id: storesTable.id })
    .from(storesTable)
    .where(and(isNotNull(storesTable.deletedAt), lte(storesTable.purgeAt, now)));

  if (expired.length === 0) return;

  for (const store of expired) {
    await db.delete(storesTable).where(eq(storesTable.id, store.id));
  }
}
router.use(async (_req, _res, next) => {
  try {
    await ensureStoreConfigSchemaReady();
    await purgeExpiredDeletedStores();
    next();
  } catch (error) {
    next(error);
  }
});

function toSydneyDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getOpenStatus(store: typeof storesTable.$inferSelect, hours: typeof storeOpeningHoursTable.$inferSelect[]) {
  if (store.status === 'coming_soon')        return { openStatus: 'coming_soon',         openLabel: 'Coming Soon' };
  if (store.status === 'temporarily_closed') return { openStatus: 'temporarily_closed',   openLabel: 'Temporarily Closed' };
  if (store.status === 'closed')             return { openStatus: 'closed',               openLabel: 'Closed' };

  const now = toSydneyDate();
  const dow = now.getDay();
  const todayHours = hours.find(h => h.dayOfWeek === dow);

  if (!todayHours || todayHours.isClosed) return { openStatus: 'closed_today', openLabel: 'Closed Today' };
  if (!todayHours.openTime || !todayHours.closeTime) return { openStatus: 'open', openLabel: 'Open' };

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = todayHours.openTime.split(':').map(Number);
  const [ch, cm] = todayHours.closeTime.split(':').map(Number);
  const openMins  = oh * 60 + om;
  const closeMins = ch * 60 + cm;

  if (nowMins < openMins)                             return { openStatus: 'opens_soon',   openLabel: `Opens at ${fmt12(todayHours.openTime)}` };
  if (nowMins >= openMins && nowMins < closeMins - 30) return { openStatus: 'open',         openLabel: 'Open Now' };
  if (nowMins >= closeMins - 30 && nowMins < closeMins) return { openStatus: 'closing_soon', openLabel: 'Closing Soon' };
  return { openStatus: 'closed', openLabel: 'Closed' };
}

// Public — all visible stores with live open/closed status
router.get('/stores', async (_req, res) => {
  const stores = await db.select().from(storesTable)
    .where(and(isNull(storesTable.deletedAt), ne(storesTable.status, 'closed')))
    .orderBy(storesTable.sortOrder, storesTable.name);

  const ids = stores.map(s => s.id);
  const allHours = ids.length
    ? await db.select().from(storeOpeningHoursTable).where(inArray(storeOpeningHoursTable.storeId, ids))
    : [];

  const data = stores.map(store => {
    const hours = allHours.filter(h => h.storeId === store.id).sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const now   = toSydneyDate();
    const todayHours = hours.find(h => h.dayOfWeek === now.getDay()) ?? null;
    return { ...store, ...getOpenStatus(store, hours), todayHours, openingHours: hours };
  });

  return res.json({ data });
});

// Public — single store detail
router.get('/stores/:id', async (req, res) => {
  const [store] = await db.select().from(storesTable).where(and(eq(storesTable.id, req.params.id), isNull(storesTable.deletedAt)));
  if (!store) return res.status(404).json({ error: 'Store not found.' });
  const hours = (await db.select().from(storeOpeningHoursTable).where(eq(storeOpeningHoursTable.storeId, store.id)))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  return res.json({ data: { ...store, ...getOpenStatus(store, hours), openingHours: hours } });
});

export default router;
