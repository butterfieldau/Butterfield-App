---
name: sydneyTime recurring UTC bug
description: Root cause of Revenue by Hour showing $0 before 10am Sydney — must not parse locale strings with new Date()
---

## The Rule
Never use `new Date(ref.toLocaleString('en-US', { timeZone: '...' }))` to recover a Date from a locale string. The string format is non-standard; `new Date(string)` parsing is implementation-defined and silently returns wrong values in some Node.js builds.

**Why:** The old `sydneyOffset()` function parsed the locale string back to get the UTC offset. When this parsing fails (returning wrong time or NaN), `sydneyStartOfDay()` computes midnight UTC instead of midnight Sydney — 10 hours off. This causes all orders before 10am Sydney to be excluded from every date-filtered query, producing $0.00 revenue before 10am. The symptom is distinctive: revenue only appears after 10am exactly (= UTC midnight).

**How to apply:** All Sydney timezone computations must use `Intl.DateTimeFormat.formatToParts` to extract date/time components, then `Date.UTC` for all arithmetic. See `artifacts/api-server/src/lib/sydneyTime.ts` for the correct implementation. This pattern is DST-safe (handles AEST UTC+10 and AEDT UTC+11).

## Status exclusions
The `hourly-revenue` and `top-products` director endpoints must exclude `'voided'` in addition to `'cancelled'` and `'refunded'` — consistent with the main stats endpoint (`status NOT IN ('cancelled','refunded','voided')`).
