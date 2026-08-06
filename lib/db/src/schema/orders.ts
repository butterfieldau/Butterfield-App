import { pgTable, text, integer, timestamp, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
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
  "voided",
  "scheduled",
  "accepted",
  // Added via ensureOrderModificationSchemaReady() runtime ALTER TYPE
  "pending_customer_approval",
]);

export const orderTypeEnum = pgEnum("order_type", ["pickup", "delivery"]);

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").unique(),
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
  processedByUserId: text("processed_by_user_id"),
  paymentMethodType: text("payment_method_type"),
  deliveryAddress: text("delivery_address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  cancelReason: text("cancel_reason"),
  clientIdempotencyKey: text("client_idempotency_key"),
  registerSessionId: text("register_session_id"),
  // POS-specific columns (added to DB via ensurePosSchemaReady ALTER TABLE)
  // Declared here so Drizzle query builder can reference them with full type safety.
  source: text("source").default("customer_app"),
  staffUserId: text("staff_user_id"),
  paymentMethod: text("payment_method"),
  tipCents: integer("tip_cents").default(0),
  surchargeCents: integer("surcharge_cents").default(0),
  splitPayments: jsonb("split_payments").$type<Array<{ method: string; amountCents: number }>>(),
  invoiceNumber: text("invoice_number"),
  // Table ordering — added via ensureTableSchemaReady() runtime migration
  tableNumber: text("table_number"),
  // Order modification — added via ensureOrderModificationSchemaReady() runtime migration
  originalItems: jsonb("original_items"),
  modifiedItems: jsonb("modified_items"),
  modificationReason: text("modification_reason"),
  modificationExpiresAt: timestamp("modification_expires_at"),
  modificationTotalDeltaCents: integer("modification_total_delta_cents"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("orders_stripe_payment_intent_id_unique_idx")
    .on(table.stripePaymentIntentId)
    .where(sql`${table.stripePaymentIntentId} IS NOT NULL`),
  uniqueIndex("orders_client_idempotency_key_unique_idx")
    .on(table.clientIdempotencyKey)
    .where(sql`${table.clientIdempotencyKey} IS NOT NULL`),
  // ── Composite indexes for POS high-volume analytics queries ─────────────
  // These index definitions are the durable schema-level record. The actual
  // CREATE INDEX statements are also applied at runtime in ensurePosSchemaReady()
  // so they exist immediately on first boot without requiring drizzle-kit push.
  index("idx_orders_source_created_at").on(table.source, table.createdAt),
  index("idx_orders_status_source_created_at").on(table.status, table.source, table.createdAt),
  index("idx_orders_store_source_created_at").on(table.storeId, table.source, table.createdAt),
  index("idx_orders_register_session_created_at").on(table.registerSessionId, table.createdAt),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
