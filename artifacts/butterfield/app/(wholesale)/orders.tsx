import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#F59E0B', bg: '#FEF3C7' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6', bg: '#EDE9FE' },
  delivered:  { label: 'Delivered',  color: '#22C55E', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
};

const STATUS_STEPS = ['pending', 'processing', 'dispatched', 'delivered'];

const FILTERS = ['All', 'pending', 'processing', 'dispatched', 'delivered', 'cancelled'];
const FILTER_LABELS: Record<string, string> = {
  All: 'All', pending: 'Pending', processing: 'Processing',
  dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
};

export default function WholesaleOrdersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wholesale-orders'],
    queryFn: () => api.wholesale.orders(),
    retry: 1,
    refetchInterval: 60000,
  });

  const allOrders: any[] = data?.data ?? [];
  const orders = filter === 'All' ? allOrders : allOrders.filter((o) => o.status === filter);

  const handleReorder = (order: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Reorder',
      `Reorder the same items from order #${order.poReference ?? order.id.slice(0, 8).toUpperCase()}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Catalog', onPress: () => {} },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[{ color: TEXT, fontSize: 26, fontFamily: 'Inter_700Bold' }]}>My Orders</Text>
          <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{allOrders.length} total</Text>
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
            const color = cfg?.color ?? BLUE;
            return (
              <Pressable
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterPill, {
                  backgroundColor: active ? (cfg ? cfg.bg : `${BLUE}18`) : BG,
                  borderColor: active ? color : BORDER,
                }]}
              >
                <Text style={[{ color: active ? color : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>
                  {FILTER_LABELS[f] ?? f}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o: any) => o.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="file-text" size={36} color={BORDER} />
              <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }]}>
                No orders yet.{'\n'}Browse the catalog to place your first order.
              </Text>
            </View>
          }
          renderItem={({ item: order }: { item: any }) => {
            const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
            const items = Array.isArray(order.items) ? order.items : [];
            const isExpanded = expandedId === order.id;
            const stepIdx = STATUS_STEPS.indexOf(order.status);

            return (
              <Pressable
                onPress={() => { setExpandedId(isExpanded ? null : order.id); Haptics.selectionAsync(); }}
                style={[styles.orderCard, { backgroundColor: CARD, borderLeftColor: cfg.color }]}
              >
                {/* Header row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>
                      #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[{ backgroundColor: cfg.bg, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }]}>
                      <Text style={[{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>{cfg.label}</Text>
                    </View>
                    <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 15 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                {stepIdx >= 0 && (
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                    {STATUS_STEPS.map((step, i) => (
                      <View key={step} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= stepIdx ? cfg.color : BORDER }} />
                    ))}
                  </View>
                )}

                {/* Items preview */}
                <View style={{ gap: 2, marginTop: 8 }}>
                  {(isExpanded ? items : items.slice(0, 2)).map((item: any, i: number) => {
                    const qty = item.qty ?? item.quantity ?? '?';
                    const name = item.productName ?? item.name ?? `Product ${i + 1}`;
                    const lineCents = item.totalCents ?? ((item.unitPriceCents ?? 0) * qty);
                    return (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 }]}>
                          {qty}× {name}
                        </Text>
                        <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                          ${(lineCents / 100).toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                  {!isExpanded && items.length > 2 && (
                    <Text style={[{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                      +{items.length - 2} more items — tap to expand
                    </Text>
                  )}
                </View>

                {/* Extra details when expanded */}
                {isExpanded && (
                  <View style={{ marginTop: 8, gap: 4, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8 }}>
                    {order.deliveryType && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Feather name={order.deliveryType === 'delivery' ? 'truck' : 'map-pin'} size={12} color={MUTED} />
                        <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }]}>
                          {order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}
                          {order.scheduledDate ? ` · ${new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                        </Text>
                      </View>
                    )}
                    {order.notes && (
                      <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, fontStyle: 'italic' }]}>
                        "{order.notes}"
                      </Text>
                    )}
                    <Pressable
                      onPress={() => handleReorder(order)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: `${BLUE}12`, borderRadius: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: `${BLUE}30` }}
                    >
                      <Feather name="repeat" size={13} color={BLUE} />
                      <Text style={[{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 12 }]}>Reorder</Text>
                    </Pressable>
                  </View>
                )}

                {/* Delivery date chip */}
                {!isExpanded && order.scheduledDate && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Feather name="truck" size={12} color={MUTED} />
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }]}>
                      {order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'} · {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </Text>
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
  header:     { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  orderCard:  {
    padding: 16, backgroundColor: '#fff', borderRadius: 14,
    borderLeftWidth: 3, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    gap: 0,
  },
});
