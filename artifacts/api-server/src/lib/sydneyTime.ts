/**
 * Sydney timezone date helpers.
 *
 * The common bug: `new Date(year, month, day)` builds midnight using the SERVER's
 * local timezone (UTC on Replit), not Sydney time.  Since Sydney is UTC+10/+11, that
 * means "today" starts 10-11 hours too late — so every date-filtered query misses
 * all orders placed before 10am Sydney and shows zeros.
 *
 * Fix: compute the UTC offset between the real UTC timestamp and the Sydney-local
 * representation, then subtract it so the resulting Date is midnight-Sydney-as-UTC.
 */

function sydneyOffset(ref: Date): number {
  const sydRepr = new Date(ref.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  return sydRepr.getTime() - ref.getTime();
}

/** Midnight start of the current day in Sydney time, returned as a UTC Date. */
export function sydneyStartOfDay(ref: Date = new Date()): Date {
  const syd = new Date(ref.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const offset = sydneyOffset(ref);
  return new Date(new Date(syd.getFullYear(), syd.getMonth(), syd.getDate()).getTime() - offset);
}

/** Midnight start of the 1st of the current month in Sydney time, returned as a UTC Date. */
export function sydneyStartOfMonth(ref: Date = new Date()): Date {
  const syd = new Date(ref.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const offset = sydneyOffset(ref);
  return new Date(new Date(syd.getFullYear(), syd.getMonth(), 1).getTime() - offset);
}

/** Current date fields (year/month/day/dayOfWeek) in Sydney timezone. */
export function sydneyDateParts(ref: Date = new Date()) {
  const syd = new Date(ref.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  return {
    year:      syd.getFullYear(),
    month:     syd.getMonth(),
    day:       syd.getDate(),
    dayOfWeek: syd.getDay(),
    monthNum:  syd.getMonth() + 1,
  };
}
