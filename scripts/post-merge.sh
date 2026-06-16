#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply any raw SQL schema changes that drizzle-kit push would otherwise prompt
# about interactively. Pre-applying them here means drizzle-kit sees no diff and
# skips the prompt entirely. Add new IF NOT EXISTS statements below as needed.
psql "$DATABASE_URL" -c "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;" || true
psql "$DATABASE_URL" -c "ALTER TABLE orders ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);" 2>/dev/null || true
psql "$DATABASE_URL" -c "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_pos_only boolean NOT NULL DEFAULT false;" || true
# drizzle-kit push --force skips destructive-statement warnings. With the
# interactive prompts pre-satisfied above, this now runs fully unattended.
pnpm --filter @workspace/db run push-force || true
