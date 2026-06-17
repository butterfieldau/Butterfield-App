import { db, loyaltyRewardsTable } from '@workspace/db';
import { eq, or } from 'drizzle-orm';
import { logger } from './logger.js';

export const BIRTHDAY_COOKIE_REWARD_ID = 'birthday-cookie-reward-v1';
const REWARD_5OFF_ID   = 'reward-5off-v1';
const REWARD_30OFF_ID  = 'reward-30off-v1';

export async function seedBirthdayCookieReward(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: loyaltyRewardsTable.id })
      .from(loyaltyRewardsTable)
      .where(eq(loyaltyRewardsTable.id, BIRTHDAY_COOKIE_REWARD_ID));

    if (existing) return;

    await db.insert(loyaltyRewardsTable).values({
      id: BIRTHDAY_COOKIE_REWARD_ID,
      name: 'Birthday Cookie',
      description: 'Happy Birthday! Enjoy a free cookie on us — any one you like.',
      pointsCost: 0,
      rewardType: 'birthday_cookie',
      isActive: true,
      customerRedeemable: false,
      claimExpiryDays: 30,
      category: 'food',
    });

    logger.info({ id: BIRTHDAY_COOKIE_REWARD_ID }, 'Birthday Cookie reward seeded');
  } catch (err) {
    logger.error({ err }, 'Failed to seed Birthday Cookie reward');
  }
}

export async function ensureRewardsIntegrity(): Promise<void> {
  try {
    // Fix "Free Soft Serve" → rename to "Free Cookie", change type to cookie_any.
    // cookie_any applies 100% off the cheapest cookie in the cart — same logic as birthday_cookie.
    await db.update(loyaltyRewardsTable)
      .set({
        name: 'Free Cookie',
        description: 'Redeem for any one cookie of your choice — the cheapest cookie in your cart becomes free.',
        rewardType: 'cookie_any',
        isActive: true,
        linkedProductId: null,
      })
      .where(or(
        eq(loyaltyRewardsTable.name, 'Free Soft Serve'),
        eq(loyaltyRewardsTable.name, 'Free Cookie'),
      ));

    // Fix "$10 Off Your Order" — was type=item_reward with no product; change to money_voucher
    await db.update(loyaltyRewardsTable)
      .set({
        rewardType: 'money_voucher',
        voucherValueCents: 1000,
        isActive: true,
        linkedProductId: null,
      })
      .where(eq(loyaltyRewardsTable.name, '$10 Off Your Order'));

    // Seed "$5 Off Your Order" idempotently (may have been purged from DB)
    const [existing5off] = await db
      .select({ id: loyaltyRewardsTable.id })
      .from(loyaltyRewardsTable)
      .where(or(
        eq(loyaltyRewardsTable.id, REWARD_5OFF_ID),
        eq(loyaltyRewardsTable.name, '$5 Off Your Order'),
      ));

    if (!existing5off) {
      await db.insert(loyaltyRewardsTable).values({
        id: REWARD_5OFF_ID,
        name: '$5 Off Your Order',
        description: 'Get $5 off your total order. Valid on any order.',
        pointsCost: 400,
        rewardType: 'money_voucher',
        voucherValueCents: 500,
        isActive: true,
        customerRedeemable: true,
        claimExpiryDays: 30,
        category: 'discount',
      });
      logger.info({ id: REWARD_5OFF_ID }, '$5 Off reward seeded');
    } else {
      // Ensure correct values if it exists but is broken
      await db.update(loyaltyRewardsTable)
        .set({ rewardType: 'money_voucher', voucherValueCents: 500, isActive: true })
        .where(eq(loyaltyRewardsTable.id, existing5off.id));
    }

    // Seed "$30 Off Your Order" (replaces old "Free Cookie Party Box" concept)
    const [existing30off] = await db
      .select({ id: loyaltyRewardsTable.id })
      .from(loyaltyRewardsTable)
      .where(or(
        eq(loyaltyRewardsTable.id, REWARD_30OFF_ID),
        eq(loyaltyRewardsTable.name, '$30 Off Your Order'),
        eq(loyaltyRewardsTable.name, 'Free Cookie Party Box (6)'),
      ));

    if (!existing30off) {
      await db.insert(loyaltyRewardsTable).values({
        id: REWARD_30OFF_ID,
        name: '$30 Off Your Order',
        description: 'Get $30 off your total order. Perfect for large orders or event catering.',
        pointsCost: 1200,
        rewardType: 'money_voucher',
        voucherValueCents: 3000,
        isActive: true,
        customerRedeemable: true,
        claimExpiryDays: 30,
        category: 'discount',
      });
      logger.info({ id: REWARD_30OFF_ID }, '$30 Off reward seeded');
    } else {
      await db.update(loyaltyRewardsTable)
        .set({ rewardType: 'money_voucher', voucherValueCents: 3000, isActive: true })
        .where(eq(loyaltyRewardsTable.id, existing30off.id));
    }

    logger.info('Rewards integrity check complete');
  } catch (err) {
    logger.error({ err }, 'Failed to ensure rewards integrity');
  }
}
