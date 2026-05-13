import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getApiBase(): string {
  const explicitBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (explicitBase) {
    return explicitBase.replace(/\/+$/, "");
  }

  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}/api`;
  }

  return '/api';
}

const API_BASE = getApiBase();

/**
 * Request permission and register the Expo push token with the backend.
 * Safe to call multiple times — deduplication is handled server-side.
 * Returns the token string or null (on simulators / web / denied permission).
 */
export async function registerPushToken(authToken: string): Promise<string | null> {
  // Web doesn't support Expo push tokens
  if (Platform.OS === 'web') return null;

  try {
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
        lightColor: '#4B72C4',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Register with backend (best-effort, non-blocking)
    await fetch(`${API_BASE}/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS,
      }),
    });

    return token;
  } catch {
    // Non-fatal — push notifications are best-effort
    return null;
  }
}

/**
 * Deregister the push token on logout so stale tokens are not targeted.
 */
export async function deregisterPushToken(authToken: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    await fetch(`${API_BASE}/notifications/register-token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Ignore — token will expire naturally
  }
}
