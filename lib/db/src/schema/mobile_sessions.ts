import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { usersTable } from "./users";

/**
 * One row per renewable mobile sign-in. Refresh credentials are never stored:
 * tokenDigest contains a SHA-256 digest of the opaque credential instead.
 */
export const mobileSessionsTable = pgTable(
  "mobile_sessions",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id").notNull(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    index("mobile_sessions_user_id_idx").on(table.userId),
    index("mobile_sessions_family_id_idx").on(table.familyId),
    index("mobile_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const insertMobileSessionSchema = createInsertSchema(mobileSessionsTable).omit({
  createdAt: true,
  lastUsedAt: true,
});

export type InsertMobileSession = z.infer<typeof insertMobileSessionSchema>;
export type MobileSession = typeof mobileSessionsTable.$inferSelect;