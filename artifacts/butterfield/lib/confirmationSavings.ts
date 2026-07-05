/**
 * Pure helpers for computing the savings amount displayed on the order
 * confirmation screen.
 *
 * Kept separate from CheckoutConfirmation.tsx so they can be unit-tested
 * without loading any React Native / Expo modules.
 */

/**
 * Returns the total savings amount to display on the order confirmation screen.
 *
 * `rewardSavingsCents` from the API is already the combined total (claimed reward +
 * birthday cookie + free coffee stamp, all summed server-side). It is used directly.
 *
 * `freeCoffeeDiscountCents` is a *subset* of `rewardSavingsCents` returned for future
 * per-source attribution. It must NOT be added again — doing so would double-count
 * the coffee-stamp portion and overstate the saving by that amount.
 *
 * @example
 * // API returns: { rewardSavingsCents: 1400, freeCoffeeDiscountCents: 550 }
 * // (claimed $8.50 + coffee stamp $5.50)
 * computeConfirmationDisplaySavings({ rewardSavingsCents: 1400, freeCoffeeDiscountCents: 550 })
 * // → 1400  (not 1950)
 */
export function computeConfirmationDisplaySavings(confirmation: {
  rewardSavingsCents?: number;
  freeCoffeeDiscountCents?: number;
}): number {
  return confirmation.rewardSavingsCents ?? 0;
}
