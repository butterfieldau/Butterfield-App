/**
 * Shared date utilities for Sydney timezone.
 * Uses Intl.DateTimeFormat.formatToParts() which is reliable across all JS engines
 * (Chrome, Hermes/React Native, Safari) unlike toLocaleString() parsing.
 */
import { WS_CUTOFF_HOUR, WS_DELIVERY_SCHEDULE } from '@/constants/wholesaleConfig';

export function getSydneyNow(): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    const hour = get('hour');
    return new Date(
      get('year'),
      get('month') - 1,
      get('day'),
      hour === 24 ? 0 : hour,
      get('minute'),
      get('second'),
    );
  } catch {
    return now;
  }
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

export function formatDateChip(syd: Date, d: Date): string {
  if (isNaN(d.getTime())) return '';
  if (isSameDay(d, syd)) return 'Today';
  const tom = new Date(syd);
  tom.setDate(syd.getDate() + 1);
  if (isSameDay(d, tom)) return 'Tomorrow';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function getPickupDates(): Date[] {
  const syd = getSydneyNow();
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(syd);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    if (i === 0) {
      const nowMins = syd.getHours() * 60 + syd.getMinutes();
      if (nowMins + 180 <= 19 * 60) dates.push(d);
    } else {
      dates.push(d);
    }
  }
  return dates;
}

export function getPickupTimeMins(date: Date, syd: Date): number[] {
  const sameDay = isSameDay(date, syd);
  const minAllowed = sameDay ? syd.getHours() * 60 + syd.getMinutes() + 180 : 0;
  const slots: number[] = [];
  for (let h = 10; h <= 19; h++) {
    const limit = h === 19 ? 1 : 60;
    for (let m = 0; m < limit; m += 30) {
      const t = h * 60 + m;
      if (t >= minAllowed) slots.push(t);
    }
  }
  return slots;
}

/**
 * Returns true if the store is currently open for ASAP pickup.
 * Hours: 6:30am – 9pm daily.
 * Mon–Wed break: 3pm – 4:30pm.
 */
export function isStoreOpen(syd: Date): boolean {
  const totalMins = syd.getHours() * 60 + syd.getMinutes();
  const OPEN_MINS  = 6 * 60 + 30;  // 6:30am
  const CLOSE_MINS = 21 * 60;       // 9pm
  if (totalMins < OPEN_MINS || totalMins >= CLOSE_MINS) return false;
  const dow = syd.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed
  if (dow >= 1 && dow <= 3) {
    const BREAK_START = 15 * 60;      // 3pm
    const BREAK_END   = 16 * 60 + 30; // 4:30pm
    if (totalMins >= BREAK_START && totalMins < BREAK_END) return false;
  }
  return true;
}

/**
 * Returns a human-readable reason why ASAP pickup is currently unavailable.
 */
export function getAsapUnavailableReason(syd: Date): string {
  const totalMins = syd.getHours() * 60 + syd.getMinutes();
  const CLOSE_MINS = 21 * 60;
  const dow = syd.getDay();
  if (dow >= 1 && dow <= 3) {
    const BREAK_START = 15 * 60;
    const BREAK_END   = 16 * 60 + 30;
    if (totalMins >= BREAK_START && totalMins < BREAK_END) return 'Back at 4:30pm';
  }
  if (totalMins >= CLOSE_MINS) return 'Opens tomorrow at 6:30am';
  return 'Available from 6:30am';
}

export interface DeliveryDate {
  date: Date;
  label: string;
  available: boolean;
  note?: string;
}

export function getDeliveryDates(): DeliveryDate[] {
  const syd = getSydneyNow();
  const results: DeliveryDate[] = [];
  for (let i = 1; i <= 21 && results.length < 8; i++) {
    const d = new Date(syd);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const schedule = WS_DELIVERY_SCHEDULE.find((s) => s.deliveryDow === dow);
    if (!schedule) continue;
    const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    // Cutoff = WS_CUTOFF_HOUR on the calendar day immediately before delivery
    const cutoff = new Date(d);
    cutoff.setDate(d.getDate() + schedule.cutoffDayOffset);
    cutoff.setHours(WS_CUTOFF_HOUR, 0, 0, 0);
    const available = syd.getTime() < cutoff.getTime();
    results.push({
      date: d,
      label,
      available,
      note: available ? undefined : `Order by ${schedule.cutoffLabel}`,
    });
  }
  return results;
}
