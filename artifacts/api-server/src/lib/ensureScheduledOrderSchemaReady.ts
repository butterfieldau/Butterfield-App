import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureScheduledOrderSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await db.execute(sql.raw(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'scheduled'`));
        await db.execute(sql.raw(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'accepted'`));
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }
  return schemaReadyPromise;
}
