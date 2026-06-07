import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTS_KEY  = '@pos_products_v1';
const SYNCED_AT_KEY = '@pos_synced_at_v1';

export async function loadCachedPosProducts(): Promise<any[] | null> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
    return raw ? (JSON.parse(raw) as any[]) : null;
  } catch { return null; }
}

export async function savePosProductsCache(products: any[]): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [PRODUCTS_KEY,  JSON.stringify(products)],
      [SYNCED_AT_KEY, new Date().toISOString()],
    ]);
  } catch {}
}

export async function getPosLastSyncedAt(): Promise<Date | null> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_AT_KEY);
    return raw ? new Date(raw) : null;
  } catch { return null; }
}

/** Returns milliseconds until the next 4:00:00 am in Sydney time. */
export function getMsUntil4amSydney(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10);
  const h = get('hour') % 24;
  const m = get('minute');
  const s = get('second');
  let diff = 4 * 3600 - (h * 3600 + m * 60 + s);
  if (diff <= 0) diff += 24 * 3600;
  return diff * 1000;
}

/** Format a sync timestamp for display (e.g. "10:34 am" or "Mon 2 Jun"). */
export function formatSyncTime(d: Date | null): string {
  if (!d) return 'Never synced';
  const now  = new Date();
  const isToday =
    d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' }) ===
    now.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' });
  if (isToday) {
    return 'Synced ' + d.toLocaleTimeString('en-AU', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney',
    });
  }
  return 'Synced ' + d.toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney',
  });
}
