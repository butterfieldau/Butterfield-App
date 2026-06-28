import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  Alert, Linking, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import Reanimated, {
  interpolate, useAnimatedStyle, useSharedValue,
  withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { api, type AuthProfile } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function openStatusColor(status: string) {
  if (status === 'open')               return '#16A34A';
  if (status === 'closing_soon')       return '#F59E0B';
  if (status === 'opens_soon')         return '#3B82F6';
  if (status === 'coming_soon')        return '#8B5CF6';
  if (status === 'temporarily_closed') return '#F59E0B';
  return '#8E8E93';
}

interface ShimmerBoxProps {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  shimmerProgress: SharedValue<number>;
}

function ShimmerBox({ width = '100%', height, borderRadius = 8, shimmerProgress }: ShimmerBoxProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerProgress.value, [0, 1], [0.3, 0.7]),
  }));
  return (
    <Reanimated.View
      style={[{ width, height, borderRadius, backgroundColor: '#D1D5DB' }, animStyle]}
    />
  );
}

function ShimmerStoreCard({ shimmerProgress }: { shimmerProgress: SharedValue<number> }) {
  return (
    <View style={[sc.card, { backgroundColor: '#fff', borderColor: '#D3EAFE' }]}>
      <ShimmerBox width="100%" height={72} borderRadius={0} shimmerProgress={shimmerProgress} />
      <View style={{ padding: 16, gap: 12 }}>
        <ShimmerBox width="60%" height={13} shimmerProgress={shimmerProgress} />
        <ShimmerBox width="80%" height={11} shimmerProgress={shimmerProgress} />
        <ShimmerBox width="45%" height={11} shimmerProgress={shimmerProgress} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <ShimmerBox width={70} height={28} borderRadius={20} shimmerProgress={shimmerProgress} />
          <ShimmerBox width={70} height={28} borderRadius={20} shimmerProgress={shimmerProgress} />
        </View>
        <ShimmerBox width="100%" height={44} borderRadius={12} shimmerProgress={shimmerProgress} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ShimmerBox width="31%" height={40} borderRadius={10} shimmerProgress={shimmerProgress} />
          <ShimmerBox width="31%" height={40} borderRadius={10} shimmerProgress={shimmerProgress} />
          <ShimmerBox width="31%" height={40} borderRadius={10} shimmerProgress={shimmerProgress} />
        </View>
      </View>
    </View>
  );
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
  const colors = useColors();
  const statusColor = openStatusColor(store.openStatus);
  const isOpen = store.openStatus === 'open' || store.openStatus === 'closing_soon';

  const handleDirections = () => {
    if (!store.latitude || !store.longitude) return;
    const q = store.address
      ? `${store.address}, ${store.suburb ?? ''}, ${store.state ?? ''} ${store.postcode ?? ''}, Australia`
      : `${store.latitude},${store.longitude}`;
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}&ll=${store.latitude},${store.longitude}`);
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

  const address = [store.address, store.suburb, store.state, store.postcode].filter(Boolean).join(', ');

  return (
    <View style={[sc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Gradient banner */}
      <LinearGradient
        colors={isOpen ? ['#1493FF', '#3CBBEE'] : ['#9CA3AF', '#6B7280']}
        style={sc.banner}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Feather name="map-pin" size={15} color="#fff" />
          <Text style={sc.bannerTitle} numberOfLines={1}>{store.name}</Text>
        </View>
        <View style={sc.openBadge}>
          <View style={[sc.dot, { backgroundColor: statusColor }]} />
          <Text style={sc.openBadgeText}>{store.openLabel}</Text>
        </View>
      </LinearGradient>

      {/* Body */}
      <View style={{ padding: 16, gap: 12 }}>
        {/* Address */}
        {!!address && (
          <View style={sc.infoRow}>
            <Feather name="navigation" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
            <Text style={[sc.infoText, { color: colors.foreground }]} numberOfLines={2}>{address}</Text>
          </View>
        )}

        {/* Today's hours */}
        {todayDisplay ? (
          <View style={sc.infoRow}>
            <Feather name="clock" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
            <Text style={[sc.infoText, { color: colors.foreground }]}>{todayDisplay}</Text>
          </View>
        ) : null}

        {/* Phone */}
        {store.phone ? (
          <View style={sc.infoRow}>
            <Feather name="phone" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
            <Text style={[sc.infoText, { color: colors.foreground }]}>{store.phone}</Text>
          </View>
        ) : null}

        {/* Service chips */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {store.pickupAvailable && (
            <View style={[sc.chip, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="shopping-bag" size={11} color="#1493FF" />
              <Text style={[sc.chipText, { color: '#1493FF' }]}>Pickup</Text>
            </View>
          )}
          {store.deliveryAvailable && (
            <View style={[sc.chip, { backgroundColor: '#F5F3FF' }]}>
              <Feather name="truck" size={11} color="#7C3AED" />
              <Text style={[sc.chipText, { color: '#7C3AED' }]}>Delivery</Text>
            </View>
          )}
          {store.status === 'coming_soon' && (
            <View style={[sc.chip, { backgroundColor: '#EDE9FE' }]}>
              <Feather name="clock" size={11} color="#7C3AED" />
              <Text style={[sc.chipText, { color: '#7C3AED' }]}>Coming Soon</Text>
            </View>
          )}
        </View>

        {/* Public notes */}
        {store.publicNotes ? (
          <Text style={[sc.notes, { color: colors.mutedForeground }]}>{store.publicNotes}</Text>
        ) : null}

        {/* Primary CTA — My Store */}
        {canSelect && (
          <Pressable
            style={[
              sc.primaryCta,
              {
                backgroundColor: isSelected ? '#1493FF' : '#F0F8FF',
                borderColor: isSelected ? '#1493FF' : '#D3EAFE',
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect();
            }}
          >
            <Feather name={isSelected ? 'check-circle' : 'map-pin'} size={16} color={isSelected ? '#fff' : '#1493FF'} />
            <Text style={[sc.primaryCtaText, { color: isSelected ? '#fff' : '#1493FF' }]}>
              {isSelected ? 'My Store' : 'Set as My Store'}
            </Text>
          </Pressable>
        )}

        {/* Secondary action row */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {store.latitude != null && store.longitude != null && (
            <Pressable
              style={sc.actionBtn}
              onPress={() => { Haptics.selectionAsync(); handleDirections(); }}
            >
              <Feather name="map" size={15} color="#1493FF" />
              <Text style={[sc.actionBtnText, { color: '#1493FF' }]}>Directions</Text>
            </Pressable>
          )}
          {store.phone ? (
            <Pressable
              style={sc.actionBtn}
              onPress={() => { Haptics.selectionAsync(); handleCall(); }}
            >
              <Feather name="phone" size={15} color="#16A34A" />
              <Text style={[sc.actionBtnText, { color: '#16A34A' }]}>Call</Text>
            </Pressable>
          ) : null}
          {store.pickupAvailable && isOpen && (
            <Pressable
              style={[sc.actionBtn, { backgroundColor: '#D20001', borderColor: '#D20001' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(customer)/menu');
              }}
            >
              <Feather name="shopping-bag" size={15} color="#fff" />
              <Text style={[sc.actionBtnText, { color: '#fff' }]}>Order</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function CustomerStoresScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const shimmerProgress = useSharedValue(0);
  useEffect(() => {
    shimmerProgress.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [shimmerProgress]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.stores.list(),
    staleTime: 60_000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    enabled: !!user,
    staleTime: 60_000,
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

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Gradient header with back button */}
        <LinearGradient
          colors={['#1493FF', '#3CBBEE']}
          style={[sc.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable
            style={sc.backBtn}
            hitSlop={12}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Feather name="chevron-left" size={28} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={sc.headerTitle}>Our Stores</Text>
            <Text style={sc.headerSub}>Find your nearest Butterfield Cookies</Text>
          </View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 48,
            gap: 14,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1493FF" />
          }
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <>
              <ShimmerStoreCard shimmerProgress={shimmerProgress} />
              <ShimmerStoreCard shimmerProgress={shimmerProgress} />
              <ShimmerStoreCard shimmerProgress={shimmerProgress} />
            </>
          ) : stores.length === 0 ? (
            <View style={sc.emptyState}>
              <View style={sc.emptyIconWrap}>
                <Feather name="map-pin" size={40} color="#1493FF" />
              </View>
              <Text style={sc.emptyTitle}>No stores listed yet</Text>
              <Text style={sc.emptySub}>
                Check back soon — new Butterfield Cookies locations are on the way.
              </Text>
            </View>
          ) : (
            stores.map((store: any) => (
              <StoreCard
                key={store.id}
                store={store}
                canSelect={!!user}
                isSelected={preferredStoreId === store.id}
                onSelect={() => { void handleSelectStore(store.id); }}
              />
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const sc = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  backBtn: {
    paddingBottom: 2,
    marginRight: 4,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 28,
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#1493FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bannerTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  openBadgeText: {
    fontWeight: '600',
    fontSize: 11,
    color: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    fontWeight: '400',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontWeight: '600',
    fontSize: 11,
  },
  notes: {
    fontWeight: '400',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  primaryCtaText: {
    fontWeight: '700',
    fontSize: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  actionBtnText: {
    fontWeight: '600',
    fontSize: 12,
  },
  emptyState: {
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontWeight: '700',
    fontSize: 20,
    color: '#1C1C1E',
    textAlign: 'center',
  },
  emptySub: {
    fontWeight: '400',
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 21,
  },
});
