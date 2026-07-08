---
name: checkDatabase() false negative in this project
description: checkDatabase() tool reports "not provisioned" even though DATABASE_URL works and the app's Postgres is fully functional.
---

`checkDatabase()` can report `provisioned: false` in this project even though `$DATABASE_URL` is set and the app's Postgres database is live and serving traffic.

**Why:** Unknown root cause (possibly a connector-detection quirk), but it has recurred across sessions in this project.

**How to apply:** Don't trust a `checkDatabase()` false negative as proof there's no DB. Verify with `psql "$DATABASE_URL" -c '...'` via bash directly before concluding the database is unavailable.
