import { pgTable, text, integer, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetRoles: text("target_roles").array().notNull().default(["customer"]),
  isActive: boolean("is_active").notNull().default(true),
  isPinned: boolean("is_pinned").notNull().default(false),
  imageUrl: text("image_url"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const favouritesTable = pgTable("favourites", {
  userId: text("user_id").notNull(),
  productStripeId: text("product_stripe_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.productStripeId] })]);

export const feedbackTable = pgTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  rating: integer("rating"),
  orderId: text("order_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waitlistsTable = pgTable("waitlists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  productStripeId: text("product_stripe_id").notNull(),
  notified: boolean("notified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const storeSettingsTable = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ createdAt: true });
export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({ createdAt: true });
export const insertWaitlistSchema = createInsertSchema(waitlistsTable).omit({ createdAt: true });

export type Announcement = typeof announcementsTable.$inferSelect;
export type Feedback = typeof feedbackTable.$inferSelect;
export type Waitlist = typeof waitlistsTable.$inferSelect;
export type Favourite = typeof favouritesTable.$inferSelect;
export type StoreSettings = typeof storeSettingsTable.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
