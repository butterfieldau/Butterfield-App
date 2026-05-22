import { pgTable, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
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

export const notificationCampaignStatusEnum = pgEnum("notification_campaign_status", [
  "draft",
  "pending_approval",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);

export const notificationAudienceTypeEnum = pgEnum("notification_audience_type", [
  "customer",
  "wholesale",
  "staff",
  "role",
  "user",
  "segment",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "promo",
  "product_launch",
  "sold_out_restock",
  "order_update",
  "roster_published",
  "shift_changed",
  "timesheet_reminder",
  "wholesale_order_update",
  "low_stock_alert",
  "manager_alert",
  "system_alert",
]);

export const notificationCampaignsTable = pgTable("notification_campaigns", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  actionLink: text("action_link"),
  actionLabel: text("action_label"),
  audienceType: notificationAudienceTypeEnum("audience_type").notNull().default("customer"),
  audienceLabel: text("audience_label"),
  audienceFilters: text("audience_filters"),
  audienceRoles: text("audience_roles"),
  type: notificationTypeEnum("type").notNull().default("promo"),
  sendMode: text("send_mode").notNull().default("now"),
  sendAt: timestamp("send_at"),
  expiryAt: timestamp("expiry_at"),
  approvalRequired: boolean("approval_required").notNull().default(false),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdBy: text("created_by"),
  status: notificationCampaignStatusEnum("status").notNull().default("draft"),
  targetCount: integer("target_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  lastError: text("last_error"),
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationTemplatesTable = pgTable("notification_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: notificationTypeEnum("type").notNull().default("promo"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  imageUrl: text("image_url"),
  actionLink: text("action_link"),
  actionLabel: text("action_label"),
  audienceType: notificationAudienceTypeEnum("audience_type").notNull().default("customer"),
  audienceLabel: text("audience_label"),
  audienceFilters: text("audience_filters"),
  audienceRoles: text("audience_roles"),
  approvalRequired: boolean("approval_required").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationSegmentsTable = pgTable("notification_segments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  audienceType: notificationAudienceTypeEnum("audience_type").notNull().default("customer"),
  filters: text("filters").notNull(),
  createdBy: text("created_by"),
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
  campaignId: text("campaign_id"),
  // null when broadcast to a role
  targetUserId: text("target_user_id"),
  // null when targeting a specific user; matches role enum values + "all"
  targetRole: text("target_role"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // JSON: arbitrary extra data passed to the app on notification tap
  data: text("data"),
  status: text("status").notNull().default("sent"),
  errorMessage: text("error_message"),
  targetCount: integer("target_count").notNull().default(0),
  dedupeKey: text("dedupe_key"),
  sentBy: text("sent_by"),
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokensTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationCampaignSchema = createInsertSchema(notificationCampaignsTable).omit({
  createdAt: true,
  updatedAt: true,
  successCount: true,
  failureCount: true,
  targetCount: true,
});
export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplatesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationSegmentSchema = createInsertSchema(notificationSegmentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertNotificationLogSchema = createInsertSchema(notificationLogsTable).omit({
  sentAt: true,
});

export type PushToken = typeof pushTokensTable.$inferSelect;
export type NotificationCampaign = typeof notificationCampaignsTable.$inferSelect;
export type NotificationTemplate = typeof notificationTemplatesTable.$inferSelect;
export type NotificationSegment = typeof notificationSegmentsTable.$inferSelect;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type InsertNotificationCampaign = z.infer<typeof insertNotificationCampaignSchema>;
export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;
export type InsertNotificationSegment = z.infer<typeof insertNotificationSegmentSchema>;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
