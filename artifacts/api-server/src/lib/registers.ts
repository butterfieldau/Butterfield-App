import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import {
  db,
  registerSessionsTable,
  registerCashMovementsTable,
  posOrderRefundsTable,
  staffStoreAssignmentsTable,
  storesTable,
  storeSettingsTable,
} from '@workspace/db';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { sydneyDateParts, sydneyStartOfDay } from './sydneyTime.js';

const REGISTER_AUTO_CLOSE_KEY = 'auto_close_register_enabled';
const DEFAULT_REGISTER_AUTO_CLOSE_ENABLED = true;
const LARGE_CASH_REMOVAL_CENTS = 10000;
const LARGE_VARIANCE_CENTS = 2000;

type RoleLike = 'staff' | 'manager' | 'director' | 'master' | 'shop_display';

export interface RegisterSessionSummary {
  startingFloatCents: number | null;
  cashSalesCents: number;
  cardSalesCents: number;
  cashRefundsCents: number;
  cardRefundsCents: number;
  totalRefundsCents: number;
  discountsCents: number;
  surchargesCents: number;
  cashAddedCents: number;
  cashRemovedCents: number;
  expectedCashCents: number;
  actualCountedCashCents: number | null;
  varianceCents: number | null;
  totalSalesCents: number;
}

export interface RegisterSessionReport {
  id: string;
  storeId: string | null;
  registerName: string;
  registerLocation: string | null;
  tradingDate: string;
  openedAt: string;
  openedByUserId: string;
  openedByName: string | null;
  startingFloatEnteredAt: string | null;
  startingFloatEnteredByUserId: string | null;
  startingFloatEnteredByName: string | null;
  closedAt: string | null;
  closedByUserId: string | null;
  closedByName: string | null;
  closeMethod: 'manual' | 'auto' | null;
  closeNote: string | null;
  varianceNote: string | null;
  varianceApprovedByUserId: string | null;
  varianceApprovedByName: string | null;
  printedAt: string | null;
  autoClosed: boolean;
  isEmpty: boolean;
  summary: RegisterSessionSummary;
}

interface RegisterContext {
  storeId: string | null;
  registerName: string;
  registerLocation: string | null;
}

type SupervisorIdentity = { userId: string; name: string | null; role: string | null };

let registerSchemaReady: Promise<void> | null = null;
let autoCloseLoopStarted = false;

function toTradingDate(ref: Date = new Date()): string {
  const p = sydneyDateParts(ref);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Returns the UTC Date equivalent of 23:59:59 Sydney time on the given trading date string.
 * Used when auto-closing stale sessions so the recorded close time reflects the actual
 * end of that trading day, not the current wall-clock time.
 */
function tradingDateEndUtc(tradingDate: string): Date {
  const [year, month, day] = tradingDate.split('-').map(Number);
  // Probe at noon UTC — always within the target calendar day regardless of DST.
  const probe = new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0));
  // Midnight Sydney time on that date, as UTC.
  const startUtc = sydneyStartOfDay(probe);
  // Add 23h 59m 59s to reach 23:59:59 Sydney time.
  return new Date(startUtc.getTime() + (23 * 3600 + 59 * 60 + 59) * 1000);
}

function isManagerish(role: string | null | undefined): boolean {
  return role === 'manager' || role === 'director' || role === 'master';
}

function normalizeSplitPayments(raw: unknown): Array<{ method: 'cash' | 'eftpos'; amountCents: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const method = item && typeof item === 'object' ? String((item as any).method ?? '') : '';
      const amountCents = item && typeof item === 'object' ? Number((item as any).amountCents ?? 0) : 0;
      if (!['cash', 'eftpos'].includes(method) || !Number.isFinite(amountCents) || amountCents <= 0) return null;
      return { method: method as 'cash' | 'eftpos', amountCents: Math.round(amountCents) };
    })
    .filter(Boolean) as Array<{ method: 'cash' | 'eftpos'; amountCents: number }>;
}

function allocatePaymentBreakdown(totalCents: number, paymentMethod: string | null, splitPayments: unknown) {
  const normalizedSplits = normalizeSplitPayments(splitPayments);
  if (normalizedSplits.length > 0) {
    return normalizedSplits.reduce(
      (acc, item) => {
        if (item.method === 'cash') acc.cash += item.amountCents;
        else acc.card += item.amountCents;
        return acc;
      },
      { cash: 0, card: 0 },
    );
  }
  if (paymentMethod === 'cash') return { cash: totalCents, card: 0 };
  return { cash: 0, card: totalCents };
}

function shouldRequireCashRemovalApproval(role: string, amountCents: number): boolean {
  return !isManagerish(role) && amountCents >= LARGE_CASH_REMOVAL_CENTS;
}

function shouldRequireVarianceApproval(role: string, varianceCents: number): boolean {
  return !isManagerish(role) && Math.abs(varianceCents) >= LARGE_VARIANCE_CENTS;
}

async function getSupervisorByPin(pin: string): Promise<SupervisorIdentity | null> {
  const rows = await db.execute(sql`
    SELECT u.id, u.name, u.role, sp.settings_pin_hash, sp.clock_pin
    FROM staff_profiles sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.role IN ('manager', 'director', 'master')
  `);
  const profiles = (rows as any).rows ?? (rows as any) ?? [];
  for (const row of profiles) {
    if (row.settings_pin_hash) {
      const valid = await bcrypt.compare(pin, row.settings_pin_hash);
      if (valid) return { userId: row.id, name: row.name ?? null, role: row.role ?? null };
    } else if (row.clock_pin) {
      const valid = await bcrypt.compare(pin, row.clock_pin);
      if (valid) return { userId: row.id, name: row.name ?? null, role: row.role ?? null };
    }
  }
  return null;
}

export async function ensureRegisterSchemaReady() {
  if (!registerSchemaReady) {
    registerSchemaReady = (async () => {
      await db.execute(sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'register_close_method') THEN
            CREATE TYPE register_close_method AS ENUM ('manual', 'auto');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'register_cash_movement_type') THEN
            CREATE TYPE register_cash_movement_type AS ENUM ('add', 'remove');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'register_refund_method') THEN
            CREATE TYPE register_refund_method AS ENUM ('cash', 'eftpos', 'split');
          END IF;
        END $$;
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS register_sessions (
          id text PRIMARY KEY,
          store_id text,
          register_name text NOT NULL,
          register_location text,
          trading_date text NOT NULL,
          opened_by_user_id text NOT NULL,
          opened_at timestamp NOT NULL DEFAULT now(),
          starting_float_cents integer,
          starting_float_entered_at timestamp,
          starting_float_entered_by_user_id text,
          closed_at timestamp,
          closed_by_user_id text,
          close_method register_close_method,
          actual_counted_cash_cents integer,
          variance_cents integer,
          close_note text,
          variance_note text,
          variance_approved_by_user_id text,
          printed_at timestamp,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS register_cash_movements (
          id text PRIMARY KEY,
          session_id text NOT NULL,
          movement_type register_cash_movement_type NOT NULL,
          amount_cents integer NOT NULL,
          reason text,
          created_by_user_id text NOT NULL,
          approved_by_user_id text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pos_order_refunds (
          id text PRIMARY KEY,
          order_id text NOT NULL,
          register_session_id text NOT NULL,
          refund_amount_cents integer NOT NULL,
          refund_method register_refund_method NOT NULL,
          split_payments jsonb,
          reason text,
          created_by_user_id text NOT NULL,
          approved_by_user_id text,
          is_void boolean NOT NULL DEFAULT false,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);

      await db.execute(sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS register_session_id text
      `);

      await db.execute(sql`
        INSERT INTO store_settings (key, value)
        VALUES (${REGISTER_AUTO_CLOSE_KEY}, ${DEFAULT_REGISTER_AUTO_CLOSE_ENABLED ? 'true' : 'false'})
        ON CONFLICT (key) DO NOTHING
      `);

      await db.execute(sql`
        UPDATE register_sessions
        SET printed_at = now(), updated_at = now()
        WHERE close_method = 'auto'
          AND printed_at IS NULL
          AND starting_float_cents IS NULL
      `);

      // Enforce at most one OPEN session per store per trading day.
      // Two partial indexes cover the two cases: store_id present vs absent.
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS register_sessions_open_store_day_idx
        ON register_sessions (store_id, trading_date)
        WHERE closed_at IS NULL AND store_id IS NOT NULL
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS register_sessions_open_nostore_day_idx
        ON register_sessions (register_name, trading_date)
        WHERE closed_at IS NULL AND store_id IS NULL
      `);
    })().catch((error) => {
      registerSchemaReady = null;
      throw error;
    });
  }
  return registerSchemaReady;
}

async function getRegisterContext(userId: string): Promise<RegisterContext> {
  const assignments = await db
    .select()
    .from(staffStoreAssignmentsTable)
    .where(and(eq(staffStoreAssignmentsTable.staffId, userId), eq(staffStoreAssignmentsTable.isActive, true)))
    .orderBy(desc(staffStoreAssignmentsTable.isPrimary), asc(staffStoreAssignmentsTable.createdAt));

  let store = null as typeof storesTable.$inferSelect | null;

  if (assignments.length > 0) {
    const [assignedStore] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, assignments[0]!.storeId))
      .limit(1);
    store = assignedStore ?? null;
  }

  if (!store) {
    const [fallbackStore] = await db
      .select()
      .from(storesTable)
      .where(isNull(storesTable.deletedAt))
      .orderBy(asc(storesTable.sortOrder), asc(storesTable.name))
      .limit(1);
    store = fallbackStore ?? null;
  }

  if (!store) {
    return {
      storeId: null,
      registerName: 'Butterfield POS Register',
      registerLocation: 'Butterfield Cookies',
    };
  }

  const location = [store.address, store.suburb, store.state].filter(Boolean).join(', ');
  return {
    storeId: store.id,
    registerName: `${store.name} Register`,
    registerLocation: location || store.name,
  };
}

async function findOpenSessionForContext(context: RegisterContext, tradingDate?: string) {
  const conditions = [isNull(registerSessionsTable.closedAt)];
  if (context.storeId) conditions.push(eq(registerSessionsTable.storeId, context.storeId));
  else conditions.push(eq(registerSessionsTable.registerName, context.registerName));
  if (tradingDate) conditions.push(eq(registerSessionsTable.tradingDate, tradingDate));
  const [session] = await db
    .select()
    .from(registerSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(registerSessionsTable.openedAt))
    .limit(1);
  return session ?? null;
}

export async function getRegisterSettings() {
  await ensureRegisterSchemaReady();
  const [row] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.key, REGISTER_AUTO_CLOSE_KEY))
    .limit(1);
  return {
    autoCloseEnabled: row ? row.value === 'true' : DEFAULT_REGISTER_AUTO_CLOSE_ENABLED,
  };
}

export async function updateRegisterAutoCloseSetting(actorUserId: string, enabled: boolean) {
  await ensureRegisterSchemaReady();
  await db.insert(storeSettingsTable).values({
    key: REGISTER_AUTO_CLOSE_KEY,
    value: enabled ? 'true' : 'false',
    updatedBy: actorUserId,
  }).onConflictDoUpdate({
    target: storeSettingsTable.key,
    set: { value: enabled ? 'true' : 'false', updatedAt: new Date(), updatedBy: actorUserId },
  });
  return { autoCloseEnabled: enabled };
}

export async function getOrCreateCurrentRegisterSession(userId: string) {
  await ensureRegisterSchemaReady();
  const context = await getRegisterContext(userId);
  const tradingDate = toTradingDate();
  const existing = await findOpenSessionForContext(context, tradingDate);
  if (existing) return existing;
  try {
    const [created] = await db.insert(registerSessionsTable).values({
      id: randomUUID(),
      storeId: context.storeId,
      registerName: context.registerName,
      registerLocation: context.registerLocation,
      tradingDate,
      openedByUserId: userId,
      openedAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return created!;
  } catch (err: unknown) {
    // Unique constraint violation — another concurrent request already created the session.
    // Fetch and return the winner.
    const isUniqueViolation =
      err instanceof Error &&
      ((err as any).code === '23505' || /unique/i.test(err.message));
    if (isUniqueViolation) {
      const winner = await findOpenSessionForContext(context, tradingDate);
      if (winner) return winner;
    }
    throw err;
  }
}

export async function setRegisterStartingFloat(params: {
  userId: string;
  amountCents: number;
}) {
  const session = await getOrCreateCurrentRegisterSession(params.userId);
  const amountCents = Math.max(0, Math.round(params.amountCents));
  const [updated] = await db
    .update(registerSessionsTable)
    .set({
      startingFloatCents: amountCents,
      startingFloatEnteredAt: new Date(),
      startingFloatEnteredByUserId: params.userId,
      updatedAt: new Date(),
    })
    .where(eq(registerSessionsTable.id, session.id))
    .returning();
  return updated ?? session;
}

export async function addRegisterCashMovement(params: {
  sessionId: string;
  actorUserId: string;
  actorRole: RoleLike;
  movementType: 'add' | 'remove';
  amountCents: number;
  reason?: string | null;
  supervisorPin?: string | null;
}) {
  await ensureRegisterSchemaReady();
  const [session] = await db
    .select()
    .from(registerSessionsTable)
    .where(eq(registerSessionsTable.id, params.sessionId))
    .limit(1);
  if (!session || session.closedAt) {
    throw new Error('REGISTER_SESSION_CLOSED');
  }

  const amountCents = Math.max(1, Math.round(params.amountCents));
  let approvedByUserId: string | null = null;
  if (
    params.movementType === 'remove' &&
    shouldRequireCashRemovalApproval(params.actorRole, amountCents)
  ) {
    if (!params.supervisorPin || !/^\d{4}$/.test(String(params.supervisorPin))) {
      throw new Error('SUPERVISOR_PIN_REQUIRED');
    }
    const supervisor = await getSupervisorByPin(String(params.supervisorPin));
    if (!supervisor) throw new Error('SUPERVISOR_PIN_INVALID');
    approvedByUserId = supervisor.userId;
  }

  await db.insert(registerCashMovementsTable).values({
    id: randomUUID(),
    sessionId: params.sessionId,
    movementType: params.movementType,
    amountCents,
    reason: params.reason?.trim() || null,
    createdByUserId: params.actorUserId,
    approvedByUserId,
    createdAt: new Date(),
  });

  return { approvedByUserId };
}

export async function recordPosRefundEvent(params: {
  orderId: string;
  registerSessionId: string;
  refundAmountCents: number;
  paymentMethod: string | null;
  splitPayments?: unknown;
  reason?: string | null;
  createdByUserId: string;
  approvedByUserId?: string | null;
  isVoid?: boolean;
}) {
  await ensureRegisterSchemaReady();
  const amountCents = Math.max(0, Math.round(params.refundAmountCents));
  if (amountCents <= 0) return;
  const normalizedSplits = normalizeSplitPayments(params.splitPayments);
  const refundMethod = normalizedSplits.length > 0
    ? 'split'
    : (params.paymentMethod === 'cash' ? 'cash' : 'eftpos');

  let splitPayments = null as Array<{ method: 'cash' | 'eftpos'; amountCents: number }> | null;
  if (normalizedSplits.length > 0) {
    const originalTotal = normalizedSplits.reduce((sum, item) => sum + item.amountCents, 0);
    if (originalTotal > 0) {
      let remaining = amountCents;
      splitPayments = normalizedSplits.map((item, index) => {
        if (index === normalizedSplits.length - 1) {
          return { ...item, amountCents: remaining };
        }
        const prorated = Math.round(amountCents * (item.amountCents / originalTotal));
        remaining -= prorated;
        return { ...item, amountCents: prorated };
      }).filter((item) => item.amountCents > 0);
    }
  }

  await db.insert(posOrderRefundsTable).values({
    id: randomUUID(),
    orderId: params.orderId,
    registerSessionId: params.registerSessionId,
    refundAmountCents: amountCents,
    refundMethod,
    splitPayments,
    reason: params.reason?.trim() || null,
    createdByUserId: params.createdByUserId,
    approvedByUserId: params.approvedByUserId ?? null,
    isVoid: params.isVoid ?? false,
    createdAt: new Date(),
  });
}

export async function computeRegisterSessionSummary(sessionId: string): Promise<RegisterSessionSummary> {
  await ensureRegisterSchemaReady();
  const [session] = await db
    .select()
    .from(registerSessionsTable)
    .where(eq(registerSessionsTable.id, sessionId))
    .limit(1);
  if (!session) throw new Error('REGISTER_SESSION_NOT_FOUND');

  const [ordersResult, refundsResult, movementsResult] = await Promise.all([
    db.execute(sql`
      SELECT total_cents, payment_method, split_payments, discount_cents, surcharge_cents
      FROM orders
      WHERE register_session_id = ${sessionId}
        AND source = 'pos'
        AND status != 'cancelled'
        AND created_at >= ${session.tradingDate}::date::timestamp AT TIME ZONE 'Australia/Sydney'
        AND created_at <  (${session.tradingDate}::date + INTERVAL '1 day') AT TIME ZONE 'Australia/Sydney'
    `),
    db.execute(sql`
      SELECT refund_amount_cents, refund_method, split_payments
      FROM pos_order_refunds
      WHERE register_session_id = ${sessionId}
        AND created_at >= ${session.tradingDate}::date::timestamp AT TIME ZONE 'Australia/Sydney'
        AND created_at <  (${session.tradingDate}::date + INTERVAL '1 day') AT TIME ZONE 'Australia/Sydney'
    `),
    db.execute(sql`
      SELECT movement_type, amount_cents
      FROM register_cash_movements
      WHERE session_id = ${sessionId}
    `),
  ]);

  const orders = ((ordersResult as any).rows ?? (ordersResult as any) ?? []) as Array<{
    total_cents: string | number;
    payment_method: string | null;
    split_payments: unknown;
    discount_cents: string | number;
    surcharge_cents: string | number;
  }>;
  const refunds = ((refundsResult as any).rows ?? (refundsResult as any) ?? []) as Array<{
    refund_amount_cents: string | number;
    refund_method: string;
    split_payments: unknown;
  }>;
  const movements = ((movementsResult as any).rows ?? (movementsResult as any) ?? []) as Array<{
    movement_type: 'add' | 'remove';
    amount_cents: string | number;
  }>;

  let cashSalesCents = 0;
  let cardSalesCents = 0;
  let discountsCents = 0;
  let surchargesCents = 0;

  for (const order of orders) {
    const totalCents = Number(order.total_cents ?? 0);
    const breakdown = allocatePaymentBreakdown(totalCents, order.payment_method, order.split_payments);
    cashSalesCents += breakdown.cash;
    cardSalesCents += breakdown.card;
    discountsCents += Number(order.discount_cents ?? 0);
    surchargesCents += Number(order.surcharge_cents ?? 0);
  }

  let cashRefundsCents = 0;
  let cardRefundsCents = 0;
  for (const refund of refunds) {
    const amountCents = Number(refund.refund_amount_cents ?? 0);
    if (refund.refund_method === 'split') {
      const breakdown = allocatePaymentBreakdown(amountCents, 'eftpos', refund.split_payments);
      cashRefundsCents += breakdown.cash;
      cardRefundsCents += breakdown.card;
    } else if (refund.refund_method === 'cash') {
      cashRefundsCents += amountCents;
    } else {
      cardRefundsCents += amountCents;
    }
  }

  let cashAddedCents = 0;
  let cashRemovedCents = 0;
  for (const movement of movements) {
    const amountCents = Number(movement.amount_cents ?? 0);
    if (movement.movement_type === 'add') cashAddedCents += amountCents;
    else cashRemovedCents += amountCents;
  }

  const startingFloatCents = session.startingFloatCents ?? null;
  const expectedCashCents = (startingFloatCents ?? 0) + cashSalesCents - cashRefundsCents + cashAddedCents - cashRemovedCents;
  const actualCountedCashCents = session.actualCountedCashCents ?? null;
  const varianceCents = actualCountedCashCents === null ? null : actualCountedCashCents - expectedCashCents;

  return {
    startingFloatCents,
    cashSalesCents,
    cardSalesCents,
    cashRefundsCents,
    cardRefundsCents,
    totalRefundsCents: cashRefundsCents + cardRefundsCents,
    discountsCents,
    surchargesCents,
    cashAddedCents,
    cashRemovedCents,
    expectedCashCents,
    actualCountedCashCents,
    varianceCents,
    totalSalesCents: cashSalesCents + cardSalesCents,
  };
}

export async function closeRegisterSession(params: {
  sessionId: string;
  actorUserId: string;
  actorRole: RoleLike;
  actualCountedCashCents: number;
  closeNote?: string | null;
  varianceNote?: string | null;
}) {
  await ensureRegisterSchemaReady();
  const [session] = await db
    .select()
    .from(registerSessionsTable)
    .where(eq(registerSessionsTable.id, params.sessionId))
    .limit(1);
  if (!session || session.closedAt) throw new Error('REGISTER_SESSION_CLOSED');

  const actualCountedCashCents = Math.max(0, Math.round(params.actualCountedCashCents));
  const baseSummary = await computeRegisterSessionSummary(params.sessionId);
  const varianceCents = actualCountedCashCents - baseSummary.expectedCashCents;

  if (varianceCents !== 0 && !params.varianceNote?.trim()) {
    throw new Error('VARIANCE_NOTE_REQUIRED');
  }

  const [updated] = await db
    .update(registerSessionsTable)
    .set({
      closedAt: new Date(),
      closedByUserId: params.actorUserId,
      closeMethod: 'manual',
      actualCountedCashCents,
      varianceCents,
      closeNote: params.closeNote?.trim() || null,
      varianceNote: varianceCents !== 0 ? (params.varianceNote?.trim() || null) : null,
      varianceApprovedByUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(registerSessionsTable.id, params.sessionId))
    .returning();

  return updated ?? session;
}

export async function ensureAutoClosedRegisterSessions() {
  await ensureRegisterSchemaReady();
  const { autoCloseEnabled } = await getRegisterSettings();
  if (!autoCloseEnabled) return 0;

  const syd = sydneyDateParts();
  const today = toTradingDate();
  const shouldCloseToday = syd.hour > 23 || (syd.hour === 23 && syd.minute >= 59);

  const sessions = await db
    .select()
    .from(registerSessionsTable)
    .where(isNull(registerSessionsTable.closedAt))
    .orderBy(asc(registerSessionsTable.openedAt));

  let closedCount = 0;
  for (const session of sessions) {
    const staleSession = session.tradingDate < today;
    const endOfDayReached = session.tradingDate === today && shouldCloseToday;
    if (!staleSession && !endOfDayReached) continue;

    // For stale sessions (previous trading days), back-date the close time to
    // 23:59:59 Sydney on their actual trading date — not the current wall-clock
    // time — so the Z-report shows a sensible end-of-day close rather than
    // whatever time the server happened to sweep them up (e.g. 3:59 AM).
    const closedAt = staleSession ? tradingDateEndUtc(session.tradingDate) : new Date();

    await db
      .update(registerSessionsTable)
      .set({
        closedAt,
        closeMethod: 'auto',
        actualCountedCashCents: null,
        varianceCents: null,
        varianceNote: null,
        updatedAt: new Date(),
      })
      .where(eq(registerSessionsTable.id, session.id));
    closedCount += 1;
  }

  return closedCount;
}

export function startRegisterAutoCloseLoop() {
  if (autoCloseLoopStarted) return;
  autoCloseLoopStarted = true;
  const timer = setInterval(() => {
    ensureAutoClosedRegisterSessions().catch(() => {});
  }, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

async function fetchRegisterSessionRow(sessionId: string) {
  const result = await db.execute(sql`
    SELECT
      rs.id,
      rs.store_id,
      rs.register_name,
      rs.register_location,
      rs.trading_date,
      rs.opened_at,
      rs.opened_by_user_id,
      opener.name AS opened_by_name,
      rs.starting_float_entered_at,
      rs.starting_float_entered_by_user_id,
      float_user.name AS starting_float_entered_by_name,
      rs.closed_at,
      rs.closed_by_user_id,
      closer.name AS closed_by_name,
      rs.close_method,
      rs.close_note,
      rs.variance_note,
      rs.variance_approved_by_user_id,
      variance_user.name AS variance_approved_by_name,
      rs.printed_at
    FROM register_sessions rs
    LEFT JOIN users opener ON opener.id = rs.opened_by_user_id
    LEFT JOIN users float_user ON float_user.id = rs.starting_float_entered_by_user_id
    LEFT JOIN users closer ON closer.id = rs.closed_by_user_id
    LEFT JOIN users variance_user ON variance_user.id = rs.variance_approved_by_user_id
    WHERE rs.id = ${sessionId}
    LIMIT 1
  `);
  return ((result as any).rows ?? (result as any) ?? [])[0] ?? null;
}

export async function getRegisterSessionReport(sessionId: string): Promise<RegisterSessionReport | null> {
  await ensureRegisterSchemaReady();
  const row = await fetchRegisterSessionRow(sessionId);
  if (!row) return null;
  const summary = await computeRegisterSessionSummary(sessionId);
  return {
    id: row.id,
    storeId: row.store_id ?? null,
    registerName: row.register_name,
    registerLocation: row.register_location ?? null,
    tradingDate: row.trading_date,
    openedAt: new Date(row.opened_at).toISOString(),
    openedByUserId: row.opened_by_user_id,
    openedByName: row.opened_by_name ?? null,
    startingFloatEnteredAt: row.starting_float_entered_at ? new Date(row.starting_float_entered_at).toISOString() : null,
    startingFloatEnteredByUserId: row.starting_float_entered_by_user_id ?? null,
    startingFloatEnteredByName: row.starting_float_entered_by_name ?? null,
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    closedByUserId: row.closed_by_user_id ?? null,
    closedByName: row.closed_by_name ?? null,
    closeMethod: row.close_method ?? null,
    closeNote: row.close_note ?? null,
    varianceNote: row.variance_note ?? null,
    varianceApprovedByUserId: row.variance_approved_by_user_id ?? null,
    varianceApprovedByName: row.variance_approved_by_name ?? null,
    printedAt: row.printed_at ? new Date(row.printed_at).toISOString() : null,
    autoClosed: row.close_method === 'auto',
    isEmpty:
      row.starting_float_cents === null &&
      summary.totalSalesCents === 0 &&
      summary.cashAddedCents === 0 &&
      summary.cashRemovedCents === 0,
    summary,
  };
}

export async function listRegisterSessionReports(filters?: {
  from?: string;
  to?: string;
  register?: string;
  staffUserId?: string;
  closeMethod?: 'manual' | 'auto';
  variance?: 'all' | 'with_variance' | 'without_variance';
  activity?: 'all' | 'meaningful' | 'empty';
}) {
  await ensureRegisterSchemaReady();
  await ensureAutoClosedRegisterSessions();
  const conditions = [sql`rs.closed_at IS NOT NULL`];
  if (filters?.from) conditions.push(sql`rs.trading_date >= ${filters.from}`);
  if (filters?.to) conditions.push(sql`rs.trading_date <= ${filters.to}`);
  if (filters?.register) conditions.push(sql`LOWER(rs.register_name) LIKE LOWER(${`%${filters.register}%`})`);
  if (filters?.staffUserId) {
    conditions.push(sql`(rs.opened_by_user_id = ${filters.staffUserId} OR rs.closed_by_user_id = ${filters.staffUserId})`);
  }
  if (filters?.closeMethod) conditions.push(sql`rs.close_method = ${filters.closeMethod}`);

  const result = await db.execute(sql`
    SELECT rs.id
    FROM register_sessions rs
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY rs.trading_date DESC, rs.closed_at DESC NULLS LAST, rs.opened_at DESC
  `);
  const ids = (((result as any).rows ?? (result as any) ?? []) as Array<{ id: string }>).map((row) => row.id);
  let reports = (await Promise.all(ids.map((id) => getRegisterSessionReport(id)))).filter(Boolean) as RegisterSessionReport[];

  if (filters?.variance && filters.variance !== 'all') {
    if (filters.variance === 'with_variance') {
      reports = reports.filter((r) => r.summary.varianceCents !== null && r.summary.varianceCents !== 0);
    } else {
      reports = reports.filter((r) => r.summary.varianceCents === 0 || r.summary.varianceCents === null);
    }
  }

  const activity = filters?.activity ?? 'meaningful';
  if (activity === 'meaningful') {
    reports = reports.filter((r) => !r.isEmpty);
  } else if (activity === 'empty') {
    reports = reports.filter((r) => r.isEmpty);
  }

  return reports;
}

export async function updateClosedRegisterSessionNotes(params: {
  sessionId: string;
  closeNote?: string | null;
  varianceNote?: string | null;
}) {
  await ensureRegisterSchemaReady();
  const [updated] = await db
    .update(registerSessionsTable)
    .set({
      closeNote: params.closeNote?.trim() || null,
      varianceNote: params.varianceNote?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(registerSessionsTable.id, params.sessionId))
    .returning();
  return updated ?? null;
}

export async function markRegisterSummaryPrinted(sessionId: string) {
  await ensureRegisterSchemaReady();
  await db
    .update(registerSessionsTable)
    .set({ printedAt: new Date(), updatedAt: new Date() })
    .where(eq(registerSessionsTable.id, sessionId));
}

export async function getPendingAutoPrintReport(userId: string) {
  await ensureRegisterSchemaReady();
  const context = await getRegisterContext(userId);
  const conditions = [
    eq(registerSessionsTable.closeMethod, 'auto'),
    isNull(registerSessionsTable.printedAt),
    isNotNull(registerSessionsTable.startingFloatCents),
  ];
  if (context.storeId) conditions.push(eq(registerSessionsTable.storeId, context.storeId));
  else conditions.push(eq(registerSessionsTable.registerName, context.registerName));
  const [session] = await db
    .select()
    .from(registerSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(registerSessionsTable.closedAt))
    .limit(1);
  if (!session) return null;
  return getRegisterSessionReport(session.id);
}

export async function getRegisterSessionForCashAccess(userId: string) {
  const session = await getOrCreateCurrentRegisterSession(userId);
  return {
    session,
    cashEnabled: session.startingFloatCents !== null,
  };
}

export async function listCurrentRegisterRecentSessions(userId: string, limit = 10): Promise<RegisterSessionReport[]> {
  await ensureRegisterSchemaReady();
  const context = await getRegisterContext(userId);
  const storeCondition = context.storeId
    ? sql`rs.store_id = ${context.storeId}`
    : sql`rs.register_name = ${context.registerName}`;
  const result = await db.execute(sql`
    SELECT rs.id
    FROM register_sessions rs
    WHERE rs.closed_at IS NOT NULL
      AND ${storeCondition}
    ORDER BY rs.trading_date DESC, rs.closed_at DESC NULLS LAST
    LIMIT ${limit}
  `);
  const ids = (((result as any).rows ?? (result as any) ?? []) as { id: string }[]).map((r) => r.id);
  return (await Promise.all(ids.map((id) => getRegisterSessionReport(id)))).filter(Boolean) as RegisterSessionReport[];
}

/**
 * Fetch a register session report by ID, scoped to the requesting user's store/register.
 * Returns null if the session does not exist or belongs to a different store/register,
 * preventing IDOR across tenants.
 */
export async function getCurrentRegisterSessionReportById(
  userId: string,
  sessionId: string,
): Promise<RegisterSessionReport | null> {
  await ensureRegisterSchemaReady();
  const [context, report] = await Promise.all([
    getRegisterContext(userId),
    getRegisterSessionReport(sessionId),
  ]);
  if (!report) return null;
  if (context.storeId) {
    if (report.storeId !== context.storeId) return null;
  } else {
    if (report.registerName !== context.registerName) return null;
  }
  return report;
}

export { getSupervisorByPin };
