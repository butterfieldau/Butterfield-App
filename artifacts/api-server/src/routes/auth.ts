import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db, usersTable, customerProfilesTable, staffProfilesTable, wholesaleAccountsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { signToken, requireAuth } from '../middlewares/auth.js';

const router = Router();

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
  await db.insert(usersTable).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    role: 'customer',
    name,
    phone,
  });
  await db.insert(customerProfilesTable).values({
    userId,
    loyaltyPoints: 100,
    loyaltyTier: 'bronze',
    referralCode: generateReferralCode(name),
    birthday: birthday ?? null,
  });
  const token = signToken({ id: userId, email: email.toLowerCase(), role: 'customer', name });
  return res.status(201).json({ token, user: { id: userId, email, role: 'customer', name } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
});

router.post('/staff-login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user || user.role !== 'staff') {
    return res.status(401).json({ error: 'Staff account not found.' });
  }
  const [staffProfile] = await db.select().from(staffProfilesTable).where(eq(staffProfilesTable.userId, user.id));
  if (!staffProfile?.approvedByAdmin) {
    return res.status(403).json({ error: 'Your staff account is pending approval.' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
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
  if (existing.length > 0) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  const accountId = randomUUID();
  await db.insert(usersTable).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    role: 'wholesale',
    name,
    phone,
  });
  await db.insert(wholesaleAccountsTable).values({
    id: accountId,
    userId,
    companyName,
    abn,
    contactName: name,
    phone,
    deliveryAddress,
    status: 'pending',
  });
  return res.status(201).json({
    message: 'Application received. Our wholesale team will be in touch within 1-2 business days.',
    userId,
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
  return res.json({ user: { id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name, phone: dbUser.phone }, profile });
});

export default router;
