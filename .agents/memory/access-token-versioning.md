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

When introducing renewable sessions, preserve compatibility with installed app
versions that only understand access tokens. Let clients explicitly advertise
renewal support before shortening their access-token lifetime.

**Why:** Shortening every login token to 15 minutes logged older native builds
out repeatedly because they could not use the new refresh credential.

**How to apply:** Capability-aware login responses give legacy builds a
long-lived, version-revocable token while renewal-aware builds use short access
tokens backed by sliding refresh sessions.