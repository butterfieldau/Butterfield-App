import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const deletedAccountsTable = pgTable("deleted_accounts", {
  id: text("id").primaryKey(),
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
  deletedBy: text("deleted_by").notNull(),
  deletedByName: text("deleted_by_name"),
  expiresAt: timestamp("expires_at").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  snapshot: jsonb("snapshot").notNull(),
});
