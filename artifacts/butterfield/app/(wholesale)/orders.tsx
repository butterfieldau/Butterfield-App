import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const WS_REORDER_KEY = '@ws_pending_reorder';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const GREEN  = '#22C55E';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:    { label: 'Pending',    color: '#3B82F6', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#F59E0B', bg: '#FEF3C7' },
  dispatched: { label: 'Dispatched', color: '#8B5CF6', bg: '#EDE9FE' },
  delivered:  { label: 'Delivered',  color: '#22C55E', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#EF4444', bg: '#FEE2E2' },
  overdue:    { label: 'Overdue',    color: '#DC2626', bg: '#FEE2E2' },
};

const STATUS_STEPS = ['pending', 'processing', 'dispatched', 'delivered'];

const FILTERS = ['All', 'Overdue', 'pending', 'processing', 'dispatched', 'delivered', 'cancelled'];
const FILTER_LABELS: Record<string, string> = {
  All: 'All', Overdue: 'Overdue', pending: 'Pending', processing: 'Processing',
  dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
};

function isOverdue(order: any): boolean {
  if (!order.scheduledDate) return false;
  if (order.status === 'delivered' || order.status === 'cancelled') return false;
  return new Date(order.scheduledDate) < new Date();
}

// ── Order Detail Modal ──────────────────────────────────────────────────────
function OrderDetailModal({ order, onClose, onReorder }: { order: any | null; onClose: () => void; onReorder: (o: any) => void }) {
  const insets = useSafeAreaInsets();
  if (!order) return null;

  const cfg    = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
  const items  = Array.isArray(order.items) ? order.items : [];
  const stepIdx = STATUS_STEPS.indexOf(order.status);
  const subtotal = order.totalCents ?? 0;
  const gst = Math.round(subtotal / 11);
  const overdue = isOverdue(order);

  return (
    <Modal visible={!!order} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[mdl.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={mdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={mdl.title}>Order #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={mdl.subtitle}>{new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* Status + overdue banner */}
          {overdue && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
              <Feather name="alert-circle" size={15} color={RED} />
              <Text style={{ color: RED, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 }}>Delivery date has passed — contact your account manager</Text>
            </View>
          )}

          {/* Status pipeline */}
          <View style={[mdl.card]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={mdl.sectionTitle}>Order Status</Text>
              <View style={[mdl.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                <Text style={[mdl.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            {order.status !== 'cancelled' && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {STATUS_STEPS.map((step, i) => (
                    <View key={step} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= stepIdx ? cfg.color : BORDER }} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row' }}>
                  {STATUS_STEPS.map((step, i) => (
                    <View key={step} style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: i <= stepIdx ? cfg.color : BORDER, alignItems: 'center', justifyContent: 'center' }}>
                        {i <= stepIdx && <Feather name="check" size={11} color="#fff" />}
                      </View>
                      <Text style={{ color: i <= stepIdx ? cfg.color : MUTED, fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 3, textAlign: 'center' }}>
                        {STATUS_CONFIG[step]?.label ?? step}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Items */}
          <View style={mdl.card}>
            <Text style={mdl.sectionTitle}>Items ({items.length})</Text>
            {items.map((item: any, i: number) => {
              const qty = item.qty ?? item.quantity ?? 1;
              const name = item.productName ?? item.name ?? `Product ${i + 1}`;
              const unitCents = item.unitPriceCents ?? 0;
              const lineCents = item.totalCents ?? (unitCents * qty);
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: i < items.length - 1 ? 1 : 0, borderBottomColor: BORDER, gap: 10 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 12 }}>{qty}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontFamily: 'Inter_500Medium', fontSize: 13 }}>{name}</Text>
                    {unitCents > 0 && (
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>
                        ${(unitCents / 100).toFixed(2)} each
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    ${(lineCents / 100).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Order details */}
          <View style={mdl.card}>
            <Text style={mdl.sectionTitle}>Order Details</Text>
            {order.poReference && <InfoRow label="PO Reference" value={order.poReference} />}
            {order.deliveryType && (
              <InfoRow
                label="Delivery Type"
                value={order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}
                icon={order.deliveryType === 'delivery' ? 'truck' : 'map-pin'}
              />
            )}
            {order.scheduledDate && (
              <InfoRow
                label="Scheduled Date"
                value={new Date(order.scheduledDate).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                valueColor={overdue ? RED : undefined}
              />
            )}
            {order.deliveryAddress && <InfoRow label="Delivery Address" value={order.deliveryAddress} />}
            {order.notes && <InfoRow label="Notes" value={order.notes} />}
          </View>

          {/* Totals */}
          <View style={mdl.card}>
            <Text style={mdl.sectionTitle}>Order Total</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>Subtotal (incl. GST)</Text>
                <Text style={{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 13 }}>${(subtotal / 100).toFixed(2)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>GST (10%)</Text>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>${(gst / 100).toFixed(2)}</Text>
              </View>
              <View style={{ height: 1, backgroundColor: BORDER }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }}>Total (AUD)</Text>
                <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 15 }}>${(subtotal / 100).toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Reorder */}
          {order.status !== 'cancelled' && (
            <Pressable
              onPress={() => onReorder(order)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: BLUE, borderRadius: 14 }}
            >
              <Feather name="repeat" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>Reorder</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, icon, valueColor }: { label: string; value: string; icon?: any; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon && <Feather name={icon} size={12} color={MUTED} />}
        <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: valueColor ?? TEXT, fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function WholesaleOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wholesale-orders'],
    queryFn: () => api.wholesale.orders(),
    retry: 1,
    refetchInterval: 60000,
  });

  const allOrders: any[] = data?.data ?? [];

  const orders = allOrders.filter((o) => {
    if (filter === 'All') return true;
    if (filter === 'Overdue') return isOverdue(o);
    return o.status === filter;
  });

  const overdueCount = allOrders.filter(isOverdue).length;

  const handleReorder = async (order: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
    if (rawItems.length === 0) {
      Alert.alert('No items', 'This order has no items to reorder.');
      return;
    }
    const reorderItems = rawItems.map((item: any) => ({
      productId: item.productId ?? item.product_id ?? item.id ?? '',
      qty: Number(item.qty ?? item.quantity ?? 1),
      productName: item.productName ?? item.name ?? '',
    })).filter((i) => i.productId);

    await AsyncStorage.setItem(WS_REORDER_KEY, JSON.stringify(reorderItems));
    setSelectedOrder(null);
    router.navigate('/(wholesale)/catalog');
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: 'Inter_700Bold' }}>My Orders</Text>
          <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{allOrders.length} total</Text>
        </View>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(f) => f}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item: f }) => {
            const active = filter === f;
            const isOverdueFilter = f === 'Overdue';
            const color = isOverdueFilter ? RED : (STATUS_CONFIG[f]?.color ?? BLUE);
            const bgColor = isOverdueFilter ? '#FEE2E2' : (STATUS_CONFIG[f]?.bg ?? `${BLUE}18`);
            return (
              <Pressable
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterPill, {
                  backgroundColor: active ? bgColor : BG,
                  borderColor: active ? color : BORDER,
                }]}
              >
                <Text style={{ color: active ? color : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {FILTER_LABELS[f] ?? f}
                  {isOverdueFilter && overdueCount > 0 ? ` (${overdueCount})` : ''}
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
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' }}>
                {filter === 'Overdue' ? 'No overdue orders.' : 'No orders yet.\nBrowse the catalog to place your first order.'}
              </Text>
            </View>
          }
          renderItem={({ item: order }: { item: any }) => {
            const cfg = STATUS_CONFIG[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F3F4F6' };
            const items = Array.isArray(order.items) ? order.items : [];
            const stepIdx = STATUS_STEPS.indexOf(order.status);
            const overdue = isOverdue(order);

            return (
              <Pressable
                onPress={() => { setSelectedOrder(order); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.orderCard, { backgroundColor: CARD, borderLeftColor: overdue ? RED : cfg.color }]}
              >
                {/* Header row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                      #{order.poReference ?? order.id.slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>
                      {new Date(order.createdAt).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {overdue && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Feather name="alert-circle" size={11} color={RED} />
                        <Text style={{ color: RED, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Overdue</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={{ backgroundColor: cfg.bg, borderColor: cfg.color, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: cfg.color, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{cfg.label}</Text>
                    </View>
                    <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 15 }}>${(order.totalCents / 100).toFixed(2)}</Text>
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
                  {items.slice(0, 2).map((item: any, i: number) => {
                    const qty = item.qty ?? item.quantity ?? '?';
                    const name = item.productName ?? item.name ?? `Product ${i + 1}`;
                    const lineCents = item.totalCents ?? ((item.unitPriceCents ?? 0) * qty);
                    return (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 }}>
                          {qty}× {name}
                        </Text>
                        <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }}>
                          ${(lineCents / 100).toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                  {items.length > 2 && (
                    <Text style={{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>
                      +{items.length - 2} more — tap to view all
                    </Text>
                  )}
                </View>

                {/* Delivery date + tap hint */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  {order.scheduledDate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="truck" size={11} color={overdue ? RED : MUTED} />
                      <Text style={{ color: overdue ? RED : MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>
                        {order.deliveryType === 'pickup' ? 'Pickup' : 'Delivery'} · {new Date(order.scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  ) : <View />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: BLUE, fontFamily: 'Inter_500Medium', fontSize: 11 }}>Details</Text>
                    <Feather name="chevron-right" size={12} color={BLUE} />
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onReorder={handleReorder}
      />
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

const mdl = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  subtitle:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2 },
  card:          { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 0 },
  sectionTitle:  { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E', marginBottom: 8 },
  statusPill:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  statusPillText:{ fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
