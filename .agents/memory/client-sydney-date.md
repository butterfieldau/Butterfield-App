---
name: Client-side Sydney date comparison pattern
description: How to safely compare dates in Sydney timezone on the Expo client — avoids the before-10am UTC/AEST mismatch bug.
---

## The rule

Never use `getDate()`, `getMonth()`, `getFullYear()`, or `setHours(0,0,0,0)` for date comparison or key generation in client-side code. These return **device-local time**. On a simulator or device not in AEST, orders placed between Sydney midnight and 10am (UTC-previous-day) appear as "yesterday".

Always convert to a Sydney wall-clock date string first:

```typescript
const SYD_TZ = 'Australia/Sydney';
function sydDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: SYD_TZ }); // → "YYYY-MM-DD"
}
function isSameDay(a: Date | string, b: Date): boolean {
  return sydDate(a) === sydDate(b);
}
function isThisMonth(d: Date | string): boolean {
  return sydDate(d).slice(0, 7) === sydDate(new Date()).slice(0, 7);
}
function isThisWeek(d: Date | string): boolean {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return sydDate(d) >= sydDate(cutoff);
}
```

`'en-CA'` locale gives a stable `YYYY-MM-DD` format regardless of device locale — do NOT use `'en-AU'` (gives `DD/MM/YYYY`) or `'default'`.

For date keys in maps (e.g. `ordersByDate`), use `sydDate(d)` directly.

For `toYMD()` functions sending date strings to the server: `d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })`.

A `today` Date used only in `isSameDay(order.date, today)` comparisons can be plain `new Date()` — the comparison will correctly resolve to Sydney calendar day.

**Why:** Server uses `TZ=Australia/Sydney` and its `sydneyStartOfDay()` is correct. The mismatch surfaces purely on the client when the device runs in UTC (simulators, non-Australian devices). Before 10am AEST, UTC is still on the previous calendar day, so any device-local date method gives "yesterday" for an 8am Sydney order.

**How to apply:** Any time you write a date comparison, filter, or YYYY-MM-DD key in the director/staff/customer screens — always reach for `sydDate()`, not `getDate()`.

Files fixed: `app/(director)/orders.tsx` (isSameDay, isThisWeek, isThisMonth, ordersByDate key, today useMemo), `app/(director)/index.tsx` (RevenueRangePicker today), `app/(director)/reports.tsx` (toYMD).
