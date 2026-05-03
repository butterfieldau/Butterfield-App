import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG = '#0D0604';
const CARD = '#1A0A04';
const ACCENT = '#C8833A';

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  received: { label: 'Received', color: '#3B82F6', next: 'being_prepared', nextLabel: 'Start Preparing' },
  being_prepared: { label: 'Preparing', color: ACCENT, next: 'ready_for_pickup', nextLabel: 'Mark Ready' },
  ready_for_pickup: { label: 'Ready', color: '#22C55E', next: 'completed', nextLabel: 'Complete' },
  completed: { label: 'Completed', color: '#6B7280' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
  refunded: { label: 'Refunded', color: '#8B5CF6' },
};

const FILTERS = ['All', 'received', 'being_prepared', 'ready_for_pickup', 'completed'];

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

  const orders = (data?.data ?? []).filter((o) => {
    const matchFilter = filter === 'All' || o.status === filter;
    const matchSearch = !search || o.id.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: '#fff' }]}>Order Queue</Text>
        <View style={[styles.searchBar, { backgroundColor: CARD, borderRadius: 12, borderColor: '#2A1408', borderWidth: 1 }]}>
          <Feather name="search" size={14} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={[{ flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 }]}
            placeholder="Search order ID..."
            placeholderTextColor="rgba(255,255,255,0.3)"
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
          renderItem={({ item: f }) => (
            <Pressable
              onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
              style={[styles.filterPill, { backgroundColor: filter === f ? ACCENT : CARD, borderRadius: 20 }]}
            >
              <Text style={[{ color: filter === f ? '#fff' : 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                {STATUS_CONFIG[f]?.label ?? 'All'}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ACCENT} />}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Feather name="inbox" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 14 }]}>
              {isLoading ? 'Loading orders...' : 'No orders found'}
            </Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.received;
          const items = Array.isArray(order.items) ? order.items : [];
          return (
            <View style={[styles.orderCard, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: cfg.color, borderLeftWidth: 3 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View>
                  <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }]}>#{order.id.slice(0, 8).toUpperCase()}</Text>
                  <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                    {new Date(order.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · {order.type}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${cfg.color}20`, borderColor: cfg.color, borderWidth: 1 }]}>
                  <Text style={[{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={{ gap: 3, marginBottom: 10 }}>
                {items.slice(0, 4).map((item: any, i: number) => (
                  <Text key={i} style={[{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>
                    {item.quantity}× {item.productName}
                  </Text>
                ))}
                {items.length > 4 && (
                  <Text style={[{ color: ACCENT, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>+{items.length - 4} more</Text>
                )}
              </View>

              {order.notes ? (
                <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 8, fontStyle: 'italic' }]}>
                  "{order.notes}"
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                {cfg.next && (
                  <Pressable
                    onPress={() => handleAdvance(order.id, cfg.next!)}
                    disabled={advancing === order.id}
                    style={[styles.advanceBtn, { backgroundColor: cfg.color, borderRadius: 10 }]}
                  >
                    <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                      {advancing === order.id ? '...' : cfg.nextLabel}
                    </Text>
                  </Pressable>
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
  header: { paddingHorizontal: 20, gap: 12, paddingBottom: 16 },
  title: { fontSize: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7 },
  orderCard: { padding: 16 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  advanceBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
