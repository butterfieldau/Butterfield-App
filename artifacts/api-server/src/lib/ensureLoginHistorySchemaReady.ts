import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let ensured = false;

export async function ensureLoginHistorySchemaReady() {
  if (ensured) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS login_history (
      id text PRIMARY KEY,
      user_id text,
      email text,
      role text,
      success boolean NOT NULL DEFAULT false,
      fail_reason text,
      ip text,
      user_agent text,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS login_history_created_at_idx
    ON login_history(created_at DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS login_history_email_idx
    ON login_history(email);
  `);

  ensured = true;
}
