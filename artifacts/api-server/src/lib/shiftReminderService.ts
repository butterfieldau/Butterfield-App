import { db, notificationLogsTable, staffRosterTable, usersTable } from '@workspace/db';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { sendNotification } from './notificationService.js';
import { logger } from './logger.js';

const REMINDER_TYPE = 'shift_reminder';
const REMINDER_LEAD_MINUTES = 5;
const POLL_INTERVAL_MS = 60_000;
const SYDNEY_TZ = 'Australia/Sydney';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function toSydneyParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function shouldSendShiftReminder(notificationPreferences: string | null | undefined) {
  if (!notificationPreferences) return true;
  try {
    const prefs = JSON.parse(notificationPreferences);
    if (typeof prefs.shiftAlerts === 'boolean') return prefs.shiftAlerts;
    if (typeof prefs.staffAlerts === 'boolean') return prefs.staffAlerts;
  } catch {
    // Ignore malformed preferences and fall back to enabled.
  }
  return true;
}

async function findAlreadySentRosterIds(userIds: string[]) {
  if (userIds.length === 0) return new Set<string>();

  const recentLogs = await db.select({
    targetUserId: notificationLogsTable.targetUserId,
    data: notificationLogsTable.data,
  }).from(notificationLogsTable)
    .where(and(
      eq(notificationLogsTable.type, REMINDER_TYPE),
      gte(notificationLogsTable.sentAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      inArray(notificationLogsTable.targetUserId, userIds),
    ));

  const sent = new Set<string>();
  for (const log of recentLogs) {
    if (!log.data) continue;
    try {
      const parsed = JSON.parse(log.data);
      if (parsed?.rosterId) sent.add(String(parsed.rosterId));
    } catch {
      // Ignore malformed historical payloads.
    }
  }
  return sent;
}

async function sendDueShiftReminders() {
  if (running) return;
  running = true;

  try {
    const target = toSydneyParts(new Date(Date.now() + REMINDER_LEAD_MINUTES * 60_000));
    const dueRows = await db.select({
      rosterId: staffRosterTable.id,
      userId: staffRosterTable.userId,
      rosterDate: staffRosterTable.date,
      startTime: staffRosterTable.startTime,
      userName: usersTable.name,
      userRole: usersTable.role,
      notificationPreferences: usersTable.notificationPreferences,
    }).from(staffRosterTable)
      .leftJoin(usersTable, eq(staffRosterTable.userId, usersTable.id))
      .where(and(
        eq(staffRosterTable.date, target.date),
        eq(staffRosterTable.startTime, target.time),
      ));

    const eligibleRows = dueRows.filter((row) =>
      !!row.userId &&
      (row.userRole === 'staff' || row.userRole === 'manager') &&
      shouldSendShiftReminder(row.notificationPreferences),
    );

    const sentRosterIds = await findAlreadySentRosterIds(
      eligibleRows.map((row) => row.userId).filter(Boolean) as string[],
    );

    for (const row of eligibleRows) {
      if (sentRosterIds.has(row.rosterId)) continue;

      await sendNotification({
        userId: row.userId,
        type: REMINDER_TYPE,
        title: 'Shift starts in 5 minutes',
        body: 'Not forget to sign in when they arrive',
        data: {
          rosterId: row.rosterId,
          date: row.rosterDate,
          startTime: row.startTime,
          leadMinutes: REMINDER_LEAD_MINUTES,
        },
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Shift reminder sweep failed');
  } finally {
    running = false;
  }
}

export function startShiftReminderService() {
  if (timer) return;

  void sendDueShiftReminders();
  timer = setInterval(() => {
    void sendDueShiftReminders();
  }, POLL_INTERVAL_MS);
}
