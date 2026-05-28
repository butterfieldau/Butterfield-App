---
name: Pre-existing Stripe web bundler error
description: Web preview always fails with native Stripe module error — expected, not a regression
---

## Rule
The web preview for the Butterfield Expo app shows a blank screen with a 500 error. This is **pre-existing and expected** — do not attempt to fix it unless specifically asked.

**Why:** `@stripe/stripe-react-native` imports native-only React Native modules (`codegenNativeCommands`, `codegenNativeComponent`) that cannot run on web. The app targets iOS/Android only.

## How to apply
- When verifying changes in the web preview and it shows blank/500, check logs. If the only error is the Stripe MIME type error, the code change is fine.
- Test wholesale/staff/director screens by checking for TypeScript errors instead of web screenshot.
