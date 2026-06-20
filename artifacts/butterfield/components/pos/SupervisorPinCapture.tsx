import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Animated, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import styles from './posStyles';
import { BLUE, DARK, MUTED } from './types';

export default function SupervisorPinCapture({ onClose, onSuccess, title, subtitle }: {
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { height: screenH } = useWindowDimensions();
  const [digits, setDigits] = React.useState<string[]>([]);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  void shake;

  const appendDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = [...digits, d];
    setDigits(next);
    Haptics.selectionAsync();
    if (next.length === 4) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(next.join(''));
    }
  };

  const backspace = () => {
    setDigits(prev => prev.slice(0, -1));
    Haptics.selectionAsync();
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.pinOverlay} onPress={onClose}>
        <Pressable style={[styles.pinSheet, { maxHeight: screenH * 0.72 }]} onPress={() => {}}>
          <View style={styles.pinHeader}>
            <View style={styles.pinLockCircle}>
              <Feather name="shield" size={22} color={BLUE} />
            </View>
            <Text style={styles.pinTitle}>{title ?? 'Supervisor Authorisation'}</Text>
            <Text style={styles.pinSub}>{subtitle ?? 'Enter your POS PIN to continue'}</Text>
          </View>
          <Animated.View style={[styles.pinDotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[styles.pinDot, digits[i] !== undefined && styles.pinDotFilled]} />
            ))}
          </Animated.View>
          <View style={styles.pinNumpad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={`k-${i}`} style={styles.pinKeyPlaceholder} />;
              const isBack = key === '⌫';
              return (
                <Pressable
                  key={key}
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

void DARK;
void MUTED;
