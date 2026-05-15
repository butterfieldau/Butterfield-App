/**
 * Wallet pass endpoints — Apple Wallet (.pkpass) and Google Wallet (JWT save URL).
 *
 * Required env vars for Apple Wallet:
 *   APPLE_PASS_TYPE_ID         e.g. pass.com.butterfieldcookies.loyalty
 *   APPLE_TEAM_ID              10-char Apple team ID
 *   APPLE_PASS_CERT_PEM        base64-encoded PEM certificate (Pass Type ID cert)
 *   APPLE_PASS_KEY_PEM         base64-encoded PEM private key
 *   APPLE_PASS_KEY_PASSPHRASE  passphrase for private key (can be empty string)
 *   APPLE_WWDR_CERT_PEM        base64-encoded Apple WWDR G4 PEM (public cert)
 *
 * Required env vars for Google Wallet:
 *   GOOGLE_WALLET_ISSUER_ID           Issuer ID from Google Pay & Wallet console
 *   GOOGLE_WALLET_CLASS_ID            Loyalty class ID (created automatically)
 *   GOOGLE_WALLET_SERVICE_ACCOUNT_JSON  base64-encoded service account JSON
 */

import { Router } from 'express';
import { db, customerProfilesTable, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { deflateSync } from 'zlib';
import { execFileSync, execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import { requireAuth } from '../middlewares/auth.js';
import { getOrCreateCustomerLoyaltyProfile, buildLoyaltyQrPayload } from '../lib/loyaltyIdentity.js';

const router = Router();

const STAMP_GOAL = 6;

// ── Apple Wallet config ─────────────────────────────────────────────────────
const APPLE_PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID ?? '';
const APPLE_TEAM_ID      = process.env.APPLE_TEAM_ID ?? '';
const APPLE_CERT_PEM     = process.env.APPLE_PASS_CERT_PEM
  ? Buffer.from(process.env.APPLE_PASS_CERT_PEM, 'base64').toString()
  : '';
const APPLE_KEY_PEM      = process.env.APPLE_PASS_KEY_PEM
  ? Buffer.from(process.env.APPLE_PASS_KEY_PEM, 'base64').toString()
  : '';
const APPLE_KEY_PASS     = process.env.APPLE_PASS_KEY_PASSPHRASE ?? '';
const APPLE_WWDR_PEM     = process.env.APPLE_WWDR_CERT_PEM
  ? Buffer.from(process.env.APPLE_WWDR_CERT_PEM, 'base64').toString()
  : '';

// ── Google Wallet config ────────────────────────────────────────────────────
const GOOGLE_ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID ?? '';
const GOOGLE_CLASS_ID  = process.env.GOOGLE_WALLET_CLASS_ID ?? 'butterfield_loyalty';
let googleSA: { client_email: string; private_key: string } | null = null;
if (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON) {
  try {
    googleSA = JSON.parse(
      Buffer.from(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON, 'base64').toString(),
    );
  } catch {
    googleSA = null;
  }
}

// ── JWT secret (re-use app secret) ─────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET ?? 'butterfield-dev-only-not-for-production';

// ── In-memory device registration store ─────────────────────────────────────
// Map: deviceId → Map: passTypeId → Set of serialNumbers (userIds)
// Lost on restart — iOS will re-register on next wallet open. Fine for MVP.
const deviceMap = new Map<string, Map<string, Set<string>>>();
// Map: serialNumber (userId) → ISO timestamp of last profile update
const passUpdatedAt = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function appleReady(): boolean {
  return !!(APPLE_PASS_TYPE_ID && APPLE_TEAM_ID && APPLE_CERT_PEM && APPLE_KEY_PEM && APPLE_WWDR_PEM);
}
function googleReady(): boolean {
  return !!(GOOGLE_ISSUER_ID && googleSA);
}

function publicBaseUrl(): string {
  if (process.env.BUTTERFIELD_PUBLIC_URL) return process.env.BUTTERFIELD_PUBLIC_URL.replace(/\/$/, '');
  const domains = process.env.REPLIT_DOMAINS ?? process.env.EXPO_PUBLIC_DOMAIN ?? '';
  const first = domains.split(',')[0]?.trim();
  return first ? `https://${first}` : 'http://localhost:80';
}

// ── Minimal PNG generator (pure Node, no native deps) ────────────────────────
function crc32(buf: Buffer): number {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ t[(crc ^ buf[i]) & 0xff];
  return ((crc ^ 0xffffffff) >>> 0);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

function makePng(w: number, h: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const row = 1 + w * 3;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      raw[y * row + 1 + x * 3] = r;
      raw[y * row + 2 + x * 3] = g;
      raw[y * row + 3 + x * 3] = b;
    }
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Sky-blue brand colour images, generated once at startup
const BRAND_R = 64; const BRAND_G = 192; const BRAND_B = 242;
const PASS_IMAGES: Record<string, Buffer> = {
  'icon.png':     makePng(29,  29,  BRAND_R, BRAND_G, BRAND_B),
  'icon@2x.png':  makePng(58,  58,  BRAND_R, BRAND_G, BRAND_B),
  'icon@3x.png':  makePng(87,  87,  BRAND_R, BRAND_G, BRAND_B),
  'logo.png':     makePng(160, 50,  BRAND_R, BRAND_G, BRAND_B),
  'logo@2x.png':  makePng(320, 100, BRAND_R, BRAND_G, BRAND_B),
  'strip.png':    makePng(375, 98,  BRAND_R, BRAND_G, BRAND_B),
  'strip@2x.png': makePng(750, 196, BRAND_R, BRAND_G, BRAND_B),
};

// ── Pass JSON builder ────────────────────────────────────────────────────────
function buildPassJson(userId: string, p: {
  customerName: string;
  stamps: number;
  freeCoffeeRewards: number;
  loyaltyPoints: number;
  tier: string;
  qrPayload: string;
  authToken: string;
}): Record<string, unknown> {
  const tierLabel = p.tier.charAt(0).toUpperCase() + p.tier.slice(1);
  return {
    formatVersion:         1,
    passTypeIdentifier:    APPLE_PASS_TYPE_ID,
    serialNumber:          userId,
    teamIdentifier:        APPLE_TEAM_ID,
    organizationName:      'Butterfield Cookies',
    description:           'Butterfield Coffee Club loyalty card',
    logoText:              'Butterfield',
    webServiceURL:         `${publicBaseUrl()}/api/wallet/`,
    authenticationToken:   p.authToken,
    backgroundColor:       'rgb(20,147,255)',
    foregroundColor:       'rgb(255,255,255)',
    labelColor:            'rgb(255,255,255)',
    storeCard: {
      primaryFields: [
        { key: 'points', label: 'POINTS', value: p.loyaltyPoints.toLocaleString() },
      ],
      secondaryFields: [
        { key: 'stamps', label: 'COFFEE STAMPS', value: `${p.stamps} of ${STAMP_GOAL}` },
        { key: 'tier',   label: 'TIER',           value: tierLabel },
      ],
      auxiliaryFields: [
        {
          key:           'freecoffees',
          label:         'FREE COFFEES',
          value:         String(p.freeCoffeeRewards),
          changeMessage: 'You now have %@ free coffees to redeem!',
        },
      ],
      backFields: [
        { key: 'member',   label: 'Member Name', value: p.customerName },
        { key: 'howto',    label: 'Collect Stamps', value: 'Ask any Butterfield team member to scan your QR code after every coffee purchase.' },
        { key: 'redeem',   label: 'Redeem Free Coffee', value: 'Show your Wallet QR code at the counter and ask staff to redeem your free coffee.' },
        { key: 'website',  label: 'Website', value: 'butterfieldcookies.com.au' },
      ],
    },
    barcodes: [{ message: p.qrPayload, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' }],
    barcode:  { message: p.qrPayload, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
  };
}

// ── pkpass builder ───────────────────────────────────────────────────────────
async function buildPkpass(passJson: Record<string, unknown>): Promise<Buffer> {
  const files: Record<string, Buffer> = {
    'pass.json': Buffer.from(JSON.stringify(passJson)),
    ...PASS_IMAGES,
  };

  // SHA1 manifest
  const manifest: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = createHash('sha1').update(buf).digest('hex');
  }
  const manifestBuf = Buffer.from(JSON.stringify(manifest));

  // CMS signature via openssl subprocess
  const tmp = mkdtempSync(join(tmpdir(), 'pkpass-'));
  let signature: Buffer;
  try {
    writeFileSync(join(tmp, 'manifest.json'), manifestBuf);
    writeFileSync(join(tmp, 'cert.pem'),      APPLE_CERT_PEM);
    writeFileSync(join(tmp, 'key.pem'),       APPLE_KEY_PEM);
    writeFileSync(join(tmp, 'wwdr.pem'),      APPLE_WWDR_PEM);
    writeFileSync(join(tmp, 'pp.txt'),        APPLE_KEY_PASS);

    execFileSync('openssl', [
      'smime', '-sign',
      '-in',       join(tmp, 'manifest.json'),
      '-signer',   join(tmp, 'cert.pem'),
      '-inkey',    join(tmp, 'key.pem'),
      '-passin',   `file:${join(tmp, 'pp.txt')}`,
      '-certfile', join(tmp, 'wwdr.pem'),
      '-out',      join(tmp, 'signature'),
      '-outform',  'DER',
      '-nodetach',
      '-binary',
    ], { stdio: 'pipe' });

    signature = readFileSync(join(tmp, 'signature'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // Build ZIP
  const zip = new JSZip();
  for (const [name, buf] of Object.entries(files)) zip.file(name, buf);
  zip.file('manifest.json', manifestBuf);
  zip.file('signature', signature);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

// ── Google Wallet URL builder ─────────────────────────────────────────────────
function buildGoogleWalletUrl(userId: string, p: {
  customerName: string;
  stamps: number;
  freeCoffeeRewards: number;
  loyaltyPoints: number;
  tier: string;
  qrPayload: string;
}): string {
  if (!googleSA) throw new Error('Google Wallet not configured');
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const objectId = `${GOOGLE_ISSUER_ID}.butterfield-${safeId}`;
  const classResourceId = `${GOOGLE_ISSUER_ID}.${GOOGLE_CLASS_ID}`;
  const tierLabel = p.tier.charAt(0).toUpperCase() + p.tier.slice(1);

  const loyaltyObject = {
    id:        objectId,
    classId:   classResourceId,
    state:     'ACTIVE',
    accountId: userId,
    accountName: p.customerName,
    loyaltyPoints: {
      balance: { int: p.loyaltyPoints },
      label:   'Points',
    },
    secondaryLoyaltyPoints: {
      balance: { string: `${p.stamps}/${STAMP_GOAL} stamps` },
      label:   'Coffee Club',
    },
    textModulesData: [
      { id: 'tier',       header: 'Loyalty Tier',  body: tierLabel },
      { id: 'freecoffee', header: 'Free Coffees',  body: String(p.freeCoffeeRewards) },
    ],
    barcode: {
      type:          'QR_CODE',
      value:         p.qrPayload,
      alternateText: 'Butterfield Loyalty QR',
    },
  };

  const payload = {
    iss:     googleSA!.client_email,
    aud:     'google',
    typ:     'savetowallet',
    iat:     Math.floor(Date.now() / 1000),
    payload: { loyaltyObjects: [loyaltyObject] },
  };

  const token = jwt.sign(payload, googleSA!.private_key, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

// ── Shared: load profile ─────────────────────────────────────────────────────
async function loadProfile(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const profile = await getOrCreateCustomerLoyaltyProfile(userId, user?.name ?? 'Member');
  const qrPayload = buildLoyaltyQrPayload(profile.loyaltyQrToken) ?? `BUTTERFIELD:${userId}`;
  const stamps = Math.min(profile.coffeeStampCount ?? profile.stampCount ?? 0, STAMP_GOAL);
  return {
    customerName:      user?.name ?? 'Butterfield Member',
    stamps,
    freeCoffeeRewards: profile.freeCoffeeRewards ?? 0,
    loyaltyPoints:     profile.loyaltyPoints ?? 0,
    tier:              profile.loyaltyTier ?? 'bronze',
    qrPayload,
    loyaltyQrToken:    profile.loyaltyQrToken ?? '',
    updatedAt:         profile.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Download token — short-lived JWT that avoids putting bearer token in URL
// ══════════════════════════════════════════════════════════════════════════════
router.post('/wallet/download-token', requireAuth, (_req, res) => {
  const token = jwt.sign(
    { userId: _req.user!.id, purpose: 'wallet-dl' },
    JWT_SECRET,
    { expiresIn: '10m' },
  );
  return res.json({ data: { token, expiresIn: 600 } });
});

// ══════════════════════════════════════════════════════════════════════════════
// Apple Wallet — GET /wallet/apple-pass.pkpass?dt={downloadToken}
// ══════════════════════════════════════════════════════════════════════════════
router.get('/wallet/apple-pass.pkpass', async (req, res) => {
  if (!appleReady()) {
    return res.status(503).json({
      error: 'Apple Wallet not configured',
      setup: 'Set APPLE_PASS_TYPE_ID, APPLE_TEAM_ID, APPLE_PASS_CERT_PEM, APPLE_PASS_KEY_PEM, APPLE_WWDR_CERT_PEM environment variables.',
    });
  }

  // Verify download token from query param
  const dt = req.query['dt'] as string | undefined;
  if (!dt) return res.status(401).json({ error: 'Missing download token' });

  let userId: string;
  try {
    const payload = jwt.verify(dt, JWT_SECRET) as { userId: string; purpose: string };
    if (payload.purpose !== 'wallet-dl') throw new Error('wrong purpose');
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired download token' });
  }

  try {
    const p = await loadProfile(userId);
    const passJson = buildPassJson(userId, { ...p, authToken: p.loyaltyQrToken || userId });
    const pkpass   = await buildPkpass(passJson);

    // Record that this pass was just generated (for webservice polling)
    passUpdatedAt.set(userId, p.updatedAt);

    res.set({
      'Content-Type':        'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="butterfield-loyalty.pkpass"',
      'Content-Length':      String(pkpass.length),
    });
    return res.send(pkpass);
  } catch (err: any) {
    req.log?.error({ err }, 'wallet: failed to build pkpass');
    return res.status(500).json({ error: 'Failed to generate pass. Check server logs.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Google Wallet — GET /wallet/google-pass-url
// ══════════════════════════════════════════════════════════════════════════════
router.get('/wallet/google-pass-url', requireAuth, async (req, res) => {
  if (!googleReady()) {
    return res.status(503).json({
      error: 'Google Wallet not configured',
      setup: 'Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CLASS_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_JSON environment variables.',
    });
  }

  try {
    const p   = await loadProfile(req.user!.id);
    const url = buildGoogleWalletUrl(req.user!.id, p);
    return res.json({ data: { url } });
  } catch (err: any) {
    req.log?.error({ err }, 'wallet: failed to build google pass url');
    return res.status(500).json({ error: err.message ?? 'Failed to generate Google Wallet URL' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Apple Wallet Webservice — pass auto-refresh when customer opens Wallet app
// https://developer.apple.com/documentation/walletpasses/add_a_web_service_to_update_passes
// ══════════════════════════════════════════════════════════════════════════════

// Middleware: verify ApplePass auth token header
function requireApplePass(req: any, res: any, next: any) {
  const h = req.headers['authorization'] as string | undefined;
  if (!h?.startsWith('ApplePass ')) {
    return res.sendStatus(401);
  }
  req.applePassToken = h.slice('ApplePass '.length);
  next();
}

// POST /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
// Called by iOS to register a device for push updates.
router.post(
  '/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber',
  requireApplePass,
  async (req, res) => {
    const { deviceId, passTypeId, serialNumber: userId } = req.params;
    const pushToken = req.body?.pushToken as string | undefined;

    // Verify the auth token matches this user's loyaltyQrToken
    const [profile] = await db.select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, userId))
      .limit(1);
    if (!profile || profile.loyaltyQrToken !== (req as any).applePassToken) {
      return res.sendStatus(401);
    }

    // Store registration
    if (!deviceMap.has(deviceId)) deviceMap.set(deviceId, new Map());
    const typeMap = deviceMap.get(deviceId)!;
    if (!typeMap.has(passTypeId)) typeMap.set(passTypeId, new Set());
    const serials = typeMap.get(passTypeId)!;
    const isNew = !serials.has(userId);
    serials.add(userId);

    // Seed the pass updated-at if not already known
    if (!passUpdatedAt.has(userId)) {
      passUpdatedAt.set(userId, profile.updatedAt?.toISOString() ?? new Date().toISOString());
    }

    return res.sendStatus(isNew ? 201 : 200);
  },
);

// DELETE /wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber
router.delete(
  '/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serialNumber',
  requireApplePass,
  async (req, res) => {
    const { deviceId, passTypeId, serialNumber: userId } = req.params;
    deviceMap.get(deviceId)?.get(passTypeId)?.delete(userId);
    return res.sendStatus(200);
  },
);

// GET /wallet/v1/devices/:deviceId/registrations/:passTypeId?passesUpdatedSince=<tag>
// Returns serial numbers updated since the given ISO timestamp.
router.get(
  '/wallet/v1/devices/:deviceId/registrations/:passTypeId',
  async (req, res) => {
    const { deviceId, passTypeId } = req.params;
    const since = req.query['passesUpdatedSince'] as string | undefined;
    const serials = deviceMap.get(deviceId)?.get(passTypeId);
    if (!serials?.size) return res.sendStatus(204);

    // Check if any user profiles have been updated since 'since'
    const sinceDate = since ? new Date(since) : new Date(0);
    const updated: string[] = [];

    for (const userId of serials) {
      const [profile] = await db.select({ updatedAt: customerProfilesTable.updatedAt })
        .from(customerProfilesTable)
        .where(eq(customerProfilesTable.userId, userId))
        .limit(1);
      if (profile?.updatedAt && profile.updatedAt > sinceDate) {
        updated.push(userId);
        passUpdatedAt.set(userId, profile.updatedAt.toISOString());
      }
    }

    if (!updated.length) return res.sendStatus(204);

    return res.json({
      serialNumbers: updated,
      lastUpdated:   new Date().toISOString(),
    });
  },
);

// GET /wallet/v1/passes/:passTypeId/:serialNumber
// Returns the latest version of the pass for the given serial number.
router.get(
  '/wallet/v1/passes/:passTypeId/:serialNumber',
  requireApplePass,
  async (req, res) => {
    if (!appleReady()) return res.sendStatus(503);
    const userId = req.params.serialNumber;

    // Verify auth token
    const [profile] = await db.select()
      .from(customerProfilesTable)
      .where(eq(customerProfilesTable.userId, userId))
      .limit(1);
    if (!profile || profile.loyaltyQrToken !== (req as any).applePassToken) {
      return res.sendStatus(401);
    }

    try {
      const p        = await loadProfile(userId);
      const passJson = buildPassJson(userId, { ...p, authToken: p.loyaltyQrToken || userId });
      const pkpass   = await buildPkpass(passJson);

      passUpdatedAt.set(userId, p.updatedAt);

      res.set({
        'Content-Type':   'application/vnd.apple.pkpass',
        'Last-Modified':  new Date(p.updatedAt).toUTCString(),
        'Content-Length': String(pkpass.length),
      });
      return res.send(pkpass);
    } catch (err: any) {
      req.log?.error({ err }, 'wallet: webservice pass fetch failed');
      return res.sendStatus(500);
    }
  },
);

// GET /wallet/v1/log — Apple Wallet sends error logs here
router.post('/wallet/v1/log', (req, res) => {
  req.log?.warn({ body: req.body }, 'wallet: Apple Wallet reported an error');
  return res.sendStatus(200);
});

export default router;
