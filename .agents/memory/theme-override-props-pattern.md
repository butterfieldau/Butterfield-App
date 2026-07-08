---
name: Per-screen theme override via optional props
description: How to reskin one screen that reuses a shared themed component without touching the shared component or breaking its other consumers.
---

When a screen needs a different visual theme (colors) than a shared component it depends on (e.g. a generic tab-screen wrapper used across many role portals), do NOT fork the component's internals or hardcode a new palette into it.

Instead:
1. Add optional override props to the shared component (e.g. `headerBackgroundColor`, `titleColor`, `subtitleColor`, `statusBarStyle`), each defaulting to the existing/original value.
2. Create screen-specific copies only for components with heavy embedded styling logic that would otherwise require prop-drilling many values (e.g. an order card or modal) — keep all data/mutation logic identical, only swap the color tokens file.
3. Verify via grep that no leftover references to the old color constants remain in the new dark-only files, and that the original shared files are byte-for-byte untouched (`git diff --stat` on them should be empty).

**Why:** This guarantees zero behavior change for every other consumer of the shared component while allowing one screen (or one tab set) to carry a fully distinct theme. It also keeps the diff auditable — reviewers can confirm "shared files untouched, new dark-only files added" instead of reasoning through conditional theme logic threaded through shared code.

**How to apply:** Use this pattern whenever asked to reskin/rebrand a subset of screens (e.g. one portal's tab) inside a multi-role app where a component library is shared across roles (customer/staff/wholesale/director-style portals).
