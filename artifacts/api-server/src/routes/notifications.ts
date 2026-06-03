import { Router } from 'express';
import { randomUUID } from 'crypto';
import { db, pushTokensTable, notificationLogsTable, scheduledNotificationsTable, usersTable } from '@workspace/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { requireManagerPermission } from '../middlewares/managerPermission.js';
import { sendNotification } from '../lib/notificationService.js';
import {
  isSupportedScheduledAudience,
  processDueScheduledNotifications,
  type ScheduledNotificationAudienceType,
} from '../lib/scheduledNotifications.js';
import { ensureScheduledNotificationSchemaReady } from '../lib/ensureScheduledNotificationSchemaReady.js';
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
router.post('/send', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (req, res) => {
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
router.get('/logs', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (_req, res) => {
  await processDueScheduledNotifications().catch(() => {});
  const logs = await db
    .select()
    .from(notificationLogsTable)
    .orderBy(desc(notificationLogsTable.sentAt))
    .limit(100);
  return res.json({ data: logs });
});

// ── Scheduled notifications ──────────────────────────────────────────────────
router.get('/scheduled', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (_req, res) => {
  await ensureScheduledNotificationSchemaReady();
  await processDueScheduledNotifications().catch(() => {});

  const rows = await db
    .select()
    .from(scheduledNotificationsTable)
    .orderBy(desc(scheduledNotificationsTable.scheduledAt), desc(scheduledNotificationsTable.createdAt));

  return res.json({ data: rows });
});

router.post('/scheduled', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (req, res) => {
  await ensureScheduledNotificationSchemaReady();

  const {
    title,
    message,
    imageUrl,
    imageObjectPath,
    actionType,
    actionValue,
    audienceType,
    audienceFilters,
    scheduledAt,
    status,
  } = req.body ?? {};

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });
  if (!scheduledAt) return res.status(400).json({ error: 'Scheduled date and time are required.' });
  if (!isSupportedScheduledAudience(audienceType)) {
    return res.status(400).json({ error: 'That audience is not available yet.' });
  }

  const parsedScheduledAt = new Date(scheduledAt);
  if (Number.isNaN(parsedScheduledAt.getTime())) {
    return res.status(400).json({ error: 'Invalid scheduled date.' });
  }

  const nextStatus = status === 'draft' ? 'draft' : 'scheduled';
  const [row] = await db
    .insert(scheduledNotificationsTable)
    .values({
      id: randomUUID(),
      title: title.trim(),
      message: message.trim(),
      imageUrl: imageUrl?.trim() || null,
      imageObjectPath: imageObjectPath?.trim() || null,
      actionType: actionType?.trim() || null,
      actionValue: actionValue?.trim() || null,
      audienceType,
      audienceFilters: audienceFilters ? JSON.stringify(audienceFilters) : null,
      scheduledAt: parsedScheduledAt,
      status: nextStatus,
      createdBy: req.user!.id,
    })
    .returning();

  return res.status(201).json({ data: row });
});

router.patch('/scheduled/:id', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (req, res) => {
  await ensureScheduledNotificationSchemaReady();

  const [existing] = await db
    .select()
    .from(scheduledNotificationsTable)
    .where(eq(scheduledNotificationsTable.id, req.params.id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: 'Scheduled notification not found.' });
  if (existing.status === 'sent') {
    return res.status(400).json({ error: 'Sent notifications can no longer be edited.' });
  }

  const {
    title,
    message,
    imageUrl,
    imageObjectPath,
    actionType,
    actionValue,
    audienceType,
    audienceFilters,
    scheduledAt,
    status,
  } = req.body ?? {};

  const updates: Record<string, unknown> = { updatedAt: new Date(), processingStartedAt: null, lastError: null };

  if (title !== undefined) {
    if (!String(title).trim()) return res.status(400).json({ error: 'Title is required.' });
    updates.title = String(title).trim();
  }
  if (message !== undefined) {
    if (!String(message).trim()) return res.status(400).json({ error: 'Message is required.' });
    updates.message = String(message).trim();
  }
  if (imageUrl !== undefined) updates.imageUrl = String(imageUrl || '').trim() || null;
  if (imageObjectPath !== undefined) updates.imageObjectPath = String(imageObjectPath || '').trim() || null;
  if (actionType !== undefined) updates.actionType = String(actionType || '').trim() || null;
  if (actionValue !== undefined) updates.actionValue = String(actionValue || '').trim() || null;
  if (audienceType !== undefined) {
    if (!isSupportedScheduledAudience(audienceType)) {
      return res.status(400).json({ error: 'That audience is not available yet.' });
    }
    updates.audienceType = audienceType as ScheduledNotificationAudienceType;
  }
  if (audienceFilters !== undefined) updates.audienceFilters = audienceFilters ? JSON.stringify(audienceFilters) : null;
  if (scheduledAt !== undefined) {
    const parsedScheduledAt = new Date(scheduledAt);
    if (Number.isNaN(parsedScheduledAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled date.' });
    }
    updates.scheduledAt = parsedScheduledAt;
  }
  if (status !== undefined) {
    if (!['draft', 'scheduled', 'cancelled', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid scheduled notification status.' });
    }
    updates.status = status;
    if (status === 'cancelled') {
      updates.processingStartedAt = null;
    }
  }

  const [updated] = await db
    .update(scheduledNotificationsTable)
    .set(updates)
    .where(eq(scheduledNotificationsTable.id, req.params.id))
    .returning();

  return res.json({ data: updated });
});

router.post('/scheduled/:id/cancel', requireRole('director', 'manager', 'master'), requireManagerPermission('announcements'), async (req, res) => {
  await ensureScheduledNotificationSchemaReady();

  const [existing] = await db
    .select()
    .from(scheduledNotificationsTable)
    .where(eq(scheduledNotificationsTable.id, req.params.id))
    .limit(1);

  if (!existing) return res.status(404).json({ error: 'Scheduled notification not found.' });
  if (existing.status === 'sent') {
    return res.status(400).json({ error: 'Sent notifications cannot be cancelled.' });
  }

  const [updated] = await db
    .update(scheduledNotificationsTable)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
      processingStartedAt: null,
    })
    .where(eq(scheduledNotificationsTable.id, req.params.id))
    .returning();

  return res.json({ data: updated });
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
    wholesaleCutoffReminder: true,
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
