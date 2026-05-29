---
name: Expo Replit domain routing
description: REACT_NATIVE_PACKAGER_HOSTNAME must be REPLIT_EXPO_DEV_DOMAIN not REPLIT_DEV_DOMAIN for Expo Go to load bundles
---

## Rule
Set `REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN` in the Expo dev script — NOT `$REPLIT_DEV_DOMAIN`.

**Why:** Replit exposes two separate domains:
- `REPLIT_DEV_DOMAIN` (`...worf.replit.dev`) → shared HTTP reverse proxy, routes web artifacts on port 80
- `REPLIT_EXPO_DEV_DOMAIN` (`...expo.worf.replit.dev`) → Expo-specific domain, routes to the artifact's `localPort` (Metro bundler)

`REACT_NATIVE_PACKAGER_HOSTNAME` controls what hostname appears in the Metro manifest's `bundleUrl`, `debuggerHost`, and `hostUri` fields. If set to `REPLIT_DEV_DOMAIN`, the manifest gets fetched OK (via the `exp://` QR URL which already uses `REPLIT_EXPO_DEV_DOMAIN`) but every subsequent request — bundle download, asset fetch — fails with "network error" because the shared proxy doesn't route to Metro.

**How to apply:** The full correct dev script pattern for Expo in Replit:
```
EXPO_NO_TELEMETRY=1 EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_REPL_ID=$REPL_ID REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN pnpm exec expo start --localhost --port $PORT --non-interactive
```

Also: do NOT install `@expo/ngrok` — it triggers login/tunnel prompts that block Metro startup. The `--localhost` + Replit proxy setup replaces the need for ngrok entirely.
