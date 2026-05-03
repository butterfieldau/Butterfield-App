import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_STAFF_ORDERS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';
import type { OrderStatus, StaffOrder } from '@/types';

const STATUS_TABS: { key: OrderStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Done' },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function StaffOrders() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [orders, setOrders] = useState<StaffOrder[]>(MOCK_STAFF_ORDERS);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  const nextStatus: Record<OrderStatus, OrderStatus | null> = {
    pending: 'in-progress',
    'in-progress': 'ready',
    ready: 'completed',
    completed: null,
  };

  const handleStatusChange = (id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0D0604' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold' }]}>Order Queue</Text>
        <Text style={[styles.subtitle, { fontFamily: 'Inter_400Regular' }]}>
          {orders.filter((o) => o.status !== 'completed').length} active
        </Text>
      </View>

      {/* Tabs */}
      <FlatList
        horizontal
        data={STATUS_TABS}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) => {
          const isActive = filter === item.key;
          const count = item.key === 'all' ? orders.length : orders.filter((o) => o.status === item.key).length;
          return (
            <Pressable
              onPress={() => {
                setFilter(item.key);
                Haptics.selectionAsync();
              }}
              style={[
                styles.tabPill,
                { backgroundColor: isActive ? '#C8833A' : 'rgba(255,255,255,0.08)', borderRadius: 20 },
              ]}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'Inter_500Medium' }]}>
                {item.label}
              </Text>
              {count > 0 && (
                <View style={[styles.tabCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)' }]}>
                  <Text style={[styles.tabCountText, { color: isActive ? '#fff' : 'rgba(255,255,255,0.5)' }]}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      {/* Orders list */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: order }) => {
          const next = nextStatus[order.status];
          return (
            <View
              style={[
                styles.orderCard,
                {
                  backgroundColor: '#1A0A04',
                  borderRadius: colors.radius,
                  borderColor: order.status === 'pending' ? '#C8833A40' : 'rgba(255,255,255,0.08)',
                  borderWidth: 1,
                },
              ]}
            >
              <View style={styles.orderTop}>
                <View>
                  <Text style={[styles.orderNum, { fontFamily: 'Inter_700Bold' }]}>{order.orderNumber}</Text>
                  <Text style={[styles.orderMeta, { color: 'rgba(255,255,255,0.5)' }]}>
                    {order.customerName}
                    {order.type === 'dine-in' ? ` · Table ${order.tableNumber}` : ` · ${order.type}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <OrderStatusBadge status={order.status} />
                  <Text style={[styles.orderTime, { color: 'rgba(255,255,255,0.35)' }]}>{timeAgo(order.createdAt)}</Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />

              {order.items.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={[styles.itemQty, { color: '#C8833A', fontFamily: 'Inter_600SemiBold' }]}>{item.quantity}×</Text>
                  <Text style={[styles.itemName, { color: 'rgba(255,255,255,0.8)' }]}>{item.name}</Text>
                  <Text style={[styles.itemPrice, { color: 'rgba(255,255,255,0.4)' }]}>${(item.quantity * item.price).toFixed(2)}</Text>
                </View>
              ))}

              <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />

              <View style={styles.orderFooter}>
                <Text style={[styles.orderTotal, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                  ${order.total.toFixed(2)}
                </Text>
                {next ? (
                  <Pressable
                    onPress={() => handleStatusChange(order.id, next)}
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: next === 'completed' ? '#065F46' : '#C8833A',
                        borderRadius: colors.radius / 2,
                      },
                    ]}
                  >
                    <Feather
                      name={next === 'in-progress' ? 'play' : next === 'ready' ? 'bell' : 'check'}
                      size={14}
                      color="#fff"
                    />
                    <Text style={[styles.actionText, { fontFamily: 'Inter_600SemiBold' }]}>
                      {next === 'in-progress' ? 'Start' : next === 'ready' ? 'Mark Ready' : 'Complete'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.completedTag}>
                    <Feather name="check-circle" size={14} color="#4ADE80" />
                    <Text style={[styles.completedText, { fontFamily: 'Inter_500Medium' }]}>Done</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={36} color="rgba(255,255,255,0.2)" />
            <Text style={[styles.emptyText, { color: 'rgba(255,255,255,0.35)' }]}>No orders here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 2,
  },
  title: {
    color: '#fff',
    fontSize: 26,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },
  tabsScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  tabText: {
    fontSize: 13,
  },
  tabCount: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  list: {
    padding: 20,
    gap: 10,
  },
  orderCard: {
    padding: 16,
    gap: 10,
    marginBottom: 10,
  },
  orderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 3,
  },
  orderMeta: {
    fontSize: 12,
  },
  orderTime: {
    fontSize: 11,
  },
  divider: {
    height: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    minWidth: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
  },
  itemPrice: {
    fontSize: 13,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTotal: {
    fontSize: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
  },
  completedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completedText: {
    color: '#4ADE80',
    fontSize: 13,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
});
