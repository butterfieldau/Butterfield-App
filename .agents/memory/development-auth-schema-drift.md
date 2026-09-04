---
name: Development auth schema drift
description: Development authentication can fail because the database is behind the session-version schema.
---

Authentication code and the active development database can drift, causing every protected route to fail during session verification before its own handler runs.

**Why:** A route-level smoke test was initially mistaken for a feature failure, but both normal login and an application-signed short-lived session stopped at the same schema mismatch.

**How to apply:** When authenticated development requests fail before protected handlers execute, verify the auth schema is current. Do not bypass authentication to claim an end-to-end result; repair the schema first.