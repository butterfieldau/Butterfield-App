import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const MANAGER_PERMISSIONS = [
  "dashboard",
  "orders",
  "users",
  "timesheets",
  "products",
  "reports",
  "rewards",
  "announcements",
  "settings",
  "pricing",
  "banners",
] as const;

export type ManagerPermission = typeof MANAGER_PERMISSIONS[number];

export const managerProfilesTable = pgTable("manager_profiles", {
  userId:          text("user_id").primaryKey(),
  permissions:     text("permissions").notNull().default("[]"), // JSON: ManagerPermission[]
  createdByUserId: text("created_by_user_id"),
  notes:           text("notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export const insertManagerProfileSchema = createInsertSchema(managerProfilesTable).omit({ createdAt: true, updatedAt: true });

export type ManagerProfile = typeof managerProfilesTable.$inferSelect;
export type InsertManagerProfile = z.infer<typeof insertManagerProfileSchema>;
