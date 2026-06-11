import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CLOCK_IN_NOTIF_ID  = 'staff-clock-in-daily';
const CLOCK_OUT_NOTIF_ID = 'staff-clock-out-reminder';
const NOTIFICATION_SOUND = 'butterfield_push_tone.mp3';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleClockInReminder(): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Cancel any existing clock-in reminder first
    await Notifications.cancelScheduledNotificationAsync(CLOCK_IN_NOTIF_ID).catch(() => {});

    // Schedule a daily repeating notification at 8:45 AM
    await Notifications.scheduleNotificationAsync({
      identifier: CLOCK_IN_NOTIF_ID,
      content: {
        title: "You're starting soon",
        body: "Don't forget to clock in when you arrive at the store.",
        sound: NOTIFICATION_SOUND,
        data: { type: 'clock_in_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 45,
      },
    });
  } catch (e) {
    // Notifications not critical — silently ignore errors
  }
}

export async function cancelClockInReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(CLOCK_IN_NOTIF_ID);
  } catch {}
}

export async function scheduleClockOutReminder(shiftStartIso: string): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Cancel any existing clock-out reminder
    await Notifications.cancelScheduledNotificationAsync(CLOCK_OUT_NOTIF_ID).catch(() => {});

    // Fire 8 hours after clock-in
    const clockInMs = new Date(shiftStartIso).getTime();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    const fireAt = new Date(clockInMs + eightHoursMs);

    // Only schedule if the time is in the future
    if (fireAt.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier: CLOCK_OUT_NOTIF_ID,
      content: {
        title: "Long shift! Don't forget to clock out",
        body: "You've been on shift for 8 hours. Time to clock out when you leave.",
        sound: NOTIFICATION_SOUND,
        data: { type: 'clock_out_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {}
}

export async function cancelClockOutReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(CLOCK_OUT_NOTIF_ID);
  } catch {}
}

export async function sendClockInConfirmation(): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Clocked in ✓',
        body: "Your shift has started. Have a great day!",
        sound: NOTIFICATION_SOUND,
        data: { type: 'clock_in_confirm' },
      },
      trigger: null,
    });
  } catch {}
}

export async function sendClockOutConfirmation(hoursWorked: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Shift complete ✓',
        body: `Great work! You worked ${hoursWorked} today. See you next shift.`,
        sound: NOTIFICATION_SOUND,
        data: { type: 'clock_out_confirm' },
      },
      trigger: null,
    });
  } catch {}
}
