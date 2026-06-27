import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/lib/api';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const NOTIFICATION_SOUND = 'butterfield_push_tone.mp3';

export async function clearAppBadge(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Non-fatal — badge clearing is best-effort
  }
}

/**
 * Request permission and register the Expo push token with the backend.
 * Safe to call multiple times — deduplication is handled server-side.
 * Returns the token string or null (on simulators / web / denied permission).
 */
export async function registerPushToken(_authToken?: string): Promise<string | null> {
  // Web doesn't support Expo push tokens
  if (Platform.OS === 'web') return null;

  try {
    await clearAppBadge();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    // Android foreground channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Butterfield',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1493FF',
        sound: NOTIFICATION_SOUND,
      });
      await Notifications.setNotificationChannelAsync('butterfield-staff', {
        name: 'Butterfield staff',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1493FF',
        sound: NOTIFICATION_SOUND,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Register with backend via centralised API client (best-effort, non-blocking)
    await api.notifications.registerToken({ token, platform: Platform.OS });

    return token;
  } catch {
    // Non-fatal — push notifications are best-effort
    return null;
  }
}

/**
 * Deregister the push token on logout so stale tokens are not targeted.
 */
export async function deregisterPushToken(_authToken?: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await clearAppBadge();
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await api.notifications.unregisterToken({ token });
  } catch {
    // Ignore — token will expire naturally
  }
}
