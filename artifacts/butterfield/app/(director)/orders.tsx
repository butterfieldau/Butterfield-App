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
  { key: 'wholesale',        label: 'Wholesale' },
  { key: 'cancelled',        label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
  refunded:         { bg: '#F3E8FF', text: '#6B21A8' },
  pending:          { bg: '#DBEAFE', text: '#1E40AF' },
  processing:       { bg: '#FEF3C7', text: '#92400E' },
  dispatched:       { bg: '#EDE9FE', text: '#5B21B6' },
  delivered:        { bg: '#DCFCE7', text: '#166534' },
};

const CUSTOMER_NEXT: Record<string, string[]> = {
  received:         ['being_prepared','cancelled'],
  being_prepared:   ['ready_for_pickup','cancelled'],
  ready_for_pickup: ['completed','out_for_delivery'],
  out_for_delivery: ['completed'],
  completed:        [],
  cancelled:        [],
};

const WHOLESALE_NEXT: Record<string, string[]> = {
  pending:    ['processing','cancelled'],
  processing: ['dispatched','cancelled'],
  dispatched: ['delivered'],
  delivered:  [],
  cancelled:  [],
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Pending', being_prepared: 'Preparing',
  ready_for_pickup: 'Ready for Pickup', out_for_delivery: 'Out for Delivery',
  completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded',
  pending: 'Pending', processing: 'Processing',
  dispatched: 'Dispatched', delivered: 'Delivered',
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
  const orders = (() => {
    if (filter === 'all') return allOrders;
    if (filter === 'wholesale') return allOrders.filter((o: any) => o.orderSource === 'wholesale');
    return allOrders.filter((o: any) => o.status === filter);
  })();

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
    const isWholesale = order.orderSource === 'wholesale';
    const next = isWholesale ? (WHOLESALE_NEXT[order.status] ?? []) : (CUSTOMER_NEXT[order.status] ?? []);
    if (next.length === 0) return;
    const ref = isWholesale
      ? `#${order.poReference ?? order.id.slice(0, 8).toUpperCase()} (Wholesale)`
      : `#BC-${order.id.slice(-6).toUpperCase()}`;
    Alert.alert(
      `Update ${ref}`,
      'Move to:',
      [
        ...next.map((s) => ({ text: STATUS_LABEL[s] ?? s, onPress: () => changeStatus(order.id, s) })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(s) => s.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const color = item.key === 'wholesale' ? '#22C55E' : BLUE;
            return (
              <Pressable
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, {
                  backgroundColor: active ? color : BG,
                  borderColor: active ? color : BORDER,
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
            const isWholesale = (order as any).orderSource === 'wholesale';
            const colors = STATUS_COLORS[(order as any).status] ?? { bg: '#F3F4F6', text: '#6B7280' };
            const label  = STATUS_LABEL[(order as any).status] ?? (order as any).status;
            const next   = isWholesale
              ? (WHOLESALE_NEXT[(order as any).status] ?? [])
              : (CUSTOMER_NEXT[(order as any).status] ?? []);
            const total  = (((order as any).totalCents ?? 0) / 100).toFixed(2);
            const items  = Array.isArray((order as any).items) ? (order as any).items : [];
            return (
              <Pressable
                onPress={() => promptStatus(order)}
                style={[styles.orderCard, { backgroundColor: CARD, borderColor: BORDER }]}
              >
                <View style={styles.orderTop}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.orderId}>
                        {isWholesale
                          ? `#${(order as any).poReference ?? (order as any).id.slice(0, 8).toUpperCase()}`
                          : `#BC-${(order as any).id.slice(-6).toUpperCase()}`}
                      </Text>
                      {isWholesale && (
                        <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ color: '#166534', fontFamily: 'Inter_700Bold', fontSize: 9 }}>WHOLESALE</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderMeta}>
                      {new Date((order as any).createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{isWholesale ? ((order as any).deliveryType ?? 'delivery') : ((order as any).type ?? 'pickup')}
                    </Text>
                    {items.length > 0 && (
                      <Text style={[styles.orderMeta, { marginTop: 2 }]}>
                        {items.slice(0, 2).map((it: any) =>
                          `${it.qty ?? it.quantity ?? '?'}× ${it.productName ?? it.name ?? 'Item'}`
                        ).join(', ')}
                        {items.length > 2 ? ` +${items.length - 2} more` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
                      <Text style={[styles.statusPillText, { color: colors.text }]}>{label}</Text>
                    </View>
                    <Text style={styles.totalText}>AUD ${total}</Text>
                  </View>
                </View>
                {(order as any).deliveryAddress && (
                  <View style={styles.addrRow}>
                    <Feather name="map-pin" size={11} color={MUTED} />
                    <Text style={styles.addrText} numberOfLines={1}>{(order as any).deliveryAddress}</Text>
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
  actionHintText:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
