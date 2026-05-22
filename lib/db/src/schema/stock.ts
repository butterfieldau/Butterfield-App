import { pgTable, text, integer, real, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockCategoriesTable = pgTable("stock_categories", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type StockCategory = typeof stockCategoriesTable.$inferSelect;

export const stockItemsTable = pgTable("stock_items", {
  id:                text("id").primaryKey(),
  name:              text("name").notNull(),
  category:          text("category").notNull().default("other"),
  unit:              text("unit").notNull().default("units"),
  currentQuantity:   real("current_quantity").notNull().default(0),
  lowStockThreshold: real("low_stock_threshold").notNull().default(0),
  allowNegativeStock:boolean("allow_negative_stock").notNull().default(false),
  costCents:         integer("cost_cents"),
  supplier:          text("supplier"),
  notes:             text("notes"),
  isActive:          boolean("is_active").notNull().default(true),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export const insertStockItemSchema = createInsertSchema(stockItemsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type StockItem = typeof stockItemsTable.$inferSelect;
export type InsertStockItem = z.infer<typeof insertStockItemSchema>;

export const stockActionEnum = pgEnum("stock_action", [
  "add",
  "remove",
  "adjust",
  "transfer",
  "wasted",
  "expired",
  "stocktake",
  "sale_deduction",
  "refund_return",
]);

export const stockMovementsTable = pgTable("stock_movements", {
  id:                text("id").primaryKey(),
  stockItemId:       text("stock_item_id").references(() => stockItemsTable.id, { onDelete: "set null" }),
  productId:         text("product_id"),
  relatedOrderId:    text("related_order_id"),
  actionType:        stockActionEnum("action_type").notNull(),
  quantityDelta:     real("quantity_delta").notNull(),
  quantityBefore:    real("quantity_before").notNull(),
  quantityAfter:     real("quantity_after").notNull(),
  reason:            text("reason"),
  notes:             text("notes"),
  photoUrl:          text("photo_url"),
  costImpactCents:   integer("cost_impact_cents"),
  performedByUserId: text("performed_by_user_id"),
  performedByName:   text("performed_by_name"),
  performedByRole:   text("performed_by_role"),
  targetStockItemId: text("target_stock_item_id"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

export type StockMovement = typeof stockMovementsTable.$inferSelect;
