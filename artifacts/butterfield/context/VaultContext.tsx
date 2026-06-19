import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/context/AuthContext';

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
const VAULT_PIN_KEY = 'vault_biometric_pin';

interface VaultContextValue {
  isUnlocked: boolean;
  vaultToken: string | null;
  unlock: (token: string, pin?: string) => Promise<void>;
  lock: () => void;
  resetInactivityTimer: () => void;
  getBiometricPin: () => Promise<string | null>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();
  const prevUserId = useRef<string | null | undefined>(undefined);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    setVaultToken(null);
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    ScreenCapture.allowScreenCaptureAsync().catch(() => {});
  }, []);

  // Lock vault whenever the authenticated user changes (logout / account switch)
  useEffect(() => {
    if (prevUserId.current === undefined) {
      // First render — just record the current user id
      prevUserId.current = user?.id ?? null;
      return;
    }
    const currentId = user?.id ?? null;
    if (currentId !== prevUserId.current) {
      lock();
    }
    prevUserId.current = currentId;
  }, [user?.id, lock]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      lock();
    }, INACTIVITY_TIMEOUT_MS);
  }, [lock]);

  const unlock = useCallback(async (token: string, pin?: string) => {
    setVaultToken(token);
    setIsUnlocked(true);
    await ScreenCapture.preventScreenCaptureAsync();
    if (pin) {
      try {
        // Store PIN plainly — LocalAuthentication.authenticateAsync in the UI
        // is the biometric gate before this value is ever read back.
        await SecureStore.setItemAsync(VAULT_PIN_KEY, pin);
      } catch {
        // SecureStore unavailable — biometric convenience won't work but PIN unlock still succeeds
      }
    }
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const getBiometricPin = useCallback(async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(VAULT_PIN_KEY);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (isUnlocked) lock();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isUnlocked, lock]);

  useEffect(() => {
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  return (
    <VaultContext.Provider value={{ isUnlocked, vaultToken, unlock, lock, resetInactivityTimer, getBiometricPin }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
