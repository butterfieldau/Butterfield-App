import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  points: integer("points").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loyaltyRewardsTable = pgTable("loyalty_rewards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  pointsCost: integer("points_cost").notNull(),
  category: text("category").notNull().default("food"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  isAppOnly: boolean("is_app_only").notNull().default(false),
  stock: integer("stock"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
  rewardType: text("reward_type").notNull().default("item_reward"),
  voucherValueCents: integer("voucher_value_cents"),
  linkedProductId: text("linked_product_id"),
  staffRedeemable: boolean("staff_redeemable").notNull().default(false),
  customerRedeemable: boolean("customer_redeemable").notNull().default(true),
  claimExpiryDays: integer("claim_expiry_days"),
  tierRestriction: text("tier_restriction"),
  minOrderValueCents: integer("min_order_value_cents"),
  autoGrantPointsThreshold: integer("auto_grant_points_threshold"),
  maxPerCustomer: integer("max_per_customer"),
});

export const loyaltyRedemptionsTable = pgTable("loyalty_redemptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  rewardId: text("reward_id").notNull(),
  orderId: text("order_id"),
  pointsSpent: integer("points_spent").notNull(),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});

export const loyaltyActivityLogTable = pgTable("loyalty_activity_log", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  staffId: text("staff_id"),
  loyaltyQrToken: text("loyalty_qr_token"),
  orderId: text("order_id"),
  activityType: text("activity_type").notNull(),
  pointsDelta: integer("points_delta").notNull().default(0),
  coffeeStampsDelta: integer("coffee_stamps_delta").notNull().default(0),
  freeCoffeeRewardsDelta: integer("free_coffee_rewards_delta").notNull().default(0),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const claimedRewardsTable = pgTable("claimed_rewards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  rewardId: text("reward_id").notNull(),
  status: text("status").notNull().default("available"),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
  orderId: text("order_id"),
  pointsSpent: integer("points_spent").notNull(),
  voucherValueCents: integer("voucher_value_cents"),
  expiresAt: timestamp("expires_at"),
});

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactionsTable).omit({ createdAt: true });
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewardsTable).omit({ createdAt: true });
export const insertLoyaltyRedemptionSchema = createInsertSchema(loyaltyRedemptionsTable).omit({ redeemedAt: true });
export const insertLoyaltyActivityLogSchema = createInsertSchema(loyaltyActivityLogTable).omit({ createdAt: true });

export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactionsTable.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
export type LoyaltyReward = typeof loyaltyRewardsTable.$inferSelect;
export type LoyaltyRedemption = typeof loyaltyRedemptionsTable.$inferSelect;
export type LoyaltyActivityLog = typeof loyaltyActivityLogTable.$inferSelect;
export type ClaimedReward = typeof claimedRewardsTable.$inferSelect;
