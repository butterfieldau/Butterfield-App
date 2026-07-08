---
name: Command Center theme token file
description: How the Director Orders screen theme (App Orders / Wholesale / POS Terminal tabs) is themed and how to retheme it.
---

The Director Orders screen (three tabs: App Orders, Wholesale, POS Terminal) and its
detail modal all import their palette exclusively from
`artifacts/butterfield/components/director/commandCenterColors.ts` (BG, HEADER_BG,
SURFACE, SURFACE_RAISED, BORDER, TEXT, TEXT_MUTED, TEXT_FAINT, BRAND*, GREEN*, AMBER*,
RED*, BLUE*, PURPLE*).

**Why:** this file was originally a dark "Command Center" theme, later switched to a
light theme. Because every consuming component (DirectorOrderCard, WholesaleTabContent,
PosTabContent, DirectorOrderDetailModal, orders.tsx) sources colors from this one file
instead of hardcoding hex values, the entire retheme was a single-file edit.

**How to apply:** when asked to retheme these screens again, edit only this token file.
Before finishing, grep the consuming files for stray hardcoded hex/rgba literals that
bypass the token file (e.g. a `'#0D131C'` found hardcoded in a POS header bar) — these
silently keep the old theme in specific spots even after the token file changes.
This file is explicitly scoped to the Orders screen only; other Director screens use
the separate `directorColors.ts` and must not be touched by an Orders-only retheme.
