import { pgTable, text, integer, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Push token registry ───────────────────────────────────────────────────────
// One row per device per user. Users can have multiple devices.
export const pushTokensTable = pgTable("push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  // ios | android | web
  platform: text("platform").notNull().default("ios"),
  deviceName: text("device_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Notification log ──────────────────────────────────────────────────────────
// Records every broadcast or targeted notification sent.
// notification types (public):  product_launch | order_ready | order_status | app_offer | reward_update | hours_change
// notification types (staff):   new_roster | task_assigned | shift_reminder | urgent_notice | issue_update
// notification types (wholesale):order_confirmed | order_ready | invoice_sent | cutoff_reminder | new_product
export const notificationLogsTable = pgTable("notification_logs", {
  id: text("id").primaryKey(),
  // null when broadcast to a role
  targetUserId: text("target_user_id"),
  // null when targeting a specific user; matches role enum values + "all"
  targetRole: text("target_role"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // JSON: arbitrary extra data passed to the app on notification tap
  data: text("data"),
  sentBy: text("sent_by"),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokensTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationLogSchema = createInsertSchema(notificationLogsTable).omit({
  sentAt: true,
});

export type PushToken = typeof pushTokensTable.$inferSelect;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
