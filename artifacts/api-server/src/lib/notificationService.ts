import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { db, pushTokensTable, notificationLogsTable, usersTable } from '@workspace/db';
import { eq, inArray, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';

const expo = new Expo({ useFcmV1: true } as any);
const NOTIFICATION_SOUND = 'butterfield-push-tone.mp3';
const DEFAULT_CHANNEL_ID = 'default';
const STAFF_CHANNEL_ID = 'butterfield-staff';

export interface SendNotificationOptions {
  /** Target a single user by ID */
  userId?: string;
  /** Target an explicit list of users */
  userIds?: string[];
  /** Target all users with this role */
  role?: string;
  /** Target multiple roles at once */
  roles?: string[];
  type: string;
  title: string;
  body: string;
  /** Extra data payload delivered to the app on notification tap */
  data?: Record<string, unknown>;
  /** ID of the user (director/manager/system) who triggered this */
  sentBy?: string;
  /** Optional custom label stored in the notification log */
  logTargetLabel?: string | null;
  /**
   * Android notification channel ID.
   * Defaults to 'default' (customer/general channel).
   * Use 'butterfield-staff' for staff/internal-team notifications.
   */
  channelId?: string;
}

/**
 * Resolve active push tokens for the given target.
 * Priority: userId > role > roles
 */
async function resolveTokens(opts: SendNotificationOptions): Promise<string[]> {
  let userIds: string[] = [];

  if (opts.userId) {
    userIds = [opts.userId];
  } else if (opts.userIds?.length) {
    userIds = opts.userIds;
  } else {
    const targetRoles = opts.roles ?? (opts.role ? [opts.role] : []);
    if (targetRoles.length === 0) return [];
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.role, targetRoles as any));
    userIds = users.map((u) => u.id);
  }

  if (userIds.length === 0) return [];

  const rows = await db
    .select({ token: pushTokensTable.token })
    .from(pushTokensTable)
    .where(
      and(
        inArray(pushTokensTable.userId, userIds),
        eq(pushTokensTable.isActive, true),
      ),
    );

  return rows.map((r) => r.token).filter((t) => Expo.isExpoPushToken(t));
}

/**
 * Send push notifications to one user or an entire role group.
 * Failures are soft — a log entry is always written.
 */
export async function sendNotification(opts: SendNotificationOptions): Promise<void> {
  const targetRole = opts.logTargetLabel ?? opts.roles?.join(',') ?? opts.role ?? null;

  let successCount = 0;
  let failureCount = 0;

  try {
    const tokens = await resolveTokens(opts);

    if (tokens.length === 0) {
      logger.info({ type: opts.type, target: opts.userId ?? targetRole }, 'Push notification: no tokens found');
    } else {
      const channelId = opts.channelId ?? DEFAULT_CHANNEL_ID;
      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        title: opts.title,
        body: opts.body,
        data: opts.data ?? {},
        sound: NOTIFICATION_SOUND,
        channelId,
      }));

      const chunks = expo.chunkPushNotifications(messages);

      for (const chunk of chunks) {
        try {
          const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
          for (const ticket of tickets) {
            if (ticket.status === 'ok') {
              successCount++;
            } else {
              failureCount++;
              logger.warn({ ticket }, 'Push notification ticket error');
            }
          }
        } catch (err) {
          failureCount += chunk.length;
          logger.error({ err }, 'Push chunk send error');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Push notification error');
    failureCount++;
  }

  // Always persist the log regardless of success
  await db.insert(notificationLogsTable).values({
    id: randomUUID(),
    targetUserId: opts.userId ?? null,
    targetRole,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    data: opts.data ? JSON.stringify(opts.data) : null,
    sentBy: opts.sentBy ?? null,
    successCount,
    failureCount,
  });
}

/**
 * Convenience: notify a single user.
 */
export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  return sendNotification({ userId, type, title, body, data });
}

/**
 * Convenience: broadcast to all users of a role.
 */
export async function notifyRole(
  role: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  return sendNotification({ role, type, title, body, data });
}
