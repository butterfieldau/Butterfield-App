import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const homeSpecialsTable = pgTable("home_specials", {
  id:        text("id").primaryKey(),
  title:     text("title").notNull(),
  subtitle:  text("subtitle"),
  imageUrl:  text("image_url"),
  badgeText: text("badge_text"),
  linkTo:    text("link_to"),
  isActive:  boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HomeSpecial = typeof homeSpecialsTable.$inferSelect;
