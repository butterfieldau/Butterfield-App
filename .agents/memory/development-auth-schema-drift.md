---
name: Authentication schema drift
description: Authentication can fail globally when development or production databases lag behind the session schema.
---

Authentication code and an active database can drift, causing login itself or every protected route to fail before the intended handler runs.

**Why:** Missing session-version columns and renewable-session tables caused a production-wide login outage. The generic 503 hid that a full-row user query referenced a missing column.

**How to apply:** When auth suddenly fails globally after session-related merges, compare schema source, development, and production before debugging credentials. Repair development through the supported schema flow, verify login there, then Publish so Replit applies the production diff.