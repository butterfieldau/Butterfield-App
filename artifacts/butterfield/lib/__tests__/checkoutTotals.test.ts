import { describe, it, expect } from 'vitest';
import {
  computeCheckoutTotals,
  estimateStripeFeeCents,
  LOYALTY_POINT_VALUE_CENTS,
  STRIPE_CARD_RATE,
  STRIPE_CARD_FIXED_FEE_CENTS,
} from '../checkoutTotals';

const BASE = {
  orderType: 'pickup' as const,
  deliveryFeeCents: 0,
  method: 'credit_card' as const,
  availableLoyaltyPoints: 0,
  pointsToUseInput: '',
  discountAppliedCents: 0,
  claimedRewardDiscountCents: 0,
  cheapestCoffeePriceCents: 0,
};

describe('estimateStripeFeeCents', () => {
  it('returns 0 for zero amount', () => {
    expect(estimateStripeFeeCents(0)).toBe(0);
  });

  it('returns 0 for negative amount', () => {
    expect(estimateStripeFeeCents(-100)).toBe(0);
  });

  it('applies rate + fixed fee correctly', () => {
    const amount = 1000;
    const expected = Math.round(amount * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    expect(estimateStripeFeeCents(amount)).toBe(expected);
  });
});

describe('computeCheckoutTotals — subtotal only', () => {
  it('pickup with credit card: total = subtotal + stripe fee', () => {
    const subtotalCents = 1000;
    const stripeFee = Math.round(subtotalCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents });

    expect(result.discountCents).toBe(0);
    expect(result.deliveryCents).toBe(0);
    expect(result.stripeFee).toBe(stripeFee);
    expect(result.totalCents).toBe(subtotalCents + stripeFee);
    expect(result.totalLabel).toBe(`AUD ${((subtotalCents + stripeFee) / 100).toFixed(2)}`);
  });

  it('pay_at_pickup: no stripe fee applied', () => {
    const subtotalCents = 1500;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents, method: 'pay_at_pickup' });

    expect(result.stripeFee).toBe(0);
    expect(result.totalCents).toBe(subtotalCents);
    expect(result.totalLabel).toBe('AUD 15.00');
  });
});

describe('computeCheckoutTotals — discount code', () => {
  it('subtracts discount code amount from base before stripe fee', () => {
    const subtotalCents = 2000;
    const discountAppliedCents = 300;
    const base = subtotalCents - discountAppliedCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents, discountAppliedCents });

    expect(result.discountCents).toBe(discountAppliedCents);
    expect(result.stripeFee).toBe(stripeFee);
    expect(result.totalCents).toBe(base + stripeFee);
  });

  it('discount larger than subtotal clamps totalCents to 0', () => {
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents: 500,
      discountAppliedCents: 700,
    });

    expect(result.totalCents).toBe(0);
    expect(result.totalLabel).toBe('AUD 0.00');
    expect(result.stripeFee).toBe(0);
  });
});

describe('computeCheckoutTotals — reward vouchers', () => {
  it('item_reward: claimedRewardDiscountCents subtracted from base', () => {
    const subtotalCents = 1800;
    const claimedRewardDiscountCents = 550;
    const base = subtotalCents - claimedRewardDiscountCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents, claimedRewardDiscountCents });

    expect(result.discountCents).toBe(claimedRewardDiscountCents);
    expect(result.totalCents).toBe(base + stripeFee);
  });

  it('free_coffee: cheapestCoffeePriceCents subtracted from base', () => {
    const subtotalCents = 2200;
    const cheapestCoffeePriceCents = 500;
    const base = subtotalCents - cheapestCoffeePriceCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents, cheapestCoffeePriceCents });

    expect(result.discountCents).toBe(cheapestCoffeePriceCents);
    expect(result.totalCents).toBe(base + stripeFee);
  });

  it('cookie_any (claimedRewardDiscountCents = cheapestCookiePrice): deducted correctly', () => {
    const subtotalCents = 1600;
    const claimedRewardDiscountCents = 450;
    const base = subtotalCents - claimedRewardDiscountCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({ ...BASE, subtotalCents, claimedRewardDiscountCents });

    expect(result.discountCents).toBe(claimedRewardDiscountCents);
    expect(result.totalCents).toBe(base + stripeFee);
    expect(result.totalLabel).toBe(`AUD ${((base + stripeFee) / 100).toFixed(2)}`);
  });
});

describe('computeCheckoutTotals — delivery fee', () => {
  it('adds delivery fee to base before stripe fee for delivery order', () => {
    const subtotalCents = 2000;
    const deliveryFeeCents = 500;
    const base = subtotalCents + deliveryFeeCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      orderType: 'delivery',
      deliveryFeeCents,
    });

    expect(result.deliveryCents).toBe(deliveryFeeCents);
    expect(result.totalCents).toBe(base + stripeFee);
  });

  it('ignores deliveryFeeCents for pickup order', () => {
    const subtotalCents = 2000;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      orderType: 'pickup',
      deliveryFeeCents: 500,
    });

    expect(result.deliveryCents).toBe(0);
  });
});

describe('computeCheckoutTotals — loyalty points', () => {
  it('deducts loyaltyPointsDiscountCents from total', () => {
    const subtotalCents = 3000;
    const base = subtotalCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = base + stripeFee;
    const pointsToUse = 10;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.loyaltyPointsUsed).toBe(pointsToUse);
    expect(result.loyaltyPointsDiscountCents).toBe(pointsToUse * LOYALTY_POINT_VALUE_CENTS);
    expect(result.totalCents).toBe(totalBeforePoints - pointsToUse * LOYALTY_POINT_VALUE_CENTS);
    expect(result.totalLabel).toBe(
      `AUD ${((totalBeforePoints - pointsToUse * LOYALTY_POINT_VALUE_CENTS) / 100).toFixed(2)}`,
    );
  });

  it('maxUsablePoints is bounded by available points', () => {
    const subtotalCents = 10000;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      availableLoyaltyPoints: 5,
      pointsToUseInput: '999',
    });

    expect(result.maxUsablePoints).toBe(5);
    expect(result.loyaltyPointsUsed).toBe(5);
  });

  it('maxUsablePoints is bounded by totalBeforePoints (cannot overpay with points)', () => {
    const subtotalCents = 100;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      method: 'pay_at_pickup',
      availableLoyaltyPoints: 10000,
      pointsToUseInput: '10000',
    });

    const expectedMax = Math.floor(subtotalCents / LOYALTY_POINT_VALUE_CENTS);
    expect(result.maxUsablePoints).toBe(expectedMax);
    expect(result.loyaltyPointsUsed).toBe(expectedMax);
    expect(result.totalCents).toBe(0);
  });

  it('ignores non-numeric characters in pointsToUseInput', () => {
    const subtotalCents = 2000;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      method: 'pay_at_pickup',
      availableLoyaltyPoints: 100,
      pointsToUseInput: '10abc',
    });

    expect(result.requestedPointsToUse).toBe(10);
    expect(result.loyaltyPointsUsed).toBe(10);
  });

  it('empty pointsToUseInput results in zero loyalty deduction', () => {
    const subtotalCents = 2000;
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: '',
    });

    expect(result.loyaltyPointsUsed).toBe(0);
    expect(result.loyaltyPointsDiscountCents).toBe(0);
  });
});

describe('computeCheckoutTotals — combinations', () => {
  it('discount code + loyalty points on pickup order', () => {
    const subtotalCents = 5000;
    const discountAppliedCents = 500;
    const pointsToUse = 20;
    const base = subtotalCents - discountAppliedCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = base + stripeFee;
    const loyaltyDiscount = pointsToUse * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      discountAppliedCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.discountCents).toBe(discountAppliedCents);
    expect(result.totalCents).toBe(totalBeforePoints - loyaltyDiscount);
    expect(result.totalLabel).toBe(`AUD ${((totalBeforePoints - loyaltyDiscount) / 100).toFixed(2)}`);
  });

  it('reward voucher + delivery fee + loyalty points', () => {
    const subtotalCents = 4000;
    const claimedRewardDiscountCents = 600;
    const deliveryFeeCents = 500;
    const pointsToUse = 15;
    const base = subtotalCents + deliveryFeeCents - claimedRewardDiscountCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = base + stripeFee;
    const loyaltyDiscount = pointsToUse * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      claimedRewardDiscountCents,
      orderType: 'delivery',
      deliveryFeeCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.discountCents).toBe(claimedRewardDiscountCents);
    expect(result.deliveryCents).toBe(deliveryFeeCents);
    expect(result.totalCents).toBe(totalBeforePoints - loyaltyDiscount);
    expect(result.totalLabel).toBe(`AUD ${((totalBeforePoints - loyaltyDiscount) / 100).toFixed(2)}`);
  });

  it('free coffee + discount code + pay_at_pickup + loyalty points', () => {
    const subtotalCents = 3500;
    const discountAppliedCents = 200;
    const cheapestCoffeePriceCents = 500;
    const pointsToUse = 10;
    const base = subtotalCents - discountAppliedCents - cheapestCoffeePriceCents;
    const loyaltyDiscount = pointsToUse * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      discountAppliedCents,
      cheapestCoffeePriceCents,
      method: 'pay_at_pickup',
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.stripeFee).toBe(0);
    expect(result.discountCents).toBe(discountAppliedCents + cheapestCoffeePriceCents);
    expect(result.totalCents).toBe(base - loyaltyDiscount);
    expect(result.totalLabel).toBe(`AUD ${((base - loyaltyDiscount) / 100).toFixed(2)}`);
  });

  it('totalLabel and totalCents always agree (format check)', () => {
    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents: 7350,
      discountAppliedCents: 150,
      claimedRewardDiscountCents: 450,
      orderType: 'delivery',
      deliveryFeeCents: 800,
      availableLoyaltyPoints: 50,
      pointsToUseInput: '20',
    });

    expect(result.totalLabel).toBe(`AUD ${(result.totalCents / 100).toFixed(2)}`);
  });
});

describe('computeCheckoutTotals — points + free coffee both toggled on', () => {
  // Scenario: customer has a coffee in cart ($5.50) plus a cookie ($4.50).
  // They toggle ON both "free coffee" (stamp reward) and use 10 loyalty points.
  // Both discounts must stack — neither should silently cancel the other.

  const COFFEE_PRICE = 550;  // cheapest coffee in cart
  const COOKIE_PRICE = 450;
  const subtotalCents = COFFEE_PRICE + COOKIE_PRICE; // $10.00

  it('deducts both free coffee and loyalty points when both are active simultaneously', () => {
    const cheapestCoffeePriceCents = COFFEE_PRICE;
    const pointsToUse = 10;
    const base = subtotalCents - cheapestCoffeePriceCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = base + stripeFee;
    const loyaltyDiscount = pointsToUse * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.discountCents).toBe(cheapestCoffeePriceCents);
    expect(result.loyaltyPointsUsed).toBe(pointsToUse);
    expect(result.loyaltyPointsDiscountCents).toBe(loyaltyDiscount);
    expect(result.totalCents).toBe(totalBeforePoints - loyaltyDiscount);
    expect(result.totalCents).toBeGreaterThan(0);
    expect(result.totalLabel).toBe(`AUD ${((totalBeforePoints - loyaltyDiscount) / 100).toFixed(2)}`);
  });

  it('loyalty points are capped by the post-coffee-discount total, not the raw subtotal', () => {
    // The max redeemable points must be based on the total after the coffee is free,
    // not the raw subtotal — so they cannot stack beyond the remaining balance.
    const cheapestCoffeePriceCents = COFFEE_PRICE;
    const base = subtotalCents - cheapestCoffeePriceCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = base + stripeFee;
    const expectedMax = Math.floor(totalBeforePoints / LOYALTY_POINT_VALUE_CENTS);
    // Points are whole units (5¢ each), so the sub-point remainder is never covered
    const expectedRemainder = totalBeforePoints - expectedMax * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents,
      availableLoyaltyPoints: 99999,
      pointsToUseInput: '99999',
    });

    expect(result.maxUsablePoints).toBe(expectedMax);
    expect(result.loyaltyPointsUsed).toBe(expectedMax);
    // totalCents floors to the sub-point remainder (0 when divisible, otherwise < 5)
    expect(result.totalCents).toBe(expectedRemainder);
  });

  it('toggling off free coffee (cheapestCoffeePriceCents=0) leaves loyalty points deduction intact', () => {
    const pointsToUse = 10;
    const stripeFee = Math.round(subtotalCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;
    const totalBeforePoints = subtotalCents + stripeFee;
    const loyaltyDiscount = pointsToUse * LOYALTY_POINT_VALUE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents: 0,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(result.discountCents).toBe(0);
    expect(result.loyaltyPointsUsed).toBe(pointsToUse);
    expect(result.loyaltyPointsDiscountCents).toBe(loyaltyDiscount);
    expect(result.totalCents).toBe(totalBeforePoints - loyaltyDiscount);
  });

  it('toggling off points (empty pointsToUseInput) leaves free coffee deduction intact', () => {
    const cheapestCoffeePriceCents = COFFEE_PRICE;
    const base = subtotalCents - cheapestCoffeePriceCents;
    const stripeFee = Math.round(base * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS;

    const result = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: '',
    });

    expect(result.discountCents).toBe(cheapestCoffeePriceCents);
    expect(result.loyaltyPointsUsed).toBe(0);
    expect(result.loyaltyPointsDiscountCents).toBe(0);
    expect(result.totalCents).toBe(base + stripeFee);
  });

  it('both rewards together produce a smaller total than either alone', () => {
    const cheapestCoffeePriceCents = COFFEE_PRICE;
    const pointsToUse = 5;

    const coffeeOnlyResult = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents,
      availableLoyaltyPoints: 0,
      pointsToUseInput: '',
    });

    const pointsOnlyResult = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents: 0,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    const bothResult = computeCheckoutTotals({
      ...BASE,
      subtotalCents,
      cheapestCoffeePriceCents,
      availableLoyaltyPoints: 100,
      pointsToUseInput: String(pointsToUse),
    });

    expect(bothResult.totalCents).toBeLessThan(coffeeOnlyResult.totalCents);
    expect(bothResult.totalCents).toBeLessThan(pointsOnlyResult.totalCents);
  });
});
