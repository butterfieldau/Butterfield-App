import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeStore = vi.hoisted(() => ({
  async: new Map<string, string>(),
  secure: new Map<string, string>(),
  secureSetCalls: [] as Array<{ key: string; options: Record<string, unknown> | undefined }>,
  secureGetCalls: [] as Array<{ key: string; options: Record<string, unknown> | undefined }>,
  failBiometricWrite: false,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => nativeStore.async.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { nativeStore.async.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { nativeStore.async.delete(key); }),
  },
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string, options?: Record<string, unknown>) => {
    nativeStore.secureGetCalls.push({ key, options });
    return nativeStore.secure.get(key) ?? null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string, options?: Record<string, unknown>) => {
    nativeStore.secureSetCalls.push({ key, options });
    if (nativeStore.failBiometricWrite && key === 'butterfield_biometric_refresh_token') {
      throw new Error('protected key invalidated');
    }
    nativeStore.secure.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => { nativeStore.secure.delete(key); }),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  enableBiometricSignIn,
  getBiometricRefreshToken,
  isBiometricSignInEnabled,
  saveSessionCredentials,
} from '../api';

describe('native credential protection', () => {
  beforeEach(() => {
    nativeStore.async.clear();
    nativeStore.secure.clear();
    nativeStore.secureSetCalls.length = 0;
    nativeStore.secureGetCalls.length = 0;
    nativeStore.failBiometricWrite = false;
  });

  it('stores refresh credentials in the iOS keychain and biometric copy behind authentication', async () => {
    await saveSessionCredentials('access-1', 'refresh-1', 'user-1');
    await enableBiometricSignIn('refresh-1', 'user-1');
    await expect(getBiometricRefreshToken()).resolves.toBe('refresh-1');

    expect(nativeStore.secureSetCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'butterfield_refresh_token',
        options: expect.objectContaining({ keychainAccessible: 1 }),
      }),
      expect.objectContaining({
        key: 'butterfield_biometric_refresh_token',
        options: expect.objectContaining({ requireAuthentication: true, keychainAccessible: 1 }),
      }),
    ]));
    expect(nativeStore.secureGetCalls).toContainEqual(expect.objectContaining({
      key: 'butterfield_biometric_refresh_token',
      options: expect.objectContaining({ requireAuthentication: true }),
    }));
  });

  it('removes a stale biometric marker when rotating its protected credential fails', async () => {
    await enableBiometricSignIn('refresh-1', 'user-1');
    nativeStore.failBiometricWrite = true;

    await saveSessionCredentials('access-2', 'refresh-2', 'user-1');

    await expect(isBiometricSignInEnabled()).resolves.toBe(false);
    expect(nativeStore.secure.has('butterfield_biometric_refresh_token')).toBe(false);
  });
});