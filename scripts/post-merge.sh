#!/bin/bash
set -e
pnpm install --frozen-lockfile
# drizzle-kit push --force skips destructive-statement warnings but still
# shows an interactive prompt when adding a unique constraint to a non-empty
# table:
#   ❯ No, add the constraint without truncating  (default — just press Enter)
#     Yes, truncate the table
# Send enough newlines to accept the default on every such prompt.
printf '\n\n\n\n\n' | pnpm --filter @workspace/db run push-force || true
