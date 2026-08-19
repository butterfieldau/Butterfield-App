---
name: Access token versioning
description: How access credentials are invalidated when a mutable account identity changes.
---

Use a monotonic, persisted account session version in access-token claims whenever
changing account state must immediately revoke previously issued bearer tokens.

**Why:** Comparing a bearer’s email claim to the current account email invalidates
tokens after an address change, but can revive an old token if the address changes
back before its expiry (the ABA problem).

**How to apply:** Increment the version atomically with the sensitive account
change, issue the replacement token at the new version, and reject every request
whose token version differs from the canonical account version. Treat tokens
without the version as replaced during the rollout.