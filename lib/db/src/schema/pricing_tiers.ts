import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pricingTiersTable = pgTable("pricing_tiers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  defaultDiscountPct: integer("default_discount_pct").notNull().default(0),
  minOrderCents: integer("min_order_cents").notNull().default(0),
  minOrderQty: integer("min_order_qty").notNull().default(0),
  weeklyOrderVolumeCents: integer("weekly_order_volume_cents"),
  monthlyOrderVolumeCents: integer("monthly_order_volume_cents"),
  paymentTerms: text("payment_terms").notNull().default("net14"),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
  pickupEnabled: boolean("pickup_enabled").notNull().default(true),
  freeDeliveryThresholdCents: integer("free_delivery_threshold_cents"),
  cutOffTime: text("cut_off_time").notNull().default("12:00"),
  leadTimeDays: integer("lead_time_days").notNull().default(2),
  productAccessRule: text("product_access_rule").notNull().default("all"),
  allowedProductIds: text("allowed_product_ids"),
  allowedCategories: text("allowed_categories"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPricingTierSchema = createInsertSchema(pricingTiersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type PricingTier = typeof pricingTiersTable.$inferSelect;
