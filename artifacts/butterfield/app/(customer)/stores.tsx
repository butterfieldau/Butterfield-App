import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthProfile } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const BLUE   = '#1493FF';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const SUBTEXT= '#6B7280';
const BORDER = '#E5E7EB';
const BG     = '#F5F6FA';
const WHITE  = '#FFFFFF';

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function openStatusColor(status: string) {
  if (status === 'open')               return GREEN;
  if (status === 'closing_soon')       return AMBER;
  if (status === 'opens_soon')         return BLUE;
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return AMBER;
  return MUTED;
}

function StoreCard({
  store,
  isSelected,
  onSelect,
  canSelect,
}: {
  store: any;
  isSelected: boolean;
  onSelect: () => void;
  canSelect: boolean;
}) {
  const sc       = openStatusColor(store.openStatus);
  const isOpen   = store.openStatus === 'open' || store.openStatus === 'closing_soon';
  const address  = [store.address, store.suburb, store.state, store.postcode].filter(Boolean).join(', ');

  const todayHours   = store.todayHours;
  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;

  const handleDirections = () => {
    if (!store.latitude || !store.longitude) return;
    const q = address || `${store.latitude},${store.longitude}`;
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${store.latitude},${store.longitude}`);
  };

  const handleCall = () => {
    if (!store.phone) return;
    Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`);
  };

  return (
    <View style={[cs.card, isSelected && cs.cardSelected]}>
      {/* "My Store" ribbon */}
      {isSelected && (
        <View style={cs.myStoreRibbon}>
          <Feather name="check-circle" size={12} color={WHITE} />
          <Text style={cs.myStoreRibbonText}>My Store</Text>
        </View>
      )}

      {/* Card header — name + status */}
      <View style={cs.cardHead}>
        <View style={{ flex: 1, paddingRight: isSelected ? 80 : 0 }}>
          <Text style={cs.storeName} numberOfLines={2}>{store.name}</Text>
          {store.suburb ? (
            <Text style={cs.storeSuburb}>{store.suburb}{store.state ? `, ${store.state}` : ''}</Text>
          ) : null}
        </View>
        <View style={[cs.statusPill, { backgroundColor: sc + '18', borderColor: sc + '40' }]}>
          <View style={[cs.statusDot, { backgroundColor: sc }]} />
          <Text style={[cs.statusText, { color: sc }]}>{store.openLabel ?? (isOpen ? 'Open' : 'Closed')}</Text>
        </View>
      </View>

      <View style={cs.divider} />

      {/* Info rows */}
      <View style={cs.infoSection}>
        {!!address && (
          <View style={cs.infoRow}>
            <Feather name="map-pin" size={15} color={MUTED} style={cs.infoIcon} />
            <Text style={cs.infoText} numberOfLines={2}>{address}</Text>
          </View>
        )}
        {todayDisplay && (
          <View style={cs.infoRow}>
            <Feather name="clock" size={15} color={MUTED} style={cs.infoIcon} />
            <Text style={cs.infoText}>{todayDisplay}</Text>
          </View>
        )}
        {store.phone && (
          <View style={cs.infoRow}>
            <Feather name="phone" size={15} color={MUTED} style={cs.infoIcon} />
            <Text style={cs.infoText}>{store.phone}</Text>
          </View>
        )}

        {/* Service chips */}
        <View style={cs.chipRow}>
          {store.pickupAvailable && (
            <View style={[cs.chip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Feather name="shopping-bag" size={11} color={BLUE} />
              <Text style={[cs.chipText, { color: BLUE }]}>Pickup</Text>
            </View>
          )}
          {store.deliveryAvailable && (
            <View style={[cs.chip, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
              <Feather name="truck" size={11} color="#7C3AED" />
              <Text style={[cs.chipText, { color: '#7C3AED' }]}>Delivery</Text>
            </View>
          )}
          {store.status === 'coming_soon' && (
            <View style={[cs.chip, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}>
              <Feather name="clock" size={11} color="#7C3AED" />
              <Text style={[cs.chipText, { color: '#7C3AED' }]}>Coming Soon</Text>
            </View>
          )}
        </View>

        {store.publicNotes ? (
          <Text style={cs.notes}>{store.publicNotes}</Text>
        ) : null}
      </View>

      {/* Action buttons */}
      <View style={cs.actionSection}>
        {/* Order Now — full width CTA, only when open */}
        {store.pickupAvailable && isOpen && (
          <Pressable
            style={cs.orderBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/menu'); }}
          >
            <Feather name="shopping-bag" size={16} color={WHITE} />
            <Text style={cs.orderBtnText}>Order Now</Text>
          </Pressable>
        )}

        {/* Secondary row — Directions + Call */}
        {(store.latitude || store.phone) && (
          <View style={cs.secondaryRow}>
            {store.latitude && store.longitude && (
              <Pressable style={cs.secondaryBtn} onPress={() => { Haptics.selectionAsync(); handleDirections(); }}>
                <Feather name="map" size={15} color={BLUE} />
                <Text style={cs.secondaryBtnText}>Directions</Text>
              </Pressable>
            )}
            {store.phone && (
              <Pressable style={cs.secondaryBtn} onPress={() => { Haptics.selectionAsync(); handleCall(); }}>
                <Feather name="phone" size={15} color={GREEN} />
                <Text style={[cs.secondaryBtnText, { color: GREEN }]}>Call</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Set as My Store — text link, only for logged-in users */}
        {canSelect && !isSelected && (
          <Pressable
            style={cs.selectBtn}
            onPress={() => { Haptics.selectionAsync(); onSelect(); }}
          >
            <Feather name="map-pin" size={13} color={MUTED} />
            <Text style={cs.selectBtnText}>Set as My Store</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function CustomerStoresScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.stores.list(),
    staleTime: 60000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    enabled: !!user,
    staleTime: 60000,
  });

  const stores: any[] = data?.data ?? [];
  const preferredStoreId = (meData?.profile as AuthProfile | null)?.preferredStoreId ?? null;

  const handleSelectStore = async (storeId: string) => {
    try {
      await api.auth.updateMe({ preferredStoreId: storeId });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['me'] }),
        qc.invalidateQueries({ queryKey: ['auth-me'] }),
        qc.invalidateQueries({ queryKey: ['stores'] }),
        qc.invalidateQueries({ queryKey: ['store-status'] }),
      ]);
      Alert.alert('Store updated', 'This store will now be used for your pickup times and in-store orders.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your store right now.';
      Alert.alert('Could not save store', message);
    }
  };

  const locationCount = stores.length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      {/* Hero strip */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        style={[cs.hero, { paddingTop: Math.max(insets.top, 20) + 14 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={cs.heroRow}>
          <View style={cs.heroIconWrap}>
            <Feather name="map-pin" size={20} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={cs.heroTitle}>Our Stores</Text>
            <Text style={cs.heroSub}>
              {isLoading
                ? 'Finding locations…'
                : locationCount === 0
                  ? 'No locations yet'
                  : `${locationCount} location${locationCount !== 1 ? 's' : ''} near you`}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Card list */}
      <View style={cs.list}>
        {isLoading ? (
          <View style={cs.center}>
            <ActivityIndicator size="large" color={BLUE} />
          </View>
        ) : stores.length === 0 ? (
          <View style={cs.center}>
            <View style={cs.emptyIcon}>
              <Feather name="map-pin" size={28} color={MUTED} />
            </View>
            <Text style={cs.emptyTitle}>No stores listed yet</Text>
            <Text style={cs.emptySub}>Check back soon for our upcoming locations.</Text>
          </View>
        ) : (
          stores.map(store => (
            <StoreCard
              key={store.id}
              store={store}
              canSelect={!!user}
              isSelected={preferredStoreId === store.id}
              onSelect={() => { void handleSelectStore(store.id); }}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const cs = StyleSheet.create({
  hero:            { paddingHorizontal: 20, paddingBottom: 22 },
  heroRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIconWrap:    { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroTitle:       { fontSize: 26, fontWeight: '800', color: WHITE, letterSpacing: -0.3 },
  heroSub:         { fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  list:            { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  center:          { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyIcon:       { width: 64, height: 64, borderRadius: 32, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:      { fontSize: 17, fontWeight: '700', color: TEXT },
  emptySub:        { fontSize: 14, color: MUTED, textAlign: 'center', paddingHorizontal: 24 },

  card:            { backgroundColor: WHITE, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden' },
  cardSelected:    { borderColor: GREEN, borderWidth: 1.5 },

  myStoreRibbon:   { position: 'absolute', top: 14, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN, paddingVertical: 4, paddingLeft: 10, paddingRight: 14, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  myStoreRibbonText: { fontSize: 11, fontWeight: '700', color: WHITE },

  cardHead:        { padding: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  storeName:       { fontSize: 18, fontWeight: '800', color: TEXT, lineHeight: 22 },
  storeSuburb:     { fontSize: 12, fontWeight: '400', color: SUBTEXT, marginTop: 2 },

  statusPill:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginTop: 2, flexShrink: 0 },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusText:      { fontSize: 11, fontWeight: '700' },

  divider:         { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 16 },

  infoSection:     { paddingHorizontal: 16, paddingTop: 12, gap: 9 },
  infoRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon:        { marginTop: 1 },
  infoText:        { fontSize: 14, color: SUBTEXT, flex: 1, lineHeight: 20 },

  chipRow:         { flexDirection: 'row', gap: 6, marginTop: 2 },
  chip:            { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  chipText:        { fontSize: 11, fontWeight: '600' },

  notes:           { fontSize: 12, color: MUTED, fontStyle: 'italic', lineHeight: 17 },

  actionSection:   { padding: 14, gap: 8 },

  orderBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE, borderRadius: 12, paddingVertical: 13 },
  orderBtnText:    { fontSize: 15, fontWeight: '700', color: WHITE },

  secondaryRow:    { flexDirection: 'row', gap: 8 },
  secondaryBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F9FAFB' },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: BLUE },

  selectBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  selectBtnText:   { fontSize: 13, fontWeight: '500', color: MUTED },
});
