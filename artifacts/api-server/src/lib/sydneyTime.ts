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
  // dayOfWeek: recompute via Date constructed at Sydney midnight
  const midnightUtc = new Date(Date.UTC(p.year, p.month, p.day) - sydneyOffsetMs(ref));
  return {
    year:      p.year,
    month:     p.month,       // 0-indexed (Jan=0)
    day:       p.day,
    dayOfWeek: midnightUtc.getUTCDay(),
    monthNum:  p.month + 1,   // 1-indexed
  };
}
