/**
 * Surcharge reconciliation — integration tests
 *
 * Verifies the three critical surcharge correctness paths:
 *  1. upsertTransaction SQL GREATEST: a later upsert with a higher surcharge
 *     updates amount_surcharge_cents even when the row is already complete=true.
 *  2. POST /pos/orders: when linkly_transactions.amount_surcharge_cents exceeds
 *     the client-supplied surchargeCents, the order row is corrected and the
 *     response returns the reconciled value.
 *  3. POST /pos/orders/:id/email-invoice: heals the order's surcharge_cents from
 *     linkly_transactions before sending the email (zero-stored, non-zero Linkly).
 *
 * These tests require a running API server on localhost:80 and a live database.
 * They are skipped automatically when the server is not reachable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { db, usersTable } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

const API_BASE = 'http://localhost:80/api';

// ── Server availability check ─────────────────────────────────────────────────

async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/products`, {
      signal: AbortSignal.timeout(4_000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

const serverAvailable = await isServerUp();

// ── Shared state ──────────────────────────────────────────────────────────────

let staffToken: string | null = null;
let staffUserId: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: upsertTransaction SQL GREATEST behaviour
// Tests the raw ON CONFLICT DO UPDATE rule that amount_surcharge_cents always
// uses GREATEST (not frozen by complete=true like all other fields).
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!serverAvailable)(
  'upsertTransaction — GREATEST surcharge overrides zero even when complete=true',
  () => {
    const sessionId = `test-session-${randomUUID()}`;
    const userId = randomUUID(); // synthetic; not a real users row

    afterAll(async () => {
      await db.execute(sql`
        DELETE FROM linkly_transactions WHERE session_id = ${sessionId}
      `);
    });

    it('inserts an initial completed transaction with surcharge = 0', async () => {
      // Replicate what upsertTransaction does (function is internal; we test the SQL).
      await db.execute(sql`
        INSERT INTO linkly_transactions (
          id, user_id, source, session_id, txn_ref,
          amount_cents, amount_surcharge_cents,
          status, success, complete,
          response_code, response_text,
          updated_at
        ) VALUES (
          ${randomUUID()}, ${userId}, 'pos', ${sessionId}, 'REF-001',
          2000, 0,
          'approved', true, true,
          '00', 'Approved',
          now()
        )
        ON CONFLICT (session_id) DO UPDATE SET
          amount_cents             = EXCLUDED.amount_cents,
          amount_surcharge_cents   = GREATEST(linkly_transactions.amount_surcharge_cents, EXCLUDED.amount_surcharge_cents),
          status                   = CASE WHEN linkly_transactions.complete THEN linkly_transactions.status ELSE EXCLUDED.status END,
          success                  = CASE WHEN linkly_transactions.complete THEN linkly_transactions.success ELSE EXCLUDED.success END,
          complete                 = CASE WHEN linkly_transactions.complete THEN linkly_transactions.complete ELSE EXCLUDED.complete END,
          updated_at               = now()
      `);

      const result = await db.execute(sql`
        SELECT amount_surcharge_cents, complete
        FROM linkly_transactions
        WHERE session_id = ${sessionId}
        LIMIT 1
      `);
      const row = ((result as any).rows?.[0] ?? (result as any)[0]) as any;
      expect(Number(row?.amount_surcharge_cents)).toBe(0);
      expect(row?.complete).toBe(true);
    });

    it(
      'a second upsert with surcharge=150 raises amount_surcharge_cents via GREATEST ' +
        'even though the row is already complete=true',
      async () => {
        // The real upsertTransaction uses exactly this ON CONFLICT clause.
        // amount_surcharge_cents uses GREATEST unconditionally; all other terminal
        // fields are frozen by the CASE WHEN complete THEN … END guard.
        await db.execute(sql`
          INSERT INTO linkly_transactions (
            id, user_id, source, session_id, txn_ref,
            amount_cents, amount_surcharge_cents,
            status, success, complete,
            response_code, response_text,
            updated_at
          ) VALUES (
            ${randomUUID()}, ${userId}, 'pos', ${sessionId}, 'REF-001',
            2000, 150,
            'approved', true, true,
            '00', 'Approved',
            now()
          )
          ON CONFLICT (session_id) DO UPDATE SET
            amount_cents             = EXCLUDED.amount_cents,
            amount_surcharge_cents   = GREATEST(linkly_transactions.amount_surcharge_cents, EXCLUDED.amount_surcharge_cents),
            status                   = CASE WHEN linkly_transactions.complete THEN linkly_transactions.status ELSE EXCLUDED.status END,
            success                  = CASE WHEN linkly_transactions.complete THEN linkly_transactions.success ELSE EXCLUDED.success END,
            complete                 = CASE WHEN linkly_transactions.complete THEN linkly_transactions.complete ELSE EXCLUDED.complete END,
            updated_at               = now()
        `);

        const result = await db.execute(sql`
          SELECT amount_surcharge_cents, complete, status
          FROM linkly_transactions
          WHERE session_id = ${sessionId}
          LIMIT 1
        `);
        const row = ((result as any).rows?.[0] ?? (result as any)[0]) as any;

        // GREATEST must have raised surcharge from 0 → 150
        expect(Number(row?.amount_surcharge_cents)).toBe(150);
        // complete and status must remain frozen (not overwritten by the upsert)
        expect(row?.complete).toBe(true);
        expect(row?.status).toBe('approved');
      },
    );

    it('a third upsert with a lower surcharge (50) does NOT reduce it below 150', async () => {
      await db.execute(sql`
        INSERT INTO linkly_transactions (
          id, user_id, source, session_id, txn_ref,
          amount_cents, amount_surcharge_cents,
          status, success, complete,
          response_code, response_text,
          updated_at
        ) VALUES (
          ${randomUUID()}, ${userId}, 'pos', ${sessionId}, 'REF-001',
          2000, 50,
          'approved', true, true,
          '00', 'Approved',
          now()
        )
        ON CONFLICT (session_id) DO UPDATE SET
          amount_cents             = EXCLUDED.amount_cents,
          amount_surcharge_cents   = GREATEST(linkly_transactions.amount_surcharge_cents, EXCLUDED.amount_surcharge_cents),
          status                   = CASE WHEN linkly_transactions.complete THEN linkly_transactions.status ELSE EXCLUDED.status END,
          success                  = CASE WHEN linkly_transactions.complete THEN linkly_transactions.success ELSE EXCLUDED.success END,
          complete                 = CASE WHEN linkly_transactions.complete THEN linkly_transactions.complete ELSE EXCLUDED.complete END,
          updated_at               = now()
      `);

      const result = await db.execute(sql`
        SELECT amount_surcharge_cents
        FROM linkly_transactions
        WHERE session_id = ${sessionId}
        LIMIT 1
      `);
      const row = ((result as any).rows?.[0] ?? (result as any)[0]) as any;
      // GREATEST(150, 50) = 150 — must not regress
      expect(Number(row?.amount_surcharge_cents)).toBe(150);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Shared auth setup (Suites 2 & 3)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!serverAvailable)(
  'Surcharge reconciliation — HTTP endpoint tests',
  () => {
    beforeAll(async () => {
      // Seed demo accounts (idempotent).
      await fetch(`${API_BASE}/auth/seed-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      // Resolve the demo staff user's DB id.
      const [staffRow] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, 'staff@demo.com'))
        .limit(1);
      staffUserId = staffRow?.id ?? null;

      // Log in as demo staff to obtain a JWT.
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@demo.com', password: 'Demo1234!' }),
      });
      const loginData = (await loginRes.json()) as { token?: string };
      staffToken = loginData?.token ?? null;
    }, 30_000);

    // ── Suite 2: POST /pos/orders — server-side surcharge reconciliation ──────

    describe('POST /pos/orders — reconciles surcharge from linkly_transactions', () => {
      const linklySessionId = `test-linkly-${randomUUID()}`;
      let createdOrderId: string | null = null;

      beforeAll(async () => {
        // Seed a completed Linkly transaction with surcharge = 150 cents.
        // The "client" will send surchargeCents = 0 to simulate the race where
        // the webhook arrives after the SSE stream resolves.
        await db.execute(sql`
          INSERT INTO linkly_transactions (
            id, user_id, source, session_id, txn_ref,
            amount_cents, amount_surcharge_cents,
            status, success, complete,
            response_code, response_text,
            updated_at
          ) VALUES (
            ${randomUUID()},
            ${staffUserId},
            'pos',
            ${linklySessionId},
            ${'TXNREF-' + randomUUID().slice(0, 8)},
            2150, 150,
            'approved', true, true,
            '00', 'Approved',
            now()
          )
          ON CONFLICT (session_id) DO NOTHING
        `);
      });

      afterAll(async () => {
        // Clean up the test order and Linkly row.
        if (createdOrderId) {
          await db.execute(sql`DELETE FROM orders WHERE id = ${createdOrderId}`);
        }
        await db.execute(sql`DELETE FROM linkly_transactions WHERE session_id = ${linklySessionId}`);
      });

      it('prerequisite: staff JWT obtained', () => {
        expect(staffToken).toBeTruthy();
        expect(staffUserId).toBeTruthy();
      });

      it(
        'POST /pos/orders with surchargeCents=0 but linkly row has surcharge=150 ' +
          '→ response surchargeCents is 150 and DB order.surcharge_cents is 150',
        async () => {
          expect(staffToken).toBeTruthy();

          const res = await fetch(`${API_BASE}/pos/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${staffToken}`,
            },
            body: JSON.stringify({
              items: [
                {
                  // Use a build-a-box virtual ID so unitPriceCents is trusted directly
                  productId: 'build-a-box-1',
                  productName: 'Test Box',
                  unitPriceCents: 2000,
                  quantity: 1,
                  selectedOptions: [],
                },
              ],
              orderType: 'pickup',
              paymentMethod: 'eftpos',
              surchargeCents: 0, // client under-reports: linkly row has 150
              linklySessionId,
            }),
          });

          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            data?: { id?: string; surchargeCents?: number; totalCents?: number };
          };

          createdOrderId = body?.data?.id ?? null;
          expect(createdOrderId).toBeTruthy();

          // Response must reflect the reconciled surcharge.
          expect(body?.data?.surchargeCents).toBe(150);
          // Total must be baseTotalCents (2000) + reconciled surcharge (150).
          expect(body?.data?.totalCents).toBe(2150);

          // Verify DB row is also corrected.
          const dbResult = await db.execute(sql`
            SELECT surcharge_cents, total_cents
            FROM orders
            WHERE id = ${createdOrderId}
            LIMIT 1
          `);
          const row = ((dbResult as any).rows?.[0] ?? (dbResult as any)[0]) as any;
          expect(Number(row?.surcharge_cents)).toBe(150);
          expect(Number(row?.total_cents)).toBe(2150);
        },
        20_000,
      );

      it(
        'POST /pos/orders with surchargeCents already matching linkly (150) ' +
          '→ no reconciliation needed — response surchargeCents stays 150',
        async () => {
          expect(staffToken).toBeTruthy();

          const sessionId2 = `test-linkly-${randomUUID()}`;
          let orderId2: string | null = null;

          // Seed a matching Linkly row (surcharge = 150, same as what client will send).
          await db.execute(sql`
            INSERT INTO linkly_transactions (
              id, user_id, source, session_id, txn_ref,
              amount_cents, amount_surcharge_cents,
              status, success, complete,
              response_code, response_text,
              updated_at
            ) VALUES (
              ${randomUUID()}, ${staffUserId}, 'pos', ${sessionId2},
              ${'TXNREF-' + randomUUID().slice(0, 8)},
              2150, 150, 'approved', true, true, '00', 'Approved', now()
            )
            ON CONFLICT (session_id) DO NOTHING
          `);

          try {
            const res = await fetch(`${API_BASE}/pos/orders`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${staffToken}`,
              },
              body: JSON.stringify({
                items: [
                  {
                    productId: 'build-a-box-1',
                    productName: 'Test Box',
                    unitPriceCents: 2000,
                    quantity: 1,
                    selectedOptions: [],
                  },
                ],
                orderType: 'pickup',
                paymentMethod: 'eftpos',
                surchargeCents: 150, // client matches Linkly — no reconciliation needed
                linklySessionId: sessionId2,
              }),
            });

            expect(res.status).toBe(200);
            const body = (await res.json()) as {
              data?: { id?: string; surchargeCents?: number };
            };
            orderId2 = body?.data?.id ?? null;
            expect(body?.data?.surchargeCents).toBe(150);
          } finally {
            if (orderId2) {
              await db.execute(sql`DELETE FROM orders WHERE id = ${orderId2}`);
            }
            await db.execute(sql`DELETE FROM linkly_transactions WHERE session_id = ${sessionId2}`);
          }
        },
        20_000,
      );
    });

    // ── Suite 3: POST /pos/orders/:id/email-invoice — surcharge heal ──────────

    describe('POST /pos/orders/:id/email-invoice — heals surcharge from linkly_transactions', () => {
      let orderId: string | null = null;
      const linklySessionId = `test-email-linkly-${randomUUID()}`;

      beforeAll(async () => {
        // Create an order directly in the DB with surcharge_cents = 0.
        // This simulates the case where the order was created before the Linkly
        // webhook arrived and wrote a non-zero surcharge.
        orderId = randomUUID();
        const orderNumber = `TEST-${Date.now()}`;
        const invoiceNumber = `INV-TEST-${Date.now()}`;

        await db.execute(sql`
          INSERT INTO orders (
            id, order_number, invoice_number, user_id, status, type,
            total_cents, surcharge_cents, discount_cents,
            items, stripe_payment_status, source, staff_user_id,
            payment_method, created_at, updated_at
          ) VALUES (
            ${orderId}, ${orderNumber}, ${invoiceNumber},
            ${staffUserId}, 'completed', 'pickup',
            2000, 0, 0,
            ${JSON.stringify([
              { name: 'Test Cookie', quantity: 1, unitPriceCents: 2000 },
            ])}::jsonb,
            'paid', 'pos', ${staffUserId},
            'eftpos', now(), now()
          )
        `);

        // Seed a Linkly transaction linked to this order with surcharge = 150.
        await db.execute(sql`
          INSERT INTO linkly_transactions (
            id, user_id, order_id, source, session_id, txn_ref,
            amount_cents, amount_surcharge_cents,
            status, success, complete,
            response_code, response_text,
            updated_at
          ) VALUES (
            ${randomUUID()}, ${staffUserId}, ${orderId}, 'pos', ${linklySessionId},
            ${'TXNREF-' + randomUUID().slice(0, 8)},
            2150, 150,
            'approved', true, true,
            '00', 'Approved',
            now()
          )
          ON CONFLICT (session_id) DO NOTHING
        `);
      });

      afterAll(async () => {
        if (orderId) {
          await db.execute(sql`DELETE FROM orders WHERE id = ${orderId}`);
        }
        await db.execute(sql`DELETE FROM linkly_transactions WHERE session_id = ${linklySessionId}`);
      });

      it('prerequisite: order created with surcharge_cents = 0', async () => {
        expect(orderId).toBeTruthy();
        const result = await db.execute(sql`
          SELECT surcharge_cents FROM orders WHERE id = ${orderId} LIMIT 1
        `);
        const row = ((result as any).rows?.[0] ?? (result as any)[0]) as any;
        expect(Number(row?.surcharge_cents)).toBe(0);
      });

      it('prerequisite: linkly_transactions row has amount_surcharge_cents = 150', async () => {
        const result = await db.execute(sql`
          SELECT amount_surcharge_cents FROM linkly_transactions
          WHERE session_id = ${linklySessionId} LIMIT 1
        `);
        const row = ((result as any).rows?.[0] ?? (result as any)[0]) as any;
        expect(Number(row?.amount_surcharge_cents)).toBe(150);
      });

      it(
        'POST /pos/orders/:id/email-invoice heals order.surcharge_cents from 0 → 150 ' +
          'before sending the email (even if email delivery fails)',
        async () => {
          expect(staffToken).toBeTruthy();
          expect(orderId).toBeTruthy();

          const res = await fetch(`${API_BASE}/pos/orders/${orderId}/email-invoice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${staffToken}`,
            },
            body: JSON.stringify({ email: 'receipt-test@example.com' }),
          });

          // The endpoint may return 200 (email sent) or 502 (Resend not configured
          // in the test environment). Either way the DB healing must have happened.
          expect([200, 502]).toContain(res.status);

          // The critical assertion: the order row must be healed.
          const dbResult = await db.execute(sql`
            SELECT surcharge_cents, total_cents
            FROM orders
            WHERE id = ${orderId}
            LIMIT 1
          `);
          const row = ((dbResult as any).rows?.[0] ?? (dbResult as any)[0]) as any;

          // surcharge_cents must be healed from 0 → 150
          expect(Number(row?.surcharge_cents)).toBe(150);
          // total_cents must be corrected: 2000 (base) + 150 (healed surcharge)
          expect(Number(row?.total_cents)).toBe(2150);
        },
        20_000,
      );

      it(
        'POST /pos/orders/:id/email-invoice with already-correct surcharge (150) ' +
          'does not double-add — total_cents remains 2150',
        async () => {
          // After the previous test the order already has surcharge=150 / total=2150.
          // Re-invoicing must not add the surcharge again.
          const res = await fetch(`${API_BASE}/pos/orders/${orderId}/email-invoice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${staffToken}`,
            },
            body: JSON.stringify({ email: 'receipt-test2@example.com' }),
          });

          expect([200, 502]).toContain(res.status);

          const dbResult = await db.execute(sql`
            SELECT surcharge_cents, total_cents
            FROM orders
            WHERE id = ${orderId}
            LIMIT 1
          `);
          const row = ((dbResult as any).rows?.[0] ?? (dbResult as any)[0]) as any;
          expect(Number(row?.surcharge_cents)).toBe(150);
          expect(Number(row?.total_cents)).toBe(2150);
        },
        20_000,
      );
    });
  },
);
