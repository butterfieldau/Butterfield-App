import { pgTable, text, integer, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const registerCloseMethodEnum = pgEnum("register_close_method", ["manual", "auto"]);
export const registerCashMovementTypeEnum = pgEnum("register_cash_movement_type", ["add", "remove"]);
export const registerRefundMethodEnum = pgEnum("register_refund_method", ["cash", "eftpos", "split"]);

export const registerSessionsTable = pgTable("register_sessions", {
  id: text("id").primaryKey(),
  storeId: text("store_id"),
  registerName: text("register_name").notNull(),
  registerLocation: text("register_location"),
  tradingDate: text("trading_date").notNull(),
  openedByUserId: text("opened_by_user_id").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  startingFloatCents: integer("starting_float_cents"),
  startingFloatEnteredAt: timestamp("starting_float_entered_at"),
  startingFloatEnteredByUserId: text("starting_float_entered_by_user_id"),
  closedAt: timestamp("closed_at"),
  closedByUserId: text("closed_by_user_id"),
  closeMethod: registerCloseMethodEnum("close_method"),
  actualCountedCashCents: integer("actual_counted_cash_cents"),
  varianceCents: integer("variance_cents"),
  closeNote: text("close_note"),
  varianceNote: text("variance_note"),
  varianceApprovedByUserId: text("variance_approved_by_user_id"),
  printedAt: timestamp("printed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const registerCashMovementsTable = pgTable("register_cash_movements", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  movementType: registerCashMovementTypeEnum("movement_type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  createdByUserId: text("created_by_user_id").notNull(),
  approvedByUserId: text("approved_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const posOrderRefundsTable = pgTable("pos_order_refunds", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  registerSessionId: text("register_session_id").notNull(),
  refundAmountCents: integer("refund_amount_cents").notNull(),
  refundMethod: registerRefundMethodEnum("refund_method").notNull(),
  splitPayments: jsonb("split_payments"),
  reason: text("reason"),
  createdByUserId: text("created_by_user_id").notNull(),
  approvedByUserId: text("approved_by_user_id"),
  isVoid: boolean("is_void").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RegisterSession = typeof registerSessionsTable.$inferSelect;
export type RegisterCashMovement = typeof registerCashMovementsTable.$inferSelect;
export type PosOrderRefund = typeof posOrderRefundsTable.$inferSelect;
