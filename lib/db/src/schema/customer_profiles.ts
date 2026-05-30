import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customerProfilesTable = pgTable("customer_profiles", {
  userId: text("user_id").primaryKey(),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  loyaltyTier: text("loyalty_tier").notNull().default("bronze"),
  referralCode: text("referral_code").notNull(),
  loyaltyQrToken: text("loyalty_qr_token"),
  referredBy: text("referred_by"),
  birthday: text("birthday"),
  stampCount: integer("stamp_count").notNull().default(0),
  freeCoffeesEarned: integer("free_coffees_earned").notNull().default(0),
  coffeeStampCount: integer("coffee_stamp_count").notNull().default(0),
  freeCoffeeRewards: integer("free_coffee_rewards").notNull().default(0),
  totalVisits: integer("total_visits").notNull().default(0),
  totalSpentCents: integer("total_spent_cents").notNull().default(0),
  deliveryAddress: text("delivery_address"),
  preferredStoreId: text("preferred_store_id"),
  emailMarketingOptIn: boolean("email_marketing_opt_in").notNull().default(false),
  payAtPickupEnabled: boolean("pay_at_pickup_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type CustomerProfile = typeof customerProfilesTable.$inferSelect;
