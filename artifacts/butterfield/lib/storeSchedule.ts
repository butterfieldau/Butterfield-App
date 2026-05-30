import type { StoreHour, StoreSummary } from '@/lib/api';

type TimeSegment = {
  startMins: number;
  endMins: number;
};

function parseTimeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

function parseBreakNotes(notes?: string | null): { startMins: number; endMins: number } | null {
  if (!notes) return null;
  const match = notes.match(/^Break (\d{2}:\d{2}) [–-] (\d{2}:\d{2})$/);
  if (!match) return null;
  const startMins = parseTimeToMinutes(match[1]);
  const endMins = parseTimeToMinutes(match[2]);
  if (startMins == null || endMins == null || endMins <= startMins) return null;
  return { startMins, endMins };
}

function roundUpToSlot(totalMins: number, slotMinutes: number) {
  return Math.ceil(totalMins / slotMinutes) * slotMinutes;
}

export function getStoreHoursForDate(store: Pick<StoreSummary, 'openingHours'> | null | undefined, date: Date): StoreHour | null {
  if (!store?.openingHours?.length) return null;
  return store.openingHours.find((hour) => hour.dayOfWeek === date.getDay()) ?? null;
}

export function getStorePickupSegments(store: Pick<StoreSummary, 'openingHours'> | null | undefined, date: Date): TimeSegment[] {
  const hours = getStoreHoursForDate(store, date);
  if (!hours || hours.isClosed) return [];
  const startMins = parseTimeToMinutes(hours.openTime);
  const endMins = parseTimeToMinutes(hours.closeTime);
  if (startMins == null || endMins == null || endMins <= startMins) return [];

  const breakWindow = parseBreakNotes(hours.notes);
  if (!breakWindow || breakWindow.startMins <= startMins || breakWindow.endMins >= endMins) {
    return [{ startMins, endMins }];
  }

  return [
    { startMins, endMins: breakWindow.startMins },
    { startMins: breakWindow.endMins, endMins },
  ].filter((segment) => segment.endMins > segment.startMins);
}

export function isStoreOpenForAsap(store: Pick<StoreSummary, 'openingHours' | 'status'> | null | undefined, sydNow: Date) {
  if (!store) return false;
  if (store.status === 'coming_soon' || store.status === 'temporarily_closed' || store.status === 'closed') {
    return false;
  }
  const nowMins = sydNow.getHours() * 60 + sydNow.getMinutes();
  return getStorePickupSegments(store, sydNow).some((segment) => nowMins >= segment.startMins && nowMins < segment.endMins);
}

export function getStorePickupDates(
  store: Pick<StoreSummary, 'openingHours'> | null | undefined,
  sydNow: Date,
  leadMinutes = 180,
  dayCount = 7,
): Date[] {
  const dates: Date[] = [];
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(sydNow);
    date.setDate(sydNow.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    const slots = getStorePickupTimeMins(store, date, sydNow, leadMinutes);
    if (slots.length > 0) dates.push(date);
  }
  return dates;
}

export function getStorePickupTimeMins(
  store: Pick<StoreSummary, 'openingHours'> | null | undefined,
  date: Date,
  sydNow: Date,
  leadMinutes = 180,
  slotMinutes = 30,
): number[] {
  const sameDay = date.getFullYear() === sydNow.getFullYear()
    && date.getMonth() === sydNow.getMonth()
    && date.getDate() === sydNow.getDate();
  const minAllowed = sameDay ? roundUpToSlot(sydNow.getHours() * 60 + sydNow.getMinutes() + leadMinutes, slotMinutes) : 0;
  const slots: number[] = [];
  for (const segment of getStorePickupSegments(store, date)) {
    const start = roundUpToSlot(Math.max(segment.startMins, minAllowed), slotMinutes);
    for (let mins = start; mins < segment.endMins; mins += slotMinutes) {
      slots.push(mins);
    }
  }
  return slots;
}

export function getStoreAsapUnavailableReason(
  store: Pick<StoreSummary, 'openingHours' | 'status' | 'openLabel'> | null | undefined,
  sydNow: Date,
) {
  if (!store) return 'Select your store';
  if (store.status === 'coming_soon') return 'Coming soon';
  if (store.status === 'temporarily_closed') return 'Temporarily closed';
  if (store.status === 'closed') return 'Currently closed';

  const nowMins = sydNow.getHours() * 60 + sydNow.getMinutes();
  const todaySegments = getStorePickupSegments(store, sydNow);
  if (todaySegments.length === 0) return store.openLabel ?? 'Closed today';

  const nextSegmentToday = todaySegments.find((segment) => nowMins < segment.startMins);
  if (nextSegmentToday) {
    const hours = Math.floor(nextSegmentToday.startMins / 60);
    const mins = nextSegmentToday.startMins % 60;
    const suffix = hours >= 12 ? 'pm' : 'am';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `Opens at ${h12}:${String(mins).padStart(2, '0')}${suffix}`;
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDate = new Date(sydNow);
    nextDate.setDate(sydNow.getDate() + offset);
    const nextSegments = getStorePickupSegments(store, nextDate);
    if (!nextSegments.length) continue;
    const nextStart = nextSegments[0]!.startMins;
    const hours = Math.floor(nextStart / 60);
    const mins = nextStart % 60;
    const suffix = hours >= 12 ? 'pm' : 'am';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return offset === 1
      ? `Opens tomorrow at ${h12}:${String(mins).padStart(2, '0')}${suffix}`
      : store.openLabel ?? 'Currently closed';
  }

  return store.openLabel ?? 'Currently closed';
}
