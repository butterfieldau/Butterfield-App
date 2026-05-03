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

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  received:         { label: 'Received',  color: '#3B82F6', next: 'being_prepared',  nextLabel: 'Start Preparing' },
  being_prepared:   { label: 'Preparing', color: '#F59E0B', next: 'ready_for_pickup', nextLabel: 'Mark Ready' },
  ready_for_pickup: { label: 'Ready',     color: '#22C55E', next: 'completed',        nextLabel: 'Complete' },
  completed:        { label: 'Completed', color: '#6B7280' },
  cancelled:        { label: 'Cancelled', color: '#EF4444' },
  refunded:         { label: 'Refunded',  color: '#8B5CF6' },
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
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold', color: TEXT }]}>Order Queue</Text>
        <View style={[styles.searchBar, { backgroundColor: BG, borderRadius: 12, borderColor: BORDER, borderWidth: 1 }]}>
          <Feather name="search" size={14} color={MUTED} />
          <TextInput
            style={[{ flex: 1, color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 14 }]}
            placeholder="Search order ID..."
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
            const cfg = STATUS_CONFIG[f];
            const color = active ? (cfg?.color ?? BLUE) : BORDER;
            return (
              <Pressable
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterPill, { backgroundColor: active ? `${cfg?.color ?? BLUE}18` : '#F5F6FA', borderRadius: 20, borderWidth: 1, borderColor: active ? (cfg?.color ?? BLUE) : BORDER }]}
              >
                <Text style={[{ color: active ? (cfg?.color ?? BLUE) : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                  {cfg?.label ?? 'All'}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
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
        renderItem={({ item: order }) => {
          const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.received;
          const items = Array.isArray(order.items) ? order.items : [];
          return (
            <View style={[styles.orderCard, { backgroundColor: CARD, borderRadius: 14, borderLeftColor: cfg.color, borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View>
                  <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>#{order.id.slice(0, 8).toUpperCase()}</Text>
                  <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                    {new Date(order.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · {order.type}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${cfg.color}15`, borderColor: cfg.color, borderWidth: 1 }]}>
                  <Text style={[{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>{cfg.label}</Text>
                </View>
              </View>

              <View style={{ gap: 3, marginBottom: 10 }}>
                {items.slice(0, 4).map((item: any, i: number) => (
                  <Text key={i} style={[{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>
                    {item.quantity}× {item.productName}
                  </Text>
                ))}
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
                <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
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
  header: { paddingHorizontal: 16, gap: 12, paddingBottom: 14 },
  title: { fontSize: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7 },
  orderCard: { padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  advanceBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
