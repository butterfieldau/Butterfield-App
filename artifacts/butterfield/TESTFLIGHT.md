# Butterfield TestFlight / EAS Build Guide

This Expo app is configured for iOS App Store/TestFlight builds through EAS.

## Prerequisites

- Expo account access.
- Apple Developer Program membership.
- An App Store Connect app using bundle ID `au.com.butterfieldcookies.app`.
- App Store Connect access that can create signing credentials and upload builds.

---

## Build Profiles

There are two production build profiles in `eas.json`:

| Profile | `IS_POS_BUILD` | Star IO | TCP printer socket | Use case |
|---------|----------------|---------|--------------------|----------|
| `production` | `0` | Removed | **Included** | App Store/TestFlight, including Shop Display printing |
| `production-pos` | `1` | Removed | **Included** | Legacy in-store POS profile |

---

## Consumer Build (App Store / TestFlight)

```sh
# From the repository root:
pnpm --filter @workspace/butterfield run ios:build:testflight
```

Or via EAS directly:
```sh
eas build --profile production --platform ios
```

- StarIO10 is removed from the app; printer and drawer commands use raw ESC/POS/TCP bytes.
- `react-native-tcp-socket` is included in the production TestFlight/App Store binary because Shop Display devices must connect directly to each shop's local receipt printer.
- Shop Display stores printer IP, port, brand, auto-print, auto-drawer, and drawer pin in the Shop Display printer profile. Each shop display device uses its own saved printer settings.

### Submit to TestFlight

```sh
pnpm --filter @workspace/butterfield run ios:submit:testflight
# or:
eas submit --profile production --platform ios
```

---

## POS Build (In-Store Hardware)

```sh
eas build --profile production-pos --platform ios
```

- StarIO10 remains removed.
- `react-native-tcp-socket` is included, same as the production profile.
- Shop Display printing still happens from the Shop Display device to the local printer on port 9100.

### POS Build Verification Checklist

After triggering an EAS `production-pos` build, run these checks before shipping to staff:

#### 1 — Pod linkage (build server)

In the EAS build log, confirm the CocoaPods install step lists:
```
Installing react-native-tcp-socket x.y.z
```

StarIO10 / StarIO10Core should not appear in the install log.

#### 2 — ObjC shim compile (build server / Xcode)

In the Xcode compile log (accessible via EAS build artefacts or a local `expo prebuild` + `xcodebuild`):
- `StarIOSafeInit.m` should compile without warnings at `-Wall -Wextra`.
- Expected: `[StarIOSafeInit] StarIO10 init swizzled for iOS 26 safety (full method no-op on failure).` in the device console at app launch.
- Acceptable on a healthy Star printer: the swizzled `-init` succeeds and the shim is dormant.

#### 3 — Test print (real device, Director → Settings → Printer)

1. Open the Director portal → tap the store → scroll to Printer Settings.
2. Enter the Star printer's local IP.
3. Set **Printer Brand** to **Star**.
4. Tap **Send Test Print** → receipt should emerge from the printer.
5. Enable **Auto-open Cash Drawer**.
6. Tap **Test Open Drawer** → drawer should spring open.
   - This calls `sendOpenDrawer(..., api.shopDisplay.printerBytes, drawerPin, printerBrand)` and sends raw drawer bytes over TCP from the Shop Display device.
   - A success toast confirms the local printer connection worked.
   - Any failure here usually means the iPad/iPhone is not on the same network as the printer, the printer IP is wrong, or port 9100 is blocked.

#### 4 — Linkmap check (optional, deeper verification)

In the `.ipa` artefact:
```sh
# Unzip the .ipa and inspect the binary:
nm Payload/Butterfield.app/Butterfield | grep -i starprinter
```
Should not return Star SDK symbols. Printing now relies on raw TCP socket output.

---

## Static Verification Summary (June 2026)

All four layers of the POS build have been statically verified to be correct:

| Layer | Production behaviour | Verified |
|-------|----------------------|----------|
| `react-native.config.js` | No iOS exclusion for `react-native-tcp-socket` | ✓ |
| `metro.config.js` | Resolves `react-native-tcp-socket` to the real module | ✓ |
| `plugins/withPodfileExclusion.js` | No POS-only pods are excluded | ✓ |

**Bug fixed (June 2026):** Shop Display settings now sends Test Print and Open Drawer from the Shop Display device using the Shop Display printer bytes endpoint, instead of asking the cloud API server to reach a local-network printer.

**TypeScript typecheck:** passes cleanly after the `stores.tsx` fix.

---

## Notes

- The first TestFlight upload must match the App Store Connect bundle ID.
- If the App Store Connect record uses a different bundle ID, update `ios.bundleIdentifier` in `app.json` before building.
- Incrementing iOS build numbers is handled automatically by `autoIncrement: true` in both production profiles.
- When Star Micronics ships a new SDK version, verify the iOS 26 crash is still suppressed before bumping the version pin in `package.json`. Update the "Validated against" line in `plugins/withStarIOLazyInit.js`.
