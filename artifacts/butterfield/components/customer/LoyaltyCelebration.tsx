import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { CoffeeStampIcon } from '@/components/CoffeeStampIcon';

const STAMP_COUNT = 6;

export type CelebrationTier = {
  key: string;
  label: string;
  gradients: [string, string, string];
};

export function TierCelebrateOverlay({
  visible,
  tier,
  onClose,
}: {
  visible: boolean;
  tier: CelebrationTier | null;
  onClose: () => void;
}) {
  const scale   = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 15, stiffness: 180, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity, scale]);

  if (!visible || !tier) return null;

  return (
    <Animated.View style={[s.backdrop, { opacity }]}>
      <Animated.View style={[s.card, { transform: [{ scale }] }]}>
        <LinearGradient colors={tier.gradients} style={StyleSheet.absoluteFillObject} />
        <SparkleRow />
        <Text style={s.eyebrow}>LEVEL UP</Text>
        <Text style={s.title}>Welcome to {tier.label}</Text>
        <Text style={s.body}>Your Butterfield perks just got better. Your new tier benefits are now active.</Text>
        <Pressable style={s.btn} onPress={onClose}>
          <Text style={s.btnText}>View my perks</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export function StampCelebrateOverlay({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const scale      = useRef(new Animated.Value(0.88)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const stampAnims = useRef(
    Array.from({ length: STAMP_COUNT }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.88);
      opacity.setValue(0);
      stampAnims.forEach((a) => a.setValue(0));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 14, stiffness: 170, useNativeDriver: true }),
    ]).start();
    const stampSequence = stampAnims.map((anim, i) =>
      Animated.sequence([
        Animated.delay(280 + i * 100),
        Animated.spring(anim, { toValue: 1, damping: 11, stiffness: 200, useNativeDriver: true }),
      ]),
    );
    Animated.parallel(stampSequence).start();
  }, [visible, scale, opacity, stampAnims]);

  if (!visible) return null;

  return (
    <Animated.View style={[s.backdrop, { opacity }]}>
      <Animated.View style={[s.card, { transform: [{ scale }] }]}>
        <LinearGradient colors={['#0B63D8', '#1E93FF', '#5AB8FF']} style={StyleSheet.absoluteFillObject} />
        <SparkleRow />
        <Text style={s.eyebrow}>COFFEE CLUB</Text>
        <Text style={s.title}>Free Coffee Unlocked! ☕</Text>
        <Text style={s.body}>You've collected all 6 stamps. Your free coffee is ready to redeem.</Text>
        <View style={s.stampRow}>
          {stampAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={{
                transform: [{ scale: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.3, 1.28, 1] }) }],
                opacity: anim,
              }}
            >
              <CoffeeStampIcon size={24} color="#0A67EC" />
            </Animated.View>
          ))}
        </View>
        <Pressable style={s.btn} onPress={onClose}>
          <Text style={s.btnText}>Redeem now</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function SparkleRow() {
  return (
    <View style={s.sparkleRow}>
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={i} style={[s.sparkleDot, { opacity: i % 2 === 0 ? 0.82 : 0.48 }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  card: {
    width: 320,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 28,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 20,
  },
  sparkleRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  sparkleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' },
  eyebrow: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title:   { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', lineHeight: 30, letterSpacing: -0.4 },
  body:    { color: 'rgba(255,255,255,0.78)', fontSize: 14, textAlign: 'center', lineHeight: 20, fontWeight: '500' },
  stampRow: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
