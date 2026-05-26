import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const staffInviteTokensTable = pgTable("staff_invite_tokens", {
  id:               text("id").primaryKey(),
  token:            text("token").notNull().unique(),
  createdByUserId:  text("created_by_user_id").notNull(),
  expiresAt:        timestamp("expires_at").notNull(),
  usedAt:           timestamp("used_at"),
  usedByUserId:     text("used_by_user_id"),
  note:             text("note"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export type StaffInviteToken = typeof staffInviteTokensTable.$inferSelect;
