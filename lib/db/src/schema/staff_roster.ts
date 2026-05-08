import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Staff roster ──────────────────────────────────────────────────────────────
// Each row is one shift slot on the roster. Staff are notified when a new
// roster entry is created that references their userId.
export const staffRosterTable = pgTable("staff_roster", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  // YYYY-MM-DD
  date: text("date").notNull(),
  // HH:MM 24-hour
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  // crew | supervisor | manager | trainer
  role: text("role").notNull().default("crew"),
  notes: text("notes"),
  isConfirmed: boolean("is_confirmed").notNull().default(false),
  confirmedAt: timestamp("confirmed_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStaffRosterSchema = createInsertSchema(staffRosterTable).omit({
  createdAt: true,
  updatedAt: true,
  confirmedAt: true,
});

export type StaffRoster = typeof staffRosterTable.$inferSelect;
export type InsertStaffRoster = z.infer<typeof insertStaffRosterSchema>;
