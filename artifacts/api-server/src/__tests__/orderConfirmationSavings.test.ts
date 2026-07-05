/**
 * Order Confirmation Savings — combined reward display tests
 *
 * Tests the `buildConfirmationSavings` helper that computes the two fields
 * returned by POST /api/orders when a customer redeems rewards:
 *
 *   rewardSavingsCents        — the TOTAL saved (all discount sources summed)
 *   freeCoffeeDiscountCents   — the stamp-card portion only (for attribution)
 *
 * Key contract: `freeCoffeeDiscountCents` is a *subset* of `rewardSavingsCents`,
 * NOT additive to it.  The UI must render only `rewardSavingsCents` as the
 * displayed combined savings total.
 *
 * Test matrix:
 *   1.  Only a claimed loyalty reward used
 *   2.  Only a free coffee stamp used
 *   3.  Both claimed reward AND free coffee stamp → combined total, no double-count
 *   4.  No rewards applied → both fields undefined
 *   5.  Birthday cookie discount alone
 *   6.  All three sources active → triple sum
 *   7.  freeCoffeeDiscountCents present in response when stamp used
 *   8.  freeCoffeeDiscountCents absent from response when stamp NOT used
 *   9.  Regression: zeroing freeCoffeeDiscountCents reduces combined total
 *  10.  Regression: zeroing claimedRewardDiscountCents reduces combined total
 *  11.  No-double-count: rewardSavingsCents equals the true combined total, not combined + coffee
 *  12.  UI display: rewardSavingsCents alone is the correct display value
 */

import { describe, it, expect } from 'vitest';
import { buildConfirmationSavings } from '../lib/orderConfirmationSavings.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1–6. Core savings computation
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfirmationSavings — single discount source', () => {
  it('returns only the claimed reward total when freeCoffeeDiscountCents is zero', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 850,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 0,
    });

    expect(result.rewardSavingsCents).toBe(850);
    expect(result.freeCoffeeDiscountCents).toBeUndefined();
  });

  it('returns the coffee-stamp total when claimed reward is zero', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 0,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 550,
    });

    expect(result.rewardSavingsCents).toBe(550);
    expect(result.freeCoffeeDiscountCents).toBe(550);
  });

  it('returns undefined for both when no discount was applied', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 0,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 0,
    });

    expect(result.rewardSavingsCents).toBeUndefined();
    expect(result.freeCoffeeDiscountCents).toBeUndefined();
  });

  it('includes birthdayCookieDiscountCents in the combined total', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 0,
      birthdayCookieDiscountCents: 400,
      freeCoffeeDiscountCents: 0,
    });

    expect(result.rewardSavingsCents).toBe(400);
    expect(result.freeCoffeeDiscountCents).toBeUndefined();
  });

  it('sums all three discount sources when all are active', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 850,
      birthdayCookieDiscountCents: 400,
      freeCoffeeDiscountCents: 550,
    });

    expect(result.rewardSavingsCents).toBe(1800);
    expect(result.freeCoffeeDiscountCents).toBe(550);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Both claimed reward AND free coffee stamp together
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfirmationSavings — claimed reward AND free coffee stamp combined', () => {
  const CLAIMED = 850;
  const COFFEE  = 550;

  it('rewardSavingsCents equals the SUM of both (not just one)', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });

    expect(result.rewardSavingsCents).toBe(CLAIMED + COFFEE);
  });

  it('freeCoffeeDiscountCents is the stamp portion only (not the combined total)', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });

    expect(result.freeCoffeeDiscountCents).toBe(COFFEE);
    expect(result.freeCoffeeDiscountCents).not.toBe(CLAIMED + COFFEE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7–8. Response field presence
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfirmationSavings — freeCoffeeDiscountCents response field', () => {
  it('includes the field when a coffee stamp was used', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 0,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 550,
    });

    expect(result.freeCoffeeDiscountCents).toBe(550);
  });

  it('omits the field (undefined) when no coffee stamp was used', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: 850,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 0,
    });

    // Undefined so JSON.stringify strips the key from the HTTP response body
    expect(result.freeCoffeeDiscountCents).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9–10. Regression guards
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfirmationSavings — regression guards', () => {
  const CLAIMED = 850;
  const COFFEE  = 550;

  it('combined total drops by COFFEE cents if freeCoffeeDiscountCents is accidentally zeroed', () => {
    const correct = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });
    const broken = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: 0,       // accidentally zeroed
    });

    expect(correct.rewardSavingsCents).toBe(CLAIMED + COFFEE);
    expect(broken.rewardSavingsCents).toBe(CLAIMED);
    expect((correct.rewardSavingsCents ?? 0) - (broken.rewardSavingsCents ?? 0)).toBe(COFFEE);
  });

  it('combined total drops by CLAIMED cents if claimedRewardDiscountCents is accidentally zeroed', () => {
    const correct = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });
    const broken = buildConfirmationSavings({
      claimedRewardDiscountCents: 0,    // accidentally zeroed
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });

    expect(correct.rewardSavingsCents).toBe(CLAIMED + COFFEE);
    expect(broken.rewardSavingsCents).toBe(COFFEE);
    expect((correct.rewardSavingsCents ?? 0) - (broken.rewardSavingsCents ?? 0)).toBe(CLAIMED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11–12. No-double-count contract
// ─────────────────────────────────────────────────────────────────────────────

describe('no-double-count contract — UI must use rewardSavingsCents as the combined total', () => {
  const CLAIMED = 850;
  const COFFEE  = 550;

  it('rewardSavingsCents equals the true combined total when both rewards are used', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });

    // The UI renders this single value — it is already the combined total.
    expect(result.rewardSavingsCents).toBe(CLAIMED + COFFEE);
  });

  it('rewardSavingsCents + freeCoffeeDiscountCents would OVERSTATE savings (documents the anti-pattern)', () => {
    const result = buildConfirmationSavings({
      claimedRewardDiscountCents: CLAIMED,
      birthdayCookieDiscountCents: 0,
      freeCoffeeDiscountCents: COFFEE,
    });

    // If a UI naively adds both fields, it overstates by COFFEE cents.
    const doubleCountedTotal = (result.rewardSavingsCents ?? 0) + (result.freeCoffeeDiscountCents ?? 0);
    expect(doubleCountedTotal).toBe(CLAIMED + COFFEE + COFFEE);    // 1950, not 1400
    expect(doubleCountedTotal).toBeGreaterThan(CLAIMED + COFFEE);  // proves the overstatement
  });
});
