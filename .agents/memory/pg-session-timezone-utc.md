---
name: pg session timezone must be UTC
description: TZ=Australia/Sydney on Node process causes new Date(raw_pg_string) to mis-parse as local time. Never use new Date() on raw PG timestamp strings — use TO_CHAR in SQL instead. Also covers day-boundary SQL patterns.
---

## The Rules

1. Always set `options: "-c timezone=UTC"` in the `pg.Pool` constructor (`lib/db/src/index.ts`).
2. NEVER use `(someDate::date) AT TIME ZONE 'Australia/Sydney'` for day-boundary SQL — it goes the wrong direction.
3. ALWAYS use `(someDate::date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'` for day boundaries.
4. NEVER use `new Date(r.created_at).toISOString()` on raw pg query results — use `TO_CHAR` in SQL instead.

## Why Rule 1

- `TZ=Australia/Sydney` on the Node process does NOT configure the pg session timezone.
- When SQL compares `timestamp without tz` (UTC values in `created_at`) to `timestamptz`, PostgreSQL interprets the bare timestamp through the session timezone.
- Production DB session TZ is GMT. Must force UTC explicitly via pool options.

## Why Rules 2 & 3 — The Critical Trap

`date AT TIME ZONE zone` and `(date)::timestamp AT TIME ZONE zone` are OPPOSITES:

- `'2026-06-22'::date AT TIME ZONE 'Australia/Sydney'`
  → session TZ (GMT midnight) cast to timestamptz, then converted to Sydney local
  → returns `timestamp without tz = 2026-06-22 10:00:00` ← **WRONG** (10 AM, not midnight)

- `('2026-06-22'::date)::timestamp AT TIME ZONE 'Australia/Sydney'`
  → `timestamp without tz = 2026-06-22 00:00:00` interpreted AS Sydney local
  → returns `timestamptz = 2026-06-21 14:00:00+00` ← **CORRECT** (midnight Sydney in UTC)
  → add `AT TIME ZONE 'UTC'` to get `timestamp without tz = 2026-06-21 14:00:00` for direct comparison

Confirmed in production: all today's POS orders correctly matched with `correct` expression.

## Why Rule 4 — new Date() on raw pg strings

When `TZ=Australia/Sydney` is set on the server process and OID 1114 type parser doesn't fire,
`r.created_at` arrives as a raw string like `"2026-06-21 23:47:40.590589"`.
`new Date("2026-06-21 23:47:40.590589")` is parsed as LOCAL time (Sydney UTC+10) → 13:47 UTC.
`.toISOString()` → `"2026-06-21T13:47:40Z"` (wrong by 10h).
Frontend converts 13:47 UTC → Sydney → 23:47 AEST → displays "11:47 pm" instead of "09:47 am".

**Fix**: Use `TO_CHAR(col, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` directly in SELECT:
```sql
TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso
```
Returns `"2026-06-21T23:47:40.220Z"` — a guaranteed UTC ISO 8601 string. Use `r.created_at_iso` directly (no `new Date()` on server side). Verified in production.

## Correct SQL Patterns (production-verified)

```sql
-- Specific Sydney date boundary (use in WHERE clauses on created_at):
AND o.created_at >= (${dateStr}::date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'
AND o.created_at <  (${dateStr}::date + interval '1 day')::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'

-- Start of today in Sydney:
AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'

-- Return timestamps as UTC ISO strings (never use new Date() on server):
TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso
```

## How to Apply

- `lib/db/src/index.ts`: pool has `options: "-c timezone=UTC"`. Keep it.
- All raw `db.execute()` queries that return timestamps: use `TO_CHAR` + pass string directly.
- Day-boundary WHERE clauses: use `(date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'`.
