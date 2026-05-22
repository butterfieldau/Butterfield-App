import { pgTable, text, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
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
