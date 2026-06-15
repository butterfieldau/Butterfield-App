import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator, Animated, Modal, Pressable,
  StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BLUE   = '#1493FF';
const DARK   = '#0F172A';
const MID    = '#475569';
const MUTED  = '#94A3B8';
const BORDER = '#E2E8F0';
const WHITE  = '#FFFFFF';
const CHERRY = '#D20001';

export default function PosPinModal({
  onClose,
  onSuccess,
  title,
  subtitle,
}: {
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { height: screenH } = useWindowDimensions();
  const { user } = useAuth();
  const [digits, setDigits] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const appendDigit = (d: string) => {
    if (digits.length >= 4 || checking) return;
    const next = [...digits, d];
    setDigits(next);
    setError('');
    Haptics.selectionAsync();
    if (next.length === 4) verify(next.join(''));
  };

  const backspace = () => {
    if (checking) return;
    setDigits(prev => prev.slice(0, -1));
    setError('');
    Haptics.selectionAsync();
  };

  const verify = async (pin: string) => {
    setChecking(true);
    try {
      const verifyFn = user?.role === 'shop_display'
        ? api.shopDisplay.verifySettingsPin
        : api.director.verifySettingsPin;
      const res = await verifyFn(pin);
      if (res.granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess(pin);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake();
        setError('Incorrect PIN.');
        setDigits([]);
      }
    } catch {
      setError('Connection error. Try again.');
      setDigits([]);
    } finally {
      setChecking(false);
    }
  };

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.pinOverlay} onPress={onClose}>
        <Pressable style={[styles.pinSheet, { maxHeight: screenH * 0.72 }]} onPress={() => {}}>
          <View style={styles.pinHeader}>
            <View style={styles.pinLockCircle}>
              <Feather name="lock" size={22} color={BLUE} />
            </View>
            <Text style={styles.pinTitle}>{title ?? 'POS Settings'}</Text>
            <Text style={styles.pinSub}>{subtitle ?? 'Enter your POS PIN to continue'}</Text>
          </View>

          <Animated.View style={[styles.pinDotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.pinDot, digits[i] !== undefined && styles.pinDotFilled]} />
            ))}
          </Animated.View>

          {!!error && <Text style={styles.pinError}>{error}</Text>}
          {checking && <ActivityIndicator color={BLUE} style={{ marginBottom: 8 }} />}

          <View style={styles.pinNumpad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={`k-${i}`} style={styles.pinKeyPlaceholder} />;
              const isBack = key === '⌫';
              return (
                <Pressable
                  key={`k-${i}`}
                  onPress={() => isBack ? backspace() : appendDigit(key)}
                  style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyPressed]}
                >
                  <Text style={[styles.pinKeyText, isBack && styles.pinBackText]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={styles.pinCancel}>
            <Text style={styles.pinCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pinOverlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pinSheet:          { backgroundColor: WHITE, borderRadius: 24, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12, overflow: 'hidden' },
  pinHeader:         { alignItems: 'center', paddingTop: 28, paddingBottom: 16, paddingHorizontal: 20 },
  pinLockCircle:     { width: 56, height: 56, borderRadius: 28, backgroundColor: `${BLUE}15`, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  pinTitle:          { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 6 },
  pinSub:            { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  pinDotsRow:        { flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: 20 },
  pinDot:            { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: BORDER, backgroundColor: WHITE },
  pinDotFilled:      { backgroundColor: BLUE, borderColor: BLUE },
  pinError:          { fontSize: 13, color: CHERRY, textAlign: 'center', marginBottom: 8, marginHorizontal: 20 },
  pinNumpad:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, justifyContent: 'center', marginBottom: 8 },
  pinKey:            { width: 80, height: 56, borderRadius: 14, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  pinKeyPressed:     { backgroundColor: `${BLUE}20` },
  pinKeyPlaceholder: { width: 80, height: 56 },
  pinKeyText:        { fontSize: 22, fontWeight: '600', color: DARK },
  pinBackText:       { fontSize: 20, color: MID },
  pinCancel:         { alignItems: 'center', paddingVertical: 16 },
  pinCancelText:     { fontSize: 15, color: MUTED, fontWeight: '600' },
});
