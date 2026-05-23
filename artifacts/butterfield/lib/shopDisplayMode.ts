import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

export const SHOP_DISPLAY_SOUND_KEY = '@butterfield_shop_display_sound_enabled';

let keepAwakeApi: { activateKeepAwake?: () => void; deactivateKeepAwake?: () => void } | null = null;
try {
  keepAwakeApi = require('expo-keep-awake');
} catch {
  keepAwakeApi = null;
}

export function useShopDisplayAwakeMode(active: boolean) {
  useEffect(() => {
    if (!active) return;
    keepAwakeApi?.activateKeepAwake?.();
    return () => keepAwakeApi?.deactivateKeepAwake?.();
  }, [active]);
}

export async function getShopDisplaySoundEnabled() {
  const saved = await AsyncStorage.getItem(SHOP_DISPLAY_SOUND_KEY);
  return saved == null ? true : saved === 'true';
}

export async function setShopDisplaySoundEnabled(enabled: boolean) {
  await AsyncStorage.setItem(SHOP_DISPLAY_SOUND_KEY, enabled ? 'true' : 'false');
}
