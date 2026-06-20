# Butterfield TestFlight Release

This Expo app is configured for an iOS App Store/TestFlight build through EAS.

## Prerequisites

- Expo account access.
- Apple Developer Program membership.
- An App Store Connect app using bundle ID `au.com.butterfieldcookies.app`.
- App Store Connect access that can create signing credentials and upload builds.

## Build

From the repository root:

```sh
pnpm --filter @workspace/butterfield run ios:build:testflight
```

Choose or create the Apple signing credentials when EAS prompts.

## Submit to TestFlight

After the production iOS build finishes:

```sh
pnpm --filter @workspace/butterfield run ios:submit:testflight
```

EAS will ask for App Store Connect credentials unless an API key is already configured.

## Notes

- The first TestFlight upload must match the App Store Connect bundle ID.
- If the App Store Connect record uses a different bundle ID, update `ios.bundleIdentifier` in `app.json` before building.
- Incrementing iOS build numbers is handled by the production EAS profile.

## Star IO SDK — iOS Compatibility

`react-native-star-io10` is pinned to `^1.12.1`. A swizzle shim (`plugins/withStarIOLazyInit.js`) patches the iOS 26 / arm64e startup crash introduced by PAC pointer validation changes.

### iOS compatibility matrix

| iOS version | Status |
|-------------|--------|
| iOS 26 (arm64e) | Shim **required** — SDK throws `NSException` during TurboModule eager init |
| iOS 17–25 | Shim is a no-op; SDK inits cleanly |
| iOS <17 | Untested — treat as unsupported for POS hardware |

### Updating the SDK

1. Bump `react-native-star-io10` in `package.json`.
2. Run a device build against the latest iOS beta and confirm the crash is gone.
3. Update the **"Validated against"** comment at the top of `plugins/withStarIOLazyInit.js` to reflect the new version.

### EAS build profiles

| Profile | `IS_POS_BUILD` | Description |
|---------|---------------|-------------|
| `production` | `0` | Standard consumer build — shim active, Star IO init is guarded |
| `production-pos` | `1` | Dedicated POS IPA — shim **skipped**, Star IO inits eagerly for full hardware access |

Set `IS_POS_BUILD=1` only when shipping an IPA to physical POS terminals that must have Star IO available immediately at launch. Never use `production-pos` for App Store / TestFlight consumer builds.
