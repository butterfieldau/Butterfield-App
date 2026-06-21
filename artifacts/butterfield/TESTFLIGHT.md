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

`react-native-star-io10` remains installed for JavaScript compatibility, but iOS autolinking is disabled in `react-native.config.js` for the TestFlight / App Store app.

That keeps the consumer build stable on iOS 26, where the precompiled Star framework currently aborts during React Native startup before any screen renders.

### What still works

- Epson and Star receipt printing over raw TCP
- Auto-print flows
- Director and POS print actions

### What is intentionally unavailable on iOS

- The Star native cash-drawer path used by `sendOpenDrawer` / `tryOpenDrawerWithStarSdk`

When the native Star module is not linked, those actions fail gracefully and show the existing in-app error instead of crashing the whole app.

### Re-enabling Star on iOS later

Only re-enable iOS autolinking for `react-native-star-io10` after validating a Star SDK version that launches cleanly on current iOS hardware from TestFlight.
