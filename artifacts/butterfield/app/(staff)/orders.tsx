import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const CUSTOMER_STATUS: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  received:         { label: 'Received',  color: '#3B82F6', next: 'being_prepared',  nextLabel: 'Start Preparing' },
  being_prepared:   { label: 'Preparing', color: '#F59E0B', next: 'ready_for_pickup', nextLabel: 'Mark Ready' },
  ready_for_pickup: { label: 'Ready',     color: '#22C55E', next: 'completed',        nextLabel: 'Complete' },
  completed:        { label: 'Completed', color: '#6B7280' },
  cancelled:        { label: 'Cancelled', color: '#EF4444' },
  refunded:         { label: 'Refunded',  color: '#8B5CF6' },
};

const WHOLESALE_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6' },
  processing: { label: 'Processing', color: '#F59E0B' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6' },
  delivered:  { label: 'Delivered',  color: '#22C55E' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444' },
};

const FILTERS = ['All', 'Active', 'Wholesale', 'received', 'being_prepared', 'ready_for_pickup', 'completed'];

export default function StaffOrdersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [advancing, setAdvancing] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['all-orders'],
    queryFn: () => api.staff.allOrders(),
    retry: 1,
    refetchInterval: 30000,
  });

  const allOrders = data?.data ?? [];
  const orders = allOrders.filter((o: any) => {
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase()) ||
      (o.poReference && o.poReference.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    if (filter === 'All') return true;
    if (filter === 'Wholesale') return o.orderSource === 'wholesale';
    if (filter === 'Active') return ['received','being_prepared','ready_for_pickup','pending','processing'].includes(o.status);
    return o.status === filter;
  });

  const handleAdvance = async (orderId: string, nextStatus: string) => {
    setAdvancing(orderId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.orders.updateStatus(orderId, nextStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['all-orders'] });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAdvancing(null);
    }
  };

  const FILTER_LABELS: Record<string, string> = {
    All: 'All', Active: 'Active', Wholesale: 'Wholesale',
    received: 'Received', being_prepared: 'Preparing',
    ready_for_pickup: 'Ready', completed: 'Done',
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: TEXT }]}>Order Queue</Text>
        <View style={[styles.searchBar, { backgroundColor: BG, borderRadius: 12, borderColor: BORDER, borderWidth: 1 }]}>
          <Feather name="search" size={14} color={MUTED} />
          <TextInput
            style={[{ flex: 1, color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 14 }]}
            placeholder="Search by order ID or PO..."
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(f) => f}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: f }) => {
            const active = filter === f;
            const color = f === 'Wholesale' ? '#22C55E' : f === 'Active' ? '#F59E0B' : (CUSTOMER_STATUS[f]?.color ?? BLUE);
            return (
              <Pressable
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterPill, { backgroundColor: active ? `${color}18` : '#F5F6FA', borderRadius: 20, borderWidth: 1, borderColor: active ? color : BORDER }]}
              >
                <Text style={[{ color: active ? color : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                  {FILTER_LABELS[f] ?? f}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o: any) => o.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Feather name="inbox" size={32} color={BORDER} />
            <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14 }]}>
              {isLoading ? 'Loading orders...' : 'No orders found'}
            </Text>
          </View>
        }
        renderItem={({ item: order }: { item: any }) => {
          const isWholesale = order.orderSource === 'wholesale';
          const cfg = isWholesale
            ? (WHOLESALE_STATUS[order.status] ?? { label: order.status, color: '#6B7280' })
            : (CUSTOMER_STATUS[order.status] ?? CUSTOMER_STATUS.received);
          const customerCfg = isWholesale ? null : (CUSTOMER_STATUS[order.status] ?? null);
          const items = Array.isArray(order.items) ? order.items : [];

          return (
            <View style={[styles.orderCard, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: cfg.color, borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>
                      #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    {isWholesale && (
                      <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: '#166534', fontFamily: 'Inter_700Bold', fontSize: 9 }}>WHOLESALE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                    {new Date(order.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{isWholesale ? (order.deliveryType ?? 'delivery') : (order.type ?? 'pickup')}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${cfg.color}15`, borderColor: cfg.color, borderWidth: 1 }]}>
                  <Text style={[{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={{ gap: 3, marginBottom: 10 }}>
                {items.slice(0, 4).map((item: any, i: number) => {
                  const qty = item.qty ?? item.quantity ?? '?';
                  const name = item.productName ?? item.name ?? item.productId ?? 'Product';
                  return (
                    <Text key={i} style={[{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>
                      {qty}× {name}
                    </Text>
                  );
                })}
                {items.length > 4 && (
                  <Text style={[{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>+{items.length - 4} more</Text>
                )}
              </View>

              {order.notes ? (
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 8, fontStyle: 'italic' }]}>
                  "{order.notes}"
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
                {!isWholesale && customerCfg?.next && (
                  <Pressable
                    onPress={() => handleAdvance(order.id, customerCfg.next!)}
                    disabled={advancing === order.id}
                    style={[styles.advanceBtn, { backgroundColor: cfg.color, borderRadius: 10 }]}
                  >
                    <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                      {advancing === order.id ? '...' : customerCfg.nextLabel}
                    </Text>
                  </Pressable>
                )}
                {isWholesale && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="package" size={12} color={MUTED} />
                    <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>
                      Managed by director
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, gap: 12, paddingBottom: 14 },
  title: { fontSize: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7 },
  orderCard: { padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  advanceBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
