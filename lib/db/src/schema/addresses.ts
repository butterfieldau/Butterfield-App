import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userAddressesTable = pgTable("user_addresses", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull(),
  label:     text("label").notNull().default("Home"),
  street:    text("street").notNull(),
  apt:       text("apt"),
  suburb:    text("suburb").notNull(),
  postcode:  text("postcode").notNull(),
  state:     text("state").notNull().default("NSW"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserAddressSchema = createInsertSchema(userAddressesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type UserAddress    = typeof userAddressesTable.$inferSelect;
export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;
