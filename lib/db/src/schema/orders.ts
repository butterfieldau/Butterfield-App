import { pgTable, text, integer, timestamp, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderStatusEnum = pgEnum("order_status", [
  "received",
  "being_prepared",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
  "refunded",
]);

export const orderTypeEnum = pgEnum("order_type", ["pickup", "delivery"]);

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: orderStatusEnum("status").notNull().default("received"),
  type: orderTypeEnum("type").notNull().default("pickup"),
  storeId: text("store_id"),
  scheduledFor: timestamp("scheduled_for"),
  notes: text("notes"),
  totalCents: integer("total_cents").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripePaymentStatus: text("stripe_payment_status").default("pending"),
  items: jsonb("items").notNull(),
  loyaltyPointsEarned: integer("loyalty_points_earned").notNull().default(0),
  loyaltyPointsUsed: integer("loyalty_points_used").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  discountCode: text("discount_code"),
  discountCodeId: text("discount_code_id"),
  paymentMethodType: text("payment_method_type"),
  deliveryAddress: text("delivery_address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("orders_stripe_payment_intent_id_unique_idx")
    .on(table.stripePaymentIntentId)
    .where(sql`${table.stripePaymentIntentId} IS NOT NULL`),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
