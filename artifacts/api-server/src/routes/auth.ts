import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db, usersTable, customerProfilesTable, staffProfilesTable, wholesaleAccountsTable, storeSettingsTable, managerProfilesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { signToken, requireAuth } from '../middlewares/auth.js';

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
  if (!user || !['staff', 'director', 'manager'].includes(user.role)) {
    return res.status(401).json({ error: 'Staff, Manager, or Director account not found.' });
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

// ── Seed demo accounts ──────────────────────────────────────────────────────
router.post('/seed-demo', async (req, res) => {
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
    user: { id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name, phone: dbUser.phone, notificationPreferences: notifPrefs },
    profile,
  });
});

// ── PATCH /me — update name, phone, notification prefs ────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  const user = req.user!;
  const { name, phone, notificationPreferences } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name !== undefined && name.trim()) updates.name = name.trim();
  if (phone !== undefined) updates.phone = phone?.trim() || null;
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
  }

  let notifPrefs: Record<string, boolean> | null = null;
  if (updated.notificationPreferences) {
    try { notifPrefs = JSON.parse(updated.notificationPreferences); } catch {}
  }

  return res.json({
    user: { id: updated.id, email: updated.email, role: updated.role, name: updated.name, phone: updated.phone, notificationPreferences: notifPrefs },
    profile,
  });
});

export default router;
