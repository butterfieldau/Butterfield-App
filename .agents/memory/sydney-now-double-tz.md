---
name: getSydneyNow double-TZ offset trap
description: getSydneyNow() returns a Date broken for .getHours()/.getDay() when the Node process runs with TZ=Australia/Sydney — the Sydney offset is applied twice.
---

## The rule

Never call `.getHours()`, `.getMinutes()`, `.getDay()`, or `.getMonth()` on a `getSydneyNow()` result inside the API server (which runs with `TZ=Australia/Sydney`).

Use `sydneyDateParts()` instead — it returns `{hour, minute, dayOfWeek, ...}` extracted via `Intl.DateTimeFormat.formatToParts`, which is always correct regardless of the process timezone.

## Why

`getSydneyNow()` builds `new Date(Date.UTC(sydneyYear, sydneyMonth, sydneyDay, sydneyHour, ...))`. This puts the Sydney wall-clock values into the UTC slots of the Date object. The trick only works when the **process TZ is UTC**: then `.getHours()` reads the UTC slot directly and returns the Sydney value.

When `TZ=Australia/Sydney` is set (as in the API server workflow), `.getHours()` applies the +10/+11 Sydney offset on top of the already-Sydney UTC value, doubling it. At 12:57 am Sydney, the server computed `hour = 10` → `nowMins = 657` → the store looked open when it should have been closed.

## How to apply

Any route or lib file in `artifacts/api-server/` that needs the current Sydney hour, minute, or day of week:

```ts
// ✅ Correct — always TZ-safe
import { sydneyDateParts } from '../lib/sydneyTime.js';
const { hour, minute, dayOfWeek } = sydneyDateParts();
const nowMins = hour * 60 + minute;

// ❌ Wrong in TZ=Australia/Sydney process
import { getSydneyNow } from '../lib/sydneyTime.js';
const now = getSydneyNow();
const nowMins = now.getHours() * 60 + now.getMinutes(); // double-offset!
```

`getSydneyNow()` is safe for use in client-side code (Expo/React Native) where the device TZ does not affect UTC-slot reads — do not remove it from `lib/greetings.ts` or other client files.
