---
name: POS TestFlight empty-data dead end
description: Investigation history for "POS Terminal shows no transactions after TestFlight build" — what was ruled out and current status.
---

Across two sessions, a reported bug ("POS Terminal not showing transactions after a
TestFlight build") was investigated in `artifacts/butterfield/components/director/PosTabContent.tsx`
and the corresponding `/api/director/pos/transactions` + `/api/director/pos/summary`
routes in `artifacts/api-server/src/routes/director.ts`. No code-level bug was found.

Ruled out:
- Hermes/ICU `Intl.DateTimeFormat` availability (client date computation uses
  `Intl.DateTimeFormat('en-CA', {timeZone: 'Australia/Sydney'})` directly, not
  round-tripped through `new Date(string)`, so it isn't the classic sydneyTime bug).
- `IS_POS_BUILD` env flag, `EXPO_PUBLIC_DOMAIN` (correctly set per EAS profile).
- Server date filtering (explicit Sydney timezone SQL conversion, looks correct).
- Auth token race in the API client's `request()`.
- An e2e smoke test against dev confirmed both POS endpoints return 200 with a
  legitimately empty result set for "today" — i.e. the empty state was correct given
  no seeded data, not a silent failure.

**Why this matters:** don't re-run the same investigation (Hermes/ICU, env vars, date
math) on this bug again — it has been checked thoroughly with no reproduction. If the
user reports it again from an actual TestFlight device, the next step should be getting
real device logs/network traces from that build rather than re-auditing this code path.

**How to apply:** as a defensive measure, `PosTabContent.tsx` now distinguishes a real
fetch error (`isError` from the transactions query) from a genuine empty day, showing
a "Couldn't load transactions" + Retry UI instead of the ambiguous empty-state copy in
both cases. If the bug recurs, that error UI should surface the actual cause.
