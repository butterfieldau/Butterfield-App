import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useStores } from '@/hooks/useStores';
import { api, type AuthProfile, type StoreSummary } from '@/lib/api';

function fmt12(time: string) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function StoreScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { data: storesData, isLoading } = useStores();
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    staleTime: 60000,
  });

  const stores = storesData?.data ?? [];
  const preferredStoreId = (meData?.profile as AuthProfile | null)?.preferredStoreId ?? null;
  const store: StoreSummary | null = (preferredStoreId
    ? stores.find((item) => item.id === preferredStoreId)
    : null) ?? stores[0] ?? null;

  const address = [store?.address, store?.suburb, store?.state, store?.postcode].filter(Boolean).join(', ');
  const isOpen = store?.openStatus === 'open' || store?.openStatus === 'closing_soon';

  const openDirections = () => {
    if (!store) return;
    const q = address || store.name;
    const url = store.latitude != null && store.longitude != null
      ? `https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${store.latitude},${store.longitude}`
      : `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
    Linking.openURL(url).catch(() => {});
  };

  const openCall = () => {
    if (!store?.phone) return;
    Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`).catch(() => {});
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          hitSlop={12}
        >
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Your store</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Pickup details and opening hours</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1493FF" />
        </View>
      ) : !store ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No store selected yet</Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Choose your preferred store to see pickup details here.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/customer-stores' as any)}>
            <Text style={styles.primaryBtnText}>Choose Store</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.body}>
            <Text style={styles.visitLabel}>YOUR PICKUP STORE</Text>
            <Text style={[styles.storeName, { color: colors.foreground }]}>{store.name}</Text>
            <Text style={[styles.storeAddress, { color: colors.mutedForeground }]}>{address || 'Address coming soon'}</Text>
            <View style={[styles.openBadge, { backgroundColor: isOpen ? '#DCFCE7' : '#FEE2E2' }]}>
              <View style={[styles.openDot, { backgroundColor: isOpen ? '#22C55E' : '#EF4444' }]} />
              <Text style={[styles.openText, { color: isOpen ? '#15803D' : '#DC2626' }]}>{store.openLabel ?? 'Check hours below'}</Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Store details</Text>
              <Text style={[styles.infoText, { color: colors.foreground }]}>{address || 'Address coming soon'}</Text>
              {store.phone ? <Text style={[styles.infoText, { color: colors.foreground }]}>{store.phone}</Text> : null}
              {store.website ? <Text style={[styles.infoLink, { color: '#1493FF' }]}>{store.website.replace(/^https?:\/\//, '')}</Text> : null}
              {store.dailySpecial ? <Text style={[styles.noteText, { color: colors.mutedForeground }]}>Today’s special: {store.dailySpecial}</Text> : null}
            </View>

            {(store.openingHours?.length ?? 0) > 0 && (
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Opening hours</Text>
                {store.openingHours!.map((hour) => (
                  <View key={`${hour.dayOfWeek}`} style={styles.hoursRow}>
                    <Text style={[styles.hoursDay, { color: colors.foreground }]}>{DAYS_LONG[hour.dayOfWeek] ?? 'Day'}</Text>
                    <Text style={[styles.hoursTime, { color: hour.isClosed ? colors.mutedForeground : colors.foreground }]}>
                      {hour.isClosed ? 'Closed' : hour.openTime && hour.closeTime ? `${fmt12(hour.openTime)} – ${fmt12(hour.closeTime)}` : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => router.push('/customer-stores' as any)}>
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Change Store</Text>
              </Pressable>
              {!!store.phone && (
                <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={openCall}>
                  <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Call</Text>
                </Pressable>
              )}
              <Pressable style={styles.primaryBtn} onPress={openDirections}>
                <Text style={styles.primaryBtnText}>Directions</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scroll: { flexGrow: 1 },
  body: { padding: 20, gap: 16 },
  visitLabel: { fontSize: 12, letterSpacing: 1, color: '#1493FF', fontWeight: '600' },
  storeName: { fontSize: 30, lineHeight: 34, fontWeight: '700', marginTop: -4 },
  storeAddress: { fontSize: 14, marginTop: 2 },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' },
  openDot: { width: 8, height: 8, borderRadius: 4 },
  openText: { fontSize: 13, fontWeight: '600' },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, fontWeight: '600' },
  infoText: { fontSize: 15, lineHeight: 22 },
  infoLink: { fontSize: 14, fontWeight: '600' },
  noteText: { fontSize: 13, lineHeight: 19 },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  hoursDay: { fontSize: 14, flex: 1 },
  hoursTime: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { backgroundColor: '#1493FF', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
});
