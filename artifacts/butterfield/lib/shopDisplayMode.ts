import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

export const SHOP_DISPLAY_APP_SALES_SOUND_KEY = '@butterfield_shop_display_app_sales_sound_enabled';
const LEGACY_SHOP_DISPLAY_SOUND_KEY = '@butterfield_shop_display_sound_enabled';

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
  const saved = await AsyncStorage.getItem(SHOP_DISPLAY_APP_SALES_SOUND_KEY);
  if (saved != null) return saved === 'true';
  const legacySaved = await AsyncStorage.getItem(LEGACY_SHOP_DISPLAY_SOUND_KEY);
  if (legacySaved != null) {
    await AsyncStorage.setItem(SHOP_DISPLAY_APP_SALES_SOUND_KEY, legacySaved);
    return legacySaved === 'true';
  }
  return true;
}

export async function setShopDisplaySoundEnabled(enabled: boolean) {
  await AsyncStorage.setItem(SHOP_DISPLAY_APP_SALES_SOUND_KEY, enabled ? 'true' : 'false');
}

// ── Display lock PIN (stored locally per device) ──────────────────────────────
const DISPLAY_LOCK_PIN_KEY = '@butterfield/shop_display_lock_pin';

export async function getDisplayLockPin(): Promise<string | null> {
  return AsyncStorage.getItem(DISPLAY_LOCK_PIN_KEY);
}

export async function setDisplayLockPin(pin: string): Promise<void> {
  await AsyncStorage.setItem(DISPLAY_LOCK_PIN_KEY, pin);
}

export async function clearDisplayLockPin(): Promise<void> {
  await AsyncStorage.removeItem(DISPLAY_LOCK_PIN_KEY);
}

export function verifyDisplayLockPin(entered: string, stored: string): boolean {
  return entered === stored;
}

// ── Screensaver settings (stored locally per device) ──────────────────────────
const SCREENSAVER_ENABLED_KEY = '@butterfield/shop_display_screensaver_enabled';
const SCREENSAVER_TIMEOUT_KEY = '@butterfield/shop_display_screensaver_timeout_mins';

// Module-level listeners so settings.tsx can push changes directly to _layout.tsx
// without requiring navigation. Each update carries only the field that changed.
export type ScreensaverUpdate = { enabled?: boolean; timeoutMs?: number };
type ScreensaverListener = (update: ScreensaverUpdate) => void;
const _screensaverListeners = new Set<ScreensaverListener>();

export function subscribeScreensaverSettings(listener: ScreensaverListener): () => void {
  _screensaverListeners.add(listener);
  return () => _screensaverListeners.delete(listener);
}

function _notifyScreensaver(update: ScreensaverUpdate) {
  _screensaverListeners.forEach(l => l(update));
}

export async function getScreensaverEnabled(): Promise<boolean> {
  const saved = await AsyncStorage.getItem(SCREENSAVER_ENABLED_KEY);
  if (saved != null) return saved === 'true';
  return true;
}

export async function setScreensaverEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SCREENSAVER_ENABLED_KEY, enabled ? 'true' : 'false');
  _notifyScreensaver({ enabled });
}

export async function getScreensaverTimeout(): Promise<number> {
  const saved = await AsyncStorage.getItem(SCREENSAVER_TIMEOUT_KEY);
  if (saved != null) {
    const mins = parseFloat(saved);
    if (!isNaN(mins) && mins > 0) return mins;
  }
  return 2;
}

export async function setScreensaverTimeout(minutes: number): Promise<void> {
  await AsyncStorage.setItem(SCREENSAVER_TIMEOUT_KEY, String(minutes));
  _notifyScreensaver({ timeoutMs: minutes * 60_000 });
}
