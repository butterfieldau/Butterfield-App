import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, saveToken, clearToken, getToken, type ApiUser } from '@/lib/api';
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
    coords?: { latitude: number; longitude: number }
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  internalLogin: (
    email: string,
    password: string,
    coords?: { latitude: number; longitude: number }
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (data: { email: string; password: string; name: string; phone?: string; birthday?: string }) => Promise<{ success: boolean; error?: string }>;
  wholesaleApply: (data: { email: string; password: string; name: string; phone?: string; companyName: string; abn?: string }) => Promise<{ success: boolean; message?: string; error?: string }>;
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
          if (cached) setUser(JSON.parse(cached));
          const { user: fresh } = await api.auth.me();
          const u: AuthContextUser = {
            id: fresh.id, name: fresh.name, email: fresh.email,
            role: fresh.role as UserRole, phone: fresh.phone,
          };
          setUser(u);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
          // Re-register push token silently on app reopen
          registerPushToken(token).catch(() => {});
        }
      } catch {
        await clearToken();
        await AsyncStorage.removeItem(USER_KEY);
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
    coords?: { latitude: number; longitude: number }
  ) => {
    if (!email.trim() || !password.trim()) return { success: false, error: 'Email and password are required.' };
    try {
      let res;
      if (role === 'staff') {
        res = await api.auth.staffLogin({
          email: email.trim(), password,
          latitude: coords?.latitude, longitude: coords?.longitude,
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
    coords?: { latitude: number; longitude: number }
  ) => {
    if (!email.trim() || !password.trim()) return { success: false, error: 'Email and password are required.' };
    try {
      const res = await api.auth.staffLogin({
        email: email.trim(), password,
        latitude: coords?.latitude, longitude: coords?.longitude,
      });
      const returnedRole = res.user.role as UserRole;
      if (!['staff', 'director', 'manager'].includes(returnedRole)) {
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

  const wholesaleApply = useCallback(async (data: any) => {
    try {
      const res = await api.auth.wholesaleApply(data);
      return { success: true, message: res.message };
    } catch (e: any) {
      return { success: false, error: e.message ?? 'Application failed.' };
    }
  }, []);

  const logout = useCallback(async () => {
    // Best-effort: deregister push token before clearing session
    const token = await getToken();
    if (token) deregisterPushToken(token).catch(() => {});
    await clearToken();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, internalLogin, register, wholesaleApply, logout }),
    [user, isLoading, login, internalLogin, register, wholesaleApply, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
