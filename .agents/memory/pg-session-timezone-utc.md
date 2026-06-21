---
name: pg session timezone must be UTC
description: TZ env var on Node does not set pg session TZ; and date AT TIME ZONE zone is the WRONG direction — must use (date)::timestamp AT TIME ZONE zone AT TIME ZONE 'UTC'.
---

## The Rules

1. Always set `options: "-c timezone=UTC"` in the `pg.Pool` constructor (`lib/db/src/index.ts`).
2. NEVER use `(someDate::date) AT TIME ZONE 'Australia/Sydney'` for day-boundary SQL — it goes the wrong direction.
3. ALWAYS use `(someDate::date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'` for day boundaries.

## Why Rule 1

- `TZ=Australia/Sydney` on the Node process does NOT configure the pg session timezone.
- When SQL compares `timestamp without tz` (UTC values in `created_at`) to `timestamptz`, PostgreSQL interprets the bare timestamp through the session timezone.
- Production DB session TZ is GMT. Must force UTC explicitly via pool options.

## Why Rules 2 & 3 — The Critical Trap

`date AT TIME ZONE zone` and `(date)::timestamp AT TIME ZONE zone` are OPPOSITES:

- `'2026-06-22'::date AT TIME ZONE 'Australia/Sydney'`
  → `timestamptz` cast via session TZ (GMT midnight) then converted to Sydney local
  → returns `timestamp without tz = 2026-06-22 10:00:00` ← **WRONG** (10 AM, not midnight)

- `('2026-06-22'::date)::timestamp AT TIME ZONE 'Australia/Sydney'`
  → `timestamp without tz = 2026-06-22 00:00:00` interpreted AS Sydney local
  → returns `timestamptz = 2026-06-21 14:00:00+00` ← **CORRECT** (midnight Sydney in UTC)
  → add `AT TIME ZONE 'UTC'` to get `timestamp without tz = 2026-06-21 14:00:00` for direct comparison

This was confirmed in production: all today's POS orders (22:36–23:29 UTC June 21) had `in_today_wrong=false` and `in_today_correct=true`.

## Correct SQL Patterns (production-verified)

```sql
-- Specific Sydney date boundary (use in WHERE clauses on created_at):
AND o.created_at >= (${dateStr}::date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'
AND o.created_at <  (${dateStr}::date + interval '1 day')::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'

-- Start of today in Sydney:
AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'
```

Both patterns return `timestamp without tz` (UTC), so comparison to `created_at` (also `timestamp without tz`, UTC) has zero session-TZ dependency.

## How to Apply

`lib/db/src/index.ts` has `options: "-c timezone=UTC"` in the pool. Keep it.
`artifacts/api-server/src/routes/director.ts` `/pos-orders` uses the correct pattern above.
`artifacts/api-server/src/routes/pos.ts` `/orders` and `/summary` use the correct pattern above.

Any future Sydney-day filtering in raw SQL must use the `(date)::timestamp AT TIME ZONE 'Australia/Sydney' AT TIME ZONE 'UTC'` pattern.
