import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const discountCodesTable = pgTable("discount_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull().$type<'percentage' | 'fixed_amount' | 'free_delivery'>(),
  discountValue: integer("discount_value").notNull(),
  maxDiscountCents: integer("max_discount_cents"),
  minOrderCents: integer("min_order_cents").notNull().default(0),
  startDate: timestamp("start_date"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  usageLimitTotal: integer("usage_limit_total"),
  usageLimitPerCustomer: integer("usage_limit_per_customer").notNull().default(1),
  usageCount: integer("usage_count").notNull().default(0),
  eligibleProducts: jsonb("eligible_products").$type<string[]>(),
  eligibleCategories: jsonb("eligible_categories").$type<string[]>(),
  excludedProducts: jsonb("excluded_products").$type<string[]>(),
  customerEligibility: text("customer_eligibility").notNull().default("all").$type<'all' | 'first_order' | 'loyalty' | 'selected'>(),
  selectedCustomerIds: jsonb("selected_customer_ids").$type<string[]>(),
  wholesaleEligible: boolean("wholesale_eligible").notNull().default(false),
  orderTypeEligibility: text("order_type_eligibility").notNull().default("both").$type<'both' | 'pickup' | 'delivery'>(),
  stackable: boolean("stackable").notNull().default(false),
  internalNotes: text("internal_notes"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const discountCodeUsagesTable = pgTable("discount_code_usages", {
  id: text("id").primaryKey(),
  discountCodeId: text("discount_code_id").notNull(),
  userId: text("user_id").notNull(),
  orderId: text("order_id").notNull(),
  discountAmountCents: integer("discount_amount_cents").notNull(),
  usedAt: timestamp("used_at").notNull().defaultNow(),
});
