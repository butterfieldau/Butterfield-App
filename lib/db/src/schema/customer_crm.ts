import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const customerNotesTable = pgTable("customer_notes", {
  id:         text("id").primaryKey(),
  userId:     text("user_id").notNull(),
  authorId:   text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content:    text("content").notNull(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export const customerBadgesTable = pgTable("customer_badges", {
  id:             text("id").primaryKey(),
  userId:         text("user_id").notNull(),
  badge:          text("badge").notNull(),
  addedByUserId:  text("added_by_user_id").notNull(),
  note:           text("note"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type CustomerNote  = typeof customerNotesTable.$inferSelect;
export type CustomerBadge = typeof customerBadgesTable.$inferSelect;
