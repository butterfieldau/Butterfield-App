import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import {
  db,
  customerProfilesTable,
  loyaltyActivityLogTable,
  loyaltyTransactionsTable,
  usersTable,
} from '@workspace/db';

const STAMP_GOAL = 6;

type LoyaltyProfileRow = typeof customerProfilesTable.$inferSelect;

type LoyaltyActivityInput = {
  customerId: string;
  staffId?: string | null;
  loyaltyQrToken?: string | null;
  orderId?: string | null;
  activityType: string;
  pointsDelta?: number;
  coffeeStampsDelta?: number;
  freeCoffeeRewardsDelta?: number;
  description: string;
};

// Singleton — reset on failure so the next request retries.
let schemaReadyPromise: Promise<void> | null = null;

function generateLoyaltyToken(): string {
  return randomUUID().replace(/-/g, '').toUpperCase();
}

export function buildLoyaltyQrPayload(token?: string | null): string | null {
  if (!token) return null;
  return `BUTTERFIELD:LOYALTY:${token}`;
}

export function parseLoyaltyQrPayload(raw: string): { token?: string; userId?: string; referralCode?: string } | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  if (value.startsWith('BUTTERFIELD:LOYALTY:')) {
    return { token: value.slice('BUTTERFIELD:LOYALTY:'.length).trim() || undefined };
  }

  if (value.startsWith('BUTTERFIELD:')) {
    const parts = value.split(':');
    if (parts.length >= 3) {
      return {
        userId: parts[1] || undefined,
        referralCode: parts.slice(2).join(':') || undefined,
      };
    }
  }

  // Legacy staff scanners may send the bare token.
  return { token: value };
}

async function execute(sqlStatements: string[]) {
  for (const statement of sqlStatements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensureLoyaltySchemaReady() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try {
        // ── Add ALL columns that may be missing in production ──────────────────
        // This is idempotent — safe to run on every startup.
        await execute([
          // Core loyalty columns
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS loyalty_qr_token text`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS coffee_stamp_count integer NOT NULL DEFAULT 0`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS free_coffee_rewards integer NOT NULL DEFAULT 0`,
          // Extended profile columns that may be absent in older production DBs
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS total_visits integer NOT NULL DEFAULT 0`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS total_spent_cents integer NOT NULL DEFAULT 0`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS delivery_address text`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS email_marketing_opt_in boolean NOT NULL DEFAULT false`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS pay_at_pickup_enabled boolean NOT NULL DEFAULT false`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS referred_by text`,
          `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS birthday text`,
          // Unique index on loyalty token
          `CREATE UNIQUE INDEX IF NOT EXISTS customer_profiles_loyalty_qr_token_unique_idx ON customer_profiles (loyalty_qr_token) WHERE loyalty_qr_token IS NOT NULL`,
          // Activity log table
          `CREATE TABLE IF NOT EXISTS loyalty_activity_log (
            id text PRIMARY KEY,
            customer_id text NOT NULL,
            staff_id text,
            loyalty_qr_token text,
            order_id text,
            activity_type text NOT NULL,
            points_delta integer NOT NULL DEFAULT 0,
            coffee_stamps_delta integer NOT NULL DEFAULT 0,
            free_coffee_rewards_delta integer NOT NULL DEFAULT 0,
            description text NOT NULL,
            created_at timestamp NOT NULL DEFAULT now()
          )`,
          // Add staff_id column to existing activity log tables (idempotent)
          `ALTER TABLE loyalty_activity_log ADD COLUMN IF NOT EXISTS staff_id text`,
          // Reward type columns on loyalty_rewards (task #43)
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_type text NOT NULL DEFAULT 'item_reward'`,
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS voucher_value_cents integer`,
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS linked_product_id text`,
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS staff_redeemable boolean NOT NULL DEFAULT false`,
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS customer_redeemable boolean NOT NULL DEFAULT true`,
          // Claimed rewards table (task #43)
          `CREATE TABLE IF NOT EXISTS claimed_rewards (
            id text PRIMARY KEY,
            user_id text NOT NULL,
            reward_id text NOT NULL,
            status text NOT NULL DEFAULT 'available',
            claimed_at timestamp NOT NULL DEFAULT now(),
            redeemed_at timestamp,
            order_id text,
            points_spent integer NOT NULL,
            voucher_value_cents integer
          )`,
          `ALTER TABLE claimed_rewards ADD COLUMN IF NOT EXISTS expires_at timestamp`,
          `CREATE INDEX IF NOT EXISTS claimed_rewards_user_id_idx ON claimed_rewards (user_id)`,
          `CREATE INDEX IF NOT EXISTS claimed_rewards_status_idx ON claimed_rewards (status)`,
          // Claim expiry window per reward (task #46)
          `ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS claim_expiry_days integer`,
        ]);

        // Backfill: generate QR tokens for any profile that is missing one.
        const profiles = await db.select({
          userId: customerProfilesTable.userId,
          loyaltyQrToken: customerProfilesTable.loyaltyQrToken,
        }).from(customerProfilesTable);

        for (const profile of profiles) {
          if (!profile.loyaltyQrToken) {
            await db.update(customerProfilesTable)
              .set({ loyaltyQrToken: generateLoyaltyToken(), updatedAt: new Date() })
              .where(eq(customerProfilesTable.userId, profile.userId));
          }
        }
      } catch (err) {
        // Reset so the next request retries rather than caching a permanent failure.
        schemaReadyPromise = null;
        throw err;
      }
    })();
  }

  return schemaReadyPromise;
}

export async function getOrCreateCustomerLoyaltyProfile(userId: string, fallbackName?: string) {
  await ensureLoyaltySchemaReady();

  let [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId));
  if (!profile) {
    const [userRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
    const token = generateLoyaltyToken();
    const nameSeed = fallbackName ?? userRow?.name ?? 'Customer';
    await db.insert(customerProfilesTable).values({
      userId,
      loyaltyPoints: 0,
      loyaltyTier: 'bronze',
      referralCode: nameSeed.replace(/\s+/g, '').toUpperCase().slice(0, 4) + token.slice(0, 4),
      loyaltyQrToken: token,
      coffeeStampCount: 0,
      freeCoffeeRewards: 0,
      stampCount: 0,
      freeCoffeesEarned: 0,
    });
    [profile] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId));
  }

  // Self-heal: ensure QR token is always present.
  if (!profile.loyaltyQrToken) {
    const token = generateLoyaltyToken();
    await db.update(customerProfilesTable)
      .set({ loyaltyQrToken: token, updatedAt: new Date() })
      .where(eq(customerProfilesTable.userId, userId));
    profile = { ...profile, loyaltyQrToken: token } as LoyaltyProfileRow;
  }

  // Sync legacy stamp/reward fields so both column pairs are always identical.
  const updates: Record<string, any> = {};
  if ((profile.coffeeStampCount ?? 0) !== (profile.stampCount ?? 0)) {
    updates.coffeeStampCount = profile.stampCount ?? 0;
  }
  if ((profile.freeCoffeeRewards ?? 0) !== (profile.freeCoffeesEarned ?? 0)) {
    updates.freeCoffeeRewards = profile.freeCoffeesEarned ?? 0;
  }
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await db.update(customerProfilesTable)
      .set(updates)
      .where(eq(customerProfilesTable.userId, userId));
    profile = { ...profile, ...updates } as LoyaltyProfileRow;
  }

  return profile;
}

export async function logLoyaltyActivity(input: LoyaltyActivityInput) {
  await ensureLoyaltySchemaReady();
  await db.insert(loyaltyActivityLogTable).values({
    id: randomUUID(),
    customerId: input.customerId,
    staffId: input.staffId ?? null,
    loyaltyQrToken: input.loyaltyQrToken ?? null,
    orderId: input.orderId ?? null,
    activityType: input.activityType,
    pointsDelta: input.pointsDelta ?? 0,
    coffeeStampsDelta: input.coffeeStampsDelta ?? 0,
    freeCoffeeRewardsDelta: input.freeCoffeeRewardsDelta ?? 0,
    description: input.description,
  });
}

export async function applyCoffeeStamps(params: {
  userId: string;
  stampsToAdd: number;
  source: 'in_app_order' | 'staff_scan';
  staffId?: string | null;
  orderId?: string | null;
  description: string;
}) {
  const stampsToAdd = Math.max(0, Math.floor(params.stampsToAdd));
  if (stampsToAdd <= 0) {
    return { customerName: 'Customer', stampCount: 0, freeCoffeeRewards: 0, earnedFree: false, pointsDelta: 0, loyaltyQrToken: null };
  }

  const profile = await getOrCreateCustomerLoyaltyProfile(params.userId);
  const baseStampCount = Number(profile.coffeeStampCount ?? profile.stampCount ?? 0);
  const baseRewards = Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0);
  const totalStamps = baseStampCount + stampsToAdd;
  const earnedFree = Math.floor(totalStamps / STAMP_GOAL);
  const nextStampCount = totalStamps % STAMP_GOAL;
  const nextRewards = baseRewards + earnedFree;

  const [userRow] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, params.userId));

  await db.update(customerProfilesTable)
    .set({
      coffeeStampCount: nextStampCount,
      freeCoffeeRewards: nextRewards,
      stampCount: nextStampCount,
      freeCoffeesEarned: nextRewards,
      updatedAt: new Date(),
    })
    .where(eq(customerProfilesTable.userId, params.userId));

  const description = earnedFree > 0
    ? `${params.description} — ${earnedFree} free coffee reward${earnedFree > 1 ? 's' : ''} earned`
    : params.description;

  await logLoyaltyActivity({
    customerId: params.userId,
    staffId: params.staffId ?? null,
    loyaltyQrToken: profile.loyaltyQrToken,
    orderId: params.orderId ?? null,
    activityType: params.source,
    pointsDelta: 0,
    coffeeStampsDelta: stampsToAdd,
    freeCoffeeRewardsDelta: earnedFree,
    description,
  });

  if (earnedFree > 0) {
    await db.insert(loyaltyTransactionsTable).values({
      id: randomUUID(),
      userId: params.userId,
      points: 0,
      type: 'bonus',
      description: `Free coffee reward earned (${nextRewards} available)`,
      referenceId: params.orderId ?? null,
    });
  }

  return {
    customerName: userRow?.name ?? 'Customer',
    stampCount: nextStampCount,
    freeCoffeeRewards: nextRewards,
    earnedFree: earnedFree > 0,
    pointsDelta: 0,
    loyaltyQrToken: profile.loyaltyQrToken,
  };
}

export async function reverseCoffeeStamps(params: {
  userId: string;
  stampsToRemove: number;
  source: 'order_cancel' | 'order_refund';
  staffId?: string | null;
  orderId?: string | null;
  description: string;
}) {
  const stampsToRemove = Math.max(0, Math.floor(params.stampsToRemove));
  if (stampsToRemove <= 0) {
    return { stampCount: 0, freeCoffeeRewards: 0, removedFreeRewards: 0, loyaltyQrToken: null };
  }

  const profile = await getOrCreateCustomerLoyaltyProfile(params.userId);
  const baseStampCount = Number(profile.coffeeStampCount ?? profile.stampCount ?? 0);
  const baseRewards = Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0);
  const currentStampValue = baseStampCount + (baseRewards * STAMP_GOAL);
  const nextStampValue = Math.max(0, currentStampValue - stampsToRemove);
  const nextRewards = Math.floor(nextStampValue / STAMP_GOAL);
  const nextStampCount = nextStampValue % STAMP_GOAL;
  const removedFreeRewards = Math.max(0, baseRewards - nextRewards);
  const effectiveRemovedStamps = Math.min(stampsToRemove, currentStampValue);

  await db.update(customerProfilesTable)
    .set({
      coffeeStampCount: nextStampCount,
      freeCoffeeRewards: nextRewards,
      stampCount: nextStampCount,
      freeCoffeesEarned: nextRewards,
      updatedAt: new Date(),
    })
    .where(eq(customerProfilesTable.userId, params.userId));

  const description = removedFreeRewards > 0
    ? `${params.description} — ${removedFreeRewards} free coffee reward${removedFreeRewards > 1 ? 's' : ''} reversed`
    : params.description;

  await logLoyaltyActivity({
    customerId: params.userId,
    staffId: params.staffId ?? null,
    loyaltyQrToken: profile.loyaltyQrToken,
    orderId: params.orderId ?? null,
    activityType: params.source,
    pointsDelta: 0,
    coffeeStampsDelta: -effectiveRemovedStamps,
    freeCoffeeRewardsDelta: -removedFreeRewards,
    description,
  });

  if (removedFreeRewards > 0) {
    await db.insert(loyaltyTransactionsTable).values({
      id: randomUUID(),
      userId: params.userId,
      points: 0,
      type: 'redeem',
      description: `Free coffee reward reversed (${nextRewards} available)`,
      referenceId: params.orderId ?? null,
    });
  }

  return {
    stampCount: nextStampCount,
    freeCoffeeRewards: nextRewards,
    removedFreeRewards,
    loyaltyQrToken: profile.loyaltyQrToken,
  };
}

export async function recordLoyaltyPoints(params: {
  userId: string;
  pointsDelta: number;
  orderId?: string | null;
  description: string;
}) {
  const pointsDelta = Math.trunc(params.pointsDelta);
  if (!pointsDelta) return;

  const profile = await getOrCreateCustomerLoyaltyProfile(params.userId);
  await db.update(customerProfilesTable)
    .set({
      loyaltyPoints: sql`${customerProfilesTable.loyaltyPoints} + ${pointsDelta}`,
      updatedAt: new Date(),
    })
    .where(eq(customerProfilesTable.userId, params.userId));

  await db.insert(loyaltyTransactionsTable).values({
    id: randomUUID(),
    userId: params.userId,
    points: pointsDelta,
    type: pointsDelta >= 0 ? 'earn' : 'redeem',
    description: params.description,
    referenceId: params.orderId ?? null,
  });

  await logLoyaltyActivity({
    customerId: params.userId,
    loyaltyQrToken: profile.loyaltyQrToken,
    orderId: params.orderId ?? null,
    activityType: pointsDelta >= 0 ? 'points_earn' : 'points_redeem',
    pointsDelta,
    coffeeStampsDelta: 0,
    freeCoffeeRewardsDelta: 0,
    description: params.description,
  });
}

export async function syncLegacyLoyaltyBalance(userId: string) {
  const profile = await getOrCreateCustomerLoyaltyProfile(userId);
  const updates: Record<string, any> = {};
  if ((profile.coffeeStampCount ?? 0) !== (profile.stampCount ?? 0)) updates.stampCount = profile.coffeeStampCount ?? 0;
  if ((profile.freeCoffeeRewards ?? 0) !== (profile.freeCoffeesEarned ?? 0)) updates.freeCoffeesEarned = profile.freeCoffeeRewards ?? 0;
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await db.update(customerProfilesTable)
      .set(updates)
      .where(eq(customerProfilesTable.userId, userId));
  }
  return getOrCreateCustomerLoyaltyProfile(userId);
}
