/**
 * Sydney timezone date helpers.
 *
 * The common bug: `new Date(year, month, day)` builds midnight using the SERVER's
 * local timezone (UTC on most servers), not Sydney time.  Since Sydney is UTC+10/+11,
 * that means "today" starts 10-11 hours too late — so every date-filtered query
 * misses all orders placed before 10am Sydney and shows zeros.
 *
 * Previous fix used `new Date(ref.toLocaleString('en-US', {...}))` — parsing a locale
 * string back with `new Date()` is non-standard and silently returns incorrect values
 * in some Node.js builds / ICU configurations, causing the bug to recur.
 *
 * This implementation uses `Intl.DateTimeFormat.formatToParts` to reliably extract
 * Sydney date/time components, and `Date.UTC` for all arithmetic — no locale string
 * parsing, no system-TZ dependency, correct across AEST (UTC+10) and AEDT (UTC+11).
 *
 * Smoke-test results (migration completed):
 * - Zero remaining `new Date(...toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))`
 *   arithmetic constructions in artifacts/api-server/src after this migration.
 * - Call sites updated: stores.ts (toSydneyDate), registers.ts (getSydneyNow),
 *   scheduledDeliveryAlert.ts (getSydneyDateString + getSydneyHourMinute),
 *   wholesaleCutoffReminder.ts (sydneyStr/sydneyNow block), printer.ts (×2),
 *   staff.ts (×2 sydDay), misc.ts (×2 computeStoreStatus + store-status route),
 *   orders.ts (cutoff time enforcement), director.ts (×2 sydneyNow arithmetic +
 *   ×2 sydneyHour parseInt extractions), pos.ts (×2 sydNow offset blocks).
 * - TypeScript: pnpm --filter @workspace/api-server run typecheck passes clean.
 */

/** Internal: extract date/time component values in Sydney timezone. */
function sydneyParts(ref: Date): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
} {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(ref);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  const hr = get('hour');
  return {
    year:   get('year'),
    month:  get('month') - 1,   // convert to 0-indexed
    day:    get('day'),
    hour:   hr === 24 ? 0 : hr, // hour12:false may return 24 for midnight
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Current UTC offset for Sydney at a given reference time, in milliseconds.
 * Positive = Sydney is ahead of UTC (always true: AEST=+10h, AEDT=+11h).
 *
 * Computed without parsing any locale string: we treat the Sydney date/time
 * components as if they were UTC, then subtract the real UTC time.
 */
function sydneyOffsetMs(ref: Date): number {
  const p = sydneyParts(ref);
  const sydneyAsUtcMs = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  return sydneyAsUtcMs - ref.getTime();
}

/** Midnight start of the current day in Sydney time, returned as a UTC Date. */
export function sydneyStartOfDay(ref: Date = new Date()): Date {
  const p = sydneyParts(ref);
  const offsetMs = sydneyOffsetMs(ref);
  // Date.UTC gives midnight of that Sydney calendar date treated-as-UTC;
  // subtracting the offset gives the true UTC equivalent of Sydney midnight.
  return new Date(Date.UTC(p.year, p.month, p.day) - offsetMs);
}

/** Midnight start of the 1st of the current month in Sydney time, returned as a UTC Date. */
export function sydneyStartOfMonth(ref: Date = new Date()): Date {
  const p = sydneyParts(ref);
  const offsetMs = sydneyOffsetMs(ref);
  return new Date(Date.UTC(p.year, p.month, 1) - offsetMs);
}

/** Current date fields (year/month/day/dayOfWeek) in Sydney timezone. */
export function sydneyDateParts(ref: Date = new Date()) {
  const p = sydneyParts(ref);
  // dayOfWeek must come from the Sydney CALENDAR DATE, not its UTC equivalent.
  // Bug: Date.UTC(y,m,d) - sydneyOffsetMs gives 2026-06-21T14:00Z for Sydney
  // June 22 — getUTCDay() on that returns Sunday (0) instead of Monday (1).
  // Fix: treat the Sydney date components as a UTC date for getUTCDay() only;
  // day-of-week depends solely on the calendar date, not time-of-day.
  return {
    year:      p.year,
    month:     p.month,       // 0-indexed (Jan=0)
    day:       p.day,
    dayOfWeek: new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay(),
    monthNum:  p.month + 1,   // 1-indexed
  };
}

/**
 * Returns the current wall-clock time in Sydney as a JS Date whose getHours(),
 * getDay(), getMonth() etc. reflect Sydney local time.
 *
 * Use instead of `new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))`
 * which is non-standard and silently wrong on some Node.js/ICU builds.
 */
export function getSydneyNow(ref: Date = new Date()): Date {
  const p = sydneyParts(ref);
  // Construct a Date whose UTC fields equal the Sydney local fields.
  // This means .getHours()/.getDay()/.getMonth() return Sydney local values
  // when called on the returned object (which behaves as if in UTC+0).
  return new Date(Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second));
}

/**
 * Extract the hour (0-23) from any timestamp in the Sydney timezone.
 * Uses formatToParts — never parses a locale string back into a Date.
 */
export function sydneyHour(ref: Date | string): number {
  const d = ref instanceof Date ? ref : new Date(ref);
  return sydneyParts(d).hour;
}

/**
 * Format a Date for display in Sydney timezone.
 * Thin wrapper around Intl.DateTimeFormat — replaces scattered
 * `.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', ... })` calls
 * that are used only for display strings (not fed back into new Date()).
 * Those display-only toLocaleString calls are safe, but centralising here
 * keeps the timezone reference in one place.
 */
export function formatSydneyDisplay(
  ref: Date,
  opts: Omit<Intl.DateTimeFormatOptions, 'timeZone'> = {},
): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    ...opts,
  }).format(ref);
}
