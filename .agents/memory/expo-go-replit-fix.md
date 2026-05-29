---
name: Expo Go dev server on Replit
description: How to run expo start reliably in Replit workflows without login prompts or code-signing errors
---

## The Rule

Always use both `CI=1` AND `EXPO_OFFLINE=1` in the Expo dev script for Replit.

**Why:**
- Replit workflows attach a PTY when auto-restarting (e.g. after checkpoint), making `process.stdout.isTTY = true`
- With a TTY and no login, Expo CLI shows an interactive "Log in / Proceed anonymously" prompt that blocks Metro from starting
- `CI=1` suppresses the prompt but causes a second problem: when Expo Go requests the manifest, `getCodeSigningInfoAsync` → `fetchAndCacheNewDevelopmentCodeSigningInfoAsync` → `tryGetUserAsync` throws `CommandError: Input is required, but 'npx expo' is in non-interactive mode`
- `EXPO_OFFLINE=1` bypasses the entire online code-signing path in `getCodeSigningInfoAsync`. The function falls through to "no cached cert → return null" with a harmless warning, and the manifest is served unsigned — which Expo Go accepts in development mode

**How to apply:**
Dev script must include both flags:
```
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_REPL_ID=$REPL_ID REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN pnpm exec expo start --localhost --port $PORT
```

**Code path (Expo CLI 54):**
- `isInteractive()` in `@expo/cli/build/src/utils/interactive.js` = `!env.CI && process.stdout.isTTY`
- Code signing triggered by `expo-expect-signature: keyid="expo-root"` header Expo Go always sends
- `getCodeSigningInfoAsync` in `codesigning.js`: if `EXPO_OFFLINE` → skip `fetchAndCacheNewDevelopmentCodeSigningInfoAsync` → return null

**Do NOT use `--non-interactive`:** unreliable across restart types (shows deprecation warning but doesn't consistently suppress the prompt).
