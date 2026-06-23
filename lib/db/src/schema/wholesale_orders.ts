import { pgTable, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wholesaleOrdersTable = pgTable("wholesale_orders", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  poReference: text("po_reference"),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  totalCents: integer("total_cents").notNull(),
  originalTotalCents: integer("original_total_cents"),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  deliveryType: text("delivery_type").notNull().default("pickup"),
  scheduledDate: text("scheduled_date"),
  invoiceUrl: text("invoice_url"),
  invoicePdfUrl: text("invoice_pdf_url"),
  invoiceNumber: text("invoice_number"),
  invoiceStatus: text("invoice_status"),
  invoiceDueDate: text("invoice_due_date"),
  invoiceUpdatedAt: timestamp("invoice_updated_at"),
  stripeInvoiceId: text("stripe_invoice_id"),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripePaymentStatus: text("stripe_payment_status").notNull().default("pending"),
  paymentMethodType: text("payment_method_type"),
  paymentReference: text("payment_reference"),
  refundedCents: integer("refunded_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWholesaleOrderSchema = createInsertSchema(wholesaleOrdersTable).omit({
  createdAt: true,
  updatedAt: true,
  paidAt: true,
});

export type InsertWholesaleOrder = z.infer<typeof insertWholesaleOrderSchema>;
export type WholesaleOrder = typeof wholesaleOrdersTable.$inferSelect;
