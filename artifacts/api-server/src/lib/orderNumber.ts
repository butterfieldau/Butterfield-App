import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

let seqReady = false;

async function ensureSequence(): Promise<void> {
  if (seqReady) return;
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1`);
  seqReady = true;
}

export async function generateOrderNumber(): Promise<string> {
  await ensureSequence();
  const result = await db.execute(sql`SELECT nextval('order_number_seq') AS n`);
  const n = Number((result.rows[0] as { n: string | number }).n);
  return `BF${String(n).padStart(5, '0')}`;
}
