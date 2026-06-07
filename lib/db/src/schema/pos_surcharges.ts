import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const posSurchargesTable = pgTable("pos_surcharges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value").notNull(),
  amountType: text("amount_type").notNull(),
  amountValue: integer("amount_value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PosSurcharge = typeof posSurchargesTable.$inferSelect;
