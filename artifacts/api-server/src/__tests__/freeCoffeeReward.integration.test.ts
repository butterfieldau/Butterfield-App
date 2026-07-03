/**
 * Free Coffee Reward — API-level integration test
 *
 * These tests hit the real POST /api/orders HTTP endpoint and verify database
 * state transitions. They are skipped automatically when the API server is not
 * reachable (i.e. in environments without a running server).
 *
 * When run against a live server the tests:
 *   1. Use POST /api/auth/seed-demo to ensure demo accounts exist.
 *   2. Seed the customer profile with free_coffee_rewards = 1 via direct DB write.
 *   3. Log in as the demo customer to obtain a real JWT.
 *   4. Find an existing coffee-category product in the local products table.
 *   5. POST /api/orders with useFreeCoffeeReward: true.
 *   6. Assert the HTTP response: status 201, totalCents = 0, rewardSavingsCents > 0,
 *      rewardName matches /free coffee/i.
 *   7. Query the DB directly: free_coffee_rewards decremented to 0.
 *   8. Assert the persisted order: total_cents = 0, stripe_payment_status = 'free'.
 *   9. Second redemption attempt is rejected with 400 (guard still enforced).
 *  10. Clean up test-created orders.
 *
 * How to run (server must be running on localhost:80):
 *   pnpm --filter @workspace/api-server run test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, customerProfilesTable, ordersTable, productsTable, usersTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

const API_BASE = 'http://localhost:80/api';

// ── Top-level await: evaluated before any test is registered so describe.skipIf ──
// ── sees the real value rather than the `false` default. ─────────────────────────

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

// ── Mutable state shared across tests in this suite ──────────────────────────

let customerId: string | null = null;
let coffeeProductId: string | null = null;
let coffeePriceCents: number | null = null;
let jwtToken: string | null = null;
let createdOrderId: string | null = null;

// ── Integration suite (skipped entirely when server is not reachable) ─────────

describe.skipIf(!serverAvailable)(
  'Free coffee reward — HTTP endpoint + DB state (integration)',
  () => {
    // ── Setup: seed demo account, profile, and look up a coffee product ────────

    beforeAll(async () => {
      // 1. Ensure demo accounts exist.
      await fetch(`${API_BASE}/auth/seed-demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      // 2. Resolve the demo customer's DB row.
      const [userRow] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, 'customer@demo.com'))
        .limit(1);
      customerId = userRow?.id ?? null;

      // 3. Find a coffee-category product in the local products table.
      const [coffeeProduct] = await db
        .select({ id: productsTable.id, priceCents: productsTable.priceCents })
        .from(productsTable)
        .where(and(eq(productsTable.category, 'coffee'), eq(productsTable.isActive, true)))
        .limit(1);

      if (coffeeProduct) {
        coffeeProductId = coffeeProduct.id;
        coffeePriceCents = coffeeProduct.priceCents;
      }

      // 4. Seed free_coffee_rewards = 1 on the demo customer profile.
      await db
        .update(customerProfilesTable)
        .set({ freeCoffeeRewards: 1, updatedAt: new Date() })
        .where(eq(customerProfilesTable.userId, customerId!));

      // 5. Log in as the demo customer to obtain a real JWT.
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'customer@demo.com', password: 'Demo1234!' }),
      });
      const loginData = await loginRes.json() as { token?: string };
      jwtToken = loginData?.token ?? null;
    }, 30_000);

    // ── Teardown ───────────────────────────────────────────────────────────────

    afterAll(async () => {
      if (!customerId) return;
      // Remove the order created during the test run.
      if (createdOrderId) {
        await db.delete(ordersTable).where(eq(ordersTable.id, createdOrderId));
      }
      // Reset the reward counter so the demo account is clean for future tests.
      await db
        .update(customerProfilesTable)
        .set({ freeCoffeeRewards: 0, updatedAt: new Date() })
        .where(eq(customerProfilesTable.userId, customerId!));
    });

    // ── Tests ──────────────────────────────────────────────────────────────────

    it('prerequisites: demo customer exists, JWT obtained, coffee product found', () => {
      expect(customerId).toBeTruthy();
      expect(jwtToken).toBeTruthy();
      expect(coffeeProductId).toBeTruthy();
      expect(coffeePriceCents).toBeGreaterThan(0);
    });

    it('DB: free_coffee_rewards is seeded to 1 before checkout', async () => {
      const [profile] = await db
        .select({ freeCoffeeRewards: customerProfilesTable.freeCoffeeRewards })
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.userId, customerId!));

      expect(profile?.freeCoffeeRewards).toBe(1);
    });

    it('POST /api/orders with useFreeCoffeeReward: true → 201 and $0.00 total', async () => {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          items: [{ productId: coffeeProductId, quantity: 1, selectedOptions: [] }],
          type: 'pickup',
          paymentMethod: 'pay_at_pickup',
          useFreeCoffeeReward: true,
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json() as {
        data?: { id?: string; totalCents?: number; stripePaymentStatus?: string };
        rewardSavingsCents?: number;
        rewardName?: string;
      };

      createdOrderId = body?.data?.id ?? null;

      // The entire order is free when the only item is the redeemed coffee.
      expect(body?.data?.totalCents).toBe(0);

      // The savings amount equals the server-authoritative coffee price.
      expect(body?.rewardSavingsCents).toBeGreaterThan(0);
      expect(body?.rewardSavingsCents).toBe(coffeePriceCents);

      // The reward name is surfaced so the confirmation and receipt screens can display it.
      expect(body?.rewardName).toMatch(/free coffee/i);
    }, 15_000);

    it('DB: free_coffee_rewards decremented from 1 → 0 after order creation', async () => {
      const [profile] = await db
        .select({ freeCoffeeRewards: customerProfilesTable.freeCoffeeRewards })
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.userId, customerId!));

      expect(profile?.freeCoffeeRewards).toBe(0);
    });

    it('DB: persisted order has total_cents = 0 and stripe_payment_status = "free"', async () => {
      expect(createdOrderId).toBeTruthy();

      const [order] = await db
        .select({
          totalCents: ordersTable.totalCents,
          stripePaymentStatus: ordersTable.stripePaymentStatus,
        })
        .from(ordersTable)
        .where(eq(ordersTable.id, createdOrderId!));

      expect(order?.totalCents).toBe(0);
      expect(order?.stripePaymentStatus).toBe('free');
    });

    it('Guard: second POST /api/orders with useFreeCoffeeReward: true is rejected 400', async () => {
      // free_coffee_rewards is now 0. A second redemption must be blocked server-side.
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          items: [{ productId: coffeeProductId, quantity: 1, selectedOptions: [] }],
          type: 'pickup',
          paymentMethod: 'pay_at_pickup',
          useFreeCoffeeReward: true,
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json() as { error?: string };
      expect(body?.error).toMatch(/no free coffee/i);
    }, 15_000);
  },
);
