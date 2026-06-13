import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

// ── Sydney timezone helpers (DST-aware, same approach as shop-display route) ─

function getSydneyTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

/** Returns UTC start/end for a Sydney-local YYYY-MM-DD, DST-aware. */
function sydneyDateToUtcBounds(dateStr: string): { startUtc: Date; endUtc: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 2, 0, 0)); // 02:00 UTC ≈ midday Sydney
  const sydHour = parseInt(
    new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false }).format(probe),
    10,
  );
  const utcOffsetHours = sydHour - 2; // e.g. 10 (AEST) or 11 (AEDT)
  const startUtc = new Date(Date.UTC(y, m - 1, d, -utcOffsetHours, 0, 0));
  const endUtc   = new Date(startUtc.getTime() + 86_400_000 - 1);
  return { startUtc, endUtc };
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** Milliseconds until next 1 AM Sydney time. */
function msUntilNext1AMSydney(): number {
  const now = new Date();
  const todayStr = getSydneyTodayStr();
  const { startUtc: todayMidnightUtc } = sydneyDateToUtcBounds(todayStr);
  const todayAt1AM = todayMidnightUtc.getTime() + 3_600_000;
  if (now.getTime() < todayAt1AM) {
    return todayAt1AM - now.getTime();
  }
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const { startUtc: tomorrowMidnightUtc } = sydneyDateToUtcBounds(tomorrowStr);
  return tomorrowMidnightUtc.getTime() + 3_600_000 - now.getTime();
}

// ── Summary computation ───────────────────────────────────────────────────────

export async function computeDailySummary(dateStr: string): Promise<void> {
  const { startUtc, endUtc } = sydneyDateToUtcBounds(dateStr);

  // Aggregate totals
  const totalsResult = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_cents    ELSE 0 END), 0)::int AS total_sales_cents,
      COUNT(CASE WHEN status NOT IN ('cancelled','refunded') THEN 1 END)::int            AS transaction_count,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND payment_method = 'cash'  THEN total_cents ELSE 0 END), 0)::int AS cash_total_cents,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND payment_method != 'cash' THEN total_cents ELSE 0 END), 0)::int AS card_total_cents,
      COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN discount_cents ELSE 0 END), 0)::int AS discount_total_cents,
      COALESCE(SUM(CASE WHEN status IN ('cancelled','refunded')     THEN total_cents    ELSE 0 END), 0)::int AS cancelled_cents
    FROM orders
    WHERE source = 'pos'
      AND created_at >= ${startUtc}
      AND created_at <= ${endUtc}
  `);
  const totals = ((totalsResult as any).rows ?? (totalsResult as any))[0] ?? {};

  // Items sold
  const itemsResult = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN jsonb_typeof(items) = 'array'
        THEN (SELECT COALESCE(SUM((el->>'quantity')::int), 0) FROM jsonb_array_elements(items) el)
        ELSE 0
      END
    ), 0)::int AS items_sold
    FROM orders
    WHERE source = 'pos'
      AND status NOT IN ('cancelled','refunded')
      AND created_at >= ${startUtc}
      AND created_at <= ${endUtc}
  `);
  const itemsSold = Number(((itemsResult as any).rows ?? (itemsResult as any))[0]?.items_sold ?? 0);

  // Top 6 products by revenue
  const topResult = await db.execute(sql`
    SELECT
      item->>'productName' AS name,
      SUM((item->>'quantity')::int)::int AS units,
      SUM((item->>'quantity')::int * COALESCE((item->>'unitPriceCents')::int, 0))::int AS revenue_cents
    FROM orders,
      jsonb_array_elements(items) AS item
    WHERE source = 'pos'
      AND status NOT IN ('cancelled','refunded')
      AND created_at >= ${startUtc}
      AND created_at <= ${endUtc}
      AND items IS NOT NULL
      AND jsonb_typeof(items) = 'array'
    GROUP BY item->>'productName'
    ORDER BY revenue_cents DESC
    LIMIT 6
  `);
  const topRows = (topResult as any).rows ?? (topResult as any) ?? [];
  const totalRev = Number(totals.total_sales_cents ?? 0);
  const topProducts = topRows.map((r: any) => ({
    name: r.name ?? '',
    units: Number(r.units ?? 0),
    revenueCents: Number(r.revenue_cents ?? 0),
    pct: totalRev > 0 ? Math.round((Number(r.revenue_cents ?? 0) / totalRev) * 100) : 0,
  }));

  // Hourly totals (Sydney-local hour bucket)
  const hourlyResult = await db.execute(sql`
    SELECT
      EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Australia/Sydney'))::int AS syd_hour,
      COALESCE(SUM(total_cents), 0)::int AS hour_cents
    FROM orders
    WHERE source = 'pos'
      AND status NOT IN ('cancelled','refunded')
      AND created_at >= ${startUtc}
      AND created_at <= ${endUtc}
    GROUP BY syd_hour
  `);
  const hourlyRows = (hourlyResult as any).rows ?? (hourlyResult as any) ?? [];
  const hourlyTotals: number[] = Array(24).fill(0);
  for (const r of hourlyRows) {
    const h = Number(r.syd_hour);
    if (h >= 0 && h <= 23) hourlyTotals[h] = Number(r.hour_cents ?? 0);
  }

  // Tender breakdown
  const tenderResult = await db.execute(sql`
    SELECT
      COALESCE(payment_method, 'other') AS payment_method,
      COALESCE(SUM(total_cents), 0)::int AS tender_cents
    FROM orders
    WHERE source = 'pos'
      AND status NOT IN ('cancelled','refunded')
      AND created_at >= ${startUtc}
      AND created_at <= ${endUtc}
    GROUP BY payment_method
  `);
  const tenderRows = (tenderResult as any).rows ?? (tenderResult as any) ?? [];
  const tenderBreakdown: Record<string, number> = {};
  for (const r of tenderRows) {
    const method = String(r.payment_method ?? 'other');
    const key = method.charAt(0).toUpperCase() + method.slice(1);
    tenderBreakdown[key] = Number(r.tender_cents ?? 0);
  }

  // Upsert
  await db.execute(sql`
    INSERT INTO pos_daily_summaries (
      id, date,
      total_sales_cents, transaction_count, cash_total_cents, card_total_cents,
      discount_total_cents, cancelled_cents, items_sold,
      top_products, hourly_totals, tender_breakdown, computed_at
    ) VALUES (
      ${randomUUID()}, ${dateStr},
      ${Number(totals.total_sales_cents ?? 0)},
      ${Number(totals.transaction_count ?? 0)},
      ${Number(totals.cash_total_cents ?? 0)},
      ${Number(totals.card_total_cents ?? 0)},
      ${Number(totals.discount_total_cents ?? 0)},
      ${Number(totals.cancelled_cents ?? 0)},
      ${itemsSold},
      ${JSON.stringify(topProducts)}::jsonb,
      ${JSON.stringify(hourlyTotals)}::jsonb,
      ${JSON.stringify(tenderBreakdown)}::jsonb,
      NOW()
    )
    ON CONFLICT (date) DO UPDATE SET
      total_sales_cents    = EXCLUDED.total_sales_cents,
      transaction_count    = EXCLUDED.transaction_count,
      cash_total_cents     = EXCLUDED.cash_total_cents,
      card_total_cents     = EXCLUDED.card_total_cents,
      discount_total_cents = EXCLUDED.discount_total_cents,
      cancelled_cents      = EXCLUDED.cancelled_cents,
      items_sold           = EXCLUDED.items_sold,
      top_products         = EXCLUDED.top_products,
      hourly_totals        = EXCLUDED.hourly_totals,
      tender_breakdown     = EXCLUDED.tender_breakdown,
      computed_at          = NOW()
  `);

  logger.info({ date: dateStr }, 'pos_daily_summaries: upserted');
}

// ── Job scheduler ─────────────────────────────────────────────────────────────

export function startDailySummaryJob(): void {
  const scheduleNext = () => {
    const delay = msUntilNext1AMSydney();
    logger.info({ nextRunInSeconds: Math.round(delay / 1000) }, 'pos_daily_summary: next run scheduled');

    const t = setTimeout(async () => {
      const yesterdayStr = addDaysToDateStr(getSydneyTodayStr(), -1);
      logger.info({ date: yesterdayStr }, 'pos_daily_summary: computing');
      try {
        await computeDailySummary(yesterdayStr);
      } catch (err) {
        logger.error({ err, date: yesterdayStr }, 'pos_daily_summary: compute failed');
      }
      scheduleNext();
    }, delay);

    if (typeof (t as any).unref === 'function') (t as any).unref();
  };
  scheduleNext();
}
