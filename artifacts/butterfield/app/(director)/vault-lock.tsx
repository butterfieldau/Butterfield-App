import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVault } from '@/context/VaultContext';
import { api } from '@/lib/api';

const OBSIDIAN = '#0A0A0A';
const GOLD     = '#C9A84C';
const GOLD_DIM = '#8B6914';
const MUTED    = '#666666';
const TEXT     = '#F5F5F5';
const SURFACE  = '#1A1A1A';
const ERROR    = '#EF4444';
const PIN_LEN  = 6;

function PinDots({ filled, shake }: { filled: number; shake: Animated.Value }) {
  return (
    <Animated.View style={[s.dotsRow, { transform: [{ translateX: shake }] }]}>
      {Array.from({ length: PIN_LEN }).map((_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            filled > i ? s.dotFilled : s.dotEmpty,
          ]}
        />
      ))}
    </Animated.View>
  );
}

function PinKey({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={({ pressed }) => [s.key, pressed && s.keyPressed]}
    >
      <Text style={s.keyLabel}>{label}</Text>
      {sub ? <Text style={s.keySub}>{sub}</Text> : null}
    </Pressable>
  );
}

type Mode = 'lock' | 'setup' | 'confirm';

export default function VaultLockScreen() {
  const insets = useSafeAreaInsets();
  const { isUnlocked, unlock, getBiometricPin } = useVault();
  const [pin, setPin] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [mode, setMode] = useState<Mode>('lock');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lockoutInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isUnlocked) {
      router.replace('/(director)/vault' as any);
    }
  }, [isUnlocked]);

  useEffect(() => {
    (async () => {
      try {
        const status = await api.vault.status();
        if (!status.data.isPinSet) {
          setMode('setup');
        } else if (status.data.isLockedOut && status.data.lockoutExpiresAt) {
          const remaining = Math.ceil((new Date(status.data.lockoutExpiresAt).getTime() - Date.now()) / 1000);
          setLockoutSeconds(Math.max(remaining, 0));
          startLockoutCountdown(Math.max(remaining, 0));
        }
        const biometricAvailable = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setHasBiometrics(biometricAvailable && enrolled);
      } catch {
        setError('Could not connect to vault');
      } finally {
        setLoading(false);
      }
    })();
    return () => { if (lockoutInterval.current) clearInterval(lockoutInterval.current); };
  }, []);

  function startLockoutCountdown(seconds: number) {
    let s = seconds;
    if (lockoutInterval.current) clearInterval(lockoutInterval.current);
    lockoutInterval.current = setInterval(() => {
      s -= 1;
      setLockoutSeconds(s);
      if (s <= 0) {
        clearInterval(lockoutInterval.current!);
        lockoutInterval.current = null;
        setLockoutSeconds(null);
      }
    }, 1000);
  }

  function shake() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  const handleDigit = useCallback((digit: string) => {
    if (lockoutSeconds !== null && lockoutSeconds > 0) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    if (newPin.length === PIN_LEN) {
      handlePinComplete(newPin);
    }
  }, [pin, mode, setupPin, lockoutSeconds]);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
  }, []);

  async function handlePinComplete(enteredPin: string) {
    if (mode === 'setup') {
      setSetupPin(enteredPin);
      setPin('');
      setMode('confirm');
      return;
    }

    if (mode === 'confirm') {
      if (enteredPin !== setupPin) {
        shake();
        setPin('');
        setError('PINs do not match. Try again.');
        setMode('setup');
        setSetupPin('');
        return;
      }
      try {
        setLoading(true);
        await api.vault.setupPin({ newPin: enteredPin });
        const res = await api.vault.unlock({ pin: enteredPin });
        // Pass PIN so VaultContext can store it in SecureStore for future biometric unlocks
        await unlock(res.vaultToken, enteredPin);
        router.replace('/(director)/vault' as any);
      } catch (e: any) {
        shake();
        setError(e.message ?? 'Setup failed');
        setPin('');
        setMode('setup');
        setSetupPin('');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      const res = await api.vault.unlock({ pin: enteredPin });
      // Pass PIN so VaultContext can store it in SecureStore for future biometric unlocks
      await unlock(res.vaultToken, enteredPin);
      router.replace('/(director)/vault' as any);
    } catch (e: any) {
      shake();
      setPin('');
      if (e.body?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(e.body.attemptsRemaining);
        setError(`Wrong PIN — ${e.body.attemptsRemaining} attempt${e.body.attemptsRemaining === 1 ? '' : 's'} remaining`);
      } else if (e.body?.lockoutExpiresAt) {
        const remaining = e.body.remainingSeconds ?? 30;
        setLockoutSeconds(remaining);
        startLockoutCountdown(remaining);
        setError('Vault locked for 30 seconds');
      } else {
        setError(e.message ?? 'Wrong PIN');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    try {
      const biometricResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Butterfield Vault',
        fallbackLabel: 'Use PIN',
      });
      if (!biometricResult.success) return;
      // Retrieve PIN that was securely stored on last successful PIN unlock
      const storedPin = await getBiometricPin();
      if (!storedPin) {
        setError('Please unlock with PIN first to enable biometric');
        return;
      }
      setLoading(true);
      // Send PIN to server (biometricAssisted flag is informational only for audit log)
      const res = await api.vault.unlock({ pin: storedPin, biometricAssisted: true });
      await unlock(res.vaultToken, storedPin);
      router.replace('/(director)/vault' as any);
    } catch (e: any) {
      setError(e.message ?? 'Biometric failed');
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'setup' ? 'Create Vault PIN'
    : mode === 'confirm' ? 'Confirm PIN'
    : 'Vault';

  const subtitle = mode === 'setup' ? 'Choose a 6-digit PIN to protect your recipes'
    : mode === 'confirm' ? 'Re-enter your PIN to confirm'
    : 'Enter your 6-digit PIN';

  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={OBSIDIAN} />

      {/* Back */}
      <View style={s.topRow}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="x" size={22} color={MUTED} />
        </Pressable>
      </View>

      {/* Lock icon */}
      <View style={s.iconWrap}>
        <View style={s.iconOuter}>
          <Feather name={isLocked ? 'lock' : 'shield'} size={36} color={GOLD} />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>

      {/* PIN dots */}
      <PinDots filled={pin.length} shake={shakeAnim} />

      {/* Error / lockout */}
      {error ? <Text style={s.error}>{error}</Text> : null}
      {isLocked ? (
        <Text style={s.lockoutText}>Locked — {lockoutSeconds}s remaining</Text>
      ) : null}
      {attemptsRemaining !== null && !error ? (
        <Text style={s.attemptsText}>{attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining</Text>
      ) : null}

      {/* PIN pad */}
      <View style={s.pad} pointerEvents={isLocked || loading ? 'none' : 'auto'}>
        {[['1','',''],['2','ABC',''],['3','DEF',''],
          ['4','GHI',''],['5','JKL',''],['6','MNO',''],
          ['7','PQRS',''],['8','TUV',''],['9','WXYZ',''],
          ['','',''],['0',''],['⌫','']].reduce<React.ReactElement[]>((rows, _, i, arr) => {
          if (i % 3 === 0) {
            const trio = arr.slice(i, i + 3);
            rows.push(
              <View key={i} style={s.row}>
                {trio.map((item, j) => {
                  const [label, sub] = Array.isArray(item) ? item : [item, ''];
                  if (!label) return <View key={j} style={s.key} />;
                  if (label === '⌫') return (
                    <Pressable key={j} onPress={handleDelete} style={({ pressed }) => [s.key, pressed && s.keyPressed]}>
                      <Feather name="delete" size={22} color={TEXT} />
                    </Pressable>
                  );
                  return <PinKey key={j} label={label} sub={sub} onPress={() => handleDigit(label)} />;
                })}
              </View>
            );
          }
          return rows;
        }, [])}
      </View>

      {/* Biometric */}
      {hasBiometrics && mode === 'lock' && !isLocked && (
        <Pressable onPress={handleBiometric} style={s.biometricBtn}>
          <Feather name="eye" size={20} color={GOLD} />
          <Text style={s.biometricText}>Use Face ID / Touch ID</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OBSIDIAN, alignItems: 'center' },
  topRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  backBtn: { padding: 8 },

  iconWrap: { alignItems: 'center', marginTop: 20, marginBottom: 24 },
  iconOuter: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: GOLD + '18', borderWidth: 1.5, borderColor: GOLD + '44',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title:    { fontSize: 24, fontWeight: '700', color: TEXT, marginBottom: 6 },
  subtitle: { fontSize: 14, color: MUTED, textAlign: 'center', paddingHorizontal: 40 },

  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot:      { width: 14, height: 14, borderRadius: 7 },
  dotEmpty: { backgroundColor: SURFACE, borderWidth: 1.5, borderColor: '#444' },
  dotFilled:{ backgroundColor: GOLD },

  error:       { color: ERROR, fontSize: 13, marginBottom: 4, textAlign: 'center', paddingHorizontal: 40 },
  lockoutText: { color: ERROR, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  attemptsText:{ color: GOLD_DIM, fontSize: 12, marginBottom: 4 },

  pad: { width: '100%', paddingHorizontal: 24, marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  key: {
    flex: 1, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  keyPressed: { backgroundColor: '#2A2A2A' },
  keyLabel:   { fontSize: 24, fontWeight: '400', color: TEXT },
  keySub:     { fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 1 },

  biometricBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, padding: 12 },
  biometricText: { color: GOLD, fontSize: 14, fontWeight: '600' },
});
