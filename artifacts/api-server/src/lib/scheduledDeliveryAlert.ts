import { db, ordersTable } from '@workspace/db';
import { and, eq, sql } from 'drizzle-orm';
import { sendNotification } from './notificationService.js';
import { logger } from './logger.js';
import { getSydneyNow } from './sydneyTime.js';

let alertSentToday: string | null = null;

function getSydneyDateString(): string {
  const syd = getSydneyNow();
  return `${syd.getFullYear()}-${String(syd.getMonth() + 1).padStart(2, '0')}-${String(syd.getDate()).padStart(2, '0')}`;
}

function getSydneyHourMinute(): { hour: number; minute: number } {
  const syd = getSydneyNow();
  return { hour: syd.getHours(), minute: syd.getMinutes() };
}

async function checkAndSendMorningAlert() {
  const todayKey = getSydneyDateString();
  if (alertSentToday === todayKey) return;

  const { hour, minute } = getSydneyHourMinute();
  if (hour !== 6 || minute > 10) return;

  alertSentToday = todayKey;

  try {
    const sydayStart = new Date(`${todayKey}T00:00:00+11:00`);
    const sydayEnd   = new Date(`${todayKey}T23:59:59+11:00`);

    const dueToday = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, 'accepted' as any),
        sql`${ordersTable.scheduledFor} >= ${sydayStart}`,
        sql`${ordersTable.scheduledFor} <= ${sydayEnd}`,
      ));

    if (dueToday.length === 0) return;

    const count = dueToday.length;
    await sendNotification({
      roles: ['director', 'manager', 'master'],
      type: 'scheduled_delivery_reminder',
      title: `${count} Deliver${count === 1 ? 'y' : 'ies'} Due Today`,
      body: `You have ${count} scheduled order${count === 1 ? '' : 's'} to prepare and deliver today. Open Orders to begin.`,
      data: { screen: '/(director)/orders', filter: 'scheduled' },
    });

    logger.info({ count, date: todayKey }, 'Morning delivery alert sent');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Morning delivery alert failed');
    alertSentToday = null;
  }
}

export function startScheduledDeliveryAlertService() {
  setInterval(() => {
    checkAndSendMorningAlert().catch(() => {});
  }, 60_000);

  checkAndSendMorningAlert().catch(() => {});
  logger.info('Scheduled delivery alert service started');
}
