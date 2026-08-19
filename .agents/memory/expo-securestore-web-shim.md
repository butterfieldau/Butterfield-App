---
name: Expo SecureStore web shim
description: Replit Expo web previews can expose an incomplete SecureStore shim that imports successfully but fails when called.
---

Do not treat a successful `expo-secure-store` import as proof that its methods work in the Expo web preview. Platform-guard every read, write, and delete operation; use browser storage only for the non-biometric web fallback.

**Why:** The web shim accepted the import but threw `setValueWithKeyAsync is not a function` during login, so import-time guards and try/catch around module loading did not prevent a broken sign-in flow.

**How to apply:** Keep refresh and biometric credentials in SecureStore on native platforms. On web, avoid calling SecureStore entirely, never expose biometric opt-in, and use the project's browser storage abstraction for session continuity.