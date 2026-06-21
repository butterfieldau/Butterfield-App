---
name: pg session timezone must be UTC
description: TZ env var on the Node process does not set PostgreSQL session timezone; timestamp without tz vs timestamptz comparisons break silently if session TZ != UTC.
---

## The Rule

Always set `options: "-c timezone=UTC"` in the `pg.Pool` constructor (in `lib/db/src/index.ts`). Never rely on the Node.js `TZ` environment variable to control the PostgreSQL session timezone.

## Why

- `TZ=Australia/Sydney` is set on the API server process (workflow command). This correctly makes `new Date().getHours()` etc. return Sydney local time in Node.js.
- But it does **not** send `SET TIME ZONE 'Australia/Sydney'` to PostgreSQL. The pg npm package does not read `TZ` to configure the session.
- When a SQL `WHERE` clause compares `timestamp without tz` (our `created_at` columns, which store UTC values) to a `timestamptz` expression, PostgreSQL interprets the bare timestamp using the **session timezone**.
- If the session TZ happens to be `Australia/Sydney` (e.g. from server-level `postgresql.conf`), a stored UTC value of `2026-06-21 23:14:00` gets read as 23:14 AEST = 13:14 UTC — which is before the day boundary and the row disappears from results.

## How to Apply

`lib/db/src/index.ts` already has `options: "-c timezone=UTC"` in the pool config. Do not remove it. If you ever create a second pool or a raw pg.Client, add the same option.

The pg-types OID 1114/1115 override (also in that file) handles the Node.js side: it ensures returned timestamp strings are parsed as UTC by appending 'Z'. Both pieces are required.

## Correct SQL pattern for Sydney-day filtering

Because the session TZ is UTC, `timestamp without tz` values are treated as UTC, so comparing to a `timestamptz` produced by `AT TIME ZONE 'Australia/Sydney'` works correctly:

```sql
-- specific Sydney date:
AND o.created_at >= (${dateStr}::date) AT TIME ZONE 'Australia/Sydney'
AND o.created_at <  (${dateStr}::date + interval '1 day') AT TIME ZONE 'Australia/Sydney'

-- start of today Sydney:
AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'Australia/Sydney'
```
