import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffProfilesTable = pgTable("staff_profiles", {
  userId: text("user_id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  position: text("position").notNull().default("crew"),
  department: text("department").notNull().default("floor"),
  isManager: boolean("is_manager").notNull().default(false),
  approvedByAdmin: boolean("approved_by_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStaffProfileSchema = createInsertSchema(staffProfilesTable).omit({
  createdAt: true,
});

export type InsertStaffProfile = z.infer<typeof insertStaffProfileSchema>;
export type StaffProfile = typeof staffProfilesTable.$inferSelect;
