---
name: Star MCP30 cash drawer commands
description: Correct ESC/POS commands for Star MCP30 / mC-Print3 cash drawer, and the three bugs that prevented it from firing.
---

## Rule
For Star MCP30 / mC-Print3, always use DLE DC4 (`0x10 0x14 0x01 [pin] 0x02`) for cash drawer — `buildStarOpenDrawerBytes()`. Never prefix or combine with ESC p (`0x1b 0x70`) for Star; the 0x70 byte is rendered as a triangle glyph (CP437) and disrupts the DLE DC4 bytes that follow.

**Why:** ESC p is Epson-only and queued in the print buffer. Star MCP30 does not understand ESC p — it renders the byte sequence as printable characters (triangle artefact on paper) and the drawer does not open. DLE DC4 is a real-time out-of-band command processed immediately regardless of buffer state — it works for both standalone sends and embedded mid-receipt.

**How to apply:**
- `buildStarOpenDrawerBytes()` must return ONLY `[0x10, 0x14, 0x01, pin, 0x02]` — no `Buffer.concat` with `buildOpenDrawerBytes`.
- In `artifacts/api-server/src/lib/printer.ts`, `buildReceiptBytes` and `buildTaxInvoiceBytes` Star branches call `buildStarOpenDrawerBytes(pin)` — correct, no change needed.
- The standalone `open_drawer` job handler (director.ts + shop-display.ts) selects `buildStarOpenDrawerBytes` for Star — correct, keep that pattern.

## Missing fields bug (fixed)
`GET /api/shop-display/store` did not select `autoDrawer` or `drawerPin` from `storesTable`. The POS reads printer config from this endpoint, so `store.autoDrawer` was always `undefined` → `false`, meaning the drawer command was never embedded in receipt bytes. Always include `autoDrawer` and `drawerPin` in the `/store` response.

## No-print cash drawer (fixed)
When `autoPrint` is off, the drawer never fired even on cash sales because the drawer command is embedded in receipt bytes. Fix: in `pos.tsx` `createOrderMutation.onSuccess`, add a separate `sendOpenDrawer()` call when `autoDrawer` is on, `autoPrint` is off, and `paymentMethod` is `cash` or `split`.
