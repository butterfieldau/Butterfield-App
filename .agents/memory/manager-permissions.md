---
name: Manager permission system — gotchas
description: How manager permissions are enforced across UI routing, screen-level flags, and API middleware — common mismatch patterns
---

## Rule
When adding a new section that managers can access, you must update ALL of:
1. `_layout.tsx` — `mgrHref(perm)` on the Tabs.Screen (controls tab route availability)
2. `more.tsx` — `canSee(perm)` on the menu row (controls what appears in the More menu)
3. The screen itself — any `isDirector` or role-based flag that gates UI controls
4. The API route — `requireRole` + `requireManagerPermission` or `resolveDirectorPermission`

**Why:** Each layer guards a different thing. Missing any one means managers either can't navigate there, can navigate but see a read-only view, or can see the UI but get 403 from the API.

## How to apply
- `stock.tsx` uses `isDirector = role === 'director' || role === 'master' || role === 'manager'` — managers get full edit access.
- `director-pricing.ts` uses an array middleware `[requireRole('director','manager','master'), requireManagerPermission('pricing')]`.
- `resolveDirectorPermission` in `director.ts` maps path prefixes to permission strings — discount codes now return 'pricing' (not 'director_only').
- `timesheets` maps to the 'timesheets' permission (not 'reports') in both layout and more.tsx.
- `stock` maps to the 'stock' permission (not 'products') in both layout and more.tsx.
- The `settings` tab href condition must include all perms that route into settings: `settings || announcements || rewards || banners`.

## Valid permission strings (from MANAGER_PERMISSIONS)
dashboard, orders, users, timesheets, products, reports, rewards, announcements, settings, pricing, banners, stock
