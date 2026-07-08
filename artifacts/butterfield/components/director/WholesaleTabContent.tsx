import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import {
  ActivityIndicator, Pressable,
  RefreshControl, ScrollView, Text, View,
} from 'react-native';
import type { ApiOrder } from '@/lib/api';
import { STATUS_COLORS, STATUS_LABEL } from '@/lib/orderStatus';
import { normalizeOrderItems } from '@/lib/orderItems';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED } from './directorColors';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isOverdueWholesale(order: ApiOrder): boolean {
  if (!order.scheduledDate && !(order as any).deliveryDate) return false;
  if (['delivered', 'cancelled', 'completed'].includes(order.status)) return false;
  const dateStr = (order.scheduledDate ?? (order as any).deliveryDate) as string;
  return new Date(dateStr) < new Date();
}

const WS_FILTER_TABS = [
  { key: 'all',        label: 'All' },
  { key: 'pending',    label: 'Pending' },
  { key: 'processing', label: 'Confirmed' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'overdue',    label: 'Overdue' },
  { key: 'delivered',  label: 'Invoiced' },
];

function getWeekGroup(order: ApiOrder): string {
  const now   = new Date();
  const d     = new Date(order.createdAt);
  const diffMs = now.getTime() - d.getTime();
  const days   = diffMs / (1000 * 60 * 60 * 24);
  if (days <= 7)  return 'This week';
  if (days <= 14) return 'Last week';
  return 'Older';
}

function WholesaleOrderCard({ order, onPress }: { order: ApiOrder; onPress: () => void }) {
  const isOverdue = isOverdueWholesale(order);
  const items = normalizeOrderItems(order.items);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = order.totalCents ?? 0;
  const gst      = Math.round(subtotal / 11);
  const exGst    = subtotal - gst;
  const isPaid   = !!(order as any).isPaid;

  const borderColor = isOverdue ? AMBER : order.status === 'dispatched' || order.status === 'delivered' ? GREEN : BLUE + '80';

  const invStatus = isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending';
  const invColors: Record<string, { bg: string; text: string }> = {
    paid:    { bg: '#DCFCE7', text: '#166534' },
    pending: { bg: '#FEF3C7', text: '#92400E' },
    overdue: { bg: '#FEE2E2', text: '#991B1B' },
  };
  const invCfg = invColors[invStatus];

  const statusColors = STATUS_COLORS[order.status] ?? { bg: '#F3F4F6', text: '#6B7280' };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: CARD,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        borderLeftWidth: 4,
        borderLeftColor: borderColor,
        padding: 14,
        marginBottom: 10,
        opacity: pressed ? 0.92 : 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>
              #{order.orderNumber ?? (order as any).poReference ?? order.id.slice(0, 8).toUpperCase()}
            </Text>
            {isOverdue && (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#991B1B', fontWeight: '700', fontSize: 9 }}>OVERDUE</Text>
              </View>
            )}
          </View>
          {order.customerName && (
            <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }} numberOfLines={1}>{order.customerName}</Text>
          )}
          {(order as any).scheduledDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Feather name="truck" size={11} color={isOverdue ? AMBER : MUTED} />
              <Text style={{ fontSize: 11, color: isOverdue ? AMBER : MUTED, fontWeight: '500' }}>
                {new Date((order as any).scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View style={{ backgroundColor: statusColors.bg, borderWidth: 1, borderColor: statusColors.text + '40', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
            <Text style={{ color: statusColors.text, fontWeight: '600', fontSize: 11 }}>{STATUS_LABEL[order.status] ?? order.status}</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: BLUE }}>{fmtCents(subtotal)}</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 10 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
            {itemCount} item{itemCount !== 1 ? 's' : ''} · ex-GST {fmtCents(exGst)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: invCfg.bg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 }}>
            <Text style={{ color: invCfg.text, fontWeight: '700', fontSize: 10, textTransform: 'uppercase' }}>{invStatus}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Feather name="chevron-right" size={12} color={BLUE} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function WholesaleTabContent({
  allOrders,
  isLoading,
  refreshing,
  onRefresh,
  filter,
  onFilterChange,
  onOrderPress,
  onCreateNew,
}: {
  allOrders: ApiOrder[];
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  filter: string;
  onFilterChange: (f: string) => void;
  onOrderPress: (order: ApiOrder) => void;
  onCreateNew: () => void;
}) {

  const wholesaleOrders = useMemo(
    () => allOrders.filter((o) => o.orderSource === 'wholesale'),
    [allOrders],
  );

  const filteredOrders = useMemo(() => {
    if (filter === 'all')        return wholesaleOrders;
    if (filter === 'overdue')    return wholesaleOrders.filter(isOverdueWholesale);
    return wholesaleOrders.filter((o) => o.status === filter);
  }, [wholesaleOrders, filter]);

  const sections = useMemo(() => {
    const groups: Record<string, ApiOrder[]> = {};
    for (const o of filteredOrders) {
      const g = getWeekGroup(o);
      (groups[g] ??= []).push(o);
    }
    return (['This week', 'Last week', 'Older'] as const)
      .filter((g) => groups[g]?.length)
      .map((g) => ({ label: g, items: groups[g] }));
  }, [filteredOrders]);

  const kpi = useMemo(() => {
    const outstanding = wholesaleOrders.filter((o) => !(o as any).isPaid && !['cancelled', 'refunded', 'completed'].includes(o.status));
    const outstandingCents = outstanding.reduce((s, o) => s + (o.totalCents ?? 0), 0);
    const overdueCount     = wholesaleOrders.filter(isOverdueWholesale).length;
    const avgOrderCents    = wholesaleOrders.length > 0
      ? Math.round(wholesaleOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0) / wholesaleOrders.length)
      : 0;
    return { outstandingCents, overdueCount, avgOrderCents };
  }, [wholesaleOrders]);

  return (
    <View style={{ flex: 1 }}>
      {/* KPI tiles */}
      {wholesaleOrders.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 0, backgroundColor: BG }}>
          {[
            { label: 'Outstanding', value: fmtCents(kpi.outstandingCents), icon: 'dollar-sign' as const, color: kpi.outstandingCents > 0 ? AMBER : GREEN },
            { label: 'Overdue',     value: String(kpi.overdueCount),        icon: 'alert-circle' as const, color: kpi.overdueCount > 0 ? RED : MUTED },
            { label: 'Avg order',   value: fmtCents(kpi.avgOrderCents),     icon: 'bar-chart-2' as const,  color: BLUE },
          ].map((tile) => (
            <View key={tile.label} style={{ flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 4 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: tile.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={tile.icon} size={14} color={tile.color} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{tile.value}</Text>
              <Text style={{ fontSize: 10, color: MUTED, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tile.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Filter chips */}
      <View style={{ backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
        >
          {WS_FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const color = tab.key === 'overdue' ? RED : BLUE;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { onFilterChange(tab.key); Haptics.selectionAsync(); }}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                  backgroundColor: active ? color : BG, borderColor: active ? color : BORDER }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : MUTED }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 0 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {filteredOrders.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <Feather name="package" size={36} color={BORDER} />
              <Text style={{ color: MUTED, fontWeight: '600', fontSize: 15 }}>
                {filter === 'all' ? 'No wholesale orders yet' : `No ${WS_FILTER_TABS.find(t => t.key === filter)?.label ?? filter} orders`}
              </Text>
            </View>
          ) : sections.length > 0 ? (
            sections.map((section) => (
              <View key={section.label} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 }}>
                    {section.label}
                  </Text>
                  <View style={{ backgroundColor: BLUE + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: BLUE, fontWeight: '700', fontSize: 11 }}>{section.items.length}</Text>
                  </View>
                </View>
                {section.items.map((order) => (
                  <WholesaleOrderCard key={order.id} order={order} onPress={() => onOrderPress(order)} />
                ))}
              </View>
            ))
          ) : (
            filteredOrders.map((order) => (
              <WholesaleOrderCard key={order.id} order={order} onPress={() => onOrderPress(order)} />
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onCreateNew(); }}
        accessibilityLabel="New Wholesale Order"
        accessibilityRole="button"
        style={{ position: 'absolute', bottom: 28, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: NAVY, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 28,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 8 }}
      >
        <Feather name="plus" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>New Wholesale Order</Text>
      </Pressable>
    </View>
  );
}

export default WholesaleTabContent;
