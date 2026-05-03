import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customerPricingTable = pgTable("customer_pricing", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  productId: text("product_id"),
  category: text("category"),
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

export const insertCustomerPricingSchema = createInsertSchema(customerPricingTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomerPricing = z.infer<typeof insertCustomerPricingSchema>;
export type CustomerPricing = typeof customerPricingTable.$inferSelect;
