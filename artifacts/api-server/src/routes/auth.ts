import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { db, usersTable, customerProfilesTable, staffProfilesTable, wholesaleAccountsTable, managerProfilesTable, passwordResetTokensTable, storesTable, storeOpeningHoursTable, loyaltyTransactionsTable, favouritesTable, staffStoreAssignmentsTable, staffInviteTokensTable, storeSettingsTable, loginHistoryTable, mobileSessionsTable } from '@workspace/db';
import { eq, and, lt, isNull, sql } from 'drizzle-orm';
import { signToken, requireAuth, getSessionSecret } from '../middlewares/auth.js';
import {
  sendEmail, buildPasswordResetEmail, buildCustomerWelcomeEmail,
  buildWholesaleApplicationReceivedEmail, buildLoginAlertEmail, getLogoUrl,
  buildTableAccountSetupEmail,
} from '../lib/emailService.js';
import { sendSms, buildPasswordResetSms } from '../lib/smsService.js';
import { ensureShopDisplaySchemaReady } from '../lib/ensureShopDisplaySchemaReady.js';
import { ensureStoreConfigSchemaReady } from '../lib/ensureStoreConfigSchemaReady.js';
import { getOrCreateCustomerLoyaltyProfile, ensureLoyaltySchemaReady } from '../lib/loyaltyIdentity.js';
import { recordAuditLog } from '../lib/auditLog.js';
import { sydneyDateParts } from '../lib/sydneyTime.js';

const DEMO_EMAILS = ['customer@demo.com', 'staff@demo.com', 'wholesale@demo.com', 'director@demo.com', 'manager@demo.com', 'loyalty9@demo.com'];
const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let mobileSessionSchemaReady: Promise<void> | null = null;

function getCoffeeStampGoalForNewUser(): number {
  const { year, monthNum } = sydneyDateParts();
  if (year > 2026) return 9;
  if (year === 2026 && monthNum >= 7) return 9;
  return 6;
}

const router = Router();

type SessionUser = Pick<typeof usersTable.$inferSelect, 'id' | 'email' | 'role' | 'name'>;

function digestRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

async function issueSessionCredentials(user: SessionUser): Promise<{ token: string; refreshToken: string }> {
  await ensureMobileSessionSchemaReady();
  const refreshToken = newRefreshToken();
  const sessionId = randomUUID();
  await db.insert(mobileSessionsTable).values({
    id: sessionId,
    familyId: sessionId,
    userId: user.id,
    tokenDigest: digestRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_SESSION_TTL_MS),
  });
  return {
    token: signToken({ id: user.id, email: user.email, role: user.role, name: user.name }),
    refreshToken,
  };
}

function sessionUser(user: typeof usersTable.$inferSelect): SessionUser {
  return { id: user.id, email: user.email, role: user.role, name: user.name };
}

function accountSessionError(user: typeof usersTable.$inferSelect): { error: string; code: string } | null {
  if (user.status === 'suspended') {
    return { error: 'This account has been suspended. Please contact us for help.', code: 'ACCOUNT_SUSPENDED' };
  }
  if (user.status === 'inactive' || user.isActive === 'false') {
    return { error: 'This account has been deactivated. Please contact us for help.', code: 'ACCOUNT_INACTIVE' };
  }
  if (user.status === 'pending') {
    return {
      error: 'Check your email for a setup code, or reset your password to finish signing in.',
      code: 'PENDING_SETUP',
    };
  }
  return null;
}

async function ensureMobileSessionSchemaReady(): Promise<void> {
  if (!mobileSessionSchemaReady) {
    mobileSessionSchemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mobile_sessions (
          id text PRIMARY KEY,
          family_id text NOT NULL,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_digest text NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_used_at timestamptz
        )
      `);
      await db.execute(sql`ALTER TABLE mobile_sessions ADD COLUMN IF NOT EXISTS family_id text`);
      await db.execute(sql`UPDATE mobile_sessions SET family_id = id WHERE family_id IS NULL`);
      await db.execute(sql`ALTER TABLE mobile_sessions ALTER COLUMN family_id SET NOT NULL`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS mobile_sessions_token_digest_idx ON mobile_sessions(token_digest)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS mobile_sessions_user_id_idx ON mobile_sessions(user_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS mobile_sessions_family_id_idx ON mobile_sessions(family_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS mobile_sessions_expires_at_idx ON mobile_sessions(expires_at)`);
    })().catch((error) => {
      mobileSessionSchemaReady = null;
      throw error;
    });
  }
  await mobileSessionSchemaReady;
}

function extractRequestIp(req: any): string | null {
  const fwd = req.headers?.['x-forwarded-for'];
  if (Array.isArray(fwd)) return fwd[0] ?? req.ip ?? null;
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** Fire-and-forget "new sign-in" confirmation email. Never blocks or fails the login response. */
function sendLoginAlertEmail(opts: { email?: string | null; name?: string | null; role: string; req: any }) {
  if (!opts.email) return;
  sendEmail({
    to: opts.email,
    subject: 'New sign-in to your Butterfield Cookies account',
    html: buildLoginAlertEmail({
      name: opts.name ?? 'there',
      role: opts.role,
      loginAt: new Date(),
      ip: extractRequestIp(opts.req),
      logoUrl: getLogoUrl(opts.req),
    }),
  }).catch((err) => { opts.req?.log?.warn?.({ err }, 'Failed to send login alert email'); });
}

function recordLoginHistory(opts: {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  success: boolean;
  failReason?: string | null;
  req: any;
}) {
  const ip = extractRequestIp(opts.req);
  const ua = opts.req.headers?.['user-agent'] ?? null;
  db.insert(loginHistoryTable).values({
    id: randomUUID(),
    userId: opts.userId ?? null,
    email: opts.email ?? null,
    role: opts.role ?? null,
    success: opts.success,
    failReason: opts.failReason ?? null,
    ip,
    userAgent: ua,
  }).catch((err: any) => {
    opts.req?.log?.warn?.({ err: err?.message }, 'recordLoginHistory failed');
  });
  // Mirror every failed login attempt into audit_logs for cross-system security queries
  if (!opts.success) {
    recordAuditLog({
      actor: opts.userId ? { id: opts.userId, email: opts.email ?? '', role: opts.role ?? '', name: '' } : null,
      action: 'auth.login_fail',
      entityType: 'user',
      entityId: opts.userId ?? opts.email ?? '',
      reason: opts.failReason ?? undefined,
    }).catch(() => {});
  }
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getRequestIdentifier(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] ?? req.ip ?? 'unknown';
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

function createRateLimiter(name: string, maxAttempts: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    // Skip rate limiting in development so test suites can log in freely
    if (process.env.NODE_ENV !== 'production') { next(); return; }

    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\s+/g, '') : '';
    const key = [name, getRequestIdentifier(req), email, phone].filter(Boolean).join(':');
    const now = Date.now();
    const current = rateLimitBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
      return;
    }

    current.count += 1;
    rateLimitBuckets.set(key, current);
    next();
  };
}

const loginRateLimit = createRateLimiter('login', 10, 10 * 60 * 1000);
const refreshRateLimit = createRateLimiter('refresh', 60, 10 * 60 * 1000);
const resetRequestRateLimit = createRateLimiter('forgot-password', 5, 15 * 60 * 1000);
const resetVerifyRateLimit = createRateLimiter('verify-reset-otp', 8, 15 * 60 * 1000);
const resetPasswordRateLimit = createRateLimiter('reset-password', 5, 15 * 60 * 1000);

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getAssignedInternalStores(userId: string) {
  return db.select({
    storeId: staffStoreAssignmentsTable.storeId,
    storeName: storesTable.name,
    latitude: storesTable.latitude,
    longitude: storesTable.longitude,
    geofenceRadius: storesTable.geofenceRadius,
    isPrimary: staffStoreAssignmentsTable.isPrimary,
  }).from(staffStoreAssignmentsTable)
    .leftJoin(storesTable, eq(staffStoreAssignmentsTable.storeId, storesTable.id))
    .where(and(
      eq(staffStoreAssignmentsTable.staffId, userId),
      eq(staffStoreAssignmentsTable.isActive, true),
    ));
}

function generateReferralCode(name: string): string {
  const prefix = name.replace(/\s+/g, '').toUpperCase().slice(0, 4);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from(randomBytes(4), (byte) => chars[byte % chars.length]).join('');
  return `${prefix}${suffix}`;
}

function splitAddressParts(address: string): { deliveryAddress: string; suburb: string | null; state: string | null; postcode: string | null } {
  const trimmed = address.trim();
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  const street = parts[0] ?? trimmed;
  const suburb = parts[1] ?? null;
  let state: string | null = null;
  let postcode: string | null = null;

  const tail = parts[2] ?? '';
  if (tail) {
    const statePostcodeMatch = tail.match(/^([A-Za-z ]+?)\s+(\d{4})$/);
    if (statePostcodeMatch) {
      state = statePostcodeMatch[1]?.trim().toUpperCase() ?? null;
      postcode = statePostcodeMatch[2] ?? null;
    } else {
      state = tail.toUpperCase();
    }
  }

  if (!postcode) {
    const postcodeMatch = trimmed.match(/\b(\d{4})\b/);
    postcode = postcodeMatch?.[1] ?? null;
  }

  return {
    deliveryAddress: street,
    suburb,
    state,
    postcode,
  };
}

router.post('/register', async (req, res) => {
  const { email, password, name, phone, birthday } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required.' });
  }
  if (!phone || !String(phone).trim()) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: 'customer', name, phone });
  await db.insert(customerProfilesTable).values({
    userId, loyaltyPoints: 0, loyaltyTier: 'blue',
    referralCode: generateReferralCode(name), birthday: birthday ?? null,
    coffeeStampGoal: getCoffeeStampGoalForNewUser(),
  });
  await getOrCreateCustomerLoyaltyProfile(userId, name);
  const credentials = await issueSessionCredentials({ id: userId, email: email.toLowerCase(), role: 'customer', name });

  // Fire-and-forget welcome confirmation email — never blocks registration.
  sendEmail({
    to: email.toLowerCase(),
    subject: 'Welcome to Butterfield Cookies!',
    html: buildCustomerWelcomeEmail({ name, logoUrl: getLogoUrl(req) }),
  }).catch((err) => { req.log?.warn({ err }, 'Failed to send welcome email'); });

  return res.status(201).json({ token: credentials.token, refreshToken: credentials.refreshToken, user: { id: userId, email, role: 'customer', name } });
});

router.post('/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  } catch {
    return res.status(503).json({ error: 'Unable to reach the auth service. Please try again in a moment.' });
  }

  if (!user) {
    recordLoginHistory({ email: email.toLowerCase().trim(), success: false, failReason: 'ACCOUNT_NOT_FOUND', req });
    return res.status(401).json({ error: 'No account found with that email address.', code: 'ACCOUNT_NOT_FOUND' });
  }

  // Accounts created for internal roles should use the staff/internal portal
  if (['staff', 'director', 'manager', 'master', 'shop_display'].includes(user.role)) {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'WRONG_PORTAL', req });
    return res.status(403).json({
      error: 'This account uses internal sign-in. Please use the "Staff / Internal Access" option on the login screen.',
      code: 'WRONG_PORTAL',
    });
  }

  // Account status check
  if (user.status === 'suspended') {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'ACCOUNT_SUSPENDED', req });
    return res.status(403).json({ error: 'This account has been suspended. Please contact us for help.', code: 'ACCOUNT_SUSPENDED' });
  }
  if (user.status === 'inactive' || user.isActive === 'false') {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'ACCOUNT_INACTIVE', req });
    return res.status(403).json({ error: 'This account has been deactivated. Please contact us for help.', code: 'ACCOUNT_INACTIVE' });
  }
  // Table-enrolled accounts that haven't set a password yet
  if (user.status === 'pending') {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'PENDING_SETUP', req });
    return res.status(403).json({
      error: "Check your email for a setup code, or tap 'Forgot password' to get a new one.",
      code: 'PENDING_SETUP',
    });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'WRONG_PASSWORD', req });
    return res.status(401).json({ error: 'Incorrect password. Please try again.', code: 'WRONG_PASSWORD' });
  }

  // For wholesale accounts, verify the wholesale profile exists and is not suspended
  if (user.role === 'wholesale') {
    const [wa] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, user.id));
    if (!wa) {
      recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'PROFILE_MISSING', req });
      return res.status(403).json({ error: 'Your wholesale account profile is missing. Please contact us to resolve this.', code: 'PROFILE_MISSING' });
    }
    if (wa.isSuspended) {
      recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'ACCOUNT_SUSPENDED', req });
      return res.status(403).json({ error: 'Your wholesale account has been suspended. Please contact your account manager.', code: 'ACCOUNT_SUSPENDED' });
    }
  }

  if (user.role === 'customer') {
    await getOrCreateCustomerLoyaltyProfile(user.id, user.name);
  }

  // Update last login timestamp
  db.update(usersTable).set({ lastLogin: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

  recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: true, req });
  recordAuditLog({ actor: { id: user.id, email: user.email, role: user.role, name: user.name ?? '' }, action: 'auth.login', entityType: 'user', entityId: user.id }).catch(() => {});
  sendLoginAlertEmail({ email: user.email, name: user.name, role: user.role, req });
  const credentials = await issueSessionCredentials(sessionUser(user));
  return res.json({ token: credentials.token, refreshToken: credentials.refreshToken, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post('/staff-login', loginRateLimit, async (req, res) => {
  await ensureShopDisplaySchemaReady();
  const { email, password, latitude, longitude, accuracyMeters } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  } catch {
    return res.status(503).json({ error: 'Unable to reach the auth service. Please try again in a moment.' });
  }

  if (!user) {
    recordLoginHistory({ email: email.toLowerCase().trim(), success: false, failReason: 'ACCOUNT_NOT_FOUND', req });
    return res.status(401).json({ error: 'No account found with that email address.', code: 'ACCOUNT_NOT_FOUND' });
  }

  // Customer or wholesale accounts must use the public login, not the internal portal
  if (['customer', 'wholesale'].includes(user.role)) {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'WRONG_PORTAL', req });
    return res.status(403).json({
      error: 'This account doesn\'t have access to the internal portal. Please sign in using the Customer or Wholesale option.',
      code: 'WRONG_PORTAL',
    });
  }

  // Only internal roles past this point: staff | director | manager | master
  if (!['staff', 'director', 'manager', 'master', 'shop_display'].includes(user.role)) {
    recordLoginHistory({ email: email.toLowerCase().trim(), success: false, failReason: 'ACCOUNT_NOT_FOUND', req });
    return res.status(401).json({ error: 'No internal account found with that email address.', code: 'ACCOUNT_NOT_FOUND' });
  }

  // Account status check
  if (user.status === 'suspended') {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'ACCOUNT_SUSPENDED', req });
    return res.status(403).json({ error: 'This account has been suspended. Contact your manager or director.', code: 'ACCOUNT_SUSPENDED' });
  }
  if (user.status === 'inactive' || user.isActive === 'false') {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'ACCOUNT_INACTIVE', req });
    return res.status(403).json({ error: 'This account has been deactivated. Contact your manager or director.', code: 'ACCOUNT_INACTIVE' });
  }

  // Password check — done before approval so a wrong password gives the right error
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'WRONG_PASSWORD', req });
    return res.status(401).json({ error: 'Incorrect password. Please try again.', code: 'WRONG_PASSWORD' });
  }

  // Staff accounts require admin approval; directors and managers do not
  if (user.role === 'staff') {
    const [staffProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
    if (!staffProfile) {
      recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'PROFILE_MISSING', req });
      return res.status(403).json({ error: 'Your staff profile is missing. Please ask the director to set up your account.', code: 'PROFILE_MISSING' });
    }
    if (!staffProfile.approvedByAdmin) {
      recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'PENDING_APPROVAL', req });
      return res.status(403).json({ error: 'Your staff account is pending approval by a director.', code: 'PENDING_APPROVAL' });
    }
  }

  if (user.role === 'manager') {
    const [managerProfile] = await db.select().from(managerProfilesTable).where(eq(managerProfilesTable.userId, user.id));
    if (!managerProfile) {
      recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: false, failReason: 'PROFILE_MISSING', req });
      return res.status(403).json({ error: 'Your manager profile is missing. Please ask the director to set up your account.', code: 'PROFILE_MISSING' });
    }
  }

  // Update last login timestamp
  db.update(usersTable).set({ lastLogin: new Date() }).where(eq(usersTable.id, user.id)).catch(() => {});

  recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: true, req });
  recordAuditLog({ actor: { id: user.id, email: user.email, role: user.role, name: user.name ?? '' }, action: 'auth.login', entityType: 'user', entityId: user.id }).catch(() => {});
  if (user.role !== 'shop_display') {
    sendLoginAlertEmail({ email: user.email, name: user.name, role: user.role, req });
  }
  const credentials = await issueSessionCredentials(sessionUser(user));
  return res.json({ token: credentials.token, refreshToken: credentials.refreshToken, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post('/refresh', refreshRateLimit, async (req, res) => {
  await ensureMobileSessionSchemaReady();
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh credential is required.', code: 'REFRESH_REQUIRED' });
  }

  const now = new Date();
  const digest = digestRefreshToken(refreshToken);
  const [existingSession] = await db.select().from(mobileSessionsTable)
    .where(and(
      eq(mobileSessionsTable.tokenDigest, digest),
      isNull(mobileSessionsTable.revokedAt),
    ));

  if (!existingSession || existingSession.expiresAt <= now) {
    if (existingSession) {
      await db.update(mobileSessionsTable)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(and(eq(mobileSessionsTable.id, existingSession.id), isNull(mobileSessionsTable.revokedAt)));
    }
    return res.status(401).json({ error: 'Session has expired or been revoked.', code: 'SESSION_INVALID' });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, existingSession.userId));
  if (!user) {
    await db.update(mobileSessionsTable)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(mobileSessionsTable.id, existingSession.id), isNull(mobileSessionsTable.revokedAt)));
    return res.status(401).json({ error: 'Session has expired or been revoked.', code: 'SESSION_INVALID' });
  }

  const accountError = accountSessionError(user);
  if (accountError) {
    await db.update(mobileSessionsTable)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(eq(mobileSessionsTable.id, existingSession.id), isNull(mobileSessionsTable.revokedAt)));
    return res.status(403).json(accountError);
  }

  if (user.role === 'wholesale') {
    const [wholesaleAccount] = await db.select().from(wholesaleAccountsTable)
      .where(eq(wholesaleAccountsTable.userId, user.id));
    if (!wholesaleAccount || wholesaleAccount.isSuspended) {
      await db.update(mobileSessionsTable)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(and(eq(mobileSessionsTable.id, existingSession.id), isNull(mobileSessionsTable.revokedAt)));
      return res.status(403).json({
        error: wholesaleAccount
          ? 'Your wholesale account has been suspended. Please contact your account manager.'
          : 'Your wholesale account profile is missing. Please contact us to resolve this.',
        code: wholesaleAccount ? 'ACCOUNT_SUSPENDED' : 'PROFILE_MISSING',
      });
    }
  }

  const nextRefreshToken = newRefreshToken();
  const rotated = await db.transaction(async (tx) => {
    // The conditional update makes a refresh credential single-use even when
    // two requests race. Only the winner is allowed to create its successor.
    const [claimed] = await tx.update(mobileSessionsTable)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(and(
        eq(mobileSessionsTable.id, existingSession.id),
        isNull(mobileSessionsTable.revokedAt),
      ))
      .returning({ id: mobileSessionsTable.id });
    if (!claimed) return false;

    await tx.insert(mobileSessionsTable).values({
      id: randomUUID(),
      familyId: existingSession.familyId,
      userId: user.id,
      tokenDigest: digestRefreshToken(nextRefreshToken),
      expiresAt: new Date(now.getTime() + REFRESH_SESSION_TTL_MS),
    });
    return true;
  });

  if (!rotated) {
    return res.status(401).json({ error: 'Session has expired or been revoked.', code: 'SESSION_INVALID' });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return res.json({
    token,
    refreshToken: nextRefreshToken,
    user: { id: user.id, email: user.email, role: user.role, name: user.name },
  });
});

router.post('/logout', async (req, res) => {
  await ensureMobileSessionSchemaReady();
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (refreshToken) {
    const now = new Date();
    const digest = digestRefreshToken(refreshToken);
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{ family_id: string }>(
        sql`SELECT family_id FROM mobile_sessions WHERE token_digest = ${digest} FOR UPDATE`,
      );
      const familyId = locked.rows[0]?.family_id;
      if (!familyId) return;
      await tx.update(mobileSessionsTable)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(and(
          eq(mobileSessionsTable.familyId, familyId),
          isNull(mobileSessionsTable.revokedAt),
        ));
    });
  }
  return res.json({ success: true });
});

router.post('/wholesale-apply', async (req, res) => {
  const { email, password, name, phone, companyName, abn, deliveryAddress, howDidYouHear } = req.body;
  if (!email || !password || !name || !companyName) {
    return res.status(400).json({ error: 'Email, password, name and company name are required.' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  if (!deliveryAddress || !deliveryAddress.trim()) {
    return res.status(400).json({ error: 'Business address is required.' });
  }
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = phone.trim();
  const normalizedName = name.trim();
  const normalizedCompany = companyName.trim();
  const normalizedAbn = abn?.trim() || null;
  const normalizedHowDidYouHear = howDidYouHear?.trim() || null;
  const addressParts = splitAddressParts(deliveryAddress);

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: normalizedEmail, passwordHash, role: 'wholesale', name: normalizedName, phone: normalizedPhone });
  await db.insert(wholesaleAccountsTable).values({
    id: accountId,
    userId,
    companyName: normalizedCompany,
    abn: normalizedAbn,
    contactName: normalizedName,
    phone: normalizedPhone,
    email: normalizedEmail,
    deliveryAddress: addressParts.deliveryAddress,
    suburb: addressParts.suburb,
    state: addressParts.state,
    postcode: addressParts.postcode,
    howDidYouHear: normalizedHowDidYouHear,
    status: 'pending',
  });
  // Fire-and-forget push notification to directors and masters
  import('../lib/notificationService.js').then(({ sendNotification }) => {
    sendNotification({
      roles: ['director', 'master'],
      type: 'wholesale_application',
      title: 'New Stockist Registration',
      body: `${normalizedCompany} has applied for a wholesale account.`,
      data: { accountId, companyName: normalizedCompany, screen: '/director-wholesale-accounts' },
    }).catch(() => {});
  }).catch(() => {});

  // Fire-and-forget "application received" confirmation email to the applicant.
  sendEmail({
    to: normalizedEmail,
    subject: 'We received your wholesale application',
    html: buildWholesaleApplicationReceivedEmail({ contactName: normalizedName, companyName: normalizedCompany, logoUrl: getLogoUrl(req) }),
  }).catch((err) => { req.log?.warn({ err }, 'Failed to send wholesale application received email'); });

  return res.status(201).json({ message: 'Your application has been submitted. Someone from our team will be in contact with you soon.', userId });
});

// ── Seed demo accounts (development only) ────────────────────────────────────
router.post('/seed-demo', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  // Ensure loyalty schema (including coffee_stamp_goal column) is up-to-date
  await ensureLoyaltySchemaReady();
  const DEMO_PW = 'Demo1234!';
  const hash = await bcrypt.hash(DEMO_PW, 10);

  const demos = [
    { email: 'customer@demo.com',  role: 'customer' as const, name: 'Demo Customer' },
    { email: 'staff@demo.com',     role: 'staff'    as const, name: 'Demo Staff' },
    { email: 'wholesale@demo.com', role: 'wholesale' as const, name: 'Demo Wholesale' },
    { email: 'director@demo.com',  role: 'director' as const, name: 'Demo Director' },
    { email: 'manager@demo.com',   role: 'manager'  as const, name: 'Demo Manager' },
    { email: 'loyalty9@demo.com',  role: 'customer' as const, name: 'Alex Chen' },
  ];

  const created: string[] = [];
  const existing: string[] = [];

  for (const demo of demos) {
    const [ex] = await db.select().from(usersTable).where(eq(usersTable.email, demo.email));

    let userId: string;
    if (ex) {
      userId = ex.id;
      existing.push(demo.email);
      // Always reset role in case it was changed (e.g. promoted to director)
      await db.update(usersTable).set({ role: demo.role as any }).where(eq(usersTable.id, userId));
    } else {
      userId = randomUUID();
      await db.insert(usersTable).values({ id: userId, email: demo.email, passwordHash: hash, role: demo.role as any, name: demo.name });
      created.push(demo.email);
    }

    if (demo.role === 'customer') {
      if (demo.email === 'loyalty9@demo.com') {
        await db.insert(customerProfilesTable)
          .values({ userId, loyaltyPoints: 0, loyaltyTier: 'blue', referralCode: 'DEMO9999', coffeeStampGoal: 9, coffeeStampCount: 5, stampCount: 5, freeCoffeeRewards: 1, freeCoffeesEarned: 1 })
          .onConflictDoUpdate({ target: customerProfilesTable.userId, set: { coffeeStampGoal: 9, coffeeStampCount: 5, stampCount: 5, freeCoffeeRewards: 1 } });
      } else {
        await db.insert(customerProfilesTable)
          .values({ userId, loyaltyPoints: 150, loyaltyTier: 'silver', referralCode: 'DEMO1234' })
          .onConflictDoUpdate({ target: customerProfilesTable.userId, set: { loyaltyTier: 'silver' } });
      }
    } else if (demo.role === 'staff') {
      await db.insert(staffProfilesTable)
        .values({ userId, employeeId: 'EMP-DEMO-001', position: 'Senior Crew', department: 'floor', isManager: true, approvedByAdmin: true, hourlyRateCents: 2800 })
        .onConflictDoUpdate({ target: staffProfilesTable.userId, set: { approvedByAdmin: true } });
    } else if (demo.role === 'wholesale') {
      const [existingWholesale] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, userId));
      if (existingWholesale) {
        await db.update(wholesaleAccountsTable).set({ status: 'approved', isSuspended: false, suspendedReason: null }).where(eq(wholesaleAccountsTable.userId, userId));
      } else {
        await db.insert(wholesaleAccountsTable).values({
          id: randomUUID(), userId, companyName: 'Demo Wholesale Co.', abn: '12 345 678 901',
          contactName: demo.name, phone: '0400000000', status: 'approved',
        });
      }
    } else if (demo.role === 'director') {
      // Ensure director has a staff_profiles row with a known settings PIN (1234)
      const settingsPinHash = await bcrypt.hash('1234', 10);
      await db.execute(sql`
        INSERT INTO staff_profiles (user_id, employee_id, position, department, settings_pin_hash)
        VALUES (${userId}, ${'EMP-' + userId.slice(0,8).toUpperCase()}, 'Director', 'management', ${settingsPinHash})
        ON CONFLICT (user_id) DO UPDATE SET settings_pin_hash = ${settingsPinHash}
      `);
    } else if (demo.role === 'manager') {
      await db.insert(managerProfilesTable)
        .values({
          userId,
          permissions: JSON.stringify(['dashboard','orders','products','reports']),
          notes: 'Demo manager account',
        })
        .onConflictDoUpdate({ target: managerProfilesTable.userId, set: { permissions: JSON.stringify(['dashboard','orders','products','reports']) } });
    }
  }

  // ── Seed Merrylands store (idempotent) ────────────────────────────────────
  const MERRYLANDS_ID = '00000000-0000-0000-0000-000000000001';
  await db.insert(storesTable).values({
    id: MERRYLANDS_ID,
    name: 'Butterfield Cookies — Merrylands',
    slug: 'merrylands',
    address: '2 Main Lane',
    suburb: 'Merrylands',
    state: 'NSW',
    postcode: '2160',
    country: 'Australia',
    latitude: -33.8349,
    longitude: 150.9942,
    geofenceRadius: 100,
    phone: '0480 769 995',
    status: 'open',
    pickupAvailable: true,
    deliveryAvailable: false,
    sortOrder: 0,
  }).onConflictDoUpdate({
    target: storesTable.id,
    set: { name: 'Butterfield Cookies — Merrylands', status: 'open', updatedAt: new Date() },
  });

  // Mon–Sat 9 am – 5 pm, Sunday closed (idempotent: delete-then-insert only if no hours exist)
  const existingHours = await db.select().from(storeOpeningHoursTable)
    .where(eq(storeOpeningHoursTable.storeId, MERRYLANDS_ID));
  if (existingHours.length === 0) {
    const defaultHours = [
      { dayOfWeek: 0, isClosed: true,  openTime: null,    closeTime: null    },
      { dayOfWeek: 1, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 3, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 4, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 5, isClosed: false, openTime: '09:00', closeTime: '17:00' },
      { dayOfWeek: 6, isClosed: false, openTime: '09:00', closeTime: '17:00' },
    ];
    await db.insert(storeOpeningHoursTable).values(
      defaultHours.map(h => ({ id: randomUUID(), storeId: MERRYLANDS_ID, ...h }))
    );
  }

  // Clear any rate-limit buckets for demo accounts so tests can always log in cleanly
  const demoEmails = demos.map(d => d.email);
  for (const key of Array.from(rateLimitBuckets.keys())) {
    if (demoEmails.some(e => key.includes(e))) {
      rateLimitBuckets.delete(key);
    }
  }

  return res.json({
    message: `Demo accounts ready.`,
    created,
    existing,
    credentials: {
      password: DEMO_PW,
      accounts: [
        { email: 'customer@demo.com',  role: 'customer',  portal: 'Customer app' },
        { email: 'staff@demo.com',     role: 'staff',     portal: 'Staff portal (no geo restriction)' },
        { email: 'wholesale@demo.com', role: 'wholesale', portal: 'Wholesale portal' },
        { email: 'director@demo.com',  role: 'director',  portal: 'Director portal (full backend)' },
        { email: 'manager@demo.com',   role: 'manager',   portal: 'Manager portal (director-configured access)' },
      ],
    },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  await ensureStoreConfigSchemaReady();
  const user = req.user!;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser) return res.status(404).json({ error: 'User not found' });
  const accountError = accountSessionError(dbUser);
  if (accountError) return res.status(403).json(accountError);
  let profile = null;
  if (dbUser.role === 'customer') {
    const loyaltyProfile = await getOrCreateCustomerLoyaltyProfile(user.id, dbUser.name);
    const [customerProfile] = await db.select({
      preferredStoreId: customerProfilesTable.preferredStoreId,
    }).from(customerProfilesTable).where(eq(customerProfilesTable.userId, user.id));
    profile = {
      ...loyaltyProfile,
      preferredStoreId: customerProfile?.preferredStoreId ?? null,
    };
  } else if (dbUser.role === 'staff') {
    const [sp] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
    profile = sp;
  } else if (dbUser.role === 'wholesale') {
    const [wa] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, user.id));
    profile = wa;
  } else if (dbUser.role === 'manager') {
    const [mp] = await db.select().from(managerProfilesTable).where(eq(managerProfilesTable.userId, user.id));
    profile = mp;
  }
  let notifPrefs: Record<string, boolean> | null = null;
  if (dbUser.notificationPreferences) {
    try { notifPrefs = JSON.parse(dbUser.notificationPreferences); } catch {}
  }
  let managerPermissions: string[] | null = null;
  if (dbUser.role === 'manager' && profile) {
    try { managerPermissions = JSON.parse((profile as any).permissions ?? '[]'); } catch { managerPermissions = []; }
  }
  return res.json({
    user: { id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name, phone: dbUser.phone, profileImage: dbUser.profileImage, notificationPreferences: notifPrefs, managerPermissions },
    profile,
  });
});

// ── PATCH /me — update name, phone, profileImage, notification prefs ──────────
router.patch('/me', requireAuth, async (req, res) => {
  await ensureStoreConfigSchemaReady();
  const user = req.user!;
  const { name, phone, notificationPreferences, profileImage, preferredStoreId } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (profileImage !== undefined) updates.profileImage = profileImage ?? null;
  if (notificationPreferences !== undefined) {
    updates.notificationPreferences = typeof notificationPreferences === 'string'
      ? notificationPreferences
      : JSON.stringify(notificationPreferences);
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();

  let profile = null;
  if (updated.role === 'customer') {
    profile = await getOrCreateCustomerLoyaltyProfile(user.id, updated.name);
    if (preferredStoreId !== undefined) {
      if (preferredStoreId) {
        const [store] = await db.select({ id: storesTable.id }).from(storesTable).where(and(eq(storesTable.id, String(preferredStoreId)), isNull(storesTable.deletedAt)));
        if (!store) {
          return res.status(400).json({ error: 'Selected store could not be found.' });
        }
      }
      await db.update(customerProfilesTable)
        .set({
          preferredStoreId: preferredStoreId ? String(preferredStoreId) : null,
          updatedAt: new Date(),
        })
        .where(eq(customerProfilesTable.userId, user.id));
      profile = {
        ...profile,
        preferredStoreId: preferredStoreId ? String(preferredStoreId) : null,
      };
    }
  } else if (updated.role === 'staff') {
    const [sp] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
    profile = sp;
  } else if (updated.role === 'wholesale') {
    const [wa] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, user.id));
    profile = wa;
  }

  let notifPrefs: Record<string, boolean> | null = null;
  if (updated.notificationPreferences) {
    try { notifPrefs = JSON.parse(updated.notificationPreferences); } catch {}
  }

  return res.json({
    user: { id: updated.id, email: updated.email, role: updated.role, name: updated.name, phone: updated.phone, profileImage: updated.profileImage, notificationPreferences: notifPrefs },
    profile,
  });
});

router.post('/social', async (req, res) => {
  const { provider, accessToken, idToken } = req.body;

  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ error: 'provider is required.' });
  }

  let verifiedId: string;
  let verifiedEmail: string;
  let verifiedName: string | undefined;

  if (provider === 'google') {
    if (idToken && typeof idToken === 'string') {
      let googleUser: { sub: string; email: string; name?: string; email_verified?: string };
      try {
        const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (!r.ok) {
          return res.status(401).json({ error: 'Invalid or expired Google token.' });
        }
        googleUser = await r.json() as typeof googleUser;
      } catch {
        return res.status(502).json({ error: 'Could not reach Google to verify token.' });
      }

      if (!googleUser.email) {
        return res.status(401).json({ error: 'No email returned from Google.' });
      }
      if (googleUser.email_verified !== 'true') {
        return res.status(401).json({ error: 'Google account email is not verified.' });
      }

      verifiedId = googleUser.sub;
      verifiedEmail = googleUser.email.toLowerCase();
      verifiedName = googleUser.name;
    } else if (accessToken && typeof accessToken === 'string') {
      // Backward-compatible path for older clients still sending a Google access token.
      let googleUserRes: Response;
      try {
        googleUserRes = await fetch('https://www.googleapis.com/userinfo/v2/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        return res.status(502).json({ error: 'Could not reach Google to verify token.' });
      }
      if (!googleUserRes.ok) {
        return res.status(401).json({ error: 'Google token verification failed.' });
      }
      const gUser = (await googleUserRes.json()) as Record<string, unknown>;
      if (typeof gUser.id !== 'string' || !gUser.id || typeof gUser.email !== 'string' || !gUser.email) {
        return res.status(401).json({ error: 'Google token did not return valid identity claims.' });
      }
      verifiedId = gUser.id;
      verifiedEmail = gUser.email.toLowerCase();
      verifiedName = typeof gUser.name === 'string' ? gUser.name : undefined;
    } else {
      return res.status(400).json({ error: 'Google sign-in requires an idToken.' });
    }

  } else if (provider === 'apple') {
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Apple sign-in requires an idToken.' });
    }
    // Verify Apple identity token (signed JWT) using Apple's published JWKS
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      return res.status(401).json({ error: 'Malformed Apple identity token.' });
    }
    let header: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      return res.status(401).json({ error: 'Malformed Apple identity token header.' });
    }
    let jwks: { keys: Record<string, unknown>[] };
    try {
      const jwksRes = await fetch('https://appleid.apple.com/auth/keys');
      if (!jwksRes.ok) throw new Error('JWKS fetch failed');
      jwks = (await jwksRes.json()) as { keys: Record<string, unknown>[] };
    } catch {
      return res.status(502).json({ error: 'Could not reach Apple to verify token.' });
    }
    const jwk = jwks.keys.find(k => k.kid === header.kid);
    if (!jwk) {
      return res.status(401).json({ error: 'Apple identity token key not found.' });
    }
    let applePayload: Record<string, unknown>;
    try {
      const { createPublicKey } = await import('crypto');
      const pubKey = createPublicKey({ key: jwk as unknown as { kty: string }, format: 'jwk' });
      const pem = pubKey.export({ type: 'spki', format: 'pem' }) as string;
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
      };
      // Bind to this app's bundle ID / service ID when configured
      const appleAud = process.env.APPLE_BUNDLE_ID;
      if (appleAud) verifyOptions.audience = appleAud;
      applePayload = jwt.verify(idToken, pem, verifyOptions) as Record<string, unknown>;
    } catch {
      return res.status(401).json({ error: 'Apple identity token verification failed.' });
    }
    if (typeof applePayload.sub !== 'string' || !applePayload.sub) {
      return res.status(401).json({ error: 'Apple token missing subject claim.' });
    }
    verifiedId    = applePayload.sub;
    verifiedEmail = typeof applePayload.email === 'string' ? applePayload.email.toLowerCase() : '';
    verifiedName  = undefined;

  } else {
    return res.status(400).json({ error: 'Unsupported provider. Supported: google, apple.' });
  }

  let user: typeof usersTable.$inferSelect | null = null;

  // Look up by verified provider ID first
  const [byProvider] = await db.select().from(usersTable)
    .where(and(eq(usersTable.socialProvider, provider), eq(usersTable.socialId, verifiedId)));
  user = byProvider ?? null;
  if (user && user.role !== 'customer') {
    return res.status(403).json({
      error: 'This account uses internal sign-in. Please use the appropriate account sign-in option.',
      code: 'WRONG_PORTAL',
    });
  }

  // If no match by provider ID, look up by verified email
  if (!user && verifiedEmail) {
    const [byEmail] = await db.select().from(usersTable)
      .where(eq(usersTable.email, verifiedEmail));
    user = byEmail ?? null;
    if (user) {
      if (user.role !== 'customer') {
        return res.status(403).json({
          error: 'This account uses internal sign-in. Please use the appropriate account sign-in option.',
          code: 'WRONG_PORTAL',
        });
      }
      // Bind the verified provider ID to the existing account
      await db.update(usersTable)
        .set({ socialProvider: provider, socialId: verifiedId })
        .where(eq(usersTable.id, user.id));
    }
  }

  // Create a new customer account if no existing user found
  if (!user) {
    if (!verifiedEmail) return res.status(400).json({ error: 'Email required to create a new account.' });
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    const userName = verifiedName?.trim() || verifiedEmail.split('@')[0];
    await db.insert(usersTable).values({
      id: userId,
      email: verifiedEmail,
      passwordHash,
      role: 'customer',
      name: userName,
      socialProvider: provider,
      socialId: verifiedId,
    });
    await db.insert(customerProfilesTable).values({
      userId,
      loyaltyPoints: 0,
      loyaltyTier: 'blue',
      referralCode: generateReferralCode(userName),
      coffeeStampGoal: getCoffeeStampGoalForNewUser(),
    });
    await getOrCreateCustomerLoyaltyProfile(userId, userName);
    const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    user = newUser ?? null;
  }

  if (!user) return res.status(500).json({ error: 'Failed to resolve user.' });

  const accountError = accountSessionError(user);
  if (accountError) {
    res.status(403).json(accountError);
    return;
  }
  await getOrCreateCustomerLoyaltyProfile(user.id, user.name);
  const credentials = await issueSessionCredentials(sessionUser(user));
  return res.json({ token: credentials.token, refreshToken: credentials.refreshToken, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

// ── Password reset ────────────────────────────────────────────────────────────

const RESET_SECRET = `${getSessionSecret()}:reset`;

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

router.post('/forgot-password', resetRequestRateLimit, async (req, res) => {
  const { email, phone, method } = req.body as { email?: string; phone?: string; method?: 'email' | 'sms' };
  const deliveryMethod = method === 'sms' ? 'sms' : 'email';

  // Validate input
  if (deliveryMethod === 'email') {
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required.' });
    }
  } else {
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
  }

  // Lookup user by email or phone
  let user: { id: string; name: string; email: string; phone: string | null; status: string | null } | undefined;
  if (deliveryMethod === 'email') {
    const normalised = email!.toLowerCase().trim();
    const [found] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.email, normalised));
    user = found;
  } else {
    const normalised = phone!.trim().replace(/\s+/g, '');
    const [found] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, status: usersTable.status })
      .from(usersTable).where(eq(usersTable.phone, normalised));
    user = found;
  }

  // Masked destination for UI feedback (always respond with success to prevent enumeration)
  const destination = deliveryMethod === 'email'
    ? maskEmail(email!)
    : maskPhone(phone!);

  if (!user) {
    return res.json({ success: true, message: 'If an account with those details exists, a reset code has been sent.', destination });
  }

  // Purge old tokens for this user
  await db.delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, user.id));

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  // Pending (table-enrolled) accounts get a 7-day setup code; everyone else gets 15 minutes
  const isPending = user.status === 'pending';
  const expiresAt = isPending
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({
    id: randomUUID(),
    userId: user.id,
    otpHash,
    expiresAt,
  });

  const isDev = process.env.NODE_ENV !== 'production';
  let sent = false;

  if (deliveryMethod === 'sms') {
    const smsResult = await sendSms(
      user.phone ?? phone!,
      buildPasswordResetSms(otp),
    );
    sent = smsResult.success;
  } else if (isPending) {
    // Pending accounts: send the branded table-account setup email (7-day code)
    const html = buildTableAccountSetupEmail({ name: user.name, otp, logoUrl: '' });
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Your Butterfield account setup code',
      html,
      text: `Your Butterfield account setup code is: ${otp}\n\nThis code is valid for 7 days.\n\nDownload the Butterfield app, tap "Forgot password?" on the sign-in screen, enter your email and this code, then choose a new password.\n\nIf you didn't request this, you can safely ignore this email.`,
    });
    sent = emailResult.success;
  } else {
    const html = buildPasswordResetEmail(otp, user.name);
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Your Butterfield Cookies password reset code',
      html,
      text: `Your password reset code is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, ignore this message.`,
    });
    sent = emailResult.success;
  }

  // In dev (no service configured), return OTP in response so it can be pre-filled
  const devOtp = (!sent && isDev) ? otp : undefined;

  return res.json({
    success: true,
    message: `If an account with those details exists, a reset code has been sent.`,
    destination,
    method: deliveryMethod,
    ...(devOtp ? { devOtp } : {}),
  });
});

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

router.post('/verify-reset-otp', resetVerifyRateLimit, async (req, res) => {
  const { email, phone, otp } = req.body as { email?: string; phone?: string; otp: string };
  if (!otp) return res.status(400).json({ error: 'Code is required.' });
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone is required.' });

  let user: { id: string; name: string } | undefined;
  if (email) {
    const normalised = email.toLowerCase().trim();
    const [found] = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.email, normalised));
    user = found;
  } else {
    const normalised = phone!.trim().replace(/\s+/g, '');
    const [found] = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.phone, normalised));
    user = found;
  }
  if (!user) return res.status(400).json({ error: 'Invalid or expired code.' });

  const now = new Date();
  const [token] = await db.select().from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.userId, user.id),
        isNull(passwordResetTokensTable.usedAt),
      )
    );

  if (!token || token.expiresAt < now) {
    return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
  }

  const valid = await bcrypt.compare(String(otp), token.otpHash);
  if (!valid) return res.status(400).json({ error: 'Incorrect code. Please try again.' });

  // Mark as used
  await db.update(passwordResetTokensTable)
    .set({ usedAt: now })
    .where(eq(passwordResetTokensTable.id, token.id));

  // Issue a short-lived reset JWT (15 min)
  const resetToken = jwt.sign(
    { sub: user.id, purpose: 'password_reset' },
    RESET_SECRET,
    { expiresIn: '15m' }
  );

  return res.json({ resetToken });
});

router.post('/reset-password', resetPasswordRateLimit, async (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'Reset token and new password are required.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  let payload: { sub: string; purpose: string };
  try {
    payload = jwt.verify(resetToken, RESET_SECRET) as any;
  } catch {
    return res.status(400).json({ error: 'Reset link has expired. Please start over.' });
  }

  if (payload.purpose !== 'password_reset') {
    return res.status(400).json({ error: 'Invalid reset token.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Also activate the account if it was created as 'pending' (e.g. via table ordering)
  const [userRow] = await db.select({ status: usersTable.status })
    .from(usersTable).where(eq(usersTable.id, payload.sub));

  await db.update(usersTable)
    .set({
      passwordHash,
      ...(userRow?.status === 'pending' ? { status: 'active' } : {}),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, payload.sub));

  return res.json({ success: true, message: 'Password updated successfully.' });
});

// ── Staff invite: validate token (public) ──────────────────────────────────
router.get('/validate-staff-invite', async (req, res) => {
  const { token } = req.query as { token?: string };
  if (!token) return res.status(400).json({ error: 'Token is required.' });
  const [row] = await db.select().from(staffInviteTokensTable)
    .where(eq(staffInviteTokensTable.token, token.trim().toUpperCase()));
  if (!row) return res.status(404).json({ error: 'Invalid invite code.' });
  if (row.usedAt) return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date() > row.expiresAt) return res.status(410).json({ error: 'This invite has expired.' });
  return res.json({ valid: true, note: row.note ?? null });
});

// ── Staff register with invite token (public) ───────────────────────────────
router.post('/staff-register', async (req, res) => {
  const { token, name, email, password, phone, position, department, address, dateOfBirth, taxFileNumber, emergencyContact, storeId } = req.body;
  if (!token || !name?.trim() || !email?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Invite code, name, email and password are required.' });
  }
  if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required.' });
  if (!address?.trim()) return res.status(400).json({ error: 'Address is required.' });
  if (!dateOfBirth?.trim()) return res.status(400).json({ error: 'Date of birth is required.' });
  if (!storeId?.trim()) return res.status(400).json({ error: 'Please select the store this team member will work in.' });
  // Validate token
  const [invite] = await db.select().from(staffInviteTokensTable)
    .where(eq(staffInviteTokensTable.token, String(token).trim().toUpperCase()));
  if (!invite) return res.status(404).json({ error: 'Invalid invite code.' });
  if (invite.usedAt) return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date() > invite.expiresAt) return res.status(410).json({ error: 'This invite has expired.' });

  const [store] = await db.select({
    id: storesTable.id,
    name: storesTable.name,
  }).from(storesTable).where(and(
    eq(storesTable.id, String(storeId).trim()),
    isNull(storesTable.deletedAt),
  ));
  if (!store) {
    return res.status(400).json({ error: 'The selected store could not be found.' });
  }

  // Check email uniqueness
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });

  // Create user + staff profile
  const hash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const empId = `EMP-${Date.now().toString(36).toUpperCase()}`;
  await db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id: userId,
      email: email.toLowerCase().trim(),
      passwordHash: hash,
      role: 'staff' as any,
      name: name.trim(),
      phone: phone?.trim() ?? null,
    });
    await tx.insert(staffProfilesTable).values({
      userId,
      employeeId: empId,
      position: position?.trim() ?? 'Crew',
      department: department?.trim() ?? 'floor',
      isManager: false,
      approvedByAdmin: false,
      hourlyRateCents: 0,
      address: address?.trim() ?? null,
      dateOfBirth: dateOfBirth?.trim() ?? null,
      taxFileNumber: taxFileNumber?.trim() ?? null,
      emergencyContact: emergencyContact ? JSON.stringify(emergencyContact) : null,
    });
    await tx.insert(staffStoreAssignmentsTable).values({
      id: randomUUID(),
      staffId: userId,
      storeId: store.id,
      isPrimary: true,
      isActive: true,
    });
    await tx.update(staffInviteTokensTable)
      .set({ usedAt: new Date(), usedByUserId: userId })
      .where(eq(staffInviteTokensTable.id, invite.id));
  });

  return res.status(201).json({
    success: true,
    message: `Application submitted for ${store.name}. You will be able to log in once a director approves your account.`,
    employeeId: empId,
  });
});

// ── Account deletion (GDPR / App Store requirement) ────────────────────────
router.delete('/account', requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const [user] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (DEMO_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'Demo accounts cannot be deleted.' });
  }
  // Remove personal data in dependency order
  try { await db.delete(loyaltyTransactionsTable).where(eq(loyaltyTransactionsTable.userId, userId)); } catch {}
  try { await db.delete(favouritesTable).where(eq(favouritesTable.userId, userId)); } catch {}
  try { await db.delete(customerProfilesTable).where(eq(customerProfilesTable.userId, userId)); } catch {}
  // Anonymise the user row (keeps order FK references intact for business records)
  const anon = `deleted-${randomUUID()}@deleted.invalid`;
  await db.update(usersTable)
    .set({ email: anon, name: 'Deleted User', phone: null, passwordHash: '', updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
  return res.json({ success: true, message: 'Account deleted.' });
});

// ── Logout (records audit event; JWT is stateless so token is discarded client-side) ──
router.post('/logout', requireAuth, async (req, res) => {
  const user = req.user!;
  recordLoginHistory({ userId: user.id, email: user.email, role: user.role, success: true, failReason: null, req });
  recordAuditLog({ actor: { id: user.id, email: user.email, role: user.role, name: user.name ?? '' }, action: 'auth.logout', entityType: 'user', entityId: user.id }).catch(() => {});
  return res.json({ success: true });
});

export default router;
