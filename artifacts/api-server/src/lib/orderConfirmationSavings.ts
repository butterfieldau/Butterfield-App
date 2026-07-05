/**
 * Pure helpers for computing the savings fields returned by the
 * POST /api/orders confirmation response.
 *
 * Kept separate so they can be unit-tested without spinning up Express or
 * touching the database.
 */

/**
 * Aggregates all per-order discount sources into the two confirmation fields
 * surfaced on the order-confirmation screen:
 *
 *   rewardSavingsCents   — the TOTAL amount saved (all sources summed)
 *   freeCoffeeDiscountCents — the coffee-stamp portion only (for attribution)
 *
 * `freeCoffeeDiscountCents` is a subset of `rewardSavingsCents`, not additive
 * to it.  The UI must display only `rewardSavingsCents` as the combined figure.
 */
export function buildConfirmationSavings(input: {
  claimedRewardDiscountCents: number;
  birthdayCookieDiscountCents: number;
  freeCoffeeDiscountCents: number;
}): {
  rewardSavingsCents: number | undefined;
  freeCoffeeDiscountCents: number | undefined;
} {
  const total =
    input.claimedRewardDiscountCents +
    input.birthdayCookieDiscountCents +
    input.freeCoffeeDiscountCents;

  return {
    rewardSavingsCents: total > 0 ? total : undefined,
    freeCoffeeDiscountCents:
      input.freeCoffeeDiscountCents > 0 ? input.freeCoffeeDiscountCents : undefined,
  };
}
