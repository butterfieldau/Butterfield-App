---
name: Expo Go dev server on Replit
description: How to run expo start reliably in Replit workflows without login prompts or code-signing errors — and with Metro watch mode enabled
---

## The Rule

Use `EXPO_OFFLINE=1` **only**. Do NOT set `CI=1` — it kills Metro watch mode (file changes never hot-reload).

**Why:**
- `CI=1` suppresses Expo's interactive login prompt BUT also causes Metro to log "reloads are disabled" and stop watching for file changes. Any code change requires a full workflow restart to appear.
- `EXPO_OFFLINE=1` alone is sufficient: it bypasses `fetchAndCacheNewDevelopmentCodeSigningInfoAsync` (the network call that throws `CommandError` when no login exists). The manifest is served unsigned — Expo Go accepts this in development mode.
- Replit workflows do not attach a real TTY for stdin, so Expo's interactive "Log in / Proceed anonymously" prompt is never shown even without `CI=1`.

**How to apply:**
Dev script should include `EXPO_OFFLINE=1` but NOT `CI=1`:
```
EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_REPL_ID=$REPL_ID REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN pnpm exec expo start --localhost --port $PORT --clear
```

**Code path (Expo CLI 54):**
- `isInteractive()` in `@expo/cli/build/src/utils/interactive.js` = `!env.CI && process.stdout.isTTY`
- Code signing triggered by `expo-expect-signature: keyid="expo-root"` header Expo Go always sends
- `getCodeSigningInfoAsync` in `codesigning.js`: if `EXPO_OFFLINE` → skip `fetchAndCacheNewDevelopmentCodeSigningInfoAsync` → return null

**Do NOT use `--non-interactive`:** unreliable across restart types.
**Do NOT set `CI=1`:** disables Metro watch mode — file changes require full workflow restart to appear.
