import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const BLUE = '#40C0F2';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_LABEL: Record<string, string> = {
  received: 'Pending',
  being_prepared: 'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Collected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received: { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared: { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  refunded: { bg: '#FEE2E2', text: '#991B1B' },
};

function formatScheduledDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

function OrderCard({ order }: { order: any }) {
  const colorsForStatus = STATUS_COLORS[order.status] ?? STATUS_COLORS.completed;
  const label = STATUS_LABEL[order.status] ?? order.status.replace(/_/g, ' ');
  const total = (order.totalCents ?? 0) / 100;
  const scheduled = order.scheduledFor ? formatScheduledDate(order.scheduledFor) : null;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: order.status === 'completed' ? 1 : order.status === 'ready_for_pickup' ? 0.85 : order.status === 'being_prepared' ? 0.55 : 0.25,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [order.status, progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['16%', '100%'] });

  return (
    <Pressable onPress={() => router.push(`/(customer)/track/${order.id}` as any)} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
      <View style={s.topRow}>
        <View>
          <Text style={s.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
          <Text style={s.orderDate}>{new Date(order.createdAt).toLocaleDateString('en-AU')}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: colorsForStatus.bg }]}>
          <Text style={[s.badgeText, { color: colorsForStatus.text }]}>{label}</Text>
        </View>
      </View>

      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, { width, backgroundColor: colorsForStatus.text }]} />
      </View>

      {scheduled && (
        <View style={s.row}>
          <Feather name="clock" size={12} color={MUTED} />
          <Text style={s.meta}>{scheduled.date} · {scheduled.time}</Text>
        </View>
      )}

      <View style={s.bottomRow}>
        <Text style={s.meta}>Tap to track live updates</Text>
        <Text style={s.total}>AUD ${total.toFixed(2)}</Text>
      </View>
    </Pressable>
  );
}

export default function CustomerOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    retry: 1,
    refetchInterval: 10000,
  });

  const orders = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><Feather name="arrow-left" size={22} color={TEXT} /></Pressable>
        <Text style={s.headerTitle}>My orders</Text>
        <Text style={[s.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 100, gap: 12 }}><Feather name="package" size={30} color={BLUE} /><Text style={s.emptyTitle}>No orders yet</Text><Text style={s.emptySub}>Your order history will appear here once you place your first order.</Text><Pressable onPress={() => router.push('/(customer)/menu')} style={[s.shopBtn, { backgroundColor: BLUE }]}><Text style={s.shopBtnText}>Browse Menu</Text></Pressable></View>}
          renderItem={({ item }) => <OrderCard order={item} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  headerBrand: { fontSize: 18, fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },
  shopBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  shopBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  orderDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 3 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#EEF2F7', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
});