import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
  onLogout?: () => void;
  onLock?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  syncLabel?: string;
};

export function PortalHeader({ badge, badgeColor = '#EF4444', backgroundColor = NAVY, onLogout, onLock, onSync, syncing, syncLabel }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const clock = useLiveClock();
  const todayStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney',
  });

  const handleLogout = () => {
    if (!onLogout) return;
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: onLogout },
    ]);
  };

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badgeColor }]}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
            {onSync ? (
              <Pressable
                onPress={syncing ? undefined : onSync}
                style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
                hitSlop={8}
              >
                <Feather name="refresh-cw" size={12} color={syncing ? 'rgba(255,255,255,0.4)' : '#fff'} />
                <Text style={[styles.syncText, syncing && { opacity: 0.4 }]}>
                  {syncing ? 'Syncing…' : (syncLabel ?? 'Sync')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.date}>{todayStr}</Text>
            <Text style={styles.welcome}>Welcome, {user?.name?.split(' ')[0] ?? 'there'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.clockPill}>
              <Feather name="clock" size={11} color="rgba(255,255,255,0.7)" />
              <Text style={styles.clockText}>{clock}</Text>
            </View>
            {onLock ? (
              <Pressable onPress={onLock} style={styles.logoutBtn} hitSlop={8}>
                <Feather name="lock" size={16} color="rgba(255,255,255,0.75)" />
              </Pressable>
            ) : onLogout ? (
              <Pressable onPress={handleLogout} style={styles.logoutBtn} hitSlop={8}>
                <Feather name="log-out" size={16} color="rgba(255,255,255,0.75)" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip:          { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  logoRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText:      { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  syncBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  syncBtnDisabled:{ opacity: 0.55 },
  syncText:       { color: '#fff', fontSize: 11, fontWeight: '600' },
  bottomRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  date:       { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '400' },
  welcome:    { fontSize: 19, color: '#FFFFFF', fontWeight: '700' },
  clockPill:  {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12,
    paddingVertical: 7, borderRadius: 20,
  },
  clockText:  { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },
  logoutBtn:  {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
});
