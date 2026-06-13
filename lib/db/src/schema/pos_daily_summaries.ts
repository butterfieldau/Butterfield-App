import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// ── pos_daily_summaries ─────────────────────────────────────────────────────
// Pre-computed daily POS rollup — one row per (Sydney-local calendar date, storeId).
// store_id = '' (empty string) is the global/all-stores aggregate.
// Per-store rows use the actual store UUID so per-store analytics can also fast-path.
//
// The background job (dailySummaryJob.ts) upserts at 1 AM Sydney time:
//   • global row  (store_id = '')
//   • one row per distinct store that had POS orders that day
//
// Analytics endpoint reads here for past-date day queries → O(1) vs full table scan.
// Unique constraint: (date, store_id) — managed as a DB-level unique index.
export const posDailySummariesTable = pgTable("pos_daily_summaries", {
  id: text("id").primaryKey(),
  // Sydney-local calendar date YYYY-MM-DD
  date: text("date").notNull(),
  // '' = all stores (global aggregate); UUID = specific store
  storeId: text("store_id").notNull().default(''),
  totalSalesCents: integer("total_sales_cents").notNull().default(0),
  transactionCount: integer("transaction_count").notNull().default(0),
  cashTotalCents: integer("cash_total_cents").notNull().default(0),
  cardTotalCents: integer("card_total_cents").notNull().default(0),
  discountTotalCents: integer("discount_total_cents").notNull().default(0),
  cancelledCents: integer("cancelled_cents").notNull().default(0),
  itemsSold: integer("items_sold").notNull().default(0),
  // top 6 products by revenue: [{name, units, revenueCents, pct}]
  topProducts: jsonb("top_products").$type<any[]>(),
  // 24-element array indexed by Sydney-local hour; each value = sales_cents for that hour
  hourlyTotals: jsonb("hourly_totals").$type<number[]>(),
  // { Cash: cents, Eftpos: cents, Split: cents, … }
  tenderBreakdown: jsonb("tender_breakdown").$type<Record<string, number>>(),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("pos_daily_summaries_date_store_unique").on(table.date, table.storeId),
]);

export type PosDailySummary = typeof posDailySummariesTable.$inferSelect;
