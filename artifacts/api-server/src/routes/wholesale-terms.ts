import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, wholesaleTermsAcceptancesTable, wholesaleSecurityEventsTable, wholesaleAccountsTable } from '@workspace/db';
import { eq, desc, and, gte, lte, or, like, sql } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const WHOLESALE_TERMS_VERSION = '2026-06-24-v1';

const wholesaleTermsRouter = Router();
const directorWholesaleSecurityRouter = Router();

// ── WHOLESALE: check if current user has accepted latest terms ────────────────
wholesaleTermsRouter.get('/terms/status', requireRole('wholesale'), async (req, res) => {
  const userId = req.user!.id;
  const [row] = await db
    .select({ termsVersion: wholesaleTermsAcceptancesTable.termsVersion })
    .from(wholesaleTermsAcceptancesTable)
    .where(eq(wholesaleTermsAcceptancesTable.userId, userId))
    .orderBy(desc(wholesaleTermsAcceptancesTable.acceptedAt))
    .limit(1);

  const accepted = row?.termsVersion === WHOLESALE_TERMS_VERSION;
  res.json({ accepted, currentVersion: WHOLESALE_TERMS_VERSION, acceptedVersion: row?.termsVersion ?? null });
});

// ── WHOLESALE: accept terms ───────────────────────────────────────────────────
wholesaleTermsRouter.post('/terms/accept', requireRole('wholesale'), async (req, res) => {
  const userId = req.user!.id;
  const { devicePlatform, appVersion } = req.body ?? {};

  const [account] = await db
    .select({ id: wholesaleAccountsTable.id, companyName: wholesaleAccountsTable.companyName, email: wholesaleAccountsTable.email })
    .from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.userId, userId));

  const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null;

  await db.insert(wholesaleTermsAcceptancesTable).values({
    id:             randomUUID(),
    userId,
    businessId:     account?.id ?? null,
    businessName:   account?.companyName ?? null,
    contactName:    req.user!.name ?? null,
    email:          req.user!.email ?? account?.email ?? null,
    termsVersion:   WHOLESALE_TERMS_VERSION,
    acceptedAt:     new Date(),
    devicePlatform: devicePlatform ?? null,
    appVersion:     appVersion ?? null,
    ipAddress,
  });

  await db.insert(wholesaleSecurityEventsTable).values({
    id:             randomUUID(),
    userId,
    businessId:     account?.id ?? null,
    businessName:   account?.companyName ?? null,
    email:          req.user!.email ?? account?.email ?? null,
    eventType:      'wholesale_terms_accepted',
    screenName:     'WholesaleTerms',
    termsVersion:   WHOLESALE_TERMS_VERSION,
    devicePlatform: devicePlatform ?? null,
    appVersion:     appVersion ?? null,
    metadata:       { ipAddress },
  });

  res.json({ success: true, termsVersion: WHOLESALE_TERMS_VERSION });
});

// ── WHOLESALE: log a security event ──────────────────────────────────────────
wholesaleTermsRouter.post('/security/event', requireRole('wholesale'), async (req, res) => {
  const userId = req.user!.id;
  const { eventType, screenName, termsVersion, pricingVersion, devicePlatform, appVersion, metadata } = req.body ?? {};

  if (!eventType || !screenName) {
    res.status(400).json({ error: 'eventType and screenName are required' });
    return;
  }

  const [account] = await db
    .select({ id: wholesaleAccountsTable.id, companyName: wholesaleAccountsTable.companyName })
    .from(wholesaleAccountsTable)
    .where(eq(wholesaleAccountsTable.userId, userId));

  await db.insert(wholesaleSecurityEventsTable).values({
    id:             randomUUID(),
    userId,
    businessId:     account?.id ?? null,
    businessName:   account?.companyName ?? null,
    email:          req.user!.email ?? null,
    eventType,
    screenName,
    termsVersion:   termsVersion ?? null,
    pricingVersion: pricingVersion ?? null,
    devicePlatform: devicePlatform ?? null,
    appVersion:     appVersion ?? null,
    metadata:       metadata ?? null,
  });

  res.json({ success: true });
});

// ── DIRECTOR: list security events ───────────────────────────────────────────
directorWholesaleSecurityRouter.get('/wholesale-security/events', requireRole('director', 'manager', 'master'), async (req, res) => {
  const { eventType, businessName, from, to, limit: limitParam } = req.query;
  const limit = Math.min(parseInt(limitParam as string) || 100, 500);

  const conditions = [];
  if (eventType)    conditions.push(eq(wholesaleSecurityEventsTable.eventType, eventType as string));
  if (businessName) conditions.push(like(wholesaleSecurityEventsTable.businessName, `%${businessName}%`));
  if (from)         conditions.push(gte(wholesaleSecurityEventsTable.createdAt, new Date(from as string)));
  if (to)           conditions.push(lte(wholesaleSecurityEventsTable.createdAt, new Date(to as string)));

  const rows = await db
    .select()
    .from(wholesaleSecurityEventsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wholesaleSecurityEventsTable.createdAt))
    .limit(limit);

  res.json({ data: rows });
});

// ── DIRECTOR: list terms acceptances ─────────────────────────────────────────
directorWholesaleSecurityRouter.get('/wholesale-security/acceptances', requireRole('director', 'manager', 'master'), async (req, res) => {
  const rows = await db
    .select()
    .from(wholesaleTermsAcceptancesTable)
    .orderBy(desc(wholesaleTermsAcceptancesTable.acceptedAt))
    .limit(200);

  res.json({ data: rows });
});

export { wholesaleTermsRouter, directorWholesaleSecurityRouter };
