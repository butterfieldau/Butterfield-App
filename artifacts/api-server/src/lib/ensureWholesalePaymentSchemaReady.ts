import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let schemaReadyPromise: Promise<void> | null = null;

async function execute(statements: string[]) {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensureWholesalePaymentSchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        await execute([
          `ALTER TABLE wholesale_cards ADD COLUMN IF NOT EXISTS stripe_payment_method_id text`,
          `ALTER TABLE wholesale_cards ADD COLUMN IF NOT EXISTS exp_month integer`,
          `ALTER TABLE wholesale_cards ADD COLUMN IF NOT EXISTS exp_year integer`,
          `ALTER TABLE wholesale_cards ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now()`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS stripe_payment_status text NOT NULL DEFAULT 'pending'`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS payment_method_type text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS original_total_cents integer`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS stripe_invoice_id text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_pdf_url text`,
          `ALTER TABLE wholesale_orders ADD COLUMN IF NOT EXISTS invoice_updated_at timestamp`,
        ]);
      } catch (error) {
        schemaReadyPromise = null;
        throw error;
      }
    })();
  }

  return schemaReadyPromise;
}
