import type { ApiOrder } from '@/lib/api';
import { Linking, Alert, Platform } from 'react-native';

/** Returns YYYY-MM-DD for a date in the device's local timezone (for display grouping). */
export function sydDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-CA');
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  return sydDate(a) === sydDate(b);
}

export function isThisMonth(d: Date | string): boolean {
  return sydDate(d).slice(0, 7) === sydDate(new Date()).slice(0, 7);
}

export function isThisWeek(d: Date | string): boolean {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return sydDate(d) >= sydDate(cutoff);
}

export function fmtTime(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDateChip(d: Date): string {
  const today     = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (isSameDay(d, today))     return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function sydneyDateStr(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function shiftPosDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

export function fmtCents(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPosDay(dateStr: string): string {
  const today = sydneyDateStr();
  if (dateStr === today) return 'Today';
  const yesterday = shiftPosDate(today, -1);
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

export function getPosPaymentLabel(method: string | undefined, splits: unknown): string {
  if (Array.isArray(splits) && splits.length > 1) return 'Split';
  const m = (method ?? 'eftpos').toLowerCase();
  if (m === 'eftpos' || m === 'card') return 'EFTPOS';
  if (m === 'cash') return 'Cash';
  return method ?? 'EFTPOS';
}

export function summarisePosItems(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return 'No items';
  const first = items[0];
  const name = (first as any)?.name ?? (first as any)?.productName ?? 'Item';
  if (items.length === 1) return name;
  return `${name} +${items.length - 1} more`;
}

export function openMap(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === 'ios'
    ? `maps://maps.apple.com/?q=${q}`
    : `https://maps.google.com/?q=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
}

export function openMapWithChoice(address: string) {
  const q = encodeURIComponent(address);
  Alert.alert('Open in Maps', address, [
    {
      text: 'Apple Maps',
      onPress: () => Linking.openURL(`maps://maps.apple.com/?q=${q}`).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`)),
    },
    {
      text: 'Google Maps',
      onPress: () => Linking.openURL(`https://maps.google.com/?q=${q}`),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

export function getOrderTimelineDate(order: ApiOrder): Date {
  if (order.orderSource !== 'wholesale' && order.scheduledFor) {
    return new Date(order.scheduledFor);
  }
  return new Date(order.createdAt);
}

export function fmtHourLabel(h: number): string {
  if (h === 0)  return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
}

export function getOrderSectionKey(o: ApiOrder): string {
  const s = o.status;
  if (['received', 'pending'].includes(s)) return 'pending';
  if (['being_prepared', 'processing'].includes(s)) return 'preparing';
  if (['ready_for_pickup', 'dispatched'].includes(s)) return 'ready';
  if (['completed', 'accepted', 'scheduled'].includes(s)) return 'done';
  return 'cancelled';
}

export const ORDER_STATUS_SECTIONS = [
  { key: 'pending',   label: 'Pending',   accentColor: '#F59E0B' },
  { key: 'preparing', label: 'Preparing', accentColor: '#1493FF' },
  { key: 'ready',     label: 'Ready',     accentColor: '#22C55E' },
  { key: 'done',      label: 'Completed', accentColor: '#8B5CF6' },
  { key: 'cancelled', label: 'Cancelled', accentColor: '#EF4444' },
] as const;

export function getWholesaleInvoiceUrl(orderId: string): string {
  const base = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : 'http://localhost:80/api';
  return `${base}/wholesale/orders/${orderId}/invoice`;
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof Error ? error.message : fallback;
}
