export const LOYALTY_POINT_VALUE_CENTS = 5;
export const STRIPE_CARD_RATE = 0.017;
export const STRIPE_CARD_FIXED_FEE_CENTS = 30;

export function estimateStripeFeeCents(amountCents: number): number {
  return amountCents > 0
    ? Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS)
    : 0;
}

export interface CheckoutTotalsInput {
  subtotalCents: number;
  discountAppliedCents: number;
  claimedRewardDiscountCents: number;
  cheapestCoffeePriceCents: number;
  orderType: 'pickup' | 'delivery';
  deliveryFeeCents: number;
  method: 'credit_card' | 'apple_pay' | 'google_pay' | 'pay_at_pickup';
  availableLoyaltyPoints: number;
  pointsToUseInput: string;
}

export interface CheckoutTotalsOutput {
  discountCents: number;
  deliveryCents: number;
  stripeFee: number;
  maxUsablePoints: number;
  requestedPointsToUse: number;
  loyaltyPointsUsed: number;
  loyaltyPointsDiscountCents: number;
  totalCents: number;
  totalLabel: string;
}

export function computeCheckoutTotals(input: CheckoutTotalsInput): CheckoutTotalsOutput {
  const {
    subtotalCents,
    discountAppliedCents,
    claimedRewardDiscountCents,
    cheapestCoffeePriceCents,
    orderType,
    deliveryFeeCents,
    method,
    availableLoyaltyPoints,
    pointsToUseInput,
  } = input;

  const discountCents = discountAppliedCents + claimedRewardDiscountCents + cheapestCoffeePriceCents;
  const deliveryCents = orderType === 'delivery' ? deliveryFeeCents : 0;
  const baseForFee = subtotalCents + deliveryCents - discountCents;
  const stripeFee =
    method === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(Math.max(0, baseForFee));
  const totalBeforePointsCents = Math.max(0, baseForFee + stripeFee);
  const maxUsablePoints = Math.min(
    availableLoyaltyPoints,
    Math.floor(totalBeforePointsCents / LOYALTY_POINT_VALUE_CENTS),
  );
  const requestedPointsToUse = Math.max(
    0,
    Math.floor(Number(pointsToUseInput.replace(/\D/g, '') || '0')),
  );
  const loyaltyPointsUsed = Math.min(requestedPointsToUse, maxUsablePoints);
  const loyaltyPointsDiscountCents = loyaltyPointsUsed * LOYALTY_POINT_VALUE_CENTS;
  const totalCents = Math.max(0, totalBeforePointsCents - loyaltyPointsDiscountCents);
  const totalLabel = `AUD ${(totalCents / 100).toFixed(2)}`;

  return {
    discountCents,
    deliveryCents,
    stripeFee,
    maxUsablePoints,
    requestedPointsToUse,
    loyaltyPointsUsed,
    loyaltyPointsDiscountCents,
    totalCents,
    totalLabel,
  };
}
