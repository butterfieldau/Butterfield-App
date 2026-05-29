---
name: Geo-fence two-system disconnect
description: Clock-in/login reads from stores table; Settings screen writes to store_settings — must propagate.
---

## Rule
When the director saves geo settings (radius/lat/lng) via PATCH /api/director/settings, those values must be propagated to the `stores` table rows, because clock-in and login geo-checks read `stores.geofenceRadius / stores.latitude / stores.longitude` directly.

**Why:** Two separate systems existed: `store_settings` (key-value, used by Settings screen) and `stores` (per-store table, used by clock-in and auth). They were never connected. Director could set 50m in Settings but clock-in used whatever was in the stores row (often demo defaults at wrong coordinates).

**How to apply:**
- `director.ts` PATCH /settings: after upsert to store_settings, also `db.update(storesTable).set({ geofenceRadius, latitude, longitude })` for all stores.
- `staff.ts` clock-in and `auth.ts` login: use `store_settings` as fallback when a store row has null lat/lng — never hard-error "geofence missing"; always fall back gracefully.
- Per-store values in stores table take priority; global store_settings are the safety net.
