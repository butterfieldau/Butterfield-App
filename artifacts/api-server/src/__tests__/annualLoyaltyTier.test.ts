import { describe, expect, it } from 'vitest';
import {
  calculateLoyaltyPointsForEligibleSpend,
  LOYALTY_POINT_VALUE_CENTS,
} from '../lib/loyaltyIdentity.js';
import {
  getAnnualTierWindowStart,
  getTierEligibleSpendForOrder,
  isOrderEligibleForAnnualTier,
} from '../lib/loyaltyTierSettings.js';

describe('annual loyalty rules', () => {
  it('awards the same fixed $4 reward value for each eligible $100', () => {
    expect(calculateLoyaltyPointsForEligibleSpend(9_999)).toBe(0);
    expect(calculateLoyaltyPointsForEligibleSpend(10_000)).toBe(80);
    expect(calculateLoyaltyPointsForEligibleSpend(25_000)).toBe(160);
    expect(80 * LOYALTY_POINT_VALUE_CENTS).toBe(400);
  });

  it('keeps tier qualification independent from point redemptions', () => {
    expect(isOrderEligibleForAnnualTier('completed')).toBe(true);
    expect(isOrderEligibleForAnnualTier('received')).toBe(true);
    expect(isOrderEligibleForAnnualTier('cancelled')).toBe(false);
    expect(isOrderEligibleForAnnualTier('refunded')).toBe(false);
    expect(isOrderEligibleForAnnualTier('voided')).toBe(false);
  });

  it('uses the same gross eligible value for app and POS purchases', () => {
    // App order: a $100 basket paid with $10 in points still qualifies as $100.
    expect(getTierEligibleSpendForOrder({
      tierEligibleSpendCents: 10_000,
      totalCents: 9_000,
      loyaltyPointsUsed: 200,
    })).toBe(10_000);
    // POS: a card surcharge is not customer product spend.
    expect(getTierEligibleSpendForOrder({
      tierEligibleSpendCents: 10_000,
      totalCents: 10_150,
      surchargeCents: 150,
    })).toBe(10_000);
    // Historical orders have no captured value, so restore a points redemption
    // while excluding an attached-POS payment surcharge.
    expect(getTierEligibleSpendForOrder({
      totalCents: 9_150,
      surchargeCents: 150,
      loyaltyPointsUsed: 200,
    })).toBe(10_000);
  });

  it('uses the revised approved basket value for tier progress', () => {
    const originalOrderSpend = 10_000;
    const approvedItemLines = [{ lineCents: 14_000 }, { lineCents: 1_000 }];
    const approvedSpend = approvedItemLines.reduce((sum, item) => sum + item.lineCents, 0);
    expect(originalOrderSpend).toBe(10_000);
    expect(getTierEligibleSpendForOrder({
      tierEligibleSpendCents: approvedSpend,
      totalCents: approvedSpend,
    })).toBe(15_000);
  });

  it('uses a calendar rolling twelve-month boundary for annual tiers', () => {
    expect(getAnnualTierWindowStart(new Date('2026-08-23T12:00:00.000Z')).toISOString())
      .toBe('2025-08-23T12:00:00.000Z');
    expect(getAnnualTierWindowStart(new Date('2024-02-29T12:00:00.000Z')).toISOString())
      .toBe('2023-03-01T12:00:00.000Z');
  });
});