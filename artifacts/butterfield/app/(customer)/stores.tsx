import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator, Linking, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function openStatusColor(status: string) {
  if (status === 'open')              return '#16A34A';
  if (status === 'closing_soon')      return '#F59E0B';
  if (status === 'opens_soon')        return '#3B82F6';
  if (status === 'coming_soon')       return '#8B5CF6';
  if (status === 'temporarily_closed')return '#F59E0B';
  return '#8E8E93';
}
const cs = StyleSheet.create({
  hero:            { paddingHorizontal: 20, paddingBottom: 28 },
  heroTitle:       { fontWeight: '700', fontSize: 30, color: '#fff', marginBottom: 4 },
  heroSub:         { fontWeight: '400', fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  card:            { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  cardBanner:      { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBannerTitle: { fontWeight: '700', fontSize: 16, color: '#fff', flex: 1 },
  openBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  dot:             { width: 7, height: 7, borderRadius: 4 },
  openBadgeText:   { fontWeight: '600', fontSize: 11, color: '#fff' },
  infoRow:         { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  infoText:        { fontWeight: '400', fontSize: 13, flex: 1, lineHeight: 18 },
  serviceChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  serviceText:     { fontWeight: '500', fontSize: 11 },
  notes:           { fontWeight: '400', fontSize: 12, fontStyle: 'italic' },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  actionBtnText:   { fontWeight: '600', fontSize: 13, color: '#1493FF' },
});
function StoreCard({ store }: { store: any }) {
  const colors = useColors();
  const sc = openStatusColor(store.openStatus);
  const isOpen = store.openStatus === 'open' || store.openStatus === 'closing_soon';
  const handleDirections = () => {
    if (!store.latitude || !store.longitude) return;
    const q = store.address
      ? `${store.address}, ${store.suburb ?? ''}, ${store.state ?? ''} ${store.postcode ?? ''}, Australia`
      : `${store.latitude},${store.longitude}`;
    const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${store.latitude},${store.longitude}`;
    Linking.openURL(mapsUrl);
  };
  const handleCall = () => {
    if (!store.phone) return;
    Linking.openURL(`tel:${store.phone.replace(/\s/g, '')}`);
  };
  const todayHours = store.todayHours;
  const todayDisplay = todayHours?.isClosed
    ? 'Closed today'
    : todayHours?.openTime && todayHours?.closeTime
      ? `${fmt12(todayHours.openTime)} – ${fmt12(todayHours.closeTime)}`
      : null;
  return (
    <View style={[cs.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Gradient header */}
      <LinearGradient
        colors={isOpen ? ['#1493FF', '#3CBBEE'] : ['#8E8E93', '#6B6B6B']}
        style={cs.cardBanner}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="map-pin" size={16} color="#fff" />
          <Text style={cs.cardBannerTitle}>{store.name}</Text>
        </View>
        <View style={[cs.openBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <View style={[cs.dot, { backgroundColor: sc }]} />
          <Text style={cs.openBadgeText}>{store.openLabel}</Text>
        </View>
      </LinearGradient>
      {/* Body */}
      <View style={{ padding: 14, gap: 10 }}>
        {/* Address */}
        <View style={cs.infoRow}>
          <Feather name="navigation" size={14} color={colors.mutedForeground} />
          <Text style={[cs.infoText, { color: colors.foreground }]} numberOfLines={2}>
            {[store.address, store.suburb, store.state, store.postcode].filter(Boolean).join(', ')}
          </Text>
        </View>
        {/* Today's hours */}
        {todayDisplay && (
          <View style={cs.infoRow}>
            <Feather name="clock" size={14} color={colors.mutedForeground} />
            <Text style={[cs.infoText, { color: colors.foreground }]}>{todayDisplay}</Text>
          </View>
        )}
        {/* Phone */}
        {store.phone && (
          <View style={cs.infoRow}>
            <Feather name="phone" size={14} color={colors.mutedForeground} />
            <Text style={[cs.infoText, { color: colors.foreground }]}>{store.phone}</Text>
          </View>
        )}
        {/* Services */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          {store.pickupAvailable   && <View style={cs.serviceChip}><Feather name="shopping-bag" size={11} color="#1493FF" /><Text style={[cs.serviceText, { color: '#1493FF' }]}>Pickup</Text></View>}
          {store.deliveryAvailable && <View style={[cs.serviceChip, { backgroundColor: '#F5F3FF' }]}><Feather name="truck" size={11} color="#7C3AED" /><Text style={[cs.serviceText, { color: '#7C3AED' }]}>Delivery</Text></View>}
          {store.status === 'coming_soon' && <View style={[cs.serviceChip, { backgroundColor: '#EDE9FE' }]}><Feather name="clock" size={11} color="#7C3AED" /><Text style={[cs.serviceText, { color: '#7C3AED' }]}>Coming Soon</Text></View>}
        </View>
        {/* Public notes */}
        {store.publicNotes ? (
          <Text style={[cs.notes, { color: colors.mutedForeground }]}>{store.publicNotes}</Text>
        ) : null}
        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {store.latitude && store.longitude && (
            <Pressable style={[cs.actionBtn, { flex: 1 }]} onPress={handleDirections}>
              <Feather name="map" size={14} color="#1493FF" />
              <Text style={cs.actionBtnText}>Directions</Text>
            </Pressable>
          )}
          {store.phone && (
            <Pressable style={[cs.actionBtn, { flex: 1 }]} onPress={handleCall}>
              <Feather name="phone" size={14} color="#16A34A" />
              <Text style={[cs.actionBtnText, { color: '#16A34A' }]}>Call</Text>
            </Pressable>
          )}
          {store.pickupAvailable && store.status === 'open' && (
            <Pressable style={[cs.actionBtn, { flex: 1, backgroundColor: '#1493FF' }]} onPress={() => router.push('/(customer)/menu')}>
              <Feather name="shopping-bag" size={14} color="#fff" />
              <Text style={[cs.actionBtnText, { color: '#fff' }]}>Order</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
export default function CustomerStoresScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.stores.list(),
    staleTime: 60000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const stores: any[] = data?.data ?? [];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1493FF" />}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        style={[cs.hero, { paddingTop: Math.max(insets.top, 20) + 16 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <Text style={cs.heroTitle}>Our Stores</Text>
        <Text style={cs.heroSub}>Find your nearest Butterfield Cookies</Text>
      </LinearGradient>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        {isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1493FF" />
          </View>
        ) : stores.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
            <Feather name="map-pin" size={32} color="#8E8E93" />
            <Text style={{ fontWeight: '600', fontSize: 16, color: '#1C1C1E' }}>No stores listed yet</Text>
            <Text style={{ fontWeight: '400', fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>Check back soon for our upcoming locations.</Text>
          </View>
        ) : (
          stores.map(store => <StoreCard key={store.id} store={store} />)
        )}
      </View>
    </ScrollView>
  );
}
