---
name: Star MCP30 cash drawer commands
description: Correct ESC/POS commands for Star MCP30 / mC-Print3 cash drawer, and the three bugs that prevented it from firing.
---

## Rule
For Star MCP30 / mC-Print3, always use DLE DC4 (`0x10 0x14 0x01 [pin] 0x02`) for cash drawer — `buildStarOpenDrawerBytes()`. Never use ESC p (`0x1b 0x70`) for Star, even embedded in a print job; DLE DC4 is the real-time command that bypasses the print buffer.

**Why:** ESC p is Epson-only and queued in the print buffer. Star MCP30 in ESC/POS mode processes DLE DC4 immediately. Using ESC p on Star silently does nothing.

**How to apply:**
- In `artifacts/api-server/src/lib/printer.ts`, `buildReceiptBytes` and `buildTaxInvoiceBytes` Star branches must call `buildStarOpenDrawerBytes(pin)`, not `buildOpenDrawerBytes(pin)`.
- The standalone `open_drawer` job handler (director.ts + shop-display.ts) already uses the correct branch — keep that pattern.

## Missing fields bug (fixed)
`GET /api/shop-display/store` did not select `autoDrawer` or `drawerPin` from `storesTable`. The POS reads printer config from this endpoint, so `store.autoDrawer` was always `undefined` → `false`, meaning the drawer command was never embedded in receipt bytes. Always include `autoDrawer` and `drawerPin` in the `/store` response.

## No-print cash drawer (fixed)
When `autoPrint` is off, the drawer never fired even on cash sales because the drawer command is embedded in receipt bytes. Fix: in `pos.tsx` `createOrderMutation.onSuccess`, add a separate `sendOpenDrawer()` call when `autoDrawer` is on, `autoPrint` is off, and `paymentMethod` is `cash` or `split`.
