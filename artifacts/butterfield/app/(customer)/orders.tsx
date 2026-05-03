import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
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

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_LABEL: Record<string, string> = {
  received:         'Pending',
  being_prepared:   'Preparing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  completed:        'Collected',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
  refunded:         { bg: '#FEE2E2', text: '#991B1B' },
};

function formatScheduledDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, time };
}

function formatPlacedDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export default function CustomerOrdersScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders'],
    queryFn:  () => api.orders.list(),
    retry: 1,
  });

  const orders = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>My orders</Text>
        <Text style={[styles.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />
          }
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 100, gap: 14 }}>
              <View style={[styles.emptyIcon, { backgroundColor: '#EBF8FF' }]}>
                <Feather name="package" size={32} color={BLUE} />
              </View>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySub}>
                Your order history will appear here once you place your first order.
              </Text>
              <Pressable
                onPress={() => router.push('/(customer)/menu')}
                style={[styles.shopBtn, { backgroundColor: BLUE }]}
              >
                <Text style={styles.shopBtnText}>Browse Menu</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: order }) => {
            const colorsForStatus = STATUS_COLORS[order.status] ?? STATUS_COLORS.completed;
            const label           = STATUS_LABEL[order.status] ?? order.status.replace(/_/g, ' ');
            const total           = (order.totalCents ?? 0) / 100;
            const shortId         = `#BC-${order.id.slice(-6).toUpperCase()}`;
            const placed          = formatPlacedDate(order.createdAt);
            const scheduled       = order.scheduledFor ? formatScheduledDate(order.scheduledFor) : null;

            return (
              <Pressable
                onPress={() => router.push(`/(customer)/track/${order.id}` as any)}
                style={[styles.orderCard, { backgroundColor: CARD, borderColor: BORDER }]}
              >
                {/* Row 1: Order ID + Status badge */}
                <View style={styles.orderTopRow}>
                  <Text style={styles.orderId}>{shortId}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: colorsForStatus.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: colorsForStatus.text }]}>{label}</Text>
                  </View>
                </View>

                {/* Row 2: Date + Time */}
                {scheduled && (
                  <View style={styles.scheduleRow}>
                    <View style={styles.scheduleCell}>
                      <Feather name="calendar" size={12} color={MUTED} />
                      <Text style={styles.scheduleText}>{scheduled.date}</Text>
                    </View>
                    <View style={styles.scheduleCell}>
                      <Feather name="clock" size={12} color={MUTED} />
                      <Text style={styles.scheduleText}>{scheduled.time}</Text>
                    </View>
                  </View>
                )}

                {/* Row 3: Placed date + Total */}
                <View style={styles.orderBottomRow}>
                  <Text style={styles.placedText}>Placed {placed}</Text>
                  <Text style={styles.totalText}>AUD ${total.toFixed(2)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  headerBrand: { fontSize: 18, fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  // Empty state
  emptyIcon:    { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:   { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  emptySub:     { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93', textAlign: 'center', lineHeight: 21, paddingHorizontal: 24 },
  shopBtn:      { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 4 },
  shopBtnText:  { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  // Order card
  orderCard:      { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  orderTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId:        { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  statusBadge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusBadgeText:{ fontSize: 13, fontFamily: 'Inter_500Medium' },
  scheduleRow:    { flexDirection: 'row', gap: 16 },
  scheduleCell:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scheduleText:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  orderBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placedText:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  totalText:      { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
});
