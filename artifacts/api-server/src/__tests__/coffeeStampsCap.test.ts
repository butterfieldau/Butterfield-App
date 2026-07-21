/**
 * applyCoffeeStamps — free-coffee cap enforcement
 *
 * Verifies that the FREE_COFFEE_CAP (7) cannot be bypassed no matter how many
 * stamps are earned in a single call.  The cap is enforced both in the JS
 * computation (Math.min) and in the SQL UPDATE (LEAST()), so the return value
 * is the authoritative signal for callers.
 *
 * Test matrix:
 *   1. Customer already at cap (7) — earnedFree stays false, freeCoffeeRewards stays 7
 *   2. Customer already at cap (7) with a large stamp batch — still capped
 *   3. Customer one below cap (6) + stamps that earn 2 free → capped at 7, only 1 issued
 *   4. Customer at 0 rewards + 6 stamps → gets exactly 1 (well below cap)
 *   5. Cap works the same with stampGoal=9 (new-cohort customers)
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ── Hoisted shared state ──────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];

  /**
   * Build a select mock chain.
   *
   * The from() result is a thenable so callers that await db.select().from(...)
   * directly (e.g. the backfill loop in ensureLoyaltySchemaReady) get an empty
   * array without an explicit .where() call.
   *
   * Callers that chain .where() / .limit() still receive the queued row data.
   */
  const buildChain = () => {
    const data = selectQueue.shift() ?? [];
    const fromResult = {
      where: vi.fn().mockResolvedValue(data),
      limit: vi.fn().mockResolvedValue(data),
      // Makes `await db.select().from(...)` work without a trailing .where()
      then: (resolve: (v: unknown) => void) => resolve(data),
    };
    return { from: vi.fn().mockReturnValue(fromResult) };
  };

  const db = {
    select: vi.fn(buildChain),
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn(),
  };

  return { selectQueue, db, buildChain };
});

// ── @workspace/db mock ────────────────────────────────────────────────────────
vi.mock('@workspace/db', () => ({
  db: mocks.db,
  customerProfilesTable: {
    userId: 'customer_profiles.user_id',
    coffeeStampCount: 'customer_profiles.coffee_stamp_count',
    stampCount: 'customer_profiles.stamp_count',
    freeCoffeeRewards: 'customer_profiles.free_coffee_rewards',
    freeCoffeesEarned: 'customer_profiles.free_coffees_earned',
    loyaltyPoints: 'customer_profiles.loyalty_points',
    loyaltyQrToken: 'customer_profiles.loyalty_qr_token',
    loyaltyTier: 'customer_profiles.loyalty_tier',
    coffeeStampGoal: 'customer_profiles.coffee_stamp_goal',
    referralCode: 'customer_profiles.referral_code',
    updatedAt: 'customer_profiles.updated_at',
  },
  usersTable: {
    id: 'users.id',
    name: 'users.name',
  },
  loyaltyActivityLogTable: { id: 'loyalty_activity_log.id' },
  loyaltyTransactionsTable: { id: 'loyalty_transactions.id' },
}));

import { applyCoffeeStamps, ensureLoyaltySchemaReady } from '../lib/loyaltyIdentity.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-cap-test';

/**
 * Build a minimal customer_profiles row where both column pairs (the canonical
 * coffeeStampCount/freeCoffeeRewards and the legacy mirrors stampCount/
 * freeCoffeesEarned) are identical so the sync logic inside
 * getOrCreateCustomerLoyaltyProfile does not issue an extra db.update() call.
 */
function makeProfile(overrides: {
  coffeeStampCount?: number;
  freeCoffeeRewards?: number;
  coffeeStampGoal?: number;
} = {}) {
  const {
    coffeeStampCount = 0,
    freeCoffeeRewards = 0,
    coffeeStampGoal = 6,
  } = overrides;
  return {
    userId: USER_ID,
    loyaltyQrToken: 'TOKEN-CAP-TEST',
    coffeeStampCount,
    stampCount: coffeeStampCount,          // mirror — no sync update triggered
    freeCoffeeRewards,
    freeCoffeesEarned: freeCoffeeRewards,  // mirror — no sync update triggered
    loyaltyTier: 'blue',
    loyaltyPoints: 0,
    referralCode: 'TESTCODE',
    coffeeStampGoal,
  };
}

const USER_ROW = [{ name: 'Test Customer' }];

/**
 * Queue the DB responses consumed during a single applyCoffeeStamps call
 * (after ensureLoyaltySchemaReady has already been primed in beforeAll):
 *
 *   1. db.select().from(customerProfilesTable).where(...)  ← profile row
 *   2. db.select({ name }).from(usersTable).where(...)     ← user name
 *
 * db.execute() (UPDATE) and db.insert() (activity log) are handled by the
 * always-resolving mocks set up in beforeEach.
 */
function queueCallResponses(profile: ReturnType<typeof makeProfile>) {
  mocks.selectQueue.push([profile]);
  mocks.selectQueue.push(USER_ROW);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Prime the ensureLoyaltySchemaReady singleton ONCE before any test runs.
 *
 * The singleton (schemaReadyPromise) caches the result, so subsequent
 * ensureLoyaltySchemaReady() calls inside applyCoffeeStamps are no-ops.
 * Without this priming, the first test's db.select() calls are partially
 * consumed by the schema backfill loop and the queue order breaks.
 *
 * The backfill does: await db.select({...}).from(customerProfilesTable)
 * which returns the backfill queue entry ([]) without calling .where().
 */
beforeAll(async () => {
  // Push an empty result for the backfill loop (no profiles to backfill).
  mocks.selectQueue.push([]);
  await ensureLoyaltySchemaReady();
  // Drain any remaining entries left from schema setup.
  mocks.selectQueue.length = 0;
});

beforeEach(() => {
  mocks.selectQueue.length = 0;
  vi.clearAllMocks();

  // Restore the db.select mock after clearAllMocks resets its implementation.
  mocks.db.select.mockImplementation(() => {
    const data = mocks.selectQueue.shift() ?? [];
    const fromResult = {
      where: vi.fn().mockResolvedValue(data),
      limit: vi.fn().mockResolvedValue(data),
      then: (resolve: (v: unknown) => void) => resolve(data),
    };
    return { from: vi.fn().mockReturnValue(fromResult) };
  });

  // execute resolves ok for ALTER TABLE DDL and the profile UPDATE.
  mocks.db.execute.mockResolvedValue({ rows: [], rowCount: 0 });

  // update / insert chains always succeed.
  mocks.db.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
  mocks.db.insert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('applyCoffeeStamps — FREE_COFFEE_CAP enforcement', () => {
  it('does not issue a free coffee when the customer is already at the 7-reward cap', async () => {
    // Profile: 2 partial stamps, 7 stored rewards (fully capped).
    // Adding 4 stamps completes a card (2 + 4 = 6 → normally +1 free), but
    // the cap must block the increment.
    queueCallResponses(makeProfile({ coffeeStampCount: 2, freeCoffeeRewards: 7 }));

    const result = await applyCoffeeStamps({
      userId: USER_ID,
      stampsToAdd: 4,
      source: 'staff_scan',
      description: 'POS coffee scan',
    });

    expect(result.earnedFree).toBe(false);
    expect(result.freeCoffeeRewards).toBe(7);
  });

  it('does not issue a free coffee at cap even with a large stamp batch', async () => {
    // 7 rewards, 0 partial stamps.  Adding 12 stamps = 2 full card cycles.
    // Uncapped total would be 9, but cap keeps it at 7.
    queueCallResponses(makeProfile({ coffeeStampCount: 0, freeCoffeeRewards: 7 }));

    const result = await applyCoffeeStamps({
      userId: USER_ID,
      stampsToAdd: 12,
      source: 'staff_scan',
      description: 'POS coffee scan',
    });

    expect(result.earnedFree).toBe(false);
    expect(result.freeCoffeeRewards).toBe(7);
  });

  it('caps at 7 when customer is one reward below the cap and stamps earn 2 free coffees', async () => {
    // 6 rewards, 0 partial stamps.  12 stamps would add 2 free coffees (total 8)
    // but the cap limits the increment to just 1, bringing the total to 7.
    queueCallResponses(makeProfile({ coffeeStampCount: 0, freeCoffeeRewards: 6 }));

    const result = await applyCoffeeStamps({
      userId: USER_ID,
      stampsToAdd: 12,
      source: 'staff_scan',
      description: 'POS coffee scan',
    });

    expect(result.earnedFree).toBe(true);
    expect(result.freeCoffeeRewards).toBe(7);
  });

  it('allows earning below the cap (0 → 1 is unaffected)', async () => {
    // 0 rewards, 0 stamps.  6 stamps = exactly 1 free coffee — well below the cap.
    queueCallResponses(makeProfile({ coffeeStampCount: 0, freeCoffeeRewards: 0 }));

    const result = await applyCoffeeStamps({
      userId: USER_ID,
      stampsToAdd: 6,
      source: 'staff_scan',
      description: 'POS coffee scan',
    });

    expect(result.earnedFree).toBe(true);
    expect(result.freeCoffeeRewards).toBe(1);
  });

  it('enforces the cap the same way with stampGoal=9 (new-cohort customers)', async () => {
    // New-cohort customers need 9 stamps per card.  Still caps at 7.
    queueCallResponses(makeProfile({ coffeeStampCount: 0, freeCoffeeRewards: 7, coffeeStampGoal: 9 }));

    const result = await applyCoffeeStamps({
      userId: USER_ID,
      stampsToAdd: 9,
      source: 'staff_scan',
      description: 'POS coffee scan',
    });

    expect(result.earnedFree).toBe(false);
    expect(result.freeCoffeeRewards).toBe(7);
  });
});
