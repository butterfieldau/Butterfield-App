---
name: Refresh-family serialization
description: Concurrency rule for renewable credential rotation, recovery, replay detection, and revocation.
---

Every operation that rotates a renewable credential or invalidates its session family must acquire the same family-level transaction lock before taking row locks.

**Why:** Locking only the presented credential allows a successor rotation to race a logout or replay-triggered family revocation, potentially creating a descendant after the invalidation statement's snapshot.

**How to apply:** Resolve the stable family identifier, acquire the shared family lock, and only then lock session rows, rotate, recover, or revoke. Keep this lock order consistent to avoid deadlocks.