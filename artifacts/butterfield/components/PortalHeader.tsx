import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

const NAVY = '#1A2B4A';

function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString('en-AU', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney',
      });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

type Props = {
  badge?: string;
  badgeColor?: string;
  backgroundColor?: string;
};

export function PortalHeader({ badge, badgeColor = '#EF4444', backgroundColor = NAVY }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const clock = useLiveClock();
  const todayStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney',
  });

  return (
    <View style={{ backgroundColor }}>
      <View style={{ height: insets.top, backgroundColor }} />
      <View style={styles.strip}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={{ width: 120, height: 38 }}
            resizeMode="contain"
          />
          {badge ? (
            <View style={[styles.badge, { backgroundColor: badgeColor }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.date}>{todayStr}</Text>
            <Text style={styles.welcome}>Welcome, {user?.name?.split(' ')[0] ?? 'there'}</Text>
          </View>
          <View style={styles.clockPill}>
            <Feather name="clock" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.clockText}>{clock}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  logoRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  date:      { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter_400Regular' },
  welcome:   { fontSize: 19, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
  clockPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12,
    paddingVertical: 7, borderRadius: 20,
  },
  clockText: { fontSize: 14, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
});
