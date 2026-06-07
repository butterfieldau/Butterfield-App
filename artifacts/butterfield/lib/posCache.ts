import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTS_KEY       = '@pos_products_v1';
const SYNCED_AT_KEY      = '@pos_synced_at_v1';
const OFFLINE_QUEUE_KEY  = '@pos_offline_queue_v1';
const CUSTOMER_CACHE_KEY = '@pos_customer_cache_v1';

// ── Product cache ──────────────────────────────────────────────────────────────

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

// ── Offline order queue ────────────────────────────────────────────────────────

export interface OfflineOrderPayload {
  items: any[];
  orderType: 'dine_in' | 'takeaway' | 'counter';
  paymentMethod: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number;
  tipCents?: number;
  surchargeCents?: number;
  splitPayments?: { method: string; amountCents: number }[];
  customerId?: string;
  discountCode?: string;
  discountCodeId?: string;
  manualDiscountPct?: number;
  redeemFreeCoffee?: boolean;
  claimedRewardId?: string;
  birthdayBonus?: boolean;
  notes?: string;
  idempotencyKey: string;
}

export interface OfflineQueueEntry {
  idempotencyKey: string;
  queuedAt: string;
  syncStatus: 'pending' | 'failed';
  syncError?: string;
  payload: OfflineOrderPayload;
  /** Snapshot for display */
  totalCents: number;
  customerName?: string;
  itemSummary: string;
}

export async function loadOfflineQueue(): Promise<OfflineQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineQueueEntry[]) : [];
  } catch { return []; }
}

export async function saveOfflineQueue(queue: OfflineQueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function enqueueOfflineOrder(entry: OfflineQueueEntry): Promise<void> {
  const queue = await loadOfflineQueue();
  const existing = queue.findIndex(e => e.idempotencyKey === entry.idempotencyKey);
  if (existing >= 0) {
    queue[existing] = entry;
  } else {
    queue.push(entry);
  }
  await saveOfflineQueue(queue);
}

export async function removeFromOfflineQueue(idempotencyKey: string): Promise<void> {
  const queue = await loadOfflineQueue();
  await saveOfflineQueue(queue.filter(e => e.idempotencyKey !== idempotencyKey));
}

export async function markOfflineOrderFailed(idempotencyKey: string, error: string): Promise<void> {
  const queue = await loadOfflineQueue();
  const idx = queue.findIndex(e => e.idempotencyKey === idempotencyKey);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx]!, syncStatus: 'failed', syncError: error };
    await saveOfflineQueue(queue);
  }
}

// ── Customer cache (last 50 seen) ──────────────────────────────────────────────

export interface CachedPosCustomer {
  userId: string;
  name: string;
  email?: string;
  loyaltyPoints: number;
  stampCount: number;
  loyaltyTier: string;
  freeCoffeeRewards: number;
  birthday?: string | null;
  availableClaimedRewards: any[];
  cachedAt: string;
}

export async function loadCustomerCache(): Promise<CachedPosCustomer[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedPosCustomer[]) : [];
  } catch { return []; }
}

export async function upsertCustomerCache(customer: Omit<CachedPosCustomer, 'cachedAt'>): Promise<void> {
  try {
    const cache = await loadCustomerCache();
    const entry: CachedPosCustomer = { ...customer, cachedAt: new Date().toISOString() };
    const existing = cache.findIndex(c => c.userId === customer.userId);
    if (existing >= 0) {
      cache[existing] = entry;
    } else {
      cache.unshift(entry);
    }
    // Keep last 50
    const trimmed = cache.slice(0, 50);
    await AsyncStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export async function searchCustomerCache(query: string): Promise<CachedPosCustomer[]> {
  try {
    const cache = await loadCustomerCache();
    const q = query.toLowerCase().trim();
    if (!q) return cache.slice(0, 10);
    return cache.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    ).slice(0, 10);
  } catch { return []; }
}
