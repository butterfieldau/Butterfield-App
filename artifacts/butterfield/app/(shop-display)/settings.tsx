import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getShopDisplaySoundEnabled, setShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';

export default function ShopDisplaySettingsScreen() {
  const { user, logout } = useAuth();
  const [soundEnabled, setSoundEnabledState] = useState(true);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabledState).catch(() => {});
  }, []);

  const toggleSound = async (value: boolean) => {
    setSoundEnabledState(value);
    await setShopDisplaySoundEnabled(value);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG, padding: 16, gap: 14 }}>
      <View style={styles.card}>
        <Text style={styles.title}>Logged in as</Text>
        <Text style={styles.value}>{user?.name ?? 'Shop Display'}</Text>
        <Text style={styles.sub}>{user?.email}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Order alerts</Text>
            <Text style={styles.sub}>Play a noticeable alert when a new app order comes through.</Text>
          </View>
          <Switch value={soundEnabled} onValueChange={(value) => void toggleSound(value)} trackColor={{ true: BLUE }} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>App version</Text>
        <Text style={styles.value}>{Constants.expoConfig?.version ?? 'Unavailable'}</Text>
      </View>

      <Pressable
        style={styles.logoutButton}
        onPress={() => {
          Alert.alert('Log out', 'Log out of this shop display?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => void logout() },
          ]);
        }}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 18, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: TEXT, fontSize: 18, fontWeight: '800' },
  value: { color: TEXT, fontSize: 24, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 14, lineHeight: 20 },
  logoutButton: { marginTop: 8, backgroundColor: '#EF4444', borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  logoutText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
