import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, pushTokensTable, notificationLogsTable, usersTable } from '@workspace/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { sendNotification } from '../lib/notificationService.js';
import Expo from 'expo-server-sdk';

const router = Router();

// ── Register / update push token ──────────────────────────────────────────────
// Called by the mobile app after requesting permission and receiving a token.
router.post('/register-token', requireAuth, async (req, res) => {
  const { token, platform = 'ios', deviceName } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'token is required' });
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Invalid Expo push token format' });
  }

  const userId = req.user!.id;

  // Upsert: if this exact token already exists, just reactivate it
  const [existing] = await db
    .select({ id: pushTokensTable.id })
    .from(pushTokensTable)
    .where(eq(pushTokensTable.token, token));

  if (existing) {
    await db
      .update(pushTokensTable)
      .set({ userId, isActive: true, updatedAt: new Date() })
      .where(eq(pushTokensTable.token, token));
  } else {
    await db.insert(pushTokensTable).values({
      id: randomUUID(),
      userId,
      token,
      platform,
      deviceName: deviceName ?? null,
      isActive: true,
    });
  }

  // Record last login timestamp
  await db
    .update(usersTable)
    .set({ lastLogin: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true });
});

// ── Deregister token (on logout) ──────────────────────────────────────────────
router.delete('/register-token', requireAuth, async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  await db
    .update(pushTokensTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(pushTokensTable.token, token),
        eq(pushTokensTable.userId, req.user!.id),
      ),
    );

  return res.json({ ok: true });
});

// ── Send notification (director/manager only) ─────────────────────────────────
// Body: { type, title, body, targetRole?, targetUserId?, data? }
router.post('/send', requireRole('director', 'manager'), requireManagerPermission('announcements'), async (req, res) => {
  const { type, title, body, targetRole, targetUserId, data } = req.body ?? {};
  if (!type || !title || !body) {
    return res.status(400).json({ error: 'type, title, and body are required' });
  }
  if (!targetRole && !targetUserId) {
    return res.status(400).json({ error: 'targetRole or targetUserId is required' });
  }

  await sendNotification({
    type,
    title,
    body,
    role: targetRole,
    userId: targetUserId,
    data,
    sentBy: req.user!.id,
  });

  return res.json({ ok: true });
});

// ── Notification history (director/manager) ───────────────────────────────────
router.get('/logs', requireRole('director', 'manager'), requireManagerPermission('announcements'), async (_req, res) => {
  const logs = await db
    .select()
    .from(notificationLogsTable)
    .orderBy(desc(notificationLogsTable.sentAt))
    .limit(100);
  return res.json({ data: logs });
});

// ── My notification preferences ───────────────────────────────────────────────
router.get('/preferences', requireAuth, async (req, res) => {
  const [user] = await db
    .select({ notificationPreferences: usersTable.notificationPreferences })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  const defaults = {
    orderUpdates: true,
    promotions: true,
    rewards: true,
    shiftAlerts: true,
    staffAlerts: true,
    wholesaleAlerts: true,
  };

  try {
    const saved = user?.notificationPreferences
      ? JSON.parse(user.notificationPreferences)
      : {};
    return res.json({ data: { ...defaults, ...saved } });
  } catch {
    return res.json({ data: defaults });
  }
});

router.patch('/preferences', requireAuth, async (req, res) => {
  const incoming = req.body ?? {};

  // Fetch existing saved prefs so we can merge (not overwrite) keys from other devices
  const [user] = await db
    .select({ notificationPreferences: usersTable.notificationPreferences })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  let existing: Record<string, boolean> = {};
  try {
    existing = user?.notificationPreferences ? JSON.parse(user.notificationPreferences) : {};
  } catch { /* ignore */ }

  // Merge: only accept boolean values from the request
  const merged: Record<string, boolean> = { ...existing };
  for (const [key, val] of Object.entries(incoming)) {
    if (typeof val === 'boolean') merged[key] = val;
  }

  const prefs = JSON.stringify(merged);
  await db
    .update(usersTable)
    .set({ notificationPreferences: prefs, updatedAt: new Date() })
    .where(eq(usersTable.id, req.user!.id));

  return res.json({ ok: true, data: merged });
});

export default router;
