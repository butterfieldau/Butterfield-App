import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quantityPriceBreaksTable = pgTable("quantity_price_breaks", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  scope: text("scope").notNull().default("tier"),
  tierId: text("tier_id"),
  customerId: text("customer_id"),
  minQty: integer("min_qty").notNull(),
  maxQty: integer("max_qty"),
  unitPriceCents: integer("unit_price_cents"),
  discountPct: integer("discount_pct"),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertQuantityBreakSchema = createInsertSchema(quantityPriceBreaksTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertQuantityBreak = z.infer<typeof insertQuantityBreakSchema>;
export type QuantityPriceBreak = typeof quantityPriceBreaksTable.$inferSelect;
