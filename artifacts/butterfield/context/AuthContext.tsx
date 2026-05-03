import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User, UserRole } from '@/types';
import { MOCK_USERS } from '@/data/mockData';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (role: UserRole, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_KEY = '@butterfield_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY)
      .then((data) => {
        if (data) setUser(JSON.parse(data));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (role: UserRole, email: string, _password: string) => {
    if (!email.trim()) return { success: false, error: 'Please enter your email.' };
    const mockUser = MOCK_USERS[role];
    const loggedInUser: User = { ...mockUser, email: email.trim() };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(AUTH_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
