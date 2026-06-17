import { db, loyaltyRewardsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { logger } from './logger.js';

export const BIRTHDAY_COOKIE_REWARD_ID = 'birthday-cookie-reward-v1';

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
