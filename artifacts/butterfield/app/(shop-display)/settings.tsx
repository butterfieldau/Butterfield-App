import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import type { ShopDisplayStore } from '@/lib/api';
import { getShopDisplaySoundEnabled, setShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const GREEN  = '#16A34A';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:               { bg: '#DCFCE7', text: '#166534' },
  temporarily_closed: { bg: '#FEF3C7', text: '#92400E' },
  coming_soon:        { bg: '#DBEAFE', text: '#1D4ED8' },
  closed:             { bg: '#FEE2E2', text: '#B91C1C' },
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  temporarily_closed: 'Temporarily Closed',
  coming_soon: 'Coming Soon',
  closed: 'Closed',
};

export default function ShopDisplaySettingsScreen() {
  const { user, logout } = useAuth();
  const [soundEnabled, setSoundEnabledState] = useState(true);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabledState).catch(() => {});
  }, []);

  const { data: storeData, isLoading: storeLoading } = useQuery({
    queryKey: ['shop-display-store'],
    queryFn: () => api.shopDisplay.store(),
    staleTime: 60000,
  });

  const stores: ShopDisplayStore[] = storeData?.data ?? [];

  const toggleSound = async (value: boolean) => {
    setSoundEnabledState(value);
    await setShopDisplaySoundEnabled(value);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>

      {/* ── Assigned stores ── */}
      <View style={styles.sectionHeader}>
        <Feather name="map-pin" size={15} color={NAVY} />
        <Text style={styles.sectionTitle}>Assigned Stores</Text>
      </View>

      {storeLoading ? (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : stores.length === 0 ? (
        <View style={[styles.card, { gap: 6 }]}>
          <Text style={styles.title}>No store assigned</Text>
          <Text style={styles.sub}>Contact your director to assign this display to a store.</Text>
        </View>
      ) : (
        stores.map((store) => {
          const stColors = STATUS_COLORS[store.status ?? 'open'] ?? STATUS_COLORS.open;
          return (
            <View key={store.id} style={[styles.card, { gap: 12 }]}>
              <View style={styles.storeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{store.name}</Text>
                  {store.address || store.suburb ? (
                    <Text style={styles.storeAddress}>{[store.address, store.suburb].filter(Boolean).join(', ')}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: stColors.bg }]}>
                  <Text style={[styles.statusText, { color: stColors.text }]}>
                    {STATUS_LABELS[store.status ?? 'open'] ?? store.status}
                  </Text>
                </View>
              </View>

              {store.dailySpecial ? (
                <View style={styles.specialBanner}>
                  <Feather name="sun" size={13} color={AMBER} />
                  <Text style={styles.specialText}>{store.dailySpecial}</Text>
                </View>
              ) : null}

              {(store.printerIp || store.printerBrand) && (
                <View style={styles.printerRow}>
                  <Feather name="printer" size={14} color={MUTED} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.printerLabel}>Receipt Printer</Text>
                    <Text style={styles.printerValue}>
                      {store.printerBrand
                        ? store.printerBrand.charAt(0).toUpperCase() + store.printerBrand.slice(1)
                        : 'Printer'}
                      {store.printerIp ? ` · ${store.printerIp}:${store.printerPort ?? 9100}` : ' · Not configured'}
                    </Text>
                  </View>
                  <View style={[styles.autoPrintBadge, { backgroundColor: store.autoPrint ? '#DCFCE7' : '#F3F4F6' }]}>
                    <Text style={[styles.autoPrintText, { color: store.autoPrint ? GREEN : MUTED }]}>
                      {store.autoPrint ? 'Auto-print ON' : 'Auto-print OFF'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* ── Session info ── */}
      <View style={styles.sectionHeader}>
        <Feather name="user" size={15} color={NAVY} />
        <Text style={styles.sectionTitle}>Session</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Logged in as</Text>
        <Text style={styles.value}>{user?.name ?? 'Shop Display'}</Text>
        <Text style={styles.sub}>{user?.email}</Text>
      </View>

      {/* ── Preferences ── */}
      <View style={styles.sectionHeader}>
        <Feather name="sliders" size={15} color={NAVY} />
        <Text style={styles.sectionTitle}>Preferences</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Order alerts</Text>
            <Text style={styles.sub}>Play a sound when a new app order arrives.</Text>
          </View>
          <Switch value={soundEnabled} onValueChange={(v) => void toggleSound(v)} trackColor={{ true: BLUE }} />
        </View>
      </View>

      {/* ── App info ── */}
      <View style={styles.sectionHeader}>
        <Feather name="info" size={15} color={NAVY} />
        <Text style={styles.sectionTitle}>About</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>App version</Text>
        <Text style={styles.value}>{Constants.expoConfig?.version ?? 'Unavailable'}</Text>
      </View>

      <Pressable
        onPress={() => logout()}
        style={[styles.card, styles.logoutBtn]}
      >
        <Feather name="log-out" size={16} color={RED} />
        <Text style={styles.logoutText}>Sign out of this display</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4, marginBottom: -6 },
  sectionTitle:     { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, color: MUTED },
  card:             { backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 4 },
  title:            { color: MUTED, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  value:            { color: TEXT, fontSize: 18, fontWeight: '800' },
  sub:              { color: MUTED, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  row:              { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  storeName:        { fontSize: 17, fontWeight: '800', color: TEXT },
  storeAddress:     { fontSize: 13, color: MUTED, fontWeight: '500', marginTop: 2 },
  statusBadge:      { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:       { fontSize: 12, fontWeight: '700' },
  specialBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10 },
  specialText:      { flex: 1, fontSize: 14, color: '#92400E', fontWeight: '600' },
  printerRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  printerLabel:     { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  printerValue:     { fontSize: 14, fontWeight: '600', color: TEXT, marginTop: 2 },
  autoPrintBadge:   { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  autoPrintText:    { fontSize: 11, fontWeight: '700' },
  logoutBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  logoutText:       { color: RED, fontSize: 15, fontWeight: '700' },
});
