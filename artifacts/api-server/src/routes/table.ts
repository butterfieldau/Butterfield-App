/**
 * Table ordering endpoints — unauthenticated guest access.
 *
 * Routes:
 *   GET  /table/:storeId/:tableNumber  — serves the dine-in SPA shell
 *   POST /table/payment-intent         — create Stripe PI for a table order
 *   POST /table/orders                 — record a paid table order
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, ordersTable, usersTable, staffProfilesTable, storeTablesTable, storeSettingsTable, customerProfilesTable, passwordResetTokensTable } from '@workspace/db';
import { eq, inArray, sql, and } from 'drizzle-orm';
import { prepareRetailCheckout } from '../lib/retailCheckout.js';
import { generateOrderNumber } from '../lib/orderNumber.js';
import { sendNotification } from '../lib/notificationService.js';
import { applyCoffeeStamps, ensureLoyaltySchemaReady } from '../lib/loyaltyIdentity.js';
import { countCoffeeItemsFromOrderItems } from '../lib/orderLoyaltyUtils.js';
import { sydneyDateParts } from '../lib/sydneyTime.js';
import { sendEmail, buildTableAccountSetupEmail, getLogoUrl } from '../lib/emailService.js';
import bcrypt from 'bcryptjs';

const router = Router();

// ── Runtime migration ─────────────────────────────────────────────────────────
let tableSchemaMigrated = false;
async function ensureTableSchemaReady() {
  if (tableSchemaMigrated) return;
  await db.execute(
    sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_number text`,
  );
  tableSchemaMigrated = true;
}

// ── Rate limiting (10 req / min per IP) ───────────────────────────────────────
type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function getIp(req: any): string {
  const fwd = req.headers['x-forwarded-for'];
  if (Array.isArray(fwd)) return fwd[0] ?? req.ip ?? 'unknown';
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function tableRateLimit(req: any, res: any, next: any) {
  const key = `table:${getIp(req)}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (bucket.count >= 10) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return next();
}

// Periodically prune expired buckets to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000).unref();

// ── Helper: canonical QR URL ──────────────────────────────────────────────────
export function generateTableQrUrl(storeId: string, tableNumber: string): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(',')[0]?.trim()
    ?? process.env.REPLIT_DEV_DOMAIN
    ?? '';
  const base = domain ? `https://${domain}` : '';
  return `${base}/api/table/${encodeURIComponent(storeId)}/${encodeURIComponent(tableNumber)}`;
}

// ── Stripe publishable key (cached per process) ───────────────────────────────
let cachedPublishableKey: string | null = null;
async function getPublishableKey(): Promise<string | null> {
  if (cachedPublishableKey) return cachedPublishableKey;
  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    // Access the publishable key via the connectors SDK the same way getUncachableStripeClient does.
    // We can't call stripe directly for the publishable key, so we read it from the environment.
    // The stripe client module internally fetches credentials; we re-use that path.
    // Fall back to EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY if set.
    const envKey =
      process.env.STRIPE_PUBLISHABLE_KEY ??
      process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
      null;
    if (envKey) {
      cachedPublishableKey = envKey;
      return cachedPublishableKey;
    }
    // Otherwise attempt to fetch from the connectors SDK credentials endpoint.
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
        ? 'depl ' + process.env.WEB_REPL_RENEWAL
        : null;
    if (!hostname || !xReplitToken) return null;
    const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
    const envs = isProduction ? ['production', 'development'] : ['development', 'production'];
    for (const env of envs) {
      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set('include_secrets', 'true');
      url.searchParams.set('connector_names', 'stripe');
      url.searchParams.set('environment', env);
      const resp = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'X-Replit-Token': xReplitToken },
        signal: AbortSignal.timeout(6_000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as any;
      const pub = data.items?.[0]?.settings?.publishable;
      if (pub) { cachedPublishableKey = pub; return cachedPublishableKey; }
    }
    return null;
  } catch {
    return null;
  }
}

// ── HTML safety helpers ────────────────────────────────────────────────────────

/**
 * Safe JSON serialization for inline <script type="application/json"> blocks.
 * Escapes characters that would allow breaking out of a script tag (reflected XSS).
 *   < → \u003c   prevents </script> injection
 *   > → \u003e   belt-and-suspenders
 *   & → \u0026   prevents HTML entity confusion
 */
function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Minimal HTML entity encoding for values interpolated into HTML text/attribute contexts. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── SPA shell ─────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled bundle lives in dist/index.mjs, so ../public resolves to api-server/public/
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// Serve compiled SPA static assets at /api/table/assets/* and /api/table/index.html
// Must be registered before the dynamic :storeId/:tableNumber route.
const { default: expressModule } = await import('express');
router.use('/assets', expressModule.static(path.join(PUBLIC_DIR, 'table', 'assets'), { maxAge: '7d', immutable: true }));

router.get('/:storeId/:tableNumber', async (req, res) => {
  const { storeId, tableNumber } = req.params;

  // ── Validate table ordering is enabled for this store ────────────────────
  try {
    const [setting] = await db.select().from(storeSettingsTable)
      .where(eq(storeSettingsTable.key, `store_${storeId}_table_ordering_enabled`));
    if (setting && setting.value !== 'true') {
      const errorPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Table Ordering Unavailable — Butterfield Cookies</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100dvh; margin: 0; background: #fdf8f3; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p  { color: #555; text-align: center; max-width: 26rem; }
  </style>
</head>
<body>
  <h1>🍪 Table ordering is not available</h1>
  <p>Table ordering has been paused at this store. Please ask a staff member for assistance.</p>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(503).send(errorPage);
    }

    // ── Validate the table exists and is active ───────────────────────────
    const [tableRow] = await db.select({ id: storeTablesTable.id, isActive: storeTablesTable.isActive })
      .from(storeTablesTable)
      .where(and(
        eq(storeTablesTable.storeId, storeId),
        eq(storeTablesTable.tableNumber, tableNumber),
      ));
    if (tableRow && !tableRow.isActive) {
      const errorPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Table Not Available — Butterfield Cookies</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100dvh; margin: 0; background: #fdf8f3; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p  { color: #555; text-align: center; max-width: 26rem; }
  </style>
</head>
<body>
  <h1>🍪 This table is not set up for ordering</h1>
  <p>Table ${escapeHtml(tableNumber)} is not currently available for ordering. Please ask a staff member for assistance.</p>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(errorPage);
    }
    // If table_ordering_enabled is true but table doesn't exist in store_tables,
    // still allow through (store may not have configured tables yet — graceful fallback).
  } catch {
    // If validation query fails, continue serving the SPA (fail open for resilience)
  }

  // Try to serve the pre-built SPA. Fall back to an inline holding page so
  // the QR link is never a dead end even before the web-app task ships.
  const spaPath = path.join(PUBLIC_DIR, 'table', 'index.html');

  const stripePublishableKey = await getPublishableKey().catch(() => null);

  try {
    const fs = await import('node:fs/promises');
    let html = await fs.readFile(spaPath, 'utf8');

    // Inject store + table metadata so the SPA can read them without query params.
    // safeJson escapes <, >, & to prevent reflected XSS via crafted storeId/tableNumber.
    const configPayload = { storeId, tableNumber, stripePublishableKey };
    const configBlock = `<script id="table-config" type="application/json">${safeJson(configPayload)}</script>`;
    html = html.replace('</head>', `${configBlock}\n</head>`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch {
    // SPA not yet deployed — serve a minimal holding page.
    const holding = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order at the Table — Butterfield Cookies</title>
  <script id="table-config" type="application/json">${safeJson({ storeId, tableNumber })}</script>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center;
           justify-content: center; min-height: 100dvh; margin: 0; background: #fdf8f3; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p  { color: #555; text-align: center; max-width: 26rem; }
  </style>
</head>
<body>
  <h1>🍪 Table ${escapeHtml(tableNumber)}</h1>
  <p>Our table ordering experience is coming soon. In the meantime, please ask a staff member for assistance.</p>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(holding);
  }
});

// ── POST /table/payment-intent ────────────────────────────────────────────────
router.post('/payment-intent', tableRateLimit, async (req, res) => {
  await ensureTableSchemaReady();
  const { items: rawItems, tableNumber, storeId } = req.body ?? {};

  if (!tableNumber || typeof tableNumber !== 'string') {
    return res.status(400).json({ error: 'tableNumber is required.' });
  }
  if (!storeId || typeof storeId !== 'string') {
    return res.status(400).json({ error: 'storeId is required.' });
  }

  let computed: { totalCents: number; itemizedCents?: Array<{ unitCents: number; lineCents: number }> };
  let itemizedCents: Array<{ unitCents: number; lineCents: number }>;

  try {
    const result = await prepareRetailCheckout({
      userId: 'guest',
      userRole: 'customer',
      rawItems,
      orderType: 'pickup',
      paymentMethod: 'card',
      discountCode: undefined,
      claimedRewardId: undefined,
      loyaltyPointsUsed: 0,
      markClaimAppliedToCart: false,
      useFreeCoffeeReward: false,
    });
    computed = result.computed;
    itemizedCents = result.computed.itemizedCents ?? [];
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not compute order total.' });
  }

  if (computed.totalCents === 0) {
    return res.json({ paymentRequired: false, clientSecret: null, amountCents: 0 });
  }
  if (computed.totalCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least 50 cents.' });
  }

  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const intent = await stripe.paymentIntents.create({
      amount: computed.totalCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: 'dine_in',
        tableNumber,
        storeId,
        computedAmountCents: String(computed.totalCents),
      },
    });

    return res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amountCents: computed.totalCents,
      itemizedCents,
    });
  } catch (err: any) {
    req.log.error({ err }, 'Table payment intent creation failed');
    return res.status(500).json({ error: 'Payment processing unavailable. Please try again.' });
  }
});

// ── POST /table/orders ────────────────────────────────────────────────────────
router.post('/orders', tableRateLimit, async (req, res) => {
  await ensureTableSchemaReady();
  const {
    stripePaymentIntentId,
    items: rawItems,
    tableNumber,
    storeId,
    contactName,
    contactPhone,
    contactEmail,
    notes,
  } = req.body ?? {};

  // ── Input validation ───────────────────────────────────────────────────────
  if (!stripePaymentIntentId || typeof stripePaymentIntentId !== 'string') {
    return res.status(400).json({ error: 'stripePaymentIntentId is required.' });
  }
  if (!tableNumber || typeof tableNumber !== 'string') {
    return res.status(400).json({ error: 'tableNumber is required.' });
  }
  if (!storeId || typeof storeId !== 'string') {
    return res.status(400).json({ error: 'storeId is required.' });
  }

  // ── Duplicate-use guard ────────────────────────────────────────────────────
  const [existingOrder] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.stripePaymentIntentId, stripePaymentIntentId));
  if (existingOrder) {
    return res.status(409).json({ error: 'Payment intent has already been used.' });
  }

  // ── Re-price server-side ───────────────────────────────────────────────────
  let totalCents: number;
  let pricedItems: any[];

  try {
    const result = await prepareRetailCheckout({
      userId: 'guest',
      userRole: 'customer',
      rawItems,
      orderType: 'pickup',
      paymentMethod: 'card',
      discountCode: undefined,
      claimedRewardId: undefined,
      loyaltyPointsUsed: 0,
      markClaimAppliedToCart: false,
      useFreeCoffeeReward: false,
    });
    totalCents = result.computed.totalCents;
    pricedItems = result.items.map((item: any, idx: number) => {
      const priced = result.computed.itemizedCents?.[idx];
      if (!priced) return item;
      return { ...item, unitCents: priced.unitCents, lineCents: priced.lineCents };
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message ?? 'Could not verify order total.' });
  }

  // ── Verify Stripe PI ───────────────────────────────────────────────────────
  try {
    const { getUncachableStripeClient } = await import('../stripeClient.js');
    const stripe = await getUncachableStripeClient();
    const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

    if (pi.metadata?.source !== 'dine_in') {
      return res.status(403).json({ error: 'Payment intent was not created for table ordering.' });
    }
    if (pi.metadata?.storeId !== storeId) {
      return res.status(403).json({ error: 'Payment intent store does not match.' });
    }
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: `Payment has not been completed (status: ${pi.status}).` });
    }
    if (pi.currency !== 'aud') {
      return res.status(400).json({ error: 'Payment currency is not AUD.' });
    }
    if (Math.abs(pi.amount - totalCents) > 1) {
      return res.status(400).json({ error: 'Payment amount does not match order total.' });
    }
  } catch (err: any) {
    if (err?.message?.startsWith('Payment intent') || err?.message?.startsWith('Payment has') || err?.message?.startsWith('Payment currency') || err?.message?.startsWith('Payment amount')) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err, stripePaymentIntentId }, 'Table Stripe PI verification failed');
    return res.status(400).json({ error: 'Payment verification failed. Please try again.' });
  }

  // ── Resolve rewards identity before insert ────────────────────────────────
  // Doing this before the INSERT means user_id on the order row reflects the
  // real customer, so refund/reversal paths that key on order.user_id work correctly.
  const resolvedContactEmail = contactEmail || null;
  const resolvedContactName  = contactName  || null;

  let resolvedUserId = 'guest';
  let rewardsPrep: {
    userId: string;
    coffeeCount: number;
    isNewAccount: boolean;
    customerName: string;
  } | null = null;

  if (resolvedContactEmail) {
    try {
      await ensureLoyaltySchemaReady();

      const email = resolvedContactEmail.toLowerCase().trim();
      const [existingUser] = await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.email, email));

      let loyaltyUserId: string;
      let isNewAccount = false;
      let customerName = (resolvedContactName ?? '').trim() || 'Guest';

      if (existingUser) {
        loyaltyUserId = existingUser.id;
        customerName = existingUser.name ?? customerName;
      } else {
        isNewAccount = true;
        loyaltyUserId = randomUUID();
        const name = customerName;

        // Derive stamp goal the same way auth.ts does (July 2026+ → 9, else → 6)
        const { year, monthNum } = sydneyDateParts();
        const stampGoal = (year > 2026 || (year === 2026 && monthNum >= 7)) ? 9 : 6;

        // passwordHash must be non-null; this placeholder can never match bcrypt
        await db.insert(usersTable).values({
          id: loyaltyUserId,
          email,
          passwordHash: `PENDING_TABLE_${randomUUID()}`,
          role: 'customer',
          name,
          status: 'pending',
        });

        await db.insert(customerProfilesTable).values({
          userId: loyaltyUserId,
          loyaltyPoints: 0,
          loyaltyTier: 'blue',
          referralCode: name.replace(/\s+/g, '').toUpperCase().slice(0, 4) + randomUUID().replace(/-/g, '').slice(0, 4),
          coffeeStampCount: 0,
          freeCoffeeRewards: 0,
          stampCount: 0,
          freeCoffeesEarned: 0,
          coffeeStampGoal: stampGoal,
        });

        // Generate a 6-digit setup OTP (7-day expiry — customer needs time to download the app)
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const otpHash = await bcrypt.hash(otp, 10);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Delete any stale tokens first (belt-and-suspenders)
        await db.delete(passwordResetTokensTable)
          .where(eq(passwordResetTokensTable.userId, loyaltyUserId));

        await db.insert(passwordResetTokensTable).values({
          id: randomUUID(),
          userId: loyaltyUserId,
          otpHash,
          expiresAt,
        });

        // Setup email — fire-and-forget
        sendEmail({
          to: email,
          subject: 'Set up your Butterfield Cookies password',
          html: buildTableAccountSetupEmail({ name: customerName, otp, logoUrl: getLogoUrl(req) }),
        }).catch((err: any) => req.log?.warn({ err }, 'Table order setup email failed'));
      }

      // Count coffee items now so the order user_id and stamp count are consistent
      const coffeeCount = await countCoffeeItemsFromOrderItems(pricedItems);

      resolvedUserId = loyaltyUserId;
      rewardsPrep = { userId: loyaltyUserId, coffeeCount, isNewAccount, customerName };
    } catch (rewardsErr: any) {
      req.log?.warn({ rewardsErr }, 'Table order rewards pre-enrolment failed — order will use guest identity');
      // Do not block the order on rewards errors; proceed as guest
    }
  }

  // ── Insert order ───────────────────────────────────────────────────────────
  const orderId = randomUUID();
  const orderNumber = await generateOrderNumber();
  const resolvedStoreId   = storeId || null;
  const resolvedNotes     = notes   || null;
  const resolvedContactPhone = contactPhone || null;
  const itemsJson = JSON.stringify(pricedItems);

  await db.execute(sql`
    INSERT INTO orders (
      id, order_number, user_id, status, type, store_id,
      notes, total_cents,
      stripe_payment_intent_id, stripe_payment_status,
      items, loyalty_points_earned, loyalty_points_used, discount_cents,
      source, table_number, contact_name, contact_phone, contact_email,
      created_at, updated_at
    ) VALUES (
      ${orderId}, ${orderNumber}, ${resolvedUserId}, 'received', 'pickup', ${resolvedStoreId},
      ${resolvedNotes}, ${totalCents},
      ${stripePaymentIntentId}, 'paid',
      ${sql.raw(`'${itemsJson.replace(/'/g, "''")}'::jsonb`)}, 0, 0, 0,
      'dine_in', ${tableNumber}, ${resolvedContactName}, ${resolvedContactPhone}, ${resolvedContactEmail},
      NOW(), NOW()
    )
  `);

  // ── Notify staff ───────────────────────────────────────────────────────────
  try {
    const [internalUsers, authorisedStaff] = await Promise.all([
      db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, ['director', 'manager', 'master'])),
      db.select({ id: staffProfilesTable.userId }).from(staffProfilesTable).where(eq(staffProfilesTable.canViewOrders, true)),
    ]);

    const userIds = [...new Set([...internalUsers.map((u) => u.id), ...authorisedStaff.map((u) => u.id)])];
    if (userIds.length > 0) {
      const itemCount = Array.isArray(pricedItems) ? pricedItems.length : 1;
      void sendNotification({
        userIds,
        type: 'new_table_order',
        title: 'New Dine-In Order',
        body: `New order — Table ${tableNumber} · ${itemCount} item${itemCount !== 1 ? 's' : ''} · $${(totalCents / 100).toFixed(2)}`,
        data: { orderId, tableNumber, storeId, screen: '/(staff)/orders' },
        channelId: 'butterfield-staff',
      }).catch((err: any) => req.log.warn({ err, orderId }, 'Table order notification failed'));
    }
  } catch (notifyErr) {
    req.log.warn({ notifyErr, orderId }, 'Table order staff notification setup failed');
  }

  // ── Apply stamps ───────────────────────────────────────────────────────────
  // Runs after insert so orderId is available; safe because user_id on the row
  // already reflects the resolved identity (not 'guest').
  let rewardsInfo: { stampsEarned: number; totalStamps: number; isNewAccount: boolean } | null = null;
  if (rewardsPrep && rewardsPrep.coffeeCount > 0) {
    try {
      const stampResult = await applyCoffeeStamps({
        userId: rewardsPrep.userId,
        stampsToAdd: rewardsPrep.coffeeCount,
        source: 'in_app_order',
        orderId,
        description: `Dine-in table order #${orderNumber}`,
      });

      rewardsInfo = {
        stampsEarned: rewardsPrep.coffeeCount,
        totalStamps: stampResult.stampCount,
        isNewAccount: rewardsPrep.isNewAccount,
      };
    } catch (stampErr: any) {
      req.log?.warn({ stampErr, orderId }, 'Table order stamp application failed');
    }
  } else if (rewardsPrep) {
    // Account was found/created but no coffee items — still report the enrolment
    // (account exists, just 0 stamps earned this order)
    rewardsInfo = {
      stampsEarned: 0,
      totalStamps: 0,
      isNewAccount: rewardsPrep.isNewAccount,
    };
  }

  return res.status(201).json({
    data: {
      id: orderId,
      orderNumber,
      tableNumber,
      storeId,
      totalCents,
      source: 'dine_in',
      rewards: rewardsInfo,
    },
  });
});

export default router;
