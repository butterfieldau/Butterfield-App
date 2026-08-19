import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  async: new Map<string, string>(),
  secure: new Map<string, string>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => stores.async.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { stores.async.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { stores.async.delete(key); }),
  },
}));

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => stores.secure.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { stores.secure.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { stores.secure.delete(key); }),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

import {
  api,
  enableBiometricSignIn,
  getRefreshToken,
  getToken,
  isBiometricSignInEnabled,
  logoutCurrentSession,
  saveSessionCredentials,
} from '../api';

const USER = {
  id: 'user-1',
  email: 'customer@example.com',
  role: 'customer',
  name: 'Customer',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('renewable session lifecycle', () => {
  beforeEach(() => {
    stores.async.clear();
    stores.secure.clear();
    vi.restoreAllMocks();
  });

  it('refreshes once, rotates credentials, and retries the original request', async () => {
    await saveSessionCredentials('expired-access', 'refresh-1', USER.id);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'expired', code: 'TOKEN_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ token: 'access-2', refreshToken: 'refresh-2', user: USER }))
      .mockResolvedValueOnce(json({ user: USER, profile: null }));

    const result = await api.auth.me();

    expect(result.user.id).toBe(USER.id);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>).Authorization)
      .toBe('Bearer access-2');
    await expect(getToken()).resolves.toBe('access-2');
    await expect(getRefreshToken()).resolves.toBe('refresh-2');
  });

  it('shares one rotation across simultaneous expired requests', async () => {
    await saveSessionCredentials('expired-access', 'refresh-1', USER.id);
    let meCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await refreshGate;
        return json({ token: 'access-2', refreshToken: 'refresh-2', user: USER });
      }
      meCalls += 1;
      if (meCalls <= 2) return json({ error: 'expired', code: 'TOKEN_EXPIRED' }, 401);
      return json({ user: USER, profile: null });
    });

    const requests = Promise.all([api.auth.me(), api.auth.me()]);
    await vi.waitFor(() => expect(meCalls).toBe(2));
    releaseRefresh();
    const results = await requests;

    expect(results).toHaveLength(2);
    expect(refreshCalls).toBe(1);
    await expect(getRefreshToken()).resolves.toBe('refresh-2');
  });

  it('serializes explicit biometric refresh attempts', async () => {
    let refreshCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      refreshCalls += 1;
      await refreshGate;
      return json({ token: 'access-2', refreshToken: 'refresh-2', user: USER });
    });

    const attempts = Promise.all([
      api.auth.refresh('refresh-1'),
      api.auth.refresh('refresh-1'),
    ]);
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    await attempts;

    expect(refreshCalls).toBe(1);
  });

  it('waits for rotation and logs out with the successor credential', async () => {
    await saveSessionCredentials('access-1', 'refresh-1', USER.id);
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let logoutBody: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        await refreshGate;
        return json({ token: 'access-2', refreshToken: 'refresh-2', user: USER });
      }
      logoutBody = init?.body as string | undefined;
      return json({ success: true });
    });

    const refreshing = api.auth.refresh('refresh-1');
    const loggingOut = logoutCurrentSession();
    releaseRefresh();
    await Promise.all([refreshing, loggingOut]);

    expect(logoutBody).toBe(JSON.stringify({ refreshToken: 'refresh-2' }));
  });

  it('clears access, refresh, and biometric return on a revoked session', async () => {
    await saveSessionCredentials('access-1', 'refresh-1', USER.id);
    await enableBiometricSignIn('refresh-1', USER.id);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'revoked', code: 'SESSION_INVALID' }, 401));

    await expect(api.auth.refresh('refresh-1')).rejects.toMatchObject({ status: 401 });

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
    await expect(isBiometricSignInEnabled()).resolves.toBe(false);
  });

  it('clears the local session when the account is suspended', async () => {
    await saveSessionCredentials('access-1', 'refresh-1', USER.id);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'suspended', code: 'ACCOUNT_SUSPENDED' }, 403));

    await expect(api.auth.me()).rejects.toMatchObject({ status: 403 });

    await expect(getToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
  });

  it('preserves credentials when refresh fails transiently', async () => {
    await saveSessionCredentials('expired-access', 'refresh-1', USER.id);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'expired', code: 'TOKEN_EXPIRED' }, 401))
      .mockResolvedValueOnce(json({ error: 'temporarily unavailable' }, 503));

    await expect(api.auth.me()).rejects.toMatchObject({ status: 503 });

    await expect(getToken()).resolves.toBe('expired-access');
    await expect(getRefreshToken()).resolves.toBe('refresh-1');
  });

  it('sends the current refresh credential when logging out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ success: true }));

    await expect(api.auth.logout('refresh-1')).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
    }));
  });
});