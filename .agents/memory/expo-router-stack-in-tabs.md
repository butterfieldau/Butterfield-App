---
name: Expo Router — Stack group inside Tabs
description: How to correctly nest a Stack navigator inside a Tabs group without route or duplicate-screen conflicts
---

## The Rule

To have a Stack navigator for a group of screens inside a Tabs layout, use ONLY the directory pattern. Never pair `foo.tsx` with a `foo/` directory.

**CORRECT**
```
(director)/
  _layout.tsx        ← Tabs
  vault/
    _layout.tsx      ← Stack (no route, just layout)
    index.tsx        ← initial screen  → URL: /(director)/vault
    recipe.tsx       → URL: /(director)/vault/recipe
```

**WRONG — causes two different errors:**
```
(director)/
  vault.tsx          ← screen AND
  vault/
    _layout.tsx      ← Stack
    index.tsx        ← initial screen
```
- If vault.tsx + vault/index.tsx both exist → "Found conflicting screens with the same pattern" (same URL)
- If vault.tsx + vault/_layout.tsx both exist → "Duplicate screen named 'vault'" (Tabs sees two 'vault' entries)

## Why

Expo Router maps filenames to routes purely by filename, not content. A file at `vault.tsx` always creates a screen named `vault` in the parent navigator. A directory `vault/` with `_layout.tsx` also creates a group named `vault`. Both can't coexist in the same parent navigator.

## How to apply

Any time a Tabs screen needs sub-screens with push/pop (swipe-back), put ALL content in `screenName/` with `_layout.tsx` (Stack) + `index.tsx` (main content). The `screenName.tsx` file must not exist. Register `screenName` as `href: null` in the Tabs layout as normal.

If you accidentally create `foo.tsx` alongside `foo/`, use `mv foo.tsx foo/index.tsx` via bash — the write tool cannot delete files.
