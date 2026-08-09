import { db, wholesaleDeliverySettingsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { sendNotification } from './notificationService.js';
import { logger } from './logger.js';
import { getSydneyNow } from './sydneyTime.js';

const HOURS_BEFORE = 3;
const SINGLETON_ID = 'default';

export interface WholesaleDeliverySlot {
  deliveryDow: number;
  deliveryLabel: string;
  cutoffDow: number;
  cutoffDayLabel: string;
  cutoffHour: number;
  windowOpen: string;
  windowClose: string;
}

export const DEFAULT_DELIVERY_SLOTS: WholesaleDeliverySlot[] = [
  {
    deliveryDow: 1,
    deliveryLabel: 'Monday',
    cutoffDow: 6,
    cutoffDayLabel: 'Saturday',
    cutoffHour: 17,
    windowOpen: '8:00am',
    windowClose: '5:00pm',
  },
  {
    deliveryDow: 4,
    deliveryLabel: 'Thursday',
    cutoffDow: 3,
    cutoffDayLabel: 'Wednesday',
    cutoffHour: 17,
    windowOpen: '8:00am',
    windowClose: '5:00pm',
  },
];

export async function getOrCreateWholesaleDeliverySettings() {
  const [row] = await db
    .select()
    .from(wholesaleDeliverySettingsTable)
    .where(eq(wholesaleDeliverySettingsTable.id, SINGLETON_ID));

  if (row) return row;

  const [created] = await db
    .insert(wholesaleDeliverySettingsTable)
    .values({
      id: SINGLETON_ID,
      slotsJson: JSON.stringify(DEFAULT_DELIVERY_SLOTS),
      cutoffReminderEnabled: true,
      lastSentJson: '{}',
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

function formatHour(hour: number): string {
  if (hour === 12) return '12:00pm';
  if (hour > 12) return `${hour - 12}:00pm`;
  return `${hour}:00am`;
}

/** Called from the scheduled notifications interval every 30 seconds. */
export async function checkWholesaleCutoffReminders(): Promise<void> {
  try {
    const settings = await getOrCreateWholesaleDeliverySettings();
    if (!settings.cutoffReminderEnabled) return;

    const slots: WholesaleDeliverySlot[] = JSON.parse(settings.slotsJson || '[]');
    if (!slots.length) return;

    // Resolve current Sydney time
    const sydneyNow = getSydneyNow();
    const dayOfWeek = sydneyNow.getDay();
    const hour = sydneyNow.getHours();
    const minute = sydneyNow.getMinutes();

    // Only fire within the first 10 minutes of the notification hour
    if (minute > 10) return;

    // Today's date in AEST (YYYY-MM-DD)
    const todayStr = `${sydneyNow.getFullYear()}-${String(sydneyNow.getMonth() + 1).padStart(2, '0')}-${String(sydneyNow.getDate()).padStart(2, '0')}`;

    let lastSent: Record<string, string> = {};
    try {
      lastSent = JSON.parse(settings.lastSentJson);
    } catch {
      lastSent = {};
    }

    let anyUpdated = false;

    for (const slot of slots) {
      const notifHour = slot.cutoffHour - HOURS_BEFORE;
      if (slot.cutoffDow !== dayOfWeek) continue;
      if (hour !== notifHour) continue;

      const sentKey = String(slot.deliveryDow);
      if (lastSent[sentKey] === todayStr) continue;

      await sendNotification({
        role: 'wholesale',
        type: 'wholesale_cutoff_reminder',
        title: '🍪 Order cutoff reminder',
        body: `Last call for ${slot.deliveryLabel} delivery — cutoff is ${slot.cutoffDayLabel} at ${formatHour(slot.cutoffHour)} AEST.`,
        data: { screen: '/(wholesale)/catalog' },
      });

      logger.info(
        { deliveryLabel: slot.deliveryLabel, cutoffDayLabel: slot.cutoffDayLabel },
        'Wholesale cutoff reminder sent',
      );

      lastSent[sentKey] = todayStr;
      anyUpdated = true;
    }

    if (anyUpdated) {
      await db
        .update(wholesaleDeliverySettingsTable)
        .set({ lastSentJson: JSON.stringify(lastSent), updatedAt: new Date() })
        .where(eq(wholesaleDeliverySettingsTable.id, SINGLETON_ID));
    }
  } catch (err) {
    logger.warn({ err }, 'checkWholesaleCutoffReminders failed');
  }
}
