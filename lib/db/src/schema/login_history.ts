import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const loginHistoryTable = pgTable("login_history", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  email: text("email"),
  role: text("role"),
  success: boolean("success").notNull().default(false),
  failReason: text("fail_reason"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type LoginHistory = typeof loginHistoryTable.$inferSelect;
