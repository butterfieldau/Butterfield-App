import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// ── pos_daily_summaries ─────────────────────────────────────────────────────
// Pre-computed daily POS rollup — one row per Sydney-local calendar date (all
// stores combined). The background job (dailySummaryJob.ts) upserts yesterday's
// row at 1 AM Sydney time. The shop-display analytics endpoint reads from here
// for past-date day queries so dashboard load stays flat at any order volume.
//
// Lookup pattern: SELECT … WHERE date = $1   (primary-key scan, O(1))
export const posDailySummariesTable = pgTable("pos_daily_summaries", {
  id: text("id").primaryKey(),
  // Sydney-local calendar date YYYY-MM-DD — unique natural key
  date: text("date").notNull().unique(),
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
});

export type PosDailySummary = typeof posDailySummariesTable.$inferSelect;
