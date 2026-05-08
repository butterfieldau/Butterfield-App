import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["customer", "staff", "wholesale", "director", "manager"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("customer"),
  name: text("name").notNull(),
  phone: text("phone"),
  profileImage: text("profile_image"),
  stripeCustomerId: text("stripe_customer_id"),
  // account status: active | suspended | inactive
  status: text("status").notNull().default("active"),
  // legacy field kept for backwards compat — mirrors status === 'active'
  isActive: text("is_active").notNull().default("true"),
  // notification preferences stored as JSON string:
  // { orderUpdates, promotions, rewards, staffAlerts, wholesaleAlerts }
  notificationPreferences: text("notification_preferences"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
