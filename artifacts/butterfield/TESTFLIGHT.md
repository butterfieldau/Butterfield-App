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
