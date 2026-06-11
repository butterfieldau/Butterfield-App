import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// ── Per-ticket stamp cap (in-memory, keyed by client ticket UUID) ─────────────
// Deterministic guard that prevents over-tapping without requiring server-side
// ticket state in the DB. Survives normal shift durations; resets on restart.
const posTicketStampCache = new Map<string, { stampsIssued: number; expiresAt: number }>();
// Prune expired entries every 30 minutes so the Map doesn't grow unbounded
const _stampCachePruner = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of posTicketStampCache.entries()) {
    if (val.expiresAt < now) posTicketStampCache.delete(key);
  }
}, 30 * 60 * 1000);
if (typeof _stampCachePruner.unref === 'function') _stampCachePruner.unref();

import {
  db, ordersTable, customerProfilesTable, usersTable, productsTable,
  discountCodesTable, discountCodeUsagesTable, loyaltyActivityLogTable,
  claimedRewardsTable, loyaltyRewardsTable, loyaltyTransactionsTable,
  storeSettingsTable, loginHistoryTable, wholesaleOrdersTable,
} from '@workspace/db';
import { eq, and, desc, gte, sql, or, count, sum, inArray } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  applyCoffeeStamps,
  getOrCreateCustomerLoyaltyProfile,
  parseLoyaltyQrPayload,
  recordLoyaltyPoints,
  reverseCoffeeStamps,
  ensureLoyaltySchemaReady,
} from '../lib/loyaltyIdentity.js';
import { validateDiscountCode } from '../lib/discountUtils.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { recordAuditLog } from '../lib/auditLog.js';
import {
  addRegisterCashMovement,
  closeRegisterSession,
  ensureRegisterSchemaReady,
  getOrCreateCurrentRegisterSession,
  getPendingAutoPrintReport,
  getRegisterSessionReport,
  getRegisterSettings,
  markRegisterSummaryPrinted,
  recordPosRefundEvent,
  setRegisterStartingFloat,
  startRegisterAutoCloseLoop,
  updateRegisterAutoCloseSetting,
} from '../lib/registers.js';
import {
  attachLinklySessionToOrder,
  getLinklyPublicConfig,
  getLinklyToken,
  pairLinklyPinPad,
  recoverOrPollTransaction,
  runReprintReceiptAction,
  runSettlementAction,
  saveLinklyConfig,
  startPurchaseTransaction,
} from '../lib/linklyCloud.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('staff', 'manager', 'director', 'master', 'shop_display'));
startRegisterAutoCloseLoop();

function getPublicBaseUrl(req: any): string | null {
  if (process.env.LINKLY_NOTIFICATION_BASE_URL) return process.env.LINKLY_NOTIFICATION_BASE_URL.replace(/\/+$/, '');
  if (process.env.EXPO_PUBLIC_DOMAIN) return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(Boolean);
  if (domain) return `https://${domain}`;
  const host = req.headers?.['x-forwarded-host'] ?? req.headers?.host;
  if (!host) return null;
  const protocol = req.headers?.['x-forwarded-proto'] ?? 'https';
  return `${protocol}://${Array.isArray(host) ? host[0] : host}`;
}

function buildLinklyNotificationUrl(req: any, sessionId: string): string | null {
  const baseUrl = getPublicBaseUrl(req);
  return baseUrl ? `${baseUrl}/api/linkly/notifications/${encodeURIComponent(sessionId)}` : null;
}

function recordPosPinHistory(req: any, success: boolean, failReason: string | null, userId?: string | null, email?: string | null, role?: string | null) {
  const ip = (() => {
    const fwd = req.headers?.['x-forwarded-for'];
    if (Array.isArray(fwd)) return fwd[0] ?? req.ip ?? null;
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
    return req.ip ?? req.socket?.remoteAddress ?? null;
  })();
  db.insert(loginHistoryTable).values({
    id: randomUUID(),
    userId: userId ?? null,
    email: email ?? null,
    role: role ?? null,
    success,
    failReason,
    ip,
    userAgent: req.headers?.['user-agent'] ?? null,
  }).catch(() => {});
}

// ── POS threshold helpers ─────────────────────────────────────────────────────
const POS_THRESHOLDS_SETTINGS_KEY = 'pos_thresholds';
const DEFAULT_POS_THRESHOLDS = { refundRequiresPin: false, discountPinThresholdCents: 0 };

async function getPosThresholds(): Promise<{ refundRequiresPin: boolean; discountPinThresholdCents: number }> {
  try {
    const [row] = await db.select().from(storeSettingsTable)
      .where(eq(storeSettingsTable.key, POS_THRESHOLDS_SETTINGS_KEY)).limit(1);
    if (!row?.value) return DEFAULT_POS_THRESHOLDS;
    return { ...DEFAULT_POS_THRESHOLDS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_POS_THRESHOLDS;
  }
}

async function verifySupervisorPin(pin: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT sp.settings_pin_hash, sp.clock_pin
    FROM staff_profiles sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.role IN ('manager', 'director', 'master')
  `);
  const profiles = (rows as any).rows ?? (rows as any) ?? [];
  for (const row of profiles) {
    if (row.settings_pin_hash) {
      const valid = await bcrypt.compare(pin, row.settings_pin_hash);
      if (valid) return true;
    } else if (row.clock_pin) {
      const valid = await bcrypt.compare(pin, row.clock_pin);
      if (valid) return true;
    }
  }
  return false;
}

// ── Loyalty POS settings (birthday bonus multiplier, etc.) ─────────────────
const LOYALTY_POS_SETTINGS_KEY = 'loyalty_pos_settings';
const DEFAULT_BIRTHDAY_BONUS_MULTIPLIER = 2.0;

async function getLoyaltyPosSettings(): Promise<{ birthdayBonusMultiplier: number }> {
  try {
    const [row] = await db.select().from(storeSettingsTable)
      .where(eq(storeSettingsTable.key, LOYALTY_POS_SETTINGS_KEY)).limit(1);
    if (!row?.value) return { birthdayBonusMultiplier: DEFAULT_BIRTHDAY_BONUS_MULTIPLIER };
    const parsed = JSON.parse(row.value);
    const mult = Number(parsed?.birthdayBonusMultiplier);
    return {
      birthdayBonusMultiplier: Number.isFinite(mult) && mult >= 1
        ? mult
        : DEFAULT_BIRTHDAY_BONUS_MULTIPLIER,
    };
  } catch {
    return { birthdayBonusMultiplier: DEFAULT_BIRTHDAY_BONUS_MULTIPLIER };
  }
}

// ── Schema migration (idempotent) ─────────────────────────────────────────
let posSchemaReady: Promise<void> | null = null;

async function ensurePosSchemaReady() {
  if (!posSchemaReady) {
    posSchemaReady = (async () => {
      try {
        await ensureRegisterSchemaReady();
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'customer_app'`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_user_id text`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tip_cents integer NOT NULL DEFAULT 0`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0`
        ));
        await db.execute(sql.raw(
          `ALTER TABLE orders ADD COLUMN IF NOT EXISTS split_payments jsonb`
        ));
        // pos_surcharges table
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS pos_surcharges (
            id text PRIMARY KEY,
            name text NOT NULL,
            trigger_type text NOT NULL,
            trigger_value text NOT NULL,
            amount_type text NOT NULL,
            amount_value integer NOT NULL,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `));
      } catch (err) {
        posSchemaReady = null;
        throw err;
      }
    })();
  }
  return posSchemaReady;
}

async function fetchRegisterCashMovements(sessionId: string) {
  const rows = await db.execute(sql`
    SELECT
      m.id,
      m.movement_type,
      m.amount_cents,
      m.reason,
      m.created_at,
      m.created_by_user_id,
      creator.name AS created_by_name,
      m.approved_by_user_id,
      approver.name AS approved_by_name
    FROM register_cash_movements m
    LEFT JOIN users creator ON creator.id = m.created_by_user_id
    LEFT JOIN users approver ON approver.id = m.approved_by_user_id
    WHERE m.session_id = ${sessionId}
    ORDER BY m.created_at DESC
  `);
  return ((rows as any).rows ?? (rows as any) ?? []).map((row: any) => ({
    id: row.id,
    movementType: row.movement_type,
    amountCents: Number(row.amount_cents ?? 0),
    reason: row.reason ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name ?? null,
    approvedByUserId: row.approved_by_user_id ?? null,
    approvedByName: row.approved_by_name ?? null,
  }));
}

async function buildCurrentRegisterResponse(user: { id: string; role: string }) {
  const [settings, session, pendingAutoPrintReport] = await Promise.all([
    getRegisterSettings(),
    getOrCreateCurrentRegisterSession(user.id),
    getPendingAutoPrintReport(user.id),
  ]);
  const [report, cashMovements, inAppRow, wholesaleRow] = await Promise.all([
    getRegisterSessionReport(session.id),
    fetchRegisterCashMovements(session.id),
    db.execute(sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_cents), 0)::int AS revenue
      FROM orders
      WHERE source = 'customer_app'
        AND status NOT IN ('cancelled', 'refunded')
        AND created_at >= date_trunc('day', now())
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(total_cents), 0)::int AS revenue
      FROM wholesale_orders
      WHERE status != 'cancelled'
        AND created_at >= date_trunc('day', now())
    `),
  ]);
  const inApp = (inAppRow.rows[0] ?? {}) as { count: number; revenue: number };
  const ws    = (wholesaleRow.rows[0] ?? {}) as { count: number; revenue: number };
  return {
    session: report,
    cashEnabled: session.startingFloatCents !== null,
    autoCloseEnabled: settings.autoCloseEnabled,
    canEditAutoClose: ['manager', 'director', 'master'].includes(user.role),
    pendingAutoPrintReport,
    cashMovements,
    inAppOrders:      { count: Number(inApp.count ?? 0),  revenueCents: Number(inApp.revenue ?? 0) },
    wholesaleOrders:  { count: Number(ws.count ?? 0),     revenueCents: Number(ws.revenue ?? 0) },
  };
}

// ── Active Linkly sessions (POS) ──────────────────────────────────────────
const posActiveSessions = new Map<string, { deviceUserId: string; amountCents: number; createdAt: number }>();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of posActiveSessions.entries()) {
    if (s.createdAt < cutoff) posActiveSessions.delete(id);
  }
}, 5 * 60 * 1000);

// ── Helper: fetch available claimed rewards for a customer ─────────────────
async function fetchAvailableClaimedRewards(userId: string) {
  const rows = await db
    .select({
      id: claimedRewardsTable.id,
      rewardType: loyaltyRewardsTable.rewardType,
      rewardName: loyaltyRewardsTable.name,
      voucherValueCents: claimedRewardsTable.voucherValueCents,
    })
    .from(claimedRewardsTable)
    .innerJoin(loyaltyRewardsTable, eq(claimedRewardsTable.rewardId, loyaltyRewardsTable.id))
    .where(and(
      eq(claimedRewardsTable.userId, userId),
      inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
      sql`(${claimedRewardsTable.expiresAt} IS NULL OR ${claimedRewardsTable.expiresAt} > NOW())`,
    ));
  return rows;
}

// ── GET /pos/customer-search — find customers by text or QR userId ─────────
router.get('/customer-search', async (req, res) => {
  await ensurePosSchemaReady();
  const { q, userId, qrPayload } = req.query;

  // QR payload lookup: decode the BUTTERFIELD: token
  if (qrPayload) {
    const parsed = parseLoyaltyQrPayload(String(qrPayload));
    if (!parsed) return res.status(400).json({ error: 'Invalid QR payload' });

    let resolvedUserId: string | null = null;
    if (parsed.userId) {
      resolvedUserId = parsed.userId;
    } else if (parsed.token) {
      const [profileRow] = await db
        .select({ userId: customerProfilesTable.userId })
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.loyaltyQrToken, parsed.token));
      resolvedUserId = profileRow?.userId ?? null;
    }

    if (!resolvedUserId) return res.status(404).json({ error: 'Customer not found' });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, resolvedUserId));
    if (!user) return res.status(404).json({ error: 'Customer not found' });

    const [profile, availableClaimedRewards] = await Promise.all([
      getOrCreateCustomerLoyaltyProfile(resolvedUserId, user.name),
      fetchAvailableClaimedRewards(resolvedUserId),
    ]);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
        birthday: (profile as any).birthday ?? null,
        availableClaimedRewards,
      }],
    });
  }

  // Direct userId lookup
  if (userId) {
    const uid = String(userId);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    const [profile, availableClaimedRewards] = await Promise.all([
      getOrCreateCustomerLoyaltyProfile(uid, user.name),
      fetchAvailableClaimedRewards(uid),
    ]);
    return res.json({
      data: [{
        userId: user.id,
        name: user.name,
        email: user.email,
        loyaltyPoints: profile.loyaltyPoints ?? 0,
        stampCount: profile.coffeeStampCount ?? profile.stampCount ?? 0,
        loyaltyTier: profile.loyaltyTier ?? 'blue',
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
        birthday: (profile as any).birthday ?? null,
        availableClaimedRewards,
      }],
    });
  }

  // Text search by name / email / phone / referral code
  const query = String(q ?? '').trim();
  if (query.length < 2) return res.json({ data: [] });

  const like = `%${query}%`;
  const rows = await db.execute(sql`
    SELECT u.id, u.name, u.email, u.phone,
      COALESCE(cp.loyalty_points, 0) AS loyalty_points,
      COALESCE(cp.coffee_stamp_count, cp.stamp_count, 0) AS stamp_count,
      COALESCE(cp.loyalty_tier, 'blue') AS loyalty_tier,
      COALESCE(cp.free_coffee_rewards, cp.free_coffees_earned, 0) AS free_coffee_rewards,
      cp.birthday
    FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id = u.id
    WHERE u.role = 'customer'
      AND (
        u.name ILIKE ${like}
        OR u.email ILIKE ${like}
        OR u.phone ILIKE ${like}
        OR cp.referral_code ILIKE ${like}
      )
    ORDER BY u.name
    LIMIT 10
  `);

  const users = (rows.rows ?? rows as unknown as any[]) as Array<{
    id: string; name: string; email: string; phone: string | null;
    loyalty_points: number; stamp_count: number; loyalty_tier: string;
    free_coffee_rewards: number; birthday: string | null;
  }>;

  // Fetch claimed rewards for each result in parallel
  const claimedRewardsMap = await Promise.all(
    users.map(u => fetchAvailableClaimedRewards(u.id).then(cr => [u.id, cr] as const))
  ).then(entries => Object.fromEntries(entries));

  return res.json({
    data: users.map(u => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      loyaltyPoints: Number(u.loyalty_points),
      stampCount: Number(u.stamp_count),
      loyaltyTier: u.loyalty_tier,
      freeCoffeeRewards: Number(u.free_coffee_rewards),
      birthday: u.birthday ?? null,
      availableClaimedRewards: claimedRewardsMap[u.id] ?? [],
    })),
  });
});

// ── Register session endpoints ───────────────────────────────────────────────
router.get('/register/current', async (req, res) => {
  await ensurePosSchemaReady();
  const data = await buildCurrentRegisterResponse(req.user!);
  return res.json({ data });
});

router.post('/register/float', async (req, res) => {
  await ensurePosSchemaReady();
  const amountCents = Math.max(0, Math.round(Number(req.body?.amountCents ?? 0)));
  const session = await setRegisterStartingFloat({ userId: req.user!.id, amountCents });
  const report = await getRegisterSessionReport(session.id);
  return res.json({ data: report });
});

router.post('/register/cash-movements', async (req, res) => {
  await ensurePosSchemaReady();
  const movementType = req.body?.movementType === 'remove' ? 'remove' : 'add';
  const amountCents = Math.round(Number(req.body?.amountCents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'amountCents must be a positive number' });
  }
  const session = await getOrCreateCurrentRegisterSession(req.user!.id);
  try {
    await addRegisterCashMovement({
      sessionId: session.id,
      actorUserId: req.user!.id,
      actorRole: req.user!.role as any,
      movementType,
      amountCents,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
      supervisorPin: typeof req.body?.supervisorPin === 'string' ? req.body.supervisorPin : null,
    });
    const [report, cashMovements] = await Promise.all([
      getRegisterSessionReport(session.id),
      fetchRegisterCashMovements(session.id),
    ]);
    return res.json({ data: { session: report, cashMovements } });
  } catch (error: any) {
    if (error?.message === 'REGISTER_SESSION_CLOSED') {
      return res.status(409).json({ error: 'This register session is already closed.' });
    }
    if (error?.message === 'SUPERVISOR_PIN_REQUIRED') {
      return res.status(403).json({ error: 'Manager approval is required for this cash removal.', code: 'SUPERVISOR_PIN_REQUIRED' });
    }
    if (error?.message === 'SUPERVISOR_PIN_INVALID') {
      return res.status(403).json({ error: 'Incorrect manager PIN.', code: 'SUPERVISOR_PIN_INVALID' });
    }
    throw error;
  }
});

router.post('/register/close', async (req, res) => {
  await ensurePosSchemaReady();
  const session = await getOrCreateCurrentRegisterSession(req.user!.id);
  const actualCountedCashCents = Number(req.body?.actualCountedCashCents ?? NaN);
  if (!Number.isFinite(actualCountedCashCents) || actualCountedCashCents < 0) {
    return res.status(400).json({ error: 'actualCountedCashCents must be 0 or greater' });
  }
  try {
    await closeRegisterSession({
      sessionId: session.id,
      actorUserId: req.user!.id,
      actorRole: req.user!.role as any,
      actualCountedCashCents,
      closeNote: typeof req.body?.closeNote === 'string' ? req.body.closeNote : null,
      varianceNote: typeof req.body?.varianceNote === 'string' ? req.body.varianceNote : null,
      supervisorPin: typeof req.body?.supervisorPin === 'string' ? req.body.supervisorPin : null,
    });
    const report = await getRegisterSessionReport(session.id);
    return res.json({ data: report });
  } catch (error: any) {
    if (error?.message === 'REGISTER_SESSION_CLOSED') {
      return res.status(409).json({ error: 'This register session is already closed.' });
    }
    if (error?.message === 'VARIANCE_NOTE_REQUIRED') {
      return res.status(400).json({ error: 'Please add a reason for the cash variance.', code: 'VARIANCE_NOTE_REQUIRED' });
    }
    if (error?.message === 'SUPERVISOR_PIN_REQUIRED') {
      return res.status(403).json({ error: 'Manager approval is required for this cash variance.', code: 'SUPERVISOR_PIN_REQUIRED' });
    }
    if (error?.message === 'SUPERVISOR_PIN_INVALID') {
      return res.status(403).json({ error: 'Incorrect manager PIN.', code: 'SUPERVISOR_PIN_INVALID' });
    }
    throw error;
  }
});

router.patch('/register/settings', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['manager', 'director', 'master'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only managers or directors can change register settings.' });
  }
  const enabled = req.body?.autoCloseEnabled !== false;
  const data = await updateRegisterAutoCloseSetting(req.user!.id, enabled);
  return res.json({ data });
});

router.patch('/register/summary/:sessionId/printed', async (req, res) => {
  await ensurePosSchemaReady();
  await markRegisterSummaryPrinted(req.params.sessionId);
  return res.json({ success: true });
});

// ── POST /pos/customers/:id/stamp — manually award one coffee stamp ──────────
router.post('/customers/:id/stamp', async (req, res) => {
  await ensurePosSchemaReady();
  await ensureLoyaltySchemaReady();

  const customerId = req.params.id;
  const { items: ticketItems, coffeeItemCount, ticketId } = req.body;

  // Server-side validation: require ticket items with at least one coffee item
  if (!Array.isArray(ticketItems) || ticketItems.length === 0) {
    return res.status(400).json({ error: 'Ticket items are required to award a stamp' });
  }
  const coffeeItems = (ticketItems as any[]).filter(
    i => String(i.category ?? '').toLowerCase() === 'coffee',
  );
  if (coffeeItems.length === 0) {
    return res.status(400).json({ error: 'Stamp can only be awarded when a coffee item is in the ticket' });
  }

  // Cross-validate coffee item productIds against the internal product catalog
  // to prevent fabricated client payloads from minting stamps with unknown products
  const coffeeProductIds = coffeeItems
    .map((i: any) => i.productId)
    .filter((id: any) => typeof id === 'string' && id.trim());
  if (coffeeProductIds.length > 0) {
    try {
      const verified = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(
          and(
            inArray(productsTable.id, coffeeProductIds),
            sql`${productsTable.category} ILIKE 'coffee'`,
          ),
        )
        .limit(1);
      if (verified.length === 0) {
        return res.status(400).json({ error: 'No verified coffee product found in catalog' });
      }
    } catch (catalogErr: any) {
      req.log.warn({ catalogErr }, 'Product catalog check failed — proceeding with category-only validation');
    }
  }

  // Per-ticket stamp cap: use client-supplied ticketId as a deterministic cache key.
  // This prevents over-tapping (e.g. 3 taps for 1 coffee) without a time-window
  // heuristic that would incorrectly block consecutive valid tickets.
  const maxStampsThisTicket = Number.isFinite(Number(coffeeItemCount)) && Number(coffeeItemCount) > 0
    ? Math.floor(Number(coffeeItemCount))
    : coffeeItems.length;

  const ticketKey = typeof ticketId === 'string' && ticketId.length > 0 ? ticketId : null;
  if (ticketKey) {
    const entry = posTicketStampCache.get(ticketKey);
    const stampsIssued = entry?.stampsIssued ?? 0;
    if (stampsIssued >= maxStampsThisTicket) {
      return res.status(400).json({
        error: `Maximum ${maxStampsThisTicket} stamp(s) already awarded for this order`,
      });
    }
  }

  req.log.info({ customerId, coffeeItemCount: maxStampsThisTicket, ticketId: ticketKey }, 'POS manual stamp award');

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, customerId), sql`${usersTable.role} = 'customer'`));
  if (!user) return res.status(404).json({ error: 'Customer not found' });

  try {
    const stampRes = await applyCoffeeStamps({
      userId: customerId,
      stampsToAdd: 1,
      source: 'pos_manual' as any,
      staffId: req.user!.id,
      description: 'Coffee stamp awarded manually at POS',
    });

    // Increment the in-memory per-ticket cap so subsequent calls for the same
    // ticket are correctly blocked once all coffee items have stamps
    if (ticketKey) {
      const prev = posTicketStampCache.get(ticketKey) ?? { stampsIssued: 0, expiresAt: Date.now() + 4 * 60 * 60 * 1000 };
      posTicketStampCache.set(ticketKey, { stampsIssued: prev.stampsIssued + 1, expiresAt: prev.expiresAt });
    }

    const profile = await getOrCreateCustomerLoyaltyProfile(customerId);
    return res.json({
      data: {
        stampCount: stampRes.stampCount,
        rewardUnlocked: stampRes.earnedFree,
        freeCoffeeRewards: Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0),
      },
    });
  } catch (err: any) {
    req.log.error({ err, customerId }, 'POS stamp award failed');
    return res.status(500).json({ error: 'Failed to award stamp' });
  }
});

// ── GET /pos/surcharges — list all active surcharges ──────────────────────
router.get('/surcharges', async (req, res) => {
  await ensurePosSchemaReady();
  try {
    const result = await db.execute(sql`
      SELECT id, name, trigger_type, trigger_value, amount_type, amount_value, is_active, created_at
      FROM pos_surcharges
      ORDER BY created_at ASC
    `);
    const rows = ((result as any).rows ?? (result as any) ?? []) as any[];
    return res.json({ data: rows.map(r => ({
      id: r.id, name: r.name,
      triggerType: r.trigger_type, triggerValue: r.trigger_value,
      amountType: r.amount_type, amountValue: Number(r.amount_value),
      isActive: r.is_active, createdAt: r.created_at,
    })) });
  } catch (err: any) {
    req.log.error({ err }, 'GET /pos/surcharges failed');
    return res.status(500).json({ error: 'Failed to fetch surcharges' });
  }
});

// ── POST /pos/surcharges — create a surcharge (director/manager only) ──────
router.post('/surcharges', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { name, triggerType, triggerValue, amountType, amountValue } = req.body;
  if (!name || !triggerType || !triggerValue || !amountType || amountValue == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['payment_method', 'day_of_week'].includes(triggerType)) {
    return res.status(400).json({ error: 'triggerType must be payment_method or day_of_week' });
  }
  if (!['pct_basis_points', 'fixed_cents'].includes(amountType)) {
    return res.status(400).json({ error: 'amountType must be pct_basis_points or fixed_cents' });
  }
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO pos_surcharges (id, name, trigger_type, trigger_value, amount_type, amount_value)
    VALUES (${id}, ${name}, ${triggerType}, ${triggerValue}, ${amountType}, ${Number(amountValue)})
  `);
  return res.status(201).json({ data: { id, name, triggerType, triggerValue, amountType, amountValue: Number(amountValue), isActive: true } });
});

// ── PATCH /pos/surcharges/:id — update a surcharge ─────────────────────────
router.patch('/surcharges/:id', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { id } = req.params;
  const { name, isActive, amountValue } = req.body;
  await db.execute(sql`
    UPDATE pos_surcharges SET
      name = COALESCE(${name ?? null}, name),
      is_active = COALESCE(${isActive ?? null}, is_active),
      amount_value = COALESCE(${amountValue != null ? Number(amountValue) : null}, amount_value),
      updated_at = now()
    WHERE id = ${id}
  `);
  return res.json({ success: true });
});

// ── DELETE /pos/surcharges/:id — delete a surcharge ────────────────────────
router.delete('/surcharges/:id', async (req, res) => {
  await ensurePosSchemaReady();
  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required' });
  }
  const { id } = req.params;
  await db.execute(sql`DELETE FROM pos_surcharges WHERE id = ${id}`);
  return res.json({ success: true });
});

// ── POST /pos/orders — create a POS order ────────────────────────────────────
router.post('/orders', async (req, res) => {
  await ensurePosSchemaReady();
  await ensureLoyaltySchemaReady();

  const {
    items: rawItems,
    orderType,
    paymentMethod,
    amountTenderedCents,
    surchargeCents: rawSurchargeCents,
    splitPayments: rawSplitPayments,
    linklySessionId,
    customerId,
    discountCode,
    discountCodeId,
    manualDiscountPct,
    redeemFreeCoffee,
    claimedRewardId,
    birthdayBonus,
    notes,
    idempotencyKey,
  } = req.body;

  // ── Idempotency check — return existing order if key already processed ────
  if (idempotencyKey && typeof idempotencyKey === 'string') {
    try {
      const existingResult = await db.execute(sql`
        SELECT id, order_number, total_cents, payment_method, status
        FROM orders
        WHERE client_idempotency_key = ${idempotencyKey}
        LIMIT 1
      `);
      const [existing] = (((existingResult as any).rows ?? (existingResult as any) ?? []) as any[]);
      if (existing) {
        const row = existing as any;
        req.log.info({ idempotencyKey, orderId: row.id }, 'POS idempotent order returned');
        return res.status(200).json({
          data: {
            id: row.id,
            orderNumber: row.order_number,
            totalCents: row.total_cents,
            paymentMethod: row.payment_method,
            status: row.status,
          },
          loyaltyResult: null,
          idempotent: true,
        });
      }
    } catch (err: any) {
      req.log.warn({ err, idempotencyKey }, 'POS idempotency check failed — continuing');
    }
  }

  // Tier multiplier map — applied to points earned (not tip or surcharge)
  function getTierMultiplier(tier: string): number {
    switch ((tier ?? '').toLowerCase()) {
      case 'black':
      case 'platinum': return 2.0;
      case 'gold':     return 1.5;
      case 'silver':   return 1.25;
      default:         return 1.0; // blue / bronze / unknown
    }
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: 'Order must have at least one item' });
  }
  if (!['cash', 'eftpos', 'split'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod must be cash, eftpos or split' });
  }

  const registerSession = await getOrCreateCurrentRegisterSession(req.user!.id);
  const splitPayments = Array.isArray(rawSplitPayments) ? rawSplitPayments : null;
  const usesCash = paymentMethod === 'cash'
    || (paymentMethod === 'split' && !!splitPayments?.some((payment: any) => payment?.method === 'cash' && Number(payment?.amountCents ?? 0) > 0));
  if (usesCash && registerSession.startingFloatCents === null) {
    return res.status(403).json({
      error: 'Enter the opening cash float before processing cash payments.',
      code: 'REGISTER_FLOAT_REQUIRED',
    });
  }

  const linklySessionIds = [
    typeof linklySessionId === 'string' && linklySessionId ? linklySessionId : null,
    ...(splitPayments ?? [])
      .map((payment: any) => (typeof payment?.linklySessionId === 'string' && payment.linklySessionId ? payment.linklySessionId : null))
      .filter(Boolean),
  ].filter((value, index, arr): value is string => !!value && arr.indexOf(value) === index);

  // ── Resolve product prices server-side ─────────────────────────────────────
  const productIds: string[] = [...new Set(
    rawItems.map((i: any) => i.productId).filter((id: any) => typeof id === 'string' && id)
  )];
  const products = productIds.length > 0
    ? await db.select({
        id: productsTable.id,
        name: productsTable.name,
        priceCents: productsTable.priceCents,
        salePriceCents: productsTable.salePriceCents,
        category: productsTable.category,
        isActive: productsTable.isActive,
      }).from(productsTable).where(sql`${productsTable.id} = ANY(ARRAY[${sql.join(productIds.map(id => sql`${id}`), sql`, `)}])`)
    : [];
  const productMap = new Map(products.map(p => [p.id, p]));

  const items = rawItems.map((item: any) => {
    const product = productMap.get(item.productId);
    // Trust the variant price the client sends (it came from the server's own product data)
    // but cap option adjustments and recompute line total to prevent tampering
    const basePriceCents = Number(item.variantPriceCents ?? product?.salePriceCents ?? product?.priceCents ?? 0);
    const optionDelta = Array.isArray(item.selectedOptions)
      ? item.selectedOptions.reduce((s: number, o: any) => s + (Number(o.priceAdjustmentCents) || 0), 0)
      : 0;
    const unitPriceCents = Math.max(0, basePriceCents + optionDelta);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    return {
      productId: item.productId ?? '',
      productName: product?.name ?? item.productName ?? 'Item',
      variantId: item.variantId ?? null,
      variantName: item.variantName ?? null,
      selectedOptions: item.selectedOptions ?? [],
      category: product?.category ?? item.category ?? '',
      quantity,
      unitPriceCents,
      totalPriceCents: unitPriceCents * quantity,
      notes: item.notes ?? '',
    };
  });

  const subtotalCents = items.reduce((s: number, i: any) => s + i.totalPriceCents, 0);

  // ── Resolve discount amount server-side ────────────────────────────────────
  let discountAmountCents = 0;
  let resolvedDiscountCode: string | null = discountCode ?? null;
  let resolvedDiscountCodeId: string | null = null;
  let discountDescription: string | null = null;

  // 1. Discount code — re-validate server-side using the purchasing customer's identity
  //    when one is attached, so per-customer/first-order constraints apply correctly.
  //    Fall back to staff identity only when no customer is attached (walk-in, no account).
  if (discountCode && typeof discountCode === 'string' && discountCode.trim()) {
    const discountUserId = customerId ?? req.user!.id;
    const discountUserRole = customerId ? 'customer' : req.user!.role;
    try {
      const validated = await validateDiscountCode(
        discountCode,
        discountUserId,
        discountUserRole,
        subtotalCents,
        'pickup',
      );
      discountAmountCents = validated.discountAmountCents;
      resolvedDiscountCodeId = validated.id;
      resolvedDiscountCode = validated.code;
      discountDescription = validated.description;
    } catch (err: any) {
      return res.status(400).json({ error: err.message ?? 'Invalid discount code' });
    }
  }

  // 2. Manual staff % discount (10/20/50 quick chips) — no code required
  if (!discountCode && manualDiscountPct && [10, 20, 50].includes(Number(manualDiscountPct))) {
    const pct = Number(manualDiscountPct);
    discountAmountCents = Math.round(subtotalCents * pct / 100);
    resolvedDiscountCode = null;
    discountDescription = `${pct}% staff discount`;
  }

  // ── Server-side discount PIN gate ─────────────────────────────────────────
  if (discountAmountCents > 0 && manualDiscountPct) {
    const thresholds = await getPosThresholds();
    if (thresholds.discountPinThresholdCents > 0 && discountAmountCents >= thresholds.discountPinThresholdCents) {
      const supervisorPin = req.body.supervisorPin;
      if (!supervisorPin || !/^\d{4}$/.test(String(supervisorPin))) {
        return res.status(403).json({
          error: `A manager PIN is required for discounts over $${(thresholds.discountPinThresholdCents / 100).toFixed(2)}. Ask a manager or director to authorise.`,
          code: 'DISCOUNT_PIN_REQUIRED',
          thresholdCents: thresholds.discountPinThresholdCents,
        });
      }
      const pinValid = await verifySupervisorPin(String(supervisorPin));
      if (!pinValid) {
        recordAuditLog({ actor: req.user, action: 'pos.discount_pin_fail', entityType: 'pos_order', entityId: '', metadata: { discountAmountCents, discountPct: Number(manualDiscountPct) } }).catch(() => {});
        recordPosPinHistory(req, false, 'DISCOUNT_PIN_INVALID', req.user?.id, req.user?.email, req.user?.role);
        return res.status(403).json({ error: 'Incorrect manager PIN. Discount denied.', code: 'DISCOUNT_PIN_INVALID' });
      }
      recordPosPinHistory(req, true, null, req.user?.id, req.user?.email, req.user?.role);
    }
  }

  // 3. Free coffee redemption — cheapest coffee item is free
  let freeCoffeeRedeemed = false;
  if (redeemFreeCoffee && customerId) {
    const profile = await getOrCreateCustomerLoyaltyProfile(customerId);
    const availableRewards = Number(profile.freeCoffeeRewards ?? profile.freeCoffeesEarned ?? 0);
    if (availableRewards <= 0) {
      return res.status(400).json({ error: 'Customer has no free coffee rewards available' });
    }
    // Cheapest coffee item in the order
    const coffeeItems = items.filter((i: any) => String(i.category ?? '').toLowerCase() === 'coffee');
    if (coffeeItems.length > 0) {
      const cheapestCoffee = Math.min(...coffeeItems.map((i: any) => i.unitPriceCents));
      discountAmountCents += cheapestCoffee;
      freeCoffeeRedeemed = true;
    }
  }

  // ── Validate catalog claimed reward (if provided) ──────────────────────────
  let claimedRewardData: { id: string } | null = null;
  if (claimedRewardId && customerId) {
    const [cr] = await db
      .select({
        id: claimedRewardsTable.id,
        userId: claimedRewardsTable.userId,
        status: claimedRewardsTable.status,
        expiresAt: claimedRewardsTable.expiresAt,
        claimVoucherCents: claimedRewardsTable.voucherValueCents,
        rewardVoucherCents: loyaltyRewardsTable.voucherValueCents,
        rewardType: loyaltyRewardsTable.rewardType,
      })
      .from(claimedRewardsTable)
      .innerJoin(loyaltyRewardsTable, eq(claimedRewardsTable.rewardId, loyaltyRewardsTable.id))
      .where(eq(claimedRewardsTable.id, claimedRewardId));
    if (!cr) return res.status(400).json({ error: 'Claimed reward not found.' });
    if (cr.userId !== customerId) return res.status(403).json({ error: 'This reward belongs to a different customer.' });
    if (!['available', 'applied_to_cart'].includes(cr.status)) {
      return res.status(400).json({ error: 'This reward has already been used or has expired.' });
    }
    if (cr.expiresAt && cr.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reward has expired.' });
    }
    // Apply monetary value: voucher deducts face value (capped to subtotal); other rewards = full subtotal free
    const voucherCents = cr.claimVoucherCents ?? cr.rewardVoucherCents ?? null;
    const rewardDiscountCents = voucherCents != null
      ? Math.min(voucherCents, subtotalCents)
      : subtotalCents;
    discountAmountCents += rewardDiscountCents;
    claimedRewardData = { id: cr.id };
  }

  discountAmountCents = Math.min(discountAmountCents, subtotalCents);
  const baseTotalCents = Math.max(0, subtotalCents - discountAmountCents);

  // Tip feature removed — always 0 (column retained for historical order data)
  const tipCents = 0;
  const surchargeCents = Math.max(0, Math.floor(Number(rawSurchargeCents) || 0));
  const totalCents = baseTotalCents + surchargeCents;

  const orderId = randomUUID();
  const orderNumber = await generateOrderNumber();

  // ── Points earned: server-side tier + birthday verification ─────────────
  let tierMultiplierVal = 1.0;
  let earlyLoyaltyTier = 'blue';
  let birthdayBonusVerified = false;
  if (customerId) {
    try {
      const earlyProfile = await getOrCreateCustomerLoyaltyProfile(customerId);
      earlyLoyaltyTier = earlyProfile.loyaltyTier ?? 'blue';
      tierMultiplierVal = getTierMultiplier(earlyLoyaltyTier);
      // Server-side birthday check — ignore any client-supplied flag
      const profileBirthday = (earlyProfile as any).birthday as string | null | undefined;
      if (profileBirthday) {
        const bMonth = parseInt((profileBirthday.split('-')[1] ?? '0'), 10) - 1;
        birthdayBonusVerified = bMonth === new Date().getMonth();
      }
    } catch { /* fall back to 1× */ }
  }
  const basePoints = Math.floor(baseTotalCents / 100 * tierMultiplierVal);
  let birthdayBonusPoints = 0;
  let birthdayBonusMultiplier = DEFAULT_BIRTHDAY_BONUS_MULTIPLIER;
  if (birthdayBonusVerified) {
    const posSettings = await getLoyaltyPosSettings();
    birthdayBonusMultiplier = posSettings.birthdayBonusMultiplier;
    birthdayBonusPoints = Math.floor(basePoints * (birthdayBonusMultiplier - 1));
  }
  const pointsEarned = basePoints + birthdayBonusPoints;

  // Store a human-readable discount label as discount_code
  // For manual % discounts and free coffee we use a descriptive label
  const storedDiscountCode = resolvedDiscountCode ?? (discountDescription ?? null);

  // ── Atomic transaction: INSERT order + transition any claimed reward ─────────
  try {
    await db.transaction(async (tx) => {
      // Use raw SQL so we can write the POS-specific columns (source, staff_user_id, payment_method, tip_cents, surcharge_cents, split_payments)
      await tx.execute(sql`
        INSERT INTO orders (
          id, order_number, user_id, status, type, notes, total_cents,
          items, loyalty_points_earned, loyalty_points_used, discount_cents, discount_code,
          stripe_payment_status, source, staff_user_id, payment_method,
          tip_cents, surcharge_cents, split_payments, register_session_id,
          client_idempotency_key,
          created_at, updated_at
        ) VALUES (
          ${orderId},
          ${orderNumber},
          ${customerId ?? req.user!.id},
          'received',
          'pickup',
          ${notes ?? null},
          ${totalCents},
          ${JSON.stringify(items)}::jsonb,
          ${pointsEarned},
          0,
          ${discountAmountCents},
          ${storedDiscountCode},
          'paid',
          'pos',
          ${req.user!.id},
          ${paymentMethod},
          ${tipCents},
          ${surchargeCents},
          ${splitPayments ? JSON.stringify(splitPayments) : null}::jsonb,
          ${registerSession.id},
          ${idempotencyKey && typeof idempotencyKey === 'string' ? idempotencyKey : null},
          now(),
          now()
        )
      `);

      // Catalog claimed reward — transition to redeemed atomically with order insert
      if (claimedRewardData) {
        const redeemResult = await tx
          .update(claimedRewardsTable)
          .set({ status: 'redeemed', redeemedAt: new Date(), orderId })
          .where(and(
            eq(claimedRewardsTable.id, claimedRewardData.id),
            inArray(claimedRewardsTable.status, ['available', 'applied_to_cart']),
          ))
          .returning({ id: claimedRewardsTable.id });
        if (redeemResult.length === 0) {
          throw new Error('REWARD_ALREADY_CONSUMED');
        }
      }

      // Stamp-based free coffee — decrement counter atomically with order insert
      if (freeCoffeeRedeemed && customerId) {
        const freeCoffeeResult = await tx.execute(sql`
          UPDATE customer_profiles
          SET free_coffee_rewards = GREATEST(0, free_coffee_rewards - 1),
              free_coffees_earned  = GREATEST(0, free_coffees_earned  - 1),
              updated_at = now()
          WHERE user_id = ${customerId}
            AND free_coffee_rewards > 0
        `);
        if ((freeCoffeeResult.rowCount ?? 0) === 0) {
          throw new Error('FREE_COFFEE_ALREADY_USED');
        }
      }
    });
  } catch (err: any) {
    if (err?.message === 'REWARD_ALREADY_CONSUMED') {
      return res.status(409).json({ error: 'This reward has already been used. Please remove it and try again.' });
    }
    if (err?.message === 'FREE_COFFEE_ALREADY_USED') {
      return res.status(409).json({ error: 'Free coffee reward has already been redeemed. Please remove it and try again.' });
    }
    throw err;
  }

  if (linklySessionIds.length > 0) {
    await Promise.all(
      linklySessionIds.map(sessionId => attachLinklySessionToOrder(sessionId, orderId).catch((err: any) => {
        req.log.warn({ err, orderId, sessionId }, 'Failed to attach Linkly session to POS order');
      })),
    );
  }

  // ── Record discount code usage (if a validated code was applied) ────────────
  if (resolvedDiscountCodeId) {
    try {
      await db.update(discountCodesTable)
        .set({ usageCount: sql`${discountCodesTable.usageCount} + 1`, updatedAt: new Date() })
        .where(eq(discountCodesTable.id, resolvedDiscountCodeId));
      await db.insert(discountCodeUsagesTable).values({
        id: randomUUID(),
        discountCodeId: resolvedDiscountCodeId,
        userId: customerId ?? req.user!.id,
        orderId,
        discountAmountCents,
      });
    } catch (err: any) {
      req.log.warn({ err, orderId }, 'POS discount usage tracking failed');
    }
  }

  // ── Log stamp-based free coffee activity ────────────────────────────────────
  if (freeCoffeeRedeemed && customerId) {
    try {
      await db.insert(loyaltyActivityLogTable).values({
        id: randomUUID(),
        customerId,
        staffId: req.user!.id,
        orderId,
        activityType: 'reward_redeem',
        pointsDelta: 0,
        coffeeStampsDelta: 0,
        freeCoffeeRewardsDelta: -1,
        description: `Free coffee redeemed at POS — order #${orderNumber ?? orderId.slice(0, 8)}`,
      });
    } catch (err: any) {
      req.log.error({ err, orderId }, 'POS free coffee log failed');
    }
  }

  // ── Award loyalty to attached customer ──────────────────────────────────────
  let loyaltyResult: {
    pointsEarned: number;
    newBalance: number;
    stampsAdded: number;
    newStampCount: number;
    rewardUnlocked: boolean;
  } | null = null;

  if (customerId) {
    try {
      const profile = await getOrCreateCustomerLoyaltyProfile(customerId);

      // Base points (includes tier multiplier)
      const tierNote = tierMultiplierVal !== 1.0 ? ` (${earlyLoyaltyTier} tier ${tierMultiplierVal}×)` : '';
      await recordLoyaltyPoints({
        userId: customerId,
        pointsDelta: basePoints,
        orderId,
        description: `POS order #${orderNumber ?? orderId.slice(0, 8)}${tierNote}`,
      });

      // Birthday bonus — explicit type:'birthday_bonus' transaction (separate from earn)
      if (birthdayBonusVerified && birthdayBonusPoints > 0) {
        await db.update(customerProfilesTable)
          .set({
            loyaltyPoints: sql`${customerProfilesTable.loyaltyPoints} + ${birthdayBonusPoints}`,
            updatedAt: new Date(),
          })
          .where(eq(customerProfilesTable.userId, customerId));
        await db.insert(loyaltyTransactionsTable).values({
          id: randomUUID(),
          userId: customerId,
          points: birthdayBonusPoints,
          type: 'birthday_bonus',
          description: `🎂 Birthday bonus for order #${orderNumber ?? orderId.slice(0, 8)} (${birthdayBonusMultiplier}×)`,
          referenceId: orderId,
        });
      }

      const newBalance = (profile.loyaltyPoints ?? 0) + pointsEarned;

      // POS stamps are awarded exclusively through the interactive stamp card UI
      // (POST /pos/customers/:id/stamp). Auto-stamping here is intentionally disabled
      // to prevent double-awarding when staff have already tapped the stamp circles.
      const stampsAdded = 0;
      const rewardUnlocked = false;
      const newStampCount = Number(profile.coffeeStampCount ?? profile.stampCount ?? 0);

      loyaltyResult = { pointsEarned, newBalance, stampsAdded, newStampCount, rewardUnlocked };
    } catch (err: any) {
      req.log.error({ err, orderId }, 'POS loyalty update failed');
    }
  }

  // Audit log for manual staff discount
  if (discountAmountCents > 0 && manualDiscountPct) {
    recordAuditLog({
      actor: req.user,
      action: 'pos.discount',
      entityType: 'pos_order',
      entityId: orderId,
      metadata: { discountAmountCents, discountPct: Number(manualDiscountPct), orderTotalCents: totalCents },
    }).catch(() => {});
  }

  return res.status(201).json({
    data: { id: orderId, orderNumber, totalCents, paymentMethod, status: 'received' },
    loyaltyResult,
  });
});

// ── GET /pos/orders — today's POS orders (for history view) ──────────────────
router.get('/orders', async (req, res) => {
  await ensurePosSchemaReady();

  const now = new Date();
  const sydNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(
    sydNow.getFullYear(), sydNow.getMonth(), sydNow.getDate()
  );

  try {
    const result = await db.execute(sql`
      SELECT
        o.id,
        o.order_number,
        o.created_at,
        o.total_cents,
        o.status,
        o.payment_method,
        o.items,
        o.notes,
        COALESCE(o.tip_cents, 0) AS tip_cents,
        COALESCE(o.surcharge_cents, 0) AS surcharge_cents,
        o.split_payments,
        o.discount_cents,
        u.name AS customer_name,
        su.name AS staff_name
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id AND o.user_id != o.staff_user_id
      LEFT JOIN users su ON su.id = o.staff_user_id
      WHERE o.source = 'pos'
        AND o.created_at >= ${startOfToday}
      ORDER BY o.created_at DESC
      LIMIT 200
    `);

    const rows = (result.rows ?? result as unknown as any[]) as Array<{
      id: string;
      order_number: string;
      created_at: string;
      total_cents: string | number;
      status: string;
      payment_method: string | null;
      items: any;
      notes: string | null;
      tip_cents: string | number;
      surcharge_cents: string | number;
      split_payments: any;
      discount_cents: string | number;
      customer_name: string | null;
      staff_name: string | null;
    }>;

    return res.json({
      data: rows.map(r => ({
        id: r.id,
        orderNumber: r.order_number,
        createdAt: r.created_at,
        totalCents: Number(r.total_cents),
        status: r.status,
        paymentMethod: r.payment_method ?? 'eftpos',
        items: Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? JSON.parse(r.items) : []),
        notes: r.notes,
        tipCents: Number(r.tip_cents ?? 0),
        surchargeCents: Number(r.surcharge_cents ?? 0),
        splitPayments: r.split_payments ?? null,
        discountCents: Number(r.discount_cents ?? 0),
        customerName: r.customer_name,
        staffName: r.staff_name,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, 'GET /pos/orders failed');
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── GET /pos/summary — today's POS sales for this shift/store ─────────────
router.get('/summary', async (req, res) => {
  await ensurePosSchemaReady();

  const now = new Date();
  const sydNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const startOfToday = new Date(
    sydNow.getFullYear(), sydNow.getMonth(), sydNow.getDate()
  );

  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(total_cents), 0) AS revenue_cents
      FROM orders
      WHERE source = 'pos'
        AND created_at >= ${startOfToday}
        AND status NOT IN ('cancelled', 'refunded')
    `);

    const row = (result.rows ?? result as unknown as any[])[0];
    return res.json({
      data: {
        orderCount: Number(row?.order_count ?? 0),
        revenueCents: Number(row?.revenue_cents ?? 0),
      },
    });
  } catch {
    return res.json({ data: { orderCount: 0, revenueCents: 0 } });
  }
});

// ── POST /pos/orders/:id/refund — PIN-gated refund (full or partial) ─────────
router.post('/orders/:id/refund', async (req, res) => {
  await ensurePosSchemaReady();
  const { id } = req.params;
  const { amountCents, reason, supervisorPin } = req.body;

  if (!['director', 'master', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Director or manager access required to issue refunds' });
  }
  if (!amountCents || Number(amountCents) <= 0) {
    return res.status(400).json({ error: 'amountCents must be a positive number' });
  }

  // ── Server-side refund PIN gate ───────────────────────────────────────────
  const posThresholds = await getPosThresholds();
  if (posThresholds.refundRequiresPin) {
    if (!supervisorPin || !/^\d{4}$/.test(String(supervisorPin))) {
      return res.status(403).json({ error: 'A manager PIN is required to process refunds.', code: 'REFUND_PIN_REQUIRED' });
    }
    const pinValid = await verifySupervisorPin(String(supervisorPin));
    if (!pinValid) {
      recordAuditLog({ actor: req.user, action: 'pos.refund_pin_fail', entityType: 'pos_order', entityId: id }).catch(() => {});
      recordPosPinHistory(req, false, 'REFUND_PIN_INVALID', req.user?.id, req.user?.email, req.user?.role);
      return res.status(403).json({ error: 'Incorrect manager PIN. Refund denied.', code: 'REFUND_PIN_INVALID' });
    }
    recordPosPinHistory(req, true, null, req.user?.id, req.user?.email, req.user?.role);
  }

  const result = await db.execute(sql`
    SELECT id, total_cents, status, source, user_id, loyalty_points_earned, items, payment_method, split_payments
    FROM orders WHERE id = ${id} LIMIT 1
  `);
  const order = ((((result as any).rows ?? (result as any) ?? []) as any[])[0] ?? null) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.source !== 'pos') return res.status(400).json({ error: 'Only POS orders can be refunded via this endpoint' });
  if (order.status === 'cancelled' || order.status === 'refunded') {
    return res.status(400).json({ error: 'Order is already cancelled or refunded' });
  }

  const refundAmountCents = Math.min(Number(amountCents), Number(order.total_cents));
  const isFullRefund = refundAmountCents >= Number(order.total_cents);

  await db.execute(sql`
    UPDATE orders SET
      status = ${isFullRefund ? 'cancelled' : 'received'},
      cancel_reason = ${isFullRefund ? ('refund: ' + (reason ?? 'POS refund')) : null},
      updated_at = now()
    WHERE id = ${id}
  `);

  // Reverse loyalty points if full refund and customer attached
  if (isFullRefund && order.user_id && Number(order.loyalty_points_earned ?? 0) > 0) {
    try {
      await db.execute(sql`
        UPDATE customer_profiles
        SET loyalty_points = GREATEST(0, loyalty_points - ${Number(order.loyalty_points_earned)}),
            updated_at = now()
        WHERE user_id = ${order.user_id}
      `);
      // Reverse coffee stamps if any coffee items
      const items = Array.isArray(order.items) ? order.items : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
      const hasCoffee = items.some((i: any) => String(i.category ?? '').toLowerCase() === 'coffee');
      if (hasCoffee) {
        await reverseCoffeeStamps({
          userId: String(order.user_id),
          stampsToRemove: 1,
          source: 'order_refund',
          orderId: id,
          description: 'POS refund — coffee stamps reversed',
        });
      }
    } catch (err: any) {
      req.log.error({ err, orderId: id }, 'POS refund: loyalty reversal failed');
    }
  }

  const refundSession = await getOrCreateCurrentRegisterSession(req.user!.id);
  await recordPosRefundEvent({
    orderId: id,
    registerSessionId: refundSession.id,
    refundAmountCents,
    paymentMethod: typeof order.payment_method === 'string' ? order.payment_method : null,
    splitPayments: order.split_payments ?? null,
    reason: typeof reason === 'string' ? reason : null,
    createdByUserId: req.user!.id,
    approvedByUserId: req.user!.id,
    isVoid: false,
  });

  await recordAuditLog({
    actor: req.user,
    entityType: 'pos_order',
    entityId: id,
    action: 'pos.refund',
    reason: reason ?? null,
    metadata: { refundAmountCents, orderTotalCents: Number(order.total_cents), refundType: isFullRefund ? 'full' : 'partial' },
  });

  return res.json({ success: true, refundAmountCents, isFullRefund });
});

// ── Linkly config & transaction routes ───────────────────────────────────────
router.get('/linkly/config', async (req, res) => {
  await ensurePosSchemaReady();
  const data = await getLinklyPublicConfig(req.user!.id);
  return res.json({ data });
});

router.patch('/linkly/config', async (req, res) => {
  await ensurePosSchemaReady();
  const {
    linklyEnabled,
    environment,
    linklyUsername,
    linklyPassword,
    linklyPairingCode,
    linklyPosName,
    linklyPosVersion,
    linklyPosId,
    linklyPosVendorId,
  } = req.body ?? {};
  await saveLinklyConfig(req.user!.id, {
    linklyEnabled,
    environment,
    linklyUsername,
    linklyPassword,
    linklyPairingCode,
    linklyPosName,
    linklyPosVersion,
    linklyPosId,
    linklyPosVendorId,
  });
  return res.json({ success: true });
});

router.post('/linkly/pair', async (req, res) => {
  await ensurePosSchemaReady();
  req.log.info({ userId: req.user!.id }, 'Linkly pair: request received');
  try {
    const result = await pairLinklyPinPad(req.user!.id);
    req.log.info({ userId: req.user!.id, terminalId: result.terminalId }, 'Linkly pair: succeeded');
    return res.json({ success: true, terminalId: result.terminalId ?? null });
  } catch (error: any) {
    req.log.warn({ userId: req.user!.id, err: error?.message }, 'Linkly pair: failed');
    return res.status(400).json({ error: error?.message ?? 'Linkly pairing failed.' });
  }
});

router.post('/linkly/token', async (req, res) => {
  await ensurePosSchemaReady();
  try {
    await getLinklyToken(req.user!.id, true);
    const config = await getLinklyPublicConfig(req.user!.id);
    return res.json({ success: true, tokenExpiresAt: config.tokenExpiresAt });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? 'Linkly token request failed.' });
  }
});

router.post('/linkly/settlement', async (req, res) => {
  await ensurePosSchemaReady();
  const settlementType = req.body?.settlementType === 'P' ? 'P' : 'S';
  try {
    const result = await runSettlementAction(req.user!.id, settlementType);
    return res.json({ data: result });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? 'Linkly settlement failed.' });
  }
});

router.post('/linkly/reprint', async (req, res) => {
  await ensurePosSchemaReady();
  const mode = req.body?.mode === 'pinpad' ? 'pinpad' : 'pos';
  try {
    const result = await runReprintReceiptAction(req.user!.id, mode);
    return res.json({ data: result });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? 'Linkly receipt reprint failed.' });
  }
});

// ── POST /pos/linkly/transaction — initiate EFTPOS via Linkly ─────────────
router.post('/linkly/transaction', async (req, res) => {
  await ensurePosSchemaReady();
  const { amountCents } = req.body ?? {};
  if (!amountCents || Number(amountCents) <= 0)
    return res.status(400).json({ error: 'amountCents is required and must be positive' });

  const sessionId = randomUUID();
  const chargeAmount = Math.round(Number(amountCents));
  const txnRef = `BF${sessionId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;

  try {
    const started = await startPurchaseTransaction({
      userId: req.user!.id,
      sessionId,
      amountCents: chargeAmount,
      txnRef,
      operatorId: req.user!.id,
      operatorName: req.user!.name ?? req.user!.email ?? 'Staff',
      source: 'pos',
      notificationUrl: buildLinklyNotificationUrl(req, sessionId),
    });
    posActiveSessions.set(sessionId, { deviceUserId: req.user!.id, amountCents: chargeAmount, createdAt: Date.now() });
    return res.json({
      data: {
        sessionId,
        amountCents: chargeAmount,
        txnRef: started.txnRef,
        recoveryRequired: started.recoveryRequired,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'POS Linkly transaction initiation error');
    return res.status(400).json({ error: err.message ?? 'Could not reach Linkly Cloud.' });
  }
});

// ── GET /pos/linkly/:sessionId — poll Linkly transaction status ───────────
router.get('/linkly/:sessionId', async (req, res) => {
  await ensurePosSchemaReady();
  const { sessionId } = req.params;

  const binding = posActiveSessions.get(sessionId);
  if (!binding) return res.status(404).json({ error: 'Session not found or expired.' });
  if (binding.deviceUserId !== req.user!.id) return res.status(403).json({ error: 'Session belongs to a different device.' });

  try {
    const status = await recoverOrPollTransaction(req.user!.id, sessionId);
    if (status.complete) posActiveSessions.delete(sessionId);
    return res.json({
      data: {
        sessionId: status.sessionId,
        txnRef: status.txnRef,
        status: status.status,
        responseCode: status.responseCode,
        responseText: status.responseText,
        approved: status.success,
        complete: status.complete,
        authCode: status.authCode,
        rrn: status.rrn,
        stan: status.stan,
        catid: status.catid,
        caid: status.caid,
        rfn: status.rfn,
        ref: status.ref,
        receiptText: status.receiptText ?? null,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, 'POS Linkly poll error');
    return res.json({ data: { status: 'pending', responseText: 'Checking terminal status…', approved: false, complete: false } });
  }
});

// ── DELETE /pos/linkly/:sessionId — cancel Linkly transaction ────────────
router.delete('/linkly/:sessionId', async (req, res) => {
  await ensurePosSchemaReady();
  const { sessionId } = req.params;

  const binding = posActiveSessions.get(sessionId);
  if (binding && binding.deviceUserId !== req.user!.id)
    return res.status(403).json({ error: 'Session belongs to a different device.' });
  posActiveSessions.delete(sessionId);
  return res.json({ success: true });
});

// ── PATCH /pos/orders/:id/void — void a POS order within 5 minutes ─────────
router.patch('/orders/:id/void', async (req, res) => {
  await ensurePosSchemaReady();
  const { id } = req.params;
  const FIVE_MINS_MS = 5 * 60 * 1000;

  const result = await db.execute(sql`
    SELECT id, created_at, status, source, total_cents, payment_method, split_payments
    FROM orders
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = ((((result as any).rows ?? (result as any) ?? []) as any[])[0] ?? null) as any;
  if (!row) return res.status(404).json({ error: 'Order not found' });
  if (row.source !== 'pos') return res.status(400).json({ error: 'Only POS orders can be voided this way' });
  if (row.status === 'cancelled') return res.status(400).json({ error: 'Order is already cancelled' });

  const ageMs = Date.now() - new Date(row.created_at as string | number | Date).getTime();
  if (ageMs > FIVE_MINS_MS) {
    return res.status(400).json({ error: 'Orders can only be voided within 5 minutes of completion' });
  }

  await db.execute(sql`
    UPDATE orders
    SET status = 'cancelled',
        cancel_reason = 'pos_void',
        updated_at = now()
    WHERE id = ${id}
  `);

  const voidSession = await getOrCreateCurrentRegisterSession(req.user!.id);
  await recordPosRefundEvent({
    orderId: id,
    registerSessionId: voidSession.id,
    refundAmountCents: Number(row.total_cents ?? 0),
    paymentMethod: typeof row.payment_method === 'string' ? row.payment_method : null,
    splitPayments: row.split_payments ?? null,
    reason: 'pos_void',
    createdByUserId: req.user!.id,
    approvedByUserId: req.user!.id,
    isVoid: true,
  });

  recordAuditLog({
    actor: req.user,
    action: 'pos.void',
    entityType: 'order',
    entityId: id,
    reason: 'pos_void',
  });

  return res.json({ success: true });
});

// ── POST /pos/orders/:id/email-invoice ────────────────────────────────────────
router.post('/orders/:id/email-invoice', async (req, res) => {
  await ensurePosSchemaReady();
  const { id } = req.params;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const result = await db.execute(sql`
    SELECT
      o.id, o.order_number, o.total_cents, o.items, o.payment_method,
      o.surcharge_cents, o.discount_cents,
      u.name AS customer_name,
      (SELECT SUM(lt2.points) FROM loyalty_transactions lt2
       WHERE lt2.reference_id = o.id AND lt2.type = 'earn') AS loyalty_points_earned
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    WHERE o.id = ${id}
    LIMIT 1
  `);

  const row = ((result as any).rows ?? (result as any) ?? [])[0] as any ?? null;
  if (!row) return res.status(404).json({ error: 'Order not found.' });

  const rawItems: Array<{ name?: string; productName?: string; quantity: number; unitPriceCents?: number; unit_price_cents?: number; variantName?: string; variant_name?: string }> =
    Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []);

  const items = rawItems.map(i => ({
    name: i.name ?? i.productName ?? 'Item',
    quantity: Number(i.quantity ?? 1),
    unitPriceCents: Number(i.unitPriceCents ?? i.unit_price_cents ?? 0),
    variantName: i.variantName ?? i.variant_name,
  }));

  const totalCents    = Number(row.total_cents ?? 0);
  const surchargeCents = Number(row.surcharge_cents ?? 0);
  const discountCents  = Number(row.discount_cents ?? 0);
  const subtotalCents  = totalCents - surchargeCents + discountCents;
  const loyaltyPointsEarned = row.loyalty_points_earned ? Number(row.loyalty_points_earned) : null;
  const customerName = row.customer_name ?? 'Customer';
  const orderNumber  = row.order_number ?? id.slice(0, 8).toUpperCase();
  const paymentMethod = row.payment_method ?? 'eftpos';
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });

  const { sendEmail, buildPosReceiptEmail } = await import('../lib/emailService.js');
  const html = buildPosReceiptEmail({ orderNumber, customerName, items, subtotalCents, surchargeCents, discountCents, totalCents, paymentMethod, loyaltyPointsEarned, date });
  const { success } = await sendEmail({
    to: email,
    subject: `Your Butterfield Cookies receipt — #${orderNumber}`,
    html,
  });

  if (!success) {
    return res.status(502).json({ error: 'Failed to send email. Check that Resend is connected.' });
  }

  return res.json({ success: true });
});

export default router;
