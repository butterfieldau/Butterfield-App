import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { db, usersTable, customerProfilesTable, staffProfilesTable, wholesaleAccountsTable, storeSettingsTable, managerProfilesTable, passwordResetTokensTable, storesTable, storeOpeningHoursTable } from '@workspace/db';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { signToken, requireAuth } from '../middlewares/auth.js';
import { sendEmail, buildPasswordResetEmail } from '../lib/emailService.js';

const DEMO_EMAILS = ['customer@demo.com', 'staff@demo.com', 'wholesale@demo.com', 'director@demo.com', 'manager@demo.com'];

const router = Router();

const SHOP_LAT_DEFAULT  = -33.8349;
const SHOP_LNG_DEFAULT  = 150.9942;
const RADIUS_DEFAULT    = 20;

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getGeoSettings() {
  await db.insert(storeSettingsTable).values([
    { key: 'geo_radius_meters', value: String(RADIUS_DEFAULT) },
    { key: 'shop_lat',          value: String(SHOP_LAT_DEFAULT) },
    { key: 'shop_lng',          value: String(SHOP_LNG_DEFAULT) },
  ]).onConflictDoNothing();
  const rows = await db.select().from(storeSettingsTable);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    shopLat:      parseFloat(map['shop_lat']          ?? String(SHOP_LAT_DEFAULT)),
    shopLng:      parseFloat(map['shop_lng']          ?? String(SHOP_LNG_DEFAULT)),
    radiusMeters: parseInt(  map['geo_radius_meters'] ?? String(RADIUS_DEFAULT)),
  };
}

function generateReferralCode(name: string): string {
  const prefix = name.replace(/\s+/g, '').toUpperCase().slice(0, 4);
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${prefix}${suffix}`;
}

router.post('/register', async (req, res) => {
  const { email, password, name, phone, birthday } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: 'customer', name, phone });
  await db.insert(customerProfilesTable).values({
    userId, loyaltyPoints: 100, loyaltyTier: 'bronze',
    referralCode: generateReferralCode(name), birthday: birthday ?? null,
  });
  const token = signToken({ id: userId, email: email.toLowerCase(), role: 'customer', name });
  return res.status(201).json({ token, user: { id: userId, email, role: 'customer', name } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post('/staff-login', async (req, res) => {
  const { email, password, latitude, longitude } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || !['staff', 'director', 'manager', 'master'].includes(user.role)) {
    return res.status(401).json({ error: 'Staff, Manager, Director, or Master account not found.' });
  }

  // Staff accounts require admin approval; directors and managers do not
  if (user.role === 'staff') {
    const [staffProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
    if (!staffProfile?.approvedByAdmin) {
      return res.status(403).json({ error: 'Your staff account is pending approval.' });
    }
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  // Directors bypass geo check — only staff need location verification
  const isDemoAccount = DEMO_EMAILS.includes(user.email.toLowerCase());
  const needsGeoCheck = user.role === 'staff' && !isDemoAccount;
  if (needsGeoCheck) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(403).json({ error: 'Location verification is required for staff sign-in. Please enable location services.' });
    }
    const geo = await getGeoSettings();
    const distanceMeters = haversineDistanceMeters(latitude, longitude, geo.shopLat, geo.shopLng);
    if (distanceMeters > geo.radiusMeters) {
      return res.status(403).json({
        error: `You must be within ${geo.radiusMeters}m of Butterfield Merrylands to sign in. You are currently ${Math.round(distanceMeters)}m away.`,
        distanceMeters: Math.round(distanceMeters),
        radiusMeters: geo.radiusMeters,
      });
    }
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post('/wholesale-apply', async (req, res) => {
  const { email, password, name, phone, companyName, abn, deliveryAddress } = req.body;
  if (!email || !password || !name || !companyName) {
    return res.status(400).json({ error: 'Email, password, name and company name are required.' });
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) return res.status(409).json({ error: 'An account with this email already exists.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(usersTable).values({ id: userId, email: email.toLowerCase(), passwordHash, role: 'wholesale', name, phone });
  await db.insert(wholesaleAccountsTable).values({ id: accountId, userId, companyName, abn, contactName: name, phone, deliveryAddress, status: 'pending' });
  return res.status(201).json({ message: 'Application received. Our wholesale team will be in touch within 1-2 business days.', userId });
});

// ── Seed demo accounts (development only) ────────────────────────────────────
router.post('/seed-demo', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const DEMO_PW = 'Demo1234!';
  const hash = await bcrypt.hash(DEMO_PW, 10);

  const demos = [
    { email: 'customer@demo.com', role: 'customer' as const, name: 'Demo Customer' },
    { email: 'staff@demo.com',    role: 'staff'    as const, name: 'Demo Staff' },
    { email: 'wholesale@demo.com',role: 'wholesale' as const,name: 'Demo Wholesale' },
    { email: 'director@demo.com', role: 'director' as const, name: 'Demo Director' },
    { email: 'manager@demo.com',  role: 'manager'  as const, name: 'Demo Manager' },
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
      await db.insert(customerProfilesTable)
        .values({ userId, loyaltyPoints: 150, loyaltyTier: 'silver', referralCode: 'DEMO1234' })
        .onConflictDoUpdate({ target: customerProfilesTable.userId, set: { loyaltyTier: 'silver' } });
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
  const user = req.user!;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!dbUser) return res.status(404).json({ error: 'User not found' });
  let profile = null;
  if (dbUser.role === 'customer') {
    const [cp] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, user.id));
    profile = cp;
  } else if (dbUser.role === 'staff') {
    const [sp] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
    profile = sp;
  } else if (dbUser.role === 'wholesale') {
    const [wa] = await db.select().from(wholesaleAccountsTable).where(eq(wholesaleAccountsTable.userId, user.id));
    profile = wa;
  }
  let notifPrefs: Record<string, boolean> | null = null;
  if (dbUser.notificationPreferences) {
    try { notifPrefs = JSON.parse(dbUser.notificationPreferences); } catch {}
  }
  return res.json({
    user: { id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name, phone: dbUser.phone, profileImage: dbUser.profileImage, notificationPreferences: notifPrefs },
    profile,
  });
});

// ── PATCH /me — update name, phone, profileImage, notification prefs ──────────
router.patch('/me', requireAuth, async (req, res) => {
  const user = req.user!;
  const { name, phone, notificationPreferences, profileImage } = req.body;

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
    const [cp] = await db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, user.id));
    profile = cp;
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
    if (!accessToken || typeof accessToken !== 'string') {
      return res.status(400).json({ error: 'Google sign-in requires an accessToken.' });
    }
    // Verify the access token server-side — never trust client-supplied claims
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
    verifiedId    = gUser.id;
    verifiedEmail = gUser.email.toLowerCase();
    verifiedName  = typeof gUser.name === 'string' ? gUser.name : undefined;

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

  // If no match by provider ID, look up by verified email
  if (!user && verifiedEmail) {
    const [byEmail] = await db.select().from(usersTable)
      .where(eq(usersTable.email, verifiedEmail));
    user = byEmail ?? null;
    if (user) {
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
      loyaltyPoints: 100,
      loyaltyTier: 'bronze',
      referralCode: generateReferralCode(userName),
    });
    const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    user = newUser ?? null;
  }

  if (!user) return res.status(500).json({ error: 'Failed to resolve user.' });

  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

// ── Password reset ────────────────────────────────────────────────────────────

const RESET_SECRET = (process.env.SESSION_SECRET ?? 'butterfield-dev-only-not-for-production') + ':reset';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const normalised = email.toLowerCase().trim();

  const [user] = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.email, normalised));

  // Always respond with success to prevent user enumeration
  if (!user) {
    return res.json({ success: true, message: 'If an account with that email exists, a reset code has been sent.' });
  }

  // Purge expired / old tokens for this user
  await db.delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, user.id));

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({
    id: randomUUID(),
    userId: user.id,
    otpHash,
    expiresAt,
  });

  const html = buildPasswordResetEmail(otp, user.name);
  const emailResult = await sendEmail({
    to: user.email,
    subject: 'Your Butterfield Cookies password reset code',
    html,
    text: `Your password reset code is: ${otp}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, ignore this message.`,
  });

  // In dev (no email service), return OTP in response so it can be pre-filled
  const isDev = process.env.NODE_ENV !== 'production';
  const devOtp = (!emailResult.success && isDev) ? otp : undefined;

  return res.json({
    success: true,
    message: 'If an account with that email exists, a reset code has been sent.',
    ...(devOtp ? { devOtp } : {}),
  });
});

router.post('/verify-reset-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }
  const normalised = email.toLowerCase().trim();

  const [user] = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.email, normalised));
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

router.post('/reset-password', async (req, res) => {
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
  await db.update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, payload.sub));

  return res.json({ success: true, message: 'Password updated successfully.' });
});

export default router;
