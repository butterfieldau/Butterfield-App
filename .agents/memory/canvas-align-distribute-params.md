---
name: Canvas align/distribute param names
description: Correct parameter names for canvas align/distribute actions, to avoid a bare 'alignment' error.
---

The canvas `align` action takes `alignment` (enum: left/center-horizontal/right/top/center-vertical/bottom), not `edge`.

The canvas `distribute` action takes `direction` (enum: horizontal/vertical), not `axis`.

**Why:** Guessing plausible-sounding param names (`edge`, `axis`) causes the call to fail with an unhelpful bare `Error: 'alignment'` message that doesn't clearly point at the fix.

**How to apply:** When calling `applyCanvasActions` with `align`/`distribute` actions, use `{ type: "align", shapeIds: [...], alignment: "top" }` and `{ type: "distribute", shapeIds: [...], direction: "horizontal" }`.
