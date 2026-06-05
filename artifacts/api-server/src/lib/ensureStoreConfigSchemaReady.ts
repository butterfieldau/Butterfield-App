import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

async function execute(statements: string[]) {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensureStoreConfigSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await execute([
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS printer_ip text`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS printer_port integer NOT NULL DEFAULT 9100`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS printer_brand text NOT NULL DEFAULT 'epson'`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS order_cutoff_time text`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS daily_special text`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS pre_delete_status text`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS deleted_at timestamp`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS purge_at timestamp`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS preferred_store_id text`,
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id text`,
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS auto_print boolean NOT NULL DEFAULT true`,
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_name text`,
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone text`,
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email text`,
        ]);
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }

  return schemaReadyPromise;
}
