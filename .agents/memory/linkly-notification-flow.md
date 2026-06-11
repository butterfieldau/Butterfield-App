---
name: Linkly Cloud notification flow
description: How Linkly Cloud async EFTPOS notifications work and the bugs to avoid
---

## How Linkly Cloud async works

- `POST /v1/sessions/{sessionId}/transaction?async=true` returns immediately with 202
- `GET /v1/sessions/{sessionId}/transaction` returns **202 with empty `{}` body** while the transaction is in-progress on the terminal — it does NOT return the final result via polling. Do not rely on this endpoint for completion detection.
- The only reliable completion signal is the **notification callback** (webhook) Linkly POSTs to the `Notification.Uri` URL sent in the transaction request.
- Linkly sends **multiple "pending" progress notifications** before the final "approved/declined" notification. Do not treat every notification as final.
- The final approved notification has `ResponseCode: "00"` and `Success: true` (inside `Response` or at top level).

## Notification URL

- Built via `getPublicBaseUrl()` in `pos.ts` / `shop-display.ts`
- Priority: `LINKLY_NOTIFICATION_BASE_URL` env var → `EXPO_PUBLIC_DOMAIN` → `REPLIT_DOMAINS` → host header
- **`LINKLY_NOTIFICATION_BASE_URL` must only be set in production** — if it points to the production domain during dev testing, Linkly calls back to prod (which doesn't know the session) and the dev server never receives the notification, leaving the POS stuck forever.

## Bugs to avoid

### Late notification overwrites approved record
`upsertTransaction` uses `ON CONFLICT (session_id) DO UPDATE SET`. Pending notifications arriving after the approved one would overwrite `status`, `complete`, `success` back to pending.

**Fix (already in place):** All result fields use `CASE WHEN linkly_transactions.complete THEN linkly_transactions.<field> ELSE EXCLUDED.<field> END` — once complete=true, those columns are immutable.

### Notification handler doesn't guard already-complete sessions
`handleLinklyTransactionNotification` must early-return `existing` if `existing.complete` — otherwise it re-parses and re-upserts a pending payload over the approved record (before the SQL guard catches it).

**Fix (already in place):** `if (existing.complete) return existing;` added after the `if (!existing) return null` check.

**Why:** Linkly can deliver multiple progress callbacks and may retry the final notification, so both the SQL guard and the handler guard are needed as defence-in-depth.
