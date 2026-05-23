import { pgTable, text, integer, timestamp, boolean, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskCategoryEnum = pgEnum("task_category", [
  "daily",
  "prep",
  "cleaning",
  "opening",
  "closing",
  "training",
]);

export const issuePriorityEnum = pgEnum("issue_priority", ["low", "medium", "high", "urgent"]);

export const staffShiftsTable = pgTable("staff_shifts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  notes: text("notes"),
  hoursWorked: text("hours_worked"),
  unpaidBreakMins: integer("unpaid_break_mins").notNull().default(0),
  approvedAt: timestamp("approved_at"),
  approvedById: text("approved_by_id"),
  storeId:                 text("store_id"),
  clockInLat:              real("clock_in_lat"),
  clockInLng:              real("clock_in_lng"),
  clockInDistanceMeters:   integer("clock_in_distance_meters"),
  clockOutLat:             real("clock_out_lat"),
  clockOutLng:             real("clock_out_lng"),
  clockOutDistanceMeters:  integer("clock_out_distance_meters"),
  wasOverride:             boolean("was_override").notNull().default(false),
  overrideReason:          text("override_reason"),
  approvedBy:              text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffTasksTable = pgTable("staff_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: taskCategoryEnum("category").notNull().default("daily"),
  cadence: text("cadence").notNull().default("daily"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedBy: text("completed_by"),
  completedAt: timestamp("completed_at"),
  dueDate: text("due_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  isRecurring: boolean("is_recurring").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffTaskHistoryTable = pgTable("staff_task_history", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  taskTitle: text("task_title").notNull(),
  taskCategory: text("task_category").notNull(),
  completedByUserId: text("completed_by_user_id"),
  completedByName: text("completed_by_name"),
  completedByRole: text("completed_by_role"),
  completionStatus: text("completion_status").notNull().default("completed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffWastageTable = pgTable("staff_wastage", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull().default("units"),
  reason: text("reason").notNull(),
  estimatedCostCents: integer("estimated_cost_cents"),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffIssuesTable = pgTable("staff_issues", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  priority: issuePriorityEnum("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffLeaveRequestsTable = pgTable("staff_leave_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  type: text("type").notNull().default("annual"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStaffShiftSchema = createInsertSchema(staffShiftsTable).omit({ createdAt: true });
export const insertStaffTaskSchema = createInsertSchema(staffTasksTable).omit({ createdAt: true, completedAt: true });
export const insertStaffWastageSchema = createInsertSchema(staffWastageTable).omit({ createdAt: true });
export const insertStaffIssueSchema = createInsertSchema(staffIssuesTable).omit({ createdAt: true, resolvedAt: true });
export const insertStaffLeaveSchema = createInsertSchema(staffLeaveRequestsTable).omit({ createdAt: true, reviewedAt: true });

export type StaffShift = typeof staffShiftsTable.$inferSelect;
export type StaffTask = typeof staffTasksTable.$inferSelect;
export type StaffTaskHistory = typeof staffTaskHistoryTable.$inferSelect;
export type StaffWastage = typeof staffWastageTable.$inferSelect;
export type StaffIssue = typeof staffIssuesTable.$inferSelect;
export type StaffLeaveRequest = typeof staffLeaveRequestsTable.$inferSelect;
export type InsertStaffShift = z.infer<typeof insertStaffShiftSchema>;
export type InsertStaffTask = z.infer<typeof insertStaffTaskSchema>;
export type InsertStaffWastage = z.infer<typeof insertStaffWastageSchema>;
export type InsertStaffIssue = z.infer<typeof insertStaffIssueSchema>;
export type InsertStaffLeave = z.infer<typeof insertStaffLeaveSchema>;
