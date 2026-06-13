import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let ensured = false;

export async function ensureShopDisplaySchemaReady() {
  if (ensured) return;

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'shop_display'
          AND enumtypid = 'role'::regtype
      ) THEN
        ALTER TYPE role ADD VALUE 'shop_display';
      END IF;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY,
      actor_user_id text,
      actor_name text,
      actor_role text,
      entity_type text NOT NULL,
      entity_id text NOT NULL,
      action text NOT NULL,
      reason text,
      before_json text,
      after_json text,
      metadata_json text,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_task_history (
      id text PRIMARY KEY,
      task_id text NOT NULL,
      task_title text NOT NULL,
      task_category text NOT NULL,
      completed_by_user_id text,
      completed_by_name text,
      completed_by_role text,
      completion_status text NOT NULL DEFAULT 'completed',
      notes text,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE staff_tasks
    ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'daily';
  `);

  await db.execute(sql`
    ALTER TABLE staff_profiles
    ADD COLUMN IF NOT EXISTS clock_pin text;
  `);

  await db.execute(sql`
    ALTER TABLE staff_profiles
    ADD COLUMN IF NOT EXISTS settings_pin_hash text;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shop_display_profiles (
      user_id text PRIMARY KEY,
      permissions text NOT NULL DEFAULT '[]',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_enabled boolean NOT NULL DEFAULT false;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_username text;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_password_encrypted text;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_pairing_code text;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS linkly_terminal_id text;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pin_lockouts (
      user_id text PRIMARY KEY,
      failed_attempts integer NOT NULL DEFAULT 0,
      last_attempt_at timestamp,
      locked_until timestamp,
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS printer_ip text;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS printer_port integer NOT NULL DEFAULT 9100;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS printer_brand text NOT NULL DEFAULT 'epson';
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS auto_print boolean NOT NULL DEFAULT false;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS auto_drawer boolean NOT NULL DEFAULT false;
  `);

  await db.execute(sql`
    ALTER TABLE shop_display_profiles
    ADD COLUMN IF NOT EXISTS drawer_pin integer NOT NULL DEFAULT 0;
  `);

  // ── pos_daily_summaries — pre-computed nightly POS rollup ──────────────────
  // Guard ensures the table exists before analytics fast-path queries or the
  // daily summary job run, even if drizzle-kit push was never executed.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_daily_summaries (
      id text PRIMARY KEY,
      date text NOT NULL,
      store_id text NOT NULL DEFAULT '',
      total_sales_cents integer NOT NULL DEFAULT 0,
      transaction_count integer NOT NULL DEFAULT 0,
      cash_total_cents integer NOT NULL DEFAULT 0,
      card_total_cents integer NOT NULL DEFAULT 0,
      discount_total_cents integer NOT NULL DEFAULT 0,
      cancelled_cents integer NOT NULL DEFAULT 0,
      items_sold integer NOT NULL DEFAULT 0,
      top_products jsonb,
      hourly_totals jsonb,
      tender_breakdown jsonb,
      computed_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_summaries_date_store_unique
    ON pos_daily_summaries(date, store_id);
  `);

  ensured = true;
}
