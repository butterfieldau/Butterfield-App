import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wholesaleAccountsTable = pgTable("wholesale_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  companyName: text("company_name").notNull(),
  abn: text("abn"),
  contactName: text("contact_name").notNull(),
  phone: text("phone"),
  deliveryAddress: text("delivery_address"),
  pricingTier: text("pricing_tier").notNull().default("standard"),
  tierId: text("tier_id"),
  customPricingEnabled: boolean("custom_pricing_enabled").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspendedReason: text("suspended_reason"),
  creditLimitCents: integer("credit_limit_cents").notNull().default(500000),
  currentBalanceCents: integer("current_balance_cents").notNull().default(0),
  paymentTerms: text("payment_terms").notNull().default("net14"),
  accountManager: text("account_manager").notNull().default("Sarah"),
  accountManagerEmail: text("account_manager_email").notNull().default("wholesale@butterfield.com.au"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  cutOffTime: text("cut_off_time").notNull().default("12:00"),
  minOrderCents: integer("min_order_cents").notNull().default(20000),
  leadTimeDays: integer("lead_time_days").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWholesaleAccountSchema = createInsertSchema(wholesaleAccountsTable).omit({
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertWholesaleAccount = z.infer<typeof insertWholesaleAccountSchema>;
export type WholesaleAccount = typeof wholesaleAccountsTable.$inferSelect;
