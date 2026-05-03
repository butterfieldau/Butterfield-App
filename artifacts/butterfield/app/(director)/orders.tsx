import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable,
  RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUSES = [
  { key: 'all',              label: 'All' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed',        label: 'Done' },
  { key: 'cancelled',        label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
};
const STATUS_NEXT: Record<string, string[]> = {
  received:         ['being_prepared','cancelled'],
  being_prepared:   ['ready_for_pickup','cancelled'],
  ready_for_pickup: ['completed','out_for_delivery'],
  out_for_delivery: ['completed'],
  completed:        [],
  cancelled:        [],
};
const STATUS_LABEL: Record<string, string> = {
  received: 'Pending', being_prepared: 'Preparing',
  ready_for_pickup: 'Ready for Pickup', out_for_delivery: 'Out for Delivery',
  completed: 'Completed', cancelled: 'Cancelled',
};

export default function DirectorOrdersScreen() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-orders'],
    queryFn: () => api.director.orders(),
    refetchInterval: 15000,
  });

  const allOrders = data?.data ?? [];
  const orders = filter === 'all' ? allOrders : allOrders.filter((o: any) => o.status === filter);

  const changeStatus = async (orderId: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateOrderStatus(orderId, status);
      await qc.invalidateQueries({ queryKey: ['director-orders'] });
      await qc.invalidateQueries({ queryKey: ['director-stats'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const promptStatus = (order: any) => {
    const next = STATUS_NEXT[order.status] ?? [];
    if (next.length === 0) return;
    Alert.alert(
      `Update #BC-${order.id.slice(-6).toUpperCase()}`,
      'Move to:',
      [
        ...next.map((s) => ({ text: STATUS_LABEL[s] ?? s, onPress: () => changeStatus(order.id, s) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Filter chips */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(s) => s.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          renderItem={({ item }) => {
            const active = filter === item.key;
            return (
              <Pressable
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, {
                  backgroundColor: active ? BLUE : BG,
                  borderColor: active ? BLUE : BORDER,
                }]}
              >
                <Text style={[styles.filterChipText, { color: active ? '#fff' : MUTED }]}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o: any) => o.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="inbox" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 15 }}>No orders</Text>
            </View>
          }
          renderItem={({ item: order }) => {
            const colors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
            const label  = STATUS_LABEL[order.status] ?? order.status;
            const next   = STATUS_NEXT[order.status] ?? [];
            const total  = ((order.totalCents ?? 0) / 100).toFixed(2);
            return (
              <Pressable
                onPress={() => promptStatus(order)}
                style={[styles.orderCard, { backgroundColor: CARD, borderColor: BORDER }]}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.orderId}>#BC-{order.id.slice(-6).toUpperCase()}</Text>
                    <Text style={styles.orderMeta}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      {' · '}{order.type ?? 'pickup'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
                      <Text style={[styles.statusPillText, { color: colors.text }]}>{label}</Text>
                    </View>
                    <Text style={styles.totalText}>AUD ${total}</Text>
                  </View>
                </View>
                {order.deliveryAddress && (
                  <View style={styles.addrRow}>
                    <Feather name="map-pin" size={11} color={MUTED} />
                    <Text style={styles.addrText} numberOfLines={1}>{order.deliveryAddress}</Text>
                  </View>
                )}
                {next.length > 0 && (
                  <View style={[styles.actionHint, { borderTopColor: BORDER }]}>
                    <Feather name="edit-3" size={11} color={BLUE} />
                    <Text style={[styles.actionHintText, { color: BLUE }]}>Tap to update status</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filterChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipText:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  orderCard:       { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  orderTop:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderId:         { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  orderMeta:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  statusPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText:  { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  totalText:       { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  addrRow:         { flexDirection: 'row', alignItems: 'center', gap: 5 },
  addrText:        { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  actionHint:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderTopWidth: 1, paddingTop: 8 },
  actionHintText:  { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
