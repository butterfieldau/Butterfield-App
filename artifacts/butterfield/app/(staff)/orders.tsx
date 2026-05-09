import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  Alert, FlatList, Linking, Platform, Pressable,
  RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

// Status config — next action for ready_for_pickup depends on order type (see getNextAction)
const CUSTOMER_STATUS: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  received:         { label: 'Received',        color: '#3B82F6', next: 'being_prepared',  nextLabel: 'Start Preparing' },
  being_prepared:   { label: 'Preparing',       color: '#F59E0B', next: 'ready_for_pickup', nextLabel: 'Mark Ready' },
  ready_for_pickup: { label: 'Packed & Ready',  color: '#22C55E' }, // next determined by order.type below
  out_for_delivery: { label: 'Out for Delivery',color: '#8B5CF6', next: 'completed',        nextLabel: 'Mark Delivered' },
  completed:        { label: 'Completed',       color: '#6B7280' },
  cancelled:        { label: 'Cancelled',       color: '#EF4444' },
  refunded:         { label: 'Refunded',        color: '#8B5CF6' },
};

const WHOLESALE_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6' },
  processing: { label: 'Processing', color: '#F59E0B' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6' },
  delivered:  { label: 'Delivered',  color: '#22C55E' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444' },
};

// Delivery/pickup pill config
const TYPE_PILL: Record<string, { label: string; icon: 'truck' | 'shopping-bag'; bg: string; text: string }> = {
  delivery: { label: 'Delivery', icon: 'truck',        bg: '#DBEAFE', text: '#1E40AF' },
  pickup:   { label: 'Pickup',   icon: 'shopping-bag', bg: '#DCFCE7', text: '#166534' },
};

const FILTERS = ['All', 'Active', 'Delivery', 'Pickup', 'Wholesale', 'received', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'completed'];
const FILTER_LABELS: Record<string, string> = {
  All: 'All', Active: 'Active', Delivery: 'Delivery', Pickup: 'Pickup', Wholesale: 'Wholesale',
  received: 'Received', being_prepared: 'Preparing',
  ready_for_pickup: 'Ready', out_for_delivery: 'Out for Delivery', completed: 'Done',
};

function openMap(address: string) {
  const q = encodeURIComponent(address);
  const url = Platform.OS === 'ios' ? `maps://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${q}`));
}

function getNextAction(order: any): { next: string; nextLabel: string } | null {
  const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
  if (order.status === 'ready_for_pickup') {
    return isDelivery
      ? { next: 'out_for_delivery', nextLabel: 'Send for Delivery' }
      : { next: 'completed',        nextLabel: 'Mark Collected' };
  }
  const cfg = CUSTOMER_STATUS[order.status];
  return cfg?.next ? { next: cfg.next, nextLabel: cfg.nextLabel ?? 'Advance' } : null;
}

export default function StaffOrdersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [filter, setFilter]     = useState('All');
  const [search, setSearch]     = useState('');
  const [advancing, setAdvancing] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['all-orders'],
    queryFn: () => api.staff.allOrders(),
    retry: 1,
    refetchInterval: 20000,
  });

  const allOrders = data?.data ?? [];
  const orders = allOrders.filter((o: any) => {
    const matchSearch = !search ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      (o.poReference && o.poReference.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;
    const isDelivery = o.type === 'delivery' || o.deliveryType === 'delivery';
    if (filter === 'All')       return true;
    if (filter === 'Wholesale') return o.orderSource === 'wholesale';
    if (filter === 'Delivery')  return !o.orderSource?.includes('wholesale') && isDelivery;
    if (filter === 'Pickup')    return !o.orderSource?.includes('wholesale') && !isDelivery;
    if (filter === 'Active')    return ['received','being_prepared','ready_for_pickup','out_for_delivery','pending','processing'].includes(o.status);
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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={styles.title}>Order Queue</Text>
        <View style={[styles.searchBar, { backgroundColor: BG, borderColor: BORDER }]}>
          <Feather name="search" size={14} color={MUTED} />
          <TextInput
            style={{ flex: 1, color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 14 }}
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
            const color = f === 'Wholesale' ? '#22C55E' : f === 'Active' ? '#F59E0B' : f === 'Delivery' ? '#1E40AF' : f === 'Pickup' ? '#166534' : (CUSTOMER_STATUS[f]?.color ?? BLUE);
            return (
              <Pressable
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterPill, { backgroundColor: active ? `${color}18` : BG, borderColor: active ? color : BORDER }]}
              >
                <Text style={{ color: active ? color : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
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
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
            <Feather name="inbox" size={32} color={BORDER} />
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
              {isLoading ? 'Loading orders...' : 'No orders found'}
            </Text>
          </View>
        }
        renderItem={({ item: order }: { item: any }) => {
          const isWholesale = order.orderSource === 'wholesale';
          const isDelivery  = order.type === 'delivery' || order.deliveryType === 'delivery';
          const cfg         = isWholesale
            ? (WHOLESALE_STATUS[order.status] ?? { label: order.status, color: '#6B7280' })
            : (CUSTOMER_STATUS[order.status] ?? CUSTOMER_STATUS.received);
          const items       = Array.isArray(order.items) ? order.items : [];
          const nextAction  = !isWholesale ? getNextAction(order) : null;
          const typePill    = TYPE_PILL[isDelivery ? 'delivery' : 'pickup'];

          const address = order.deliveryAddress
            ?? (order.street ? [order.street, order.suburb, order.postcode].filter(Boolean).join(', ') : null);

          return (
            <View style={[styles.orderCard, { borderLeftColor: cfg.color }]}>
              {/* Top row: order ID + type pill + status badge */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.orderId}>
                      #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    {/* Delivery / Pickup pill — always visible */}
                    {!isWholesale && (
                      <View style={[styles.typePill, { backgroundColor: typePill.bg }]}>
                        <Feather name={typePill.icon} size={10} color={typePill.text} />
                        <Text style={[styles.typePillTxt, { color: typePill.text }]}>{typePill.label}</Text>
                      </View>
                    )}
                    {isWholesale && (
                      <View style={styles.wholesalePill}>
                        <Text style={styles.wholesalePillTxt}>WHOLESALE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.orderTime}>
                    {new Date(order.createdAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    {order.scheduledFor
                      ? ` · Due ${new Date(order.scheduledFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${cfg.color}15`, borderColor: cfg.color }]}>
                  <Text style={{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{cfg.label}</Text>
                </View>
              </View>

              {/* Items */}
              <View style={{ gap: 3, marginBottom: 8 }}>
                {items.slice(0, 4).map((item: any, i: number) => (
                  <Text key={i} style={styles.itemLine}>
                    {(item.qty ?? item.quantity ?? '?')}× {item.productName ?? item.name ?? item.productId ?? 'Product'}
                  </Text>
                ))}
                {items.length > 4 && (
                  <Text style={{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 12 }}>+{items.length - 4} more items</Text>
                )}
              </View>

              {/* Delivery address (tappable → map) */}
              {isDelivery && address && (
                <Pressable
                  onPress={() => { openMap(address); Haptics.selectionAsync(); }}
                  style={[styles.addressRow, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                >
                  <Feather name="navigation" size={12} color="#1E40AF" />
                  <Text style={styles.addressTxt} numberOfLines={2}>{address}</Text>
                  <Feather name="external-link" size={11} color="#1E40AF" />
                </Pressable>
              )}

              {/* Notes */}
              {order.notes ? (
                <Text style={styles.notes}>"{order.notes}"</Text>
              ) : null}

              {/* Footer: total + advance button */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <Text style={styles.total}>${((order.totalCents ?? 0) / 100).toFixed(2)}</Text>
                {!isWholesale && nextAction && (
                  <Pressable
                    onPress={() => handleAdvance(order.id, nextAction.next)}
                    disabled={advancing === order.id}
                    style={[styles.advanceBtn, { backgroundColor: cfg.color }]}
                  >
                    <Text style={styles.advanceBtnTxt}>
                      {advancing === order.id ? '...' : nextAction.nextLabel}
                    </Text>
                  </Pressable>
                )}
                {isWholesale && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name="package" size={12} color={MUTED} />
                    <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>Managed by director</Text>
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
  header:        { paddingHorizontal: 16, gap: 12, paddingBottom: 14 },
  title:         { fontSize: 26, fontFamily: 'Inter_700Bold', color: TEXT },
  searchBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42, borderRadius: 12, borderWidth: 1 },
  filterPill:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  orderCard:     { backgroundColor: CARD, borderRadius: 14, borderLeftWidth: 4, borderWidth: 1, borderColor: BORDER, padding: 14,
                   shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  orderId:       { fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT },
  orderTime:     { fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular', marginTop: 2 },
  typePill:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  typePillTxt:   { fontSize: 10, fontFamily: 'Inter_700Bold' },
  wholesalePill: { backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  wholesalePillTxt:{ color: '#166534', fontFamily: 'Inter_700Bold', fontSize: 9 },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  itemLine:      { color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 13 },
  addressRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6 },
  addressTxt:    { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: '#1E40AF', lineHeight: 16 },
  notes:         { color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 4, fontStyle: 'italic' },
  total:         { color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 14 },
  advanceBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  advanceBtnTxt: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
