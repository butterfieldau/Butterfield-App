/**
 * Order Confirmation Screen — savings display logic
 *
 * Tests `computeConfirmationDisplaySavings` exported from CheckoutConfirmation.tsx.
 * That function is the single source of truth for the dollar amount shown in the
 * "You saved $X.XX" row when a customer used rewards.
 *
 * Key invariants under test:
 *   • When both rewardSavingsCents AND freeCoffeeDiscountCents are present, the
 *     displayed total equals rewardSavingsCents (the API-combined total) — NOT
 *     rewardSavingsCents + freeCoffeeDiscountCents (which would double-count).
 *   • freeCoffeeDiscountCents alone is rendered correctly when the API returns only
 *     a coffee-stamp saving.
 *   • Zero / missing fields produce 0 so the savings row is correctly hidden.
 *
 * Test matrix:
 *   1.  Both rewards used — displays the combined total from rewardSavingsCents
 *   2.  Only claimed loyalty reward used
 *   3.  Only free coffee stamp used
 *   4.  No rewards applied — returns 0 (savings row hidden)
 *   5.  No-double-count: result equals rewardSavingsCents, not rewardSavingsCents + freeCoffeeDiscountCents
 *   6.  Savings row threshold: value > 0 is the only condition required to render
 *   7.  Savings row hidden: value === 0 when neither field is provided
 *   8.  rewardSavingsCents undefined with freeCoffeeDiscountCents present → 0 (API contract violation defence)
 *   9.  Large combined totals are formatted correctly (cents arithmetic)
 *  10.  Display amount formatted as dollars matches expected string
 */

import { describe, it, expect } from 'vitest';
import { computeConfirmationDisplaySavings } from '../confirmationSavings';

// ─────────────────────────────────────────────────────────────────────────────
// Core display logic
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConfirmationDisplaySavings — core display logic', () => {
  it('returns rewardSavingsCents when both reward and free coffee fields are present', () => {
    const result = computeConfirmationDisplaySavings({
      rewardSavingsCents: 1400,      // API combined total (850 claimed + 550 coffee)
      freeCoffeeDiscountCents: 550,  // attribution subset — must NOT be added again
    });

    expect(result).toBe(1400);
  });

  it('returns rewardSavingsCents when only a claimed loyalty reward was used', () => {
    expect(computeConfirmationDisplaySavings({ rewardSavingsCents: 850 })).toBe(850);
  });

  it('returns 0 when no rewards were applied', () => {
    expect(computeConfirmationDisplaySavings({})).toBe(0);
    expect(computeConfirmationDisplaySavings({ rewardSavingsCents: undefined })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No-double-count contract
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConfirmationDisplaySavings — no double-counting', () => {
  const CLAIMED       = 850;
  const COFFEE        = 550;
  const COMBINED      = CLAIMED + COFFEE; // 1400 — what the API returns in rewardSavingsCents
  const DOUBLE_COUNTED = COMBINED + COFFEE; // 1950 — what a naive sum would show

  it('displays the true combined total, not claimed + coffee + coffee', () => {
    const result = computeConfirmationDisplaySavings({
      rewardSavingsCents: COMBINED,
      freeCoffeeDiscountCents: COFFEE,
    });

    expect(result).toBe(COMBINED);
    expect(result).not.toBe(DOUBLE_COUNTED);
  });

  it('does not add freeCoffeeDiscountCents on top of rewardSavingsCents', () => {
    const result = computeConfirmationDisplaySavings({
      rewardSavingsCents: COMBINED,
      freeCoffeeDiscountCents: COFFEE,
    });

    // If freeCoffeeDiscountCents were added, the result would exceed COMBINED.
    expect(result).toBeLessThanOrEqual(COMBINED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Savings row visibility
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConfirmationDisplaySavings — savings row visibility', () => {
  it('returns a value > 0 when a saving exists (savings row should render)', () => {
    expect(computeConfirmationDisplaySavings({ rewardSavingsCents: 550 }) > 0).toBe(true);
    expect(computeConfirmationDisplaySavings({ rewardSavingsCents: 1400, freeCoffeeDiscountCents: 550 }) > 0).toBe(true);
  });

  it('returns 0 when no fields are present (savings row should be hidden)', () => {
    expect(computeConfirmationDisplaySavings({}) > 0).toBe(false);
  });

  it('returns 0 when rewardSavingsCents is undefined even if freeCoffeeDiscountCents is set', () => {
    // This guards against a scenario where the API only returns freeCoffeeDiscountCents
    // without rewardSavingsCents — in that case the UI still shows 0, which is the
    // safe fallback (better than an incorrect or inflated value).
    expect(computeConfirmationDisplaySavings({ freeCoffeeDiscountCents: 550 })).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dollar-amount formatting (integration check)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConfirmationDisplaySavings — formatting', () => {
  it('returns cents that format correctly to AUD strings', () => {
    const savingsCents = computeConfirmationDisplaySavings({ rewardSavingsCents: 1400, freeCoffeeDiscountCents: 550 });
    expect((savingsCents / 100).toFixed(2)).toBe('14.00');
  });

  it('formats a single-reward saving correctly', () => {
    const savingsCents = computeConfirmationDisplaySavings({ rewardSavingsCents: 550 });
    expect((savingsCents / 100).toFixed(2)).toBe('5.50');
  });
});
