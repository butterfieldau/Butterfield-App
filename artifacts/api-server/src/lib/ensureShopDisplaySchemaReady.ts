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
    CREATE TABLE IF NOT EXISTS shop_display_profiles (
      user_id text PRIMARY KEY,
      permissions text NOT NULL DEFAULT '[]',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  ensured = true;
}
