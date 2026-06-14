#!/bin/bash
set -e
pnpm install --frozen-lockfile
# The --force flag suppresses data-loss prompts; pipe a newline as a
# safety fallback in case drizzle-kit still shows an interactive picker
# (e.g. unique-constraint on non-empty table) so the script never hangs.
printf '\n' | pnpm --filter @workspace/db run push-force || true
