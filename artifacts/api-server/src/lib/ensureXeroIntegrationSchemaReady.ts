import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

async function execute(statements: string[]) {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensureXeroIntegrationSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await execute([
          `CREATE TABLE IF NOT EXISTS xero_integrations (
            id text PRIMARY KEY,
            status text NOT NULL DEFAULT 'disconnected',
            tenant_id text,
            tenant_name text,
            connection_id text,
            access_token text,
            refresh_token text,
            scope text,
            token_expires_at timestamp,
            default_account_code text,
            default_tax_type text,
            default_invoice_status text NOT NULL DEFAULT 'AUTHORISED',
            branding_theme_id text,
            branding_theme_name text,
            connected_by text,
            connected_at timestamp,
            disconnected_at timestamp,
            last_sync_at timestamp,
            last_error text,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
          )`,
          `ALTER TABLE wholesale_accounts ADD COLUMN IF NOT EXISTS xero_contact_id text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_number text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_status text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_due_date text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS xero_invoice_id text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS xero_invoice_number text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS xero_invoice_status text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS xero_invoice_pdf_url text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS xero_invoice_updated_at timestamp`,
        ]);
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }

  return schemaReadyPromise;
}
