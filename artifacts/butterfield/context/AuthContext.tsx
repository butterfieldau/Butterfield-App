import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  clearToken,
  getRefreshToken,
  getToken,
  logoutCurrentSession,
  refreshAccessToken,
  saveSessionCredentials,
  setSessionInvalidHandler,
  type AuthSessionResponse,
  type ProfileUpdateResponse,
} from '@/lib/api';
import { registerPushToken, deregisterPushToken } from '@/lib/pushNotifications';
import type { UserRole } from '@/types';

export interface AuthContextUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
}

interface AuthContextValue {
  user: AuthContextUser | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    role?: UserRole,
    coords?: { latitude: number; longitude: number; accuracyMeters?: number }
  ) => Promise<{ success: boolean; error?: string; code?: string; role?: UserRole }>;
  internalLogin: (
    email: string,
    password: string,
    coords?: { latitude: number; longitude: number; accuracyMeters?: number }
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (data: { email: string; password: string; name: string; phone?: string; birthday?: string }) => Promise<{ success: boolean; error?: string }>;
  wholesaleApply: (data: { email: string; password: string; name: string; phone: string; companyName: string; abn?: string; deliveryAddress: string; howDidYouHear?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  socialLogin: (data: { provider: 'google'; idToken: string } | { provider: 'apple'; idToken: string }) => Promise<{ success: boolean; error?: string }>;
  updateAuthenticatedUser: (response: ProfileUpdateResponse) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = '@butterfield_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const cacheAuthenticatedUser = useCallback(async (res: AuthSessionResponse): Promise<AuthContextUser> => {
    await saveSessionCredentials(res.token, res.refreshToken, res.user.id);
    const authenticatedUser: AuthContextUser = {
      id: res.user.id,
      name: res.user.name,
      email: res.user.email,
      role: res.user.role as UserRole,
    };
    setUser(authenticatedUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(authenticatedUser));
    registerPushToken(res.token).catch(() => {});
    return authenticatedUser;
  }, []);

  const updateAuthenticatedUser = useCallback(async (response: ProfileUpdateResponse): Promise<void> => {
    // Persist replacement credentials before exposing the new identity. If
    // storage fails, the old in-memory user and token remain untouched.
    if (response.token && response.refreshToken) {
      await saveSessionCredentials(response.token, response.refreshToken, response.user.id);
    }
    const authenticatedUser: AuthContextUser = {
      id: response.user.id,
      name: response.user.name,
      email: response.user.email,
      role: response.user.role as UserRole,
      phone: response.user.phone,
    };
    setUser(authenticatedUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(authenticatedUser));
    if (response.token) registerPushToken(response.token).catch(() => {});
  }, []);

  useEffect(() => setSessionInvalidHandler(async () => {
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }), []);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        let token = await getToken();
        const refreshToken = await getRefreshToken();
        if (!token && refreshToken) {
          const renewed = await refreshAccessToken();
          token = renewed.token;
        }
        if (token) {
          const cached = await AsyncStorage.getItem(USER_KEY);
          let cachedUser: AuthContextUser | null = null;
          if (cached) {
            try {
              cachedUser = JSON.parse(cached);
              setUser(cachedUser);
            } catch {
              await AsyncStorage.removeItem(USER_KEY);
            }
          }

          try {
            const { user: fresh } = await api.auth.me();
            const u: AuthContextUser = {
              id: fresh.id,
              name: fresh.name,
              email: fresh.email,
              role: fresh.role as UserRole,
              phone: fresh.phone,
            };
            setUser(u);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
            // Re-register push token silently on app reopen
            const currentToken = await getToken();
            if (currentToken) registerPushToken(currentToken).catch(() => {});
          } catch (e: any) {
            // The API layer clears only conclusive session/account rejections.
            // Network, proxy, and 5xx failures leave renewable credentials intact.
            if (!cachedUser) {
              // Transient error and no cached data — show login but keep the token
              // so the next app open can retry without forcing re-login.
              setUser(null);
            }
            // else: transient error with a valid cached user — stay logged in.
          }
        }
      } catch {
        // Let the app start even if session restore itself had a storage hiccup.
        // We only clear a session when the backend explicitly rejects it.
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (
    email: string,
    password: string,
    role?: UserRole,
    coords?: { latitude: number; longitude: number; accuracyMeters?: number }
  ) => {
    if (!email.trim() || !password.trim()) return { success: false, error: 'Email and password are required.' };
    try {
      let res;
      if (role === 'staff') {
        res = await api.auth.staffLogin({
          email: email.trim(), password,
          latitude: coords?.latitude, longitude: coords?.longitude, accuracyMeters: coords?.accuracyMeters,
        });
      } else {
        res = await api.auth.login({ email: email.trim(), password });
      }
      await cacheAuthenticatedUser(res);
      return { success: true, role: res.user.role as UserRole };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Login failed.', code: (e as any)?.body?.code };
    }
  }, [cacheAuthenticatedUser]);

  // Unified internal login for staff / director / manager
  const internalLogin = useCallback(async (
    email: string,
    password: string,
    coords?: { latitude: number; longitude: number; accuracyMeters?: number }
  ) => {
    if (!email.trim() || !password.trim()) return { success: false, error: 'Email and password are required.' };
    try {
      const res = await api.auth.staffLogin({
        email: email.trim(), password,
        latitude: coords?.latitude, longitude: coords?.longitude, accuracyMeters: coords?.accuracyMeters,
      });
      const returnedRole = res.user.role as UserRole;
      if (!['staff', 'director', 'manager', 'master', 'shop_display'].includes(returnedRole)) {
        return { success: false, error: 'This account does not have internal access.' };
      }
      await cacheAuthenticatedUser(res);
      return { success: true, role: returnedRole };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Login failed.' };
    }
  }, [cacheAuthenticatedUser]);

  const register = useCallback(async (data: {
    email: string; password: string; name: string; phone?: string; birthday?: string
  }) => {
    try {
      const res = await api.auth.register(data);
      await cacheAuthenticatedUser(res);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Registration failed.' };
    }
  }, [cacheAuthenticatedUser]);

  const wholesaleApply = useCallback(async (data: {
    email: string; password: string; name: string; phone: string;
    companyName: string; abn?: string; deliveryAddress: string; howDidYouHear?: string;
  }) => {
    try {
      const res = await api.auth.wholesaleApply(data);
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Application failed.' };
    }
  }, []);

  const socialLogin = useCallback(async (data: { provider: 'google'; idToken: string } | { provider: 'apple'; idToken: string }) => {
    try {
      const res = await api.auth.socialLogin(data);
      await cacheAuthenticatedUser(res);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Social sign-in failed.' };
    }
  }, [cacheAuthenticatedUser]);

  const logout = useCallback(async () => {
    // Best-effort: deregister push token before clearing session
    const token = await getToken();
    if (token) deregisterPushToken(token).catch(() => {});
    await logoutCurrentSession().catch(() => {});
    await clearToken();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    // Vault session is in-memory only — cleared implicitly when user state resets.
    // VaultContext will lock on next auth check since vaultToken is not persisted.
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      internalLogin,
      register,
      wholesaleApply,
      socialLogin,
      updateAuthenticatedUser,
      logout,
    }),
    [
      user,
      isLoading,
      login,
      internalLogin,
      register,
      wholesaleApply,
      socialLogin,
      updateAuthenticatedUser,
      logout,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
