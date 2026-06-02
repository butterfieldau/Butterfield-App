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
  email: text("email"),
  deliveryAddress: text("delivery_address"),
  // suburb / state / postcode stored separately for better display
  suburb: text("suburb"),
  state: text("state"),
  postcode: text("postcode"),
  pricingTier: text("pricing_tier").notNull().default("standard"),
  tierId: text("tier_id"),
  customPricingEnabled: boolean("custom_pricing_enabled").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspendedReason: text("suspended_reason"),
  // Credit management — no automatic credit; director/master must enable manually
  creditEnabled: boolean("credit_enabled").notNull().default(false),
  creditLimitCents: integer("credit_limit_cents").notNull().default(0),
  currentBalanceCents: integer("current_balance_cents").notNull().default(0),
  creditNotes: text("credit_notes"),
  // Payment terms — defaults to pay on order; director/master sets if credit is enabled
  paymentTerms: text("payment_terms").default("pay_on_order"),
  // delivery fee charged to this customer (cents, 0 = free)
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  // whether delivery orders are permitted for this account
  deliveryAllowed: boolean("delivery_allowed").notNull().default(true),
  minimumOrderCents: integer("minimum_order_cents").notNull().default(20000),
  // Account manager details — set by director/master only
  accountManager: text("account_manager"),
  accountManagerPhone: text("account_manager_phone"),
  accountManagerEmail: text("account_manager_email"),
  // Accounts team email — for invoice delivery; wholesale customer can set this themselves
  accountsEmail: text("accounts_email"),
  xeroContactId: text("xero_contact_id"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  // customer-visible notes (e.g. delivery instructions)
  notes: text("notes"),
  // internal staff notes (not visible to wholesale customer)
  internalNotes: text("internal_notes"),
  cutOffTime: text("cut_off_time").notNull().default("12:00"),
  // legacy field — superseded by minimumOrderCents
  minOrderCents: integer("min_order_cents").notNull().default(20000),
  leadTimeDays: integer("lead_time_days").notNull().default(2),
  howDidYouHear: text("how_did_you_hear"),
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
