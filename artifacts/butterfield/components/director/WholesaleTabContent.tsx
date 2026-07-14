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
import { 
  BG, SURFACE, SURFACE_RAISED, BORDER, 
  TEXT, TEXT_MUTED, TEXT_FAINT, 
  BRAND, BRAND_DIM, BRAND_TEXT_ON,
  GREEN, GREEN_DIM, AMBER, AMBER_DIM, RED, RED_DIM, BLUE, BLUE_DIM 
} from './commandCenterColors';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isWholesalePaid(order: ApiOrder): boolean {
  return !!(
    (order as any).isPaid ||
    String((order as any).stripePaymentStatus ?? '').toLowerCase() === 'paid' ||
    String((order as any).invoiceStatus ?? '').toLowerCase() === 'paid'
  );
}

function isOverdueWholesale(order: ApiOrder): boolean {
  if (isWholesalePaid(order)) return false;
  if (!order.scheduledDate && !(order as any).deliveryDate) return false;
  if (['delivered', 'cancelled', 'completed'].includes(order.status)) return false;
  const dateStr = (order.scheduledDate ?? (order as any).deliveryDate) as string;
  return new Date(dateStr) < new Date();
}

const WS_FILTER_TABS = [
  { key: 'all',        label: 'All Active' },
  { key: 'overdue',    label: 'Overdue' },
  { key: 'processing', label: 'Confirmed' },
  { key: 'dispatched', label: 'Dispatched' },
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
  const isPaid   = isWholesalePaid(order);

  const borderColor = isOverdue ? RED : order.status === 'dispatched' || order.status === 'delivered' ? GREEN : BORDER;

  const invStatus = isPaid ? 'paid' : isOverdue ? 'overdue' : 'pending';
  const invColors: Record<string, { bg: string; text: string }> = {
    paid:    { bg: GREEN_DIM, text: GREEN },
    pending: { bg: AMBER_DIM, text: AMBER },
    overdue: { bg: RED_DIM, text: RED },
  };
  const invCfg = invColors[invStatus];

  const statusColors = STATUS_COLORS[order.status] ?? { bg: SURFACE_RAISED, text: TEXT_MUTED };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: SURFACE,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isOverdue ? RED : BORDER,
        borderLeftWidth: isOverdue ? 4 : 1,
        borderLeftColor: borderColor,
        padding: 12,
        marginBottom: 8,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>
              #{order.orderNumber ?? (order as any).poReference ?? order.id.slice(0, 8).toUpperCase()}
            </Text>
            {isOverdue && (
              <View style={{ backgroundColor: RED_DIM, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: RED, fontWeight: '800', fontSize: 9 }}>OVERDUE</Text>
              </View>
            )}
            {isPaid && (
              <View style={{ backgroundColor: GREEN_DIM, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: GREEN, fontWeight: '800', fontSize: 9 }}>PAID</Text>
              </View>
            )}
          </View>
          {order.customerName && (
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }} numberOfLines={1}>{order.customerName}</Text>
          )}
          {(order as any).scheduledDate && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Feather name="truck" size={11} color={isOverdue ? RED : TEXT_FAINT} />
              <Text style={{ fontSize: 11, color: isOverdue ? RED : TEXT_MUTED, fontWeight: '500' }}>
                {new Date((order as any).scheduledDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT }}>{fmtCents(subtotal)}</Text>
          <Text style={{ fontSize: 11, color: TEXT_MUTED }}>ex-GST {fmtCents(exGst)}</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 10, opacity: 0.5 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="package" size={11} color={TEXT_FAINT} />
            <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '500' }}>
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: statusColors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: statusColors.text + '40' }}>
            <Text style={{ color: statusColors.text, fontWeight: '700', fontSize: 10, textTransform: 'uppercase' }}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Text>
          </View>
          <Feather name="chevron-right" size={14} color={TEXT_FAINT} />
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
    const outstanding = wholesaleOrders.filter((o) => !isWholesalePaid(o) && !['cancelled', 'refunded', 'completed'].includes(o.status));
    const outstandingCents = outstanding.reduce((s, o) => s + (o.totalCents ?? 0), 0);
    const overdueOrders = wholesaleOrders.filter(isOverdueWholesale);
    const overdueCount     = overdueOrders.length;
    const overdueAmountCents = overdueOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
    const overdueAccountsCount = new Set(overdueOrders.map(o => (o as any).customerId ?? o.customerName)).size;
    const avgOrderCents    = wholesaleOrders.length > 0
      ? Math.round(wholesaleOrders.reduce((s, o) => s + (o.totalCents ?? 0), 0) / wholesaleOrders.length)
      : 0;

    const thisWeekOrders = wholesaleOrders.filter(o => getWeekGroup(o) === 'This week').length;

    return { outstandingCents, overdueCount, overdueAmountCents, overdueAccountsCount, avgOrderCents, thisWeekOrders };
  }, [wholesaleOrders]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Hero Stat */}
        {wholesaleOrders.length > 0 && (
          <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                Outstanding Balance
              </Text>
              <Text style={{ fontSize: 48, fontWeight: '900', color: TEXT, letterSpacing: -1.5, marginBottom: 0 }}>
                {fmtCents(kpi.outstandingCents)}
              </Text>
              {kpi.overdueAccountsCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: RED_DIM, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 4 }}>
                  <Feather name="alert-circle" size={14} color={RED} />
                  <Text style={{ color: RED, fontWeight: '600', fontSize: 13 }}>
                    {kpi.overdueAccountsCount} accounts overdue ({fmtCents(kpi.overdueAmountCents)})
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Sub KPIs */}
        {wholesaleOrders.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 16, marginBottom: 12 }}>
            <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: TEXT_FAINT, marginBottom: 4 }}>Avg Order Value</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{fmtCents(kpi.avgOrderCents)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: TEXT_FAINT, marginBottom: 4 }}>Orders This Week</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{kpi.thisWeekOrders}</Text>
            </View>
          </View>
        )}

        {/* Filter chips */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 4 }}
          >
            {WS_FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { onFilterChange(tab.key); Haptics.selectionAsync(); }}
                  style={{ 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    borderRadius: 20, 
                    borderWidth: 1,
                    backgroundColor: active ? '#000' : SURFACE, 
                    borderColor: active ? '#000' : BORDER 
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : TEXT_MUTED }}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading && !refreshing ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BRAND} size="large" />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            {filteredOrders.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
                <Feather name="package" size={48} color={BORDER} />
                <Text style={{ color: TEXT_FAINT, fontWeight: '600', fontSize: 12 }}>
                  {filter === 'all' ? 'No wholesale orders yet' : `No ${WS_FILTER_TABS.find(t => t.key === filter)?.label ?? filter} orders`}
                </Text>
              </View>
            ) : sections.length > 0 ? (
              sections.map((section) => (
                <View key={section.label} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_MUTED, letterSpacing: 1, textTransform: 'uppercase' }}>
                      {section.label}
                    </Text>
                    <View style={{ height: 1, flex: 1, backgroundColor: BORDER, opacity: 0.3 }} />
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
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <View style={{ position: 'absolute', bottom: 24, left: 20, right: 20, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onCreateNew(); }}
          accessibilityLabel="New Wholesale Order"
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row', 
            alignItems: 'center', 
            gap: 8,
            backgroundColor: BRAND, 
            paddingHorizontal: 24, 
            paddingVertical: 14, 
            borderRadius: 28,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
            shadowColor: '#000', 
            shadowOffset: { width: 0, height: 4 }, 
            shadowOpacity: 0.3, 
            shadowRadius: 12, 
            elevation: 8 
          })}
        >
          <Feather name="plus" size={20} color={BRAND_TEXT_ON} strokeWidth={3} />
          <Text style={{ color: BRAND_TEXT_ON, fontWeight: '800', fontSize: 15 }}>New Order</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default WholesaleTabContent;
