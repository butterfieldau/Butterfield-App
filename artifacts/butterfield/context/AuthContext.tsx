import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, saveToken, clearToken, getToken, type ApiUser, ApiError } from '@/lib/api';
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
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  internalLogin: (
    email: string,
    password: string,
    coords?: { latitude: number; longitude: number; accuracyMeters?: number }
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (data: { email: string; password: string; name: string; phone?: string; birthday?: string }) => Promise<{ success: boolean; error?: string }>;
  wholesaleApply: (data: { email: string; password: string; name: string; phone: string; companyName: string; abn?: string; deliveryAddress: string; howDidYouHear?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
  socialLogin: (data: { provider: 'google'; idToken: string } | { provider: 'apple'; idToken: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = '@butterfield_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthContextUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
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
            registerPushToken(token).catch(() => {});
          } catch (e: any) {
            const status = e instanceof ApiError ? e.status : undefined;
            if (status === 401 || status === 403) {
              await clearToken();
              await AsyncStorage.removeItem(USER_KEY);
              setUser(null);
            } else if (!cachedUser) {
              // Keep the token in place for a later retry, but don't invent a session.
              setUser(null);
            }
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
      await saveToken(res.token);
      const u: AuthContextUser = {
        id: res.user.id, name: res.user.name,
        email: res.user.email, role: res.user.role as UserRole,
      };
      setUser(u);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      // Register for push notifications after successful login
      registerPushToken(res.token).catch(() => {});
      return { success: true, role: res.user.role as UserRole };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Login failed.' };
    }
  }, []);

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
      await saveToken(res.token);
      const u: AuthContextUser = {
        id: res.user.id, name: res.user.name,
        email: res.user.email, role: returnedRole,
      };
      setUser(u);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      // Register for push notifications after successful login
      registerPushToken(res.token).catch(() => {});
      return { success: true, role: returnedRole };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Login failed.' };
    }
  }, []);

  const register = useCallback(async (data: {
    email: string; password: string; name: string; phone?: string; birthday?: string
  }) => {
    try {
      const res = await api.auth.register(data);
      await saveToken(res.token);
      const u: AuthContextUser = {
        id: res.user.id, name: res.user.name,
        email: res.user.email, role: 'customer',
      };
      setUser(u);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      registerPushToken(res.token).catch(() => {});
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Registration failed.' };
    }
  }, []);

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
      await saveToken(res.token);
      const u: AuthContextUser = {
        id: res.user.id, name: res.user.name,
        email: res.user.email, role: res.user.role as UserRole,
      };
      setUser(u);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
      registerPushToken(res.token).catch(() => {});
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Social sign-in failed.' };
    }
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: deregister push token before clearing session
    const token = await getToken();
    if (token) deregisterPushToken(token).catch(() => {});
    await clearToken();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    // Vault session is in-memory only — cleared implicitly when user state resets.
    // VaultContext will lock on next auth check since vaultToken is not persisted.
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, internalLogin, register, wholesaleApply, socialLogin, logout }),
    [user, isLoading, login, internalLogin, register, wholesaleApply, socialLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
