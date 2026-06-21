---
name: sydneyTime recurring UTC bug
description: Two distinct root causes for 10-hour time offsets — both now fixed. Read before touching any timestamp code.
---

## Root Cause A — pg-types parses timestamp-without-tz as local time (PRIMARY, fixed in lib/db/src/index.ts)

`postgres-date` (used by `pg-types` OID 1114) has a branch: if the timestamp string has no timezone suffix, it uses the local-time Date constructor `new Date(y, m, d, h, mi, s)` instead of `Date.UTC`. With `TZ=Australia/Sydney` on the server process, "local" = UTC+10, so every `TIMESTAMP WITHOUT TIME ZONE` value is shifted 10 hours earlier than what was stored.

**Symptom:** POS transaction times show 10 hours behind actual Sydney wall-clock time (e.g., a 4:27 PM sale shows as 6:27 AM).

**Fix:** Override OID 1114 (and 1115 for arrays) in `lib/db/src/index.ts` BEFORE the pool is created:
```typescript
types.setTypeParser(1114 as never, (val: string) =>
  val === null ? null : new Date(val.replace(" ", "T") + "Z")
);
```
This forces UTC interpretation by appending 'Z' before parsing.

**Why it matters:** Drizzle's `timestamp()` (no options) maps to `TIMESTAMP WITHOUT TIMEZONE`. pg-types OID 1114 is used for ALL such columns. The write path (`now()` with UTC session) stores correctly — the bug was entirely in the read path.

**Schema note:** Prefer `timestamp("col", { withTimezone: true })` for new columns to get `TIMESTAMPTZ` (OID 1184), which always carries a timezone suffix and is parsed correctly by postgres-date.

---

## Root Cause B — parsing locale strings back with new Date() (older pattern, must still avoid)

Never use `new Date(ref.toLocaleString('en-US', { timeZone: '...' }))`. The string format is non-standard; parsing is implementation-defined and silently wrong in some Node.js builds.

**Symptom:** Revenue before 10am Sydney shows $0 (midnight UTC = 10am Sydney is the cutoff).

**Fix:** All Sydney timezone computations must use `Intl.DateTimeFormat.formatToParts` + `Date.UTC`. See `artifacts/api-server/src/lib/sydneyTime.ts`.

---

## Status exclusions

The `hourly-revenue` and `top-products` director endpoints must exclude `'voided'` in addition to `'cancelled'` and `'refunded'` — consistent with the main stats endpoint (`status NOT IN ('cancelled','refunded','voided')`).
