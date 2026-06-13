import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let ensured = false;

export async function ensureRosterSchemaReady() {
  if (ensured) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS staff_roster (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      date text NOT NULL,
      start_time text NOT NULL,
      end_time text NOT NULL,
      role text NOT NULL DEFAULT 'crew',
      notes text,
      is_confirmed boolean NOT NULL DEFAULT false,
      confirmed_at timestamp,
      created_by text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS staff_roster_date_idx
    ON staff_roster(date);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS staff_roster_user_id_idx
    ON staff_roster(user_id);
  `);

  ensured = true;
}
