import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffProfilesTable = pgTable("staff_profiles", {
  userId: text("user_id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(),
  position: text("position").notNull().default("crew"),
  department: text("department").notNull().default("floor"),
  // employment_status: full-time | part-time | casual
  employmentStatus: text("employment_status").notNull().default("casual"),
  isManager: boolean("is_manager").notNull().default(false),
  approvedByAdmin: boolean("approved_by_admin").notNull().default(false),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  startDate: text("start_date"),
  // JSON array of task-level permission strings e.g. ["manage_tasks","view_reports"]
  permissions: text("permissions"),
  // JSON array of completed training module names
  trainingCompleted: text("training_completed"),
  // JSON object: { name, phone, relationship }
  emergencyContact: text("emergency_contact"),
  canViewOrders:    boolean("can_view_orders").notNull().default(false),
  address:          text("address"),
  taxFileNumber:    text("tax_file_number"),
  dateOfBirth:      text("date_of_birth"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStaffProfileSchema = createInsertSchema(staffProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertStaffProfile = z.infer<typeof insertStaffProfileSchema>;
export type StaffProfile = typeof staffProfilesTable.$inferSelect;
