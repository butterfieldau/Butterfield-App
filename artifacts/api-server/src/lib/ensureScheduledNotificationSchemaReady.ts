import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

async function execute(statements: string[]) {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensureScheduledNotificationSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await execute([
          `CREATE TABLE IF NOT EXISTS scheduled_notifications (
            id text PRIMARY KEY,
            title text NOT NULL,
            message text NOT NULL,
            image_url text,
            image_object_path text,
            action_type text,
            action_value text,
            audience_type text NOT NULL,
            audience_filters text,
            scheduled_at timestamp NOT NULL,
            sent_at timestamp,
            status text NOT NULL DEFAULT 'draft',
            created_by text NOT NULL,
            processing_started_at timestamp,
            last_error text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS image_url text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS image_object_path text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS action_type text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS action_value text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS audience_filters text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS sent_at timestamp`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT ''`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS processing_started_at timestamp`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS last_error text`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now()`,
          `ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()`,
        ]);
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }

  return schemaReadyPromise;
}
