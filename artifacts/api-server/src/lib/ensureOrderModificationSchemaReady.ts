import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureOrderModificationSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        // Add the new status value to the enum
        await db.execute(sql.raw(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending_customer_approval'`));

        // Add modification-tracking columns to the orders table
        await db.execute(sql.raw(`
          ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS original_items             jsonb,
            ADD COLUMN IF NOT EXISTS modified_items             jsonb,
            ADD COLUMN IF NOT EXISTS modification_reason        text,
            ADD COLUMN IF NOT EXISTS modification_expires_at    timestamptz,
            ADD COLUMN IF NOT EXISTS modification_total_delta_cents integer
        `));
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }
  return schemaReadyPromise;
}
