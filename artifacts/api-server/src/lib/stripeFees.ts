const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;

export function calculateCardProcessingFeeCents(amountCents: number) {
  if (amountCents <= 0) return 0;
  return Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS);
}

