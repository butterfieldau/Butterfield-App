/**
 * POS order endpoint — claimedRewardId bypass guard
 *
 * Catalogue claimed rewards (item_reward, vouchers) are app-only features.
 * The POS order handler intentionally does NOT read `claimedRewardId` from
 * req.body, so a client cannot obtain a discount by supplying this field.
 *
 * Verified at two levels:
 *  A. HTTP response: totalCents equals the product price (no discount deducted).
 *  B. DB state:      discount_cents = 0 on the persisted order row.
 *
 * The response contract for POST /api/pos/orders is:
 *   { data: { id, orderNumber, invoiceNumber, totalCents, paymentMethod, status },
 *     loyaltyResult }
 *
 * The suite is skipped automatically when the API server is not reachable.
 * Run with the server up: pnpm --filter @workspace/api-server run test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  db, ordersTable, productsTable, usersTable,
  claimedRewardsTable, loyaltyRewardsTable,
} from '@workspace/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

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

let staffJwt: string | null = null;
let productId: string | null = null;
let productPriceCents: number | null = null;
let customerId: string | null = null;
let seededClaimedRewardId: string | null = null;
const createdOrderIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createPosOrder(body: Record<string, unknown>) {
  return fetch(`${API_BASE}/pos/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${staffJwt}`,
    },
    body: JSON.stringify(body),
  });
}

/** Fetch the discount_cents stored on a persisted order row. */
async function getOrderDiscountCents(orderId: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT discount_cents FROM orders WHERE id = ${orderId} LIMIT 1`,
  );
  const rows = (result as any).rows ?? (result as any) ?? [];
  return Number(rows[0]?.discount_cents ?? 0);
}

// ── Integration suite ─────────────────────────────────────────────────────────

describe.skipIf(!serverAvailable)(
  'POS POST /pos/orders — claimedRewardId is silently ignored (no discount applied)',
  () => {
    beforeAll(async () => {
      // 1. Ensure demo accounts exist.
      await fetch(`${API_BASE}/auth/seed-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      // 2. Log in as the demo staff account.
      const loginRes = await fetch(`${API_BASE}/auth/staff-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@demo.com', password: 'Demo1234!' }),
      });
      expect(loginRes.status, 'staff login should succeed').toBe(200);
      const loginData = await loginRes.json() as { token?: string };
      staffJwt = loginData.token ?? null;
      expect(staffJwt, 'staff JWT must be present').not.toBeNull();

      // 3. Resolve a real product from the DB so the server accepts the items array.
      const [product] = await db
        .select({ id: productsTable.id, priceCents: productsTable.priceCents })
        .from(productsTable)
        .limit(1);
      productId = product?.id ?? null;
      productPriceCents = product?.priceCents ?? null;
      expect(productId, 'at least one product must exist').not.toBeNull();

      // 4. Resolve demo customer's user ID (used to seed a real claimed_rewards row).
      const [userRow] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, 'customer@demo.com'))
        .limit(1);
      customerId = userRow?.id ?? null;

      // 5. Seed a real claimed_rewards row so we can pass a valid claimedRewardId.
      //    The POS handler must NOT apply any discount from this row.
      if (customerId) {
        const [existingReward] = await db
          .select({ id: loyaltyRewardsTable.id })
          .from(loyaltyRewardsTable)
          .limit(1);
        if (existingReward?.id) {
          seededClaimedRewardId = randomUUID();
          await db.execute(sql`
            INSERT INTO claimed_rewards (id, user_id, reward_id, status, claimed_at, points_spent)
            VALUES (
              ${seededClaimedRewardId},
              ${customerId},
              ${existingReward.id},
              'available',
              now(),
              0
            )
          `);
        }
      }
    });

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        await db.delete(ordersTable).where(inArray(ordersTable.id, createdOrderIds));
      }
      if (seededClaimedRewardId) {
        await db.delete(claimedRewardsTable).where(eq(claimedRewardsTable.id, seededClaimedRewardId));
      }
    });

    // ── Baseline: order without claimedRewardId ───────────────────────────────

    it('creates a POS order with totalCents equal to the product price and no discount', async () => {
      const res = await createPosOrder({
        items: [{ productId, quantity: 1, selectedOptions: [] }],
        orderType: 'pickup',
        paymentMethod: 'eftpos',
      });

      expect(res.status).toBe(201);
      const body = await res.json() as { data?: { id?: string; totalCents?: number } };

      // Response contract: { data: { id, orderNumber, invoiceNumber, totalCents, ... }, loyaltyResult }
      expect(body.data).toBeDefined();
      const orderId = body.data?.id;
      if (orderId) createdOrderIds.push(orderId);

      expect(body.data?.totalCents).toBe(productPriceCents);

      // DB: discount_cents must be 0
      if (orderId) {
        const discountCents = await getOrderDiscountCents(orderId);
        expect(discountCents).toBe(0);
      }
    });

    // ── Supplying claimedRewardId must NOT reduce the total ───────────────────

    it('ignores claimedRewardId and keeps totalCents equal to product price', async () => {
      const res = await createPosOrder({
        items: [{ productId, quantity: 1, selectedOptions: [] }],
        orderType: 'pickup',
        paymentMethod: 'eftpos',
        // A valid claimed_rewards row exists in the DB — POS must not apply it.
        claimedRewardId: seededClaimedRewardId ?? randomUUID(),
      });

      expect(res.status).toBe(201);
      const body = await res.json() as { data?: { id?: string; totalCents?: number } };
      expect(body.data).toBeDefined();
      const orderId = body.data?.id;
      if (orderId) createdOrderIds.push(orderId);

      // Total must be unchanged — claimedRewardId was silently ignored.
      expect(body.data?.totalCents).toBe(productPriceCents);

      // DB: discount_cents must be 0 — no value was granted from the reward.
      if (orderId) {
        const discountCents = await getOrderDiscountCents(orderId);
        expect(discountCents).toBe(0);
      }
    });

    // ── Random / unknown claimedRewardId is also ignored (not rejected) ───────

    it('handles a random non-existent claimedRewardId gracefully (no discount, no 4xx)', async () => {
      const res = await createPosOrder({
        items: [{ productId, quantity: 1, selectedOptions: [] }],
        orderType: 'pickup',
        paymentMethod: 'eftpos',
        customerId,
        claimedRewardId: randomUUID(), // random UUID with no matching DB row
      });

      // Must succeed (not reject with a 4xx about the unknown reward ID).
      expect(res.status).toBe(201);
      const body = await res.json() as { data?: { id?: string; totalCents?: number } };
      const orderId = body.data?.id;
      if (orderId) createdOrderIds.push(orderId);

      expect(body.data?.totalCents).toBe(productPriceCents);
    });
  },
);
