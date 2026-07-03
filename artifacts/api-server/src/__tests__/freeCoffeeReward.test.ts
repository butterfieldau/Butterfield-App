/**
 * Free Coffee Reward — end-to-end logic tests
 *
 * Covers the full path from prepareRetailCheckout (server-side pricing + validation)
 * through to the atomic DB decrement that occurs inside the orders route transaction.
 *
 * Test matrix:
 *  1. stripClientRewardFlags — pure function, strips isFreeReward / freeCoffeeItem
 *  2. Happy path: customer with 1 reward + 1 coffee item → item marked free, discount set
 *  3. Multi-coffee cart: cheapest coffee is made free, not the most expensive
 *  4. Qty > 1 for the cheapest coffee: original line shrinks, free clone pushed
 *  5. Guard: no free coffee rewards → throws before touching products
 *  6. Guard: no coffee-category items in cart → throws with descriptive message
 *  7. freeCoffeeRewardUsed flag drives the DB decrement in the orders route
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted shared state so vi.mock factories can reference it ────────────────
const mocks = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];

  const buildChain = () => {
    const data = selectQueue.shift() ?? [];
    const chain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(data),
        limit: vi.fn().mockResolvedValue(data),
      }),
    };
    return chain;
  };

  const db = {
    select: vi.fn(buildChain),
    execute: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  };

  return { selectQueue, db, buildChain };
});

// ── @workspace/db mock ────────────────────────────────────────────────────────
vi.mock('@workspace/db', () => ({
  db: mocks.db,
  // Table objects — only the shape matters; where() clauses are ignored in mocks.
  customerProfilesTable: {
    userId: 'customer_profiles.user_id',
    freeCoffeeRewards: 'customer_profiles.free_coffee_rewards',
    freeCoffeesEarned: 'customer_profiles.free_coffees_earned',
    loyaltyPoints: 'customer_profiles.loyalty_points',
    updatedAt: 'customer_profiles.updated_at',
  },
  productsTable: {
    id: 'products.id',
    category: 'products.category',
    priceCents: 'products.price_cents',
    salePriceCents: 'products.sale_price_cents',
    buildABoxSurchargeCents: 'products.build_a_box_surcharge_cents',
  },
  productVariantsTable: {
    id: 'product_variants.id',
    priceCents: 'product_variants.price_cents',
  },
  productOptionsTable: {
    id: 'product_options.id',
    priceAdjustmentCents: 'product_options.price_adjustment_cents',
  },
  claimedRewardsTable: {
    id: 'claimed_rewards.id',
    userId: 'claimed_rewards.user_id',
    status: 'claimed_rewards.status',
    voucherValueCents: 'claimed_rewards.voucher_value_cents',
    rewardId: 'claimed_rewards.reward_id',
    expiresAt: 'claimed_rewards.expires_at',
    orderId: 'claimed_rewards.order_id',
    redeemedAt: 'claimed_rewards.redeemed_at',
  },
  loyaltyRewardsTable: {
    id: 'loyalty_rewards.id',
    rewardType: 'loyalty_rewards.reward_type',
    linkedProductId: 'loyalty_rewards.linked_product_id',
    name: 'loyalty_rewards.name',
    tierRestriction: 'loyalty_rewards.tier_restriction',
    minOrderValueCents: 'loyalty_rewards.min_order_value_cents',
  },
  storeSettingsTable: { key: 'store_settings.key', value: 'store_settings.value' },
  storesTable: {},
  usersTable: {},
}));

// ── Dependency mocks ──────────────────────────────────────────────────────────
vi.mock('../lib/retailDelivery.js', () => ({
  getRetailDeliverySettings: vi.fn().mockResolvedValue({
    enabled: false,
    feeCents: 0,
    slots: [],
    blackoutDates: [],
  }),
}));

const mockComputeOrderTotal = vi.fn();
vi.mock('../lib/orderPricing.js', () => ({
  computeOrderTotal: (...args: unknown[]) => mockComputeOrderTotal(...args),
}));

vi.mock('../lib/discountUtils.js', () => ({
  validateDiscountCode: vi.fn(),
}));

vi.mock('../lib/loyaltyIdentity.js', () => ({
  LOYALTY_POINT_VALUE_CENTS: 100,
}));

// ── Import module under test (after all mocks are registered) ─────────────────
import { stripClientRewardFlags, prepareRetailCheckout } from '../lib/retailCheckout.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Push entries onto the select queue (consumed in FIFO order by db.select()). */
function queueSelectResults(...responses: unknown[][]) {
  for (const r of responses) {
    mocks.selectQueue.push(r);
  }
}

/** A minimal computeOrderTotal result for a given total. */
function makeComputedTotal(totalCents: number, itemizedCents?: { unitCents: number; lineCents: number }[]) {
  return {
    subtotalCents: totalCents,
    totalCents,
    discountCents: 0,
    deliveryFeeCents: 0,
    itemizedCents: itemizedCents ?? [{ unitCents: totalCents, lineCents: totalCents }],
  };
}

const FLAT_WHITE_ID = 'prod-flat-white';
const LATTE_ID = 'prod-latte';
const COOKIE_ID = 'prod-cookie';

const FLAT_WHITE_PRICE = 550;
const LATTE_PRICE = 650;
const COOKIE_PRICE = 400;

const flatWhiteProduct = {
  id: FLAT_WHITE_ID,
  category: 'coffee',
  priceCents: FLAT_WHITE_PRICE,
  salePriceCents: null,
};

const latteProduct = {
  id: LATTE_ID,
  category: 'coffee',
  priceCents: LATTE_PRICE,
  salePriceCents: null,
};

const cookieProduct = {
  id: COOKIE_ID,
  category: 'cookies',
  priceCents: COOKIE_PRICE,
  salePriceCents: null,
};

const USER_ID = 'user-abc';

const BASE_INPUT = {
  userId: USER_ID,
  userRole: 'customer',
  rawItems: [{ productId: FLAT_WHITE_ID, quantity: 1, selectedOptions: [] }],
  orderType: 'pickup',
  paymentMethod: 'card',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Drain any leftover queue entries so tests don't bleed into each other.
  mocks.selectQueue.length = 0;
  vi.clearAllMocks();

  // Restore the db.select mock after clearAllMocks (which resets it).
  mocks.db.select.mockImplementation(() => {
    const data = mocks.selectQueue.shift() ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(data),
        limit: vi.fn().mockResolvedValue(data),
      }),
    };
  });

  // Default computeOrderTotal: returns a flat total that passes through.
  mockComputeOrderTotal.mockResolvedValue(makeComputedTotal(FLAT_WHITE_PRICE));
}); 

// ─────────────────────────────────────────────────────────────────────────────
// 1. stripClientRewardFlags
// ─────────────────────────────────────────────────────────────────────────────

describe('stripClientRewardFlags', () => {
  it('removes isFreeReward and freeCoffeeItem from each item', () => {
    const input = [
      { productId: 'p1', quantity: 1, isFreeReward: true, freeCoffeeItem: true, selectedOptions: [] },
      { productId: 'p2', quantity: 2, selectedOptions: [] },
    ];
    const result = stripClientRewardFlags(input);
    expect(result[0]).not.toHaveProperty('isFreeReward');
    expect(result[0]).not.toHaveProperty('freeCoffeeItem');
    expect(result[0]).toMatchObject({ productId: 'p1', quantity: 1 });
  });

  it('returns an empty array for non-array input', () => {
    expect(stripClientRewardFlags(null)).toEqual([]);
    expect(stripClientRewardFlags('bad')).toEqual([]);
    expect(stripClientRewardFlags(undefined)).toEqual([]);
  });

  it('passes through items that have no reward flags', () => {
    const input = [{ productId: 'p1', quantity: 3, selectedOptions: [] }];
    const result = stripClientRewardFlags(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ productId: 'p1', quantity: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Happy path — single coffee item, reward available
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — free coffee happy path', () => {
  it('marks the coffee item as free and returns the correct discount', async () => {
    // Queue DB responses in order of calls inside prepareRetailCheckout:
    //   1st select → customer profile (freeCoffeeRewards = 1)
    //   2nd select → products (flat white is a coffee)
    //   variants/options selects are skipped (no variantId/optionId on items)
    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],        // profile check
      [flatWhiteProduct],                 // product fetch
    );

    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      useFreeCoffeeReward: true,
    });

    expect(result.freeCoffeeRewardUsed).toBe(true);
    expect(result.freeCoffeeDiscountCents).toBe(FLAT_WHITE_PRICE);

    // The item should now be marked as isFreeReward
    const freeItem = result.items.find((i) => (i as any).isFreeReward === true);
    expect(freeItem).toBeDefined();
    expect(freeItem?.productId).toBe(FLAT_WHITE_ID);
  });

  it('does NOT use the free coffee reward when useFreeCoffeeReward is false', async () => {
    // No DB calls for free coffee when flag is false
    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      useFreeCoffeeReward: false,
    });

    expect(result.freeCoffeeRewardUsed).toBe(false);
    expect(result.freeCoffeeDiscountCents).toBe(0);
    expect(result.items.every((i) => !(i as any).isFreeReward)).toBe(true);
  });

  it('sends freeCoffeeRewardUsed=true signal so the orders route can decrement DB', async () => {
    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],
      [flatWhiteProduct],
    );

    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      useFreeCoffeeReward: true,
    });

    // The orders.ts route reads freeCoffeeRewardUsed and runs the atomic UPDATE
    // with WHERE free_coffee_rewards > 0 — this flag being true is the trigger.
    expect(result.freeCoffeeRewardUsed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cheapest-coffee selection
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — cheapest coffee selection', () => {
  it('makes the cheaper coffee free when two coffee items are in the cart', async () => {
    const rawItems = [
      { productId: LATTE_ID, quantity: 1, selectedOptions: [] },   // $6.50
      { productId: FLAT_WHITE_ID, quantity: 1, selectedOptions: [] }, // $5.50 ← cheapest
    ];

    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],
      [latteProduct, flatWhiteProduct],
    );

    mockComputeOrderTotal.mockResolvedValue(
      makeComputedTotal(LATTE_PRICE + FLAT_WHITE_PRICE, [
        { unitCents: LATTE_PRICE, lineCents: LATTE_PRICE },
        { unitCents: FLAT_WHITE_PRICE, lineCents: FLAT_WHITE_PRICE },
      ]),
    );

    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      rawItems,
      useFreeCoffeeReward: true,
    });

    // Discount should be the cheaper one ($5.50), not $6.50
    expect(result.freeCoffeeDiscountCents).toBe(FLAT_WHITE_PRICE);

    // The flat white item should be the free one
    const freeItem = result.items.find((i) => (i as any).isFreeReward === true);
    expect(freeItem?.productId).toBe(FLAT_WHITE_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Quantity > 1 split behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — qty > 1 split', () => {
  it('splits a qty=2 coffee line into paid(1) + free(1) when reward is used', async () => {
    const rawItems = [
      { productId: FLAT_WHITE_ID, quantity: 2, selectedOptions: [] },
    ];

    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],
      [flatWhiteProduct],
    );

    mockComputeOrderTotal.mockResolvedValue(
      makeComputedTotal(FLAT_WHITE_PRICE * 2, [
        { unitCents: FLAT_WHITE_PRICE, lineCents: FLAT_WHITE_PRICE },
        { unitCents: FLAT_WHITE_PRICE, lineCents: FLAT_WHITE_PRICE },
      ]),
    );

    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      rawItems,
      useFreeCoffeeReward: true,
    });

    // Should now have two separate lines: qty=1 (paid) + qty=1 (free)
    expect(result.items).toHaveLength(2);
    const paidLine = result.items.find((i) => !(i as any).isFreeReward);
    const freeLine = result.items.find((i) => (i as any).isFreeReward === true);

    expect(paidLine?.quantity).toBe(1);
    expect(paidLine?.productId).toBe(FLAT_WHITE_ID);
    expect(freeLine?.quantity).toBe(1);
    expect(freeLine?.productId).toBe(FLAT_WHITE_ID);
    expect((freeLine as any).freeCoffeeItem).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Guard: insufficient free coffee rewards
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — guard: no rewards available', () => {
  it('throws when customer has freeCoffeeRewards = 0', async () => {
    queueSelectResults([{ freeCoffeeRewards: 0 }]);

    await expect(
      prepareRetailCheckout({ ...BASE_INPUT, useFreeCoffeeReward: true }),
    ).rejects.toThrow('No free coffee rewards available');
  });

  it('throws when customer profile is not found', async () => {
    queueSelectResults([]); // empty result = no profile row

    await expect(
      prepareRetailCheckout({ ...BASE_INPUT, useFreeCoffeeReward: true }),
    ).rejects.toThrow('No free coffee rewards available');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Guard: no coffee-category items in cart
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — guard: no coffee items', () => {
  it('throws when the cart contains only non-coffee items', async () => {
    const rawItems = [{ productId: COOKIE_ID, quantity: 1, selectedOptions: [] }];

    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],
      [cookieProduct], // cookies, not coffee
    );

    await expect(
      prepareRetailCheckout({
        ...BASE_INPUT,
        rawItems,
        useFreeCoffeeReward: true,
      }),
    ).rejects.toThrow('No coffee items in your order to apply the free coffee reward');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. freeCoffeeRewards DB decrement — orders route logic
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: The atomic DB decrement inside the orders route transaction is verified
// by the HTTP + DB integration tests in freeCoffeeReward.integration.test.ts,
// which hit the real POST /api/orders endpoint and assert free_coffee_rewards=0
// in the database. That is the correct level for route-transaction assertions.
// ─────────────────────────────────────────────────────────────────────────────
// 7. Response shape — rewardSavingsCents and rewardName are surfaced
// ─────────────────────────────────────────────────────────────────────────────

describe('prepareRetailCheckout — response shape for order confirmation', () => {
  it('returns freeCoffeeDiscountCents equal to the authoritative server price', async () => {
    queueSelectResults(
      [{ freeCoffeeRewards: 1 }],
      [{ ...flatWhiteProduct, salePriceCents: 499 }], // sale price takes priority
    );

    mockComputeOrderTotal.mockResolvedValue(makeComputedTotal(499));

    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      useFreeCoffeeReward: true,
    });

    // salePriceCents (499) should be used, not priceCents (550)
    expect(result.freeCoffeeDiscountCents).toBe(499);
    expect(result.freeCoffeeRewardUsed).toBe(true);
  });

  it('freeCoffeeDiscountCents is 0 when reward is not used', async () => {
    const result = await prepareRetailCheckout({
      ...BASE_INPUT,
      useFreeCoffeeReward: false,
    });

    expect(result.freeCoffeeDiscountCents).toBe(0);
    expect(result.freeCoffeeRewardUsed).toBe(false);
  });
});
