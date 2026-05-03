import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/context/AuthContext';
import { MOCK_STAFF_ORDERS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';
import type { StaffOrder, OrderStatus } from '@/types';

const QUICK_ACTIONS = [
  { icon: 'plus-circle', label: 'New Order', color: '#C8833A' },
  { icon: 'users', label: 'Check In', color: '#3A6A5A' },
  { icon: 'printer', label: 'Print Queue', color: '#4A4A8A' },
  { icon: 'alert-circle', label: 'Issue', color: '#8A4A4A' },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function OrderRow({ order, onStatusChange }: { order: StaffOrder; onStatusChange: (id: string, s: OrderStatus) => void }) {
  const colors = useColors();
  const nextStatus: Record<OrderStatus, OrderStatus | null> = {
    pending: 'in-progress',
    'in-progress': 'ready',
    ready: 'completed',
    completed: null,
  };
  const next = nextStatus[order.status];

  return (
    <View style={[styles.orderCard, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
      <View style={styles.orderHeader}>
        <View>
          <Text style={[styles.orderNum, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{order.orderNumber}</Text>
          <Text style={[styles.orderMeta, { color: colors.mutedForeground }]}>
            {order.customerName} · {order.type === 'dine-in' ? `Table ${order.tableNumber}` : order.type}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <OrderStatusBadge status={order.status} />
          <Text style={[styles.orderTime, { color: colors.mutedForeground }]}>{timeAgo(order.createdAt)}</Text>
        </View>
      </View>
      <View style={[styles.orderDivider, { backgroundColor: colors.border }]} />
      {order.items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <Text style={[styles.itemQty, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>{item.quantity}×</Text>
          <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
          <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>${(item.quantity * item.price).toFixed(2)}</Text>
        </View>
      ))}
      <View style={styles.orderFooter}>
        <Text style={[styles.orderTotal, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          ${order.total.toFixed(2)}
        </Text>
        {next && (
          <Pressable
            onPress={() => onStatusChange(order.id, next)}
            style={[styles.nextBtn, { backgroundColor: colors.primary, borderRadius: colors.radius / 2 }]}
          >
            <Text style={[styles.nextBtnText, { fontFamily: 'Inter_600SemiBold' }]}>
              {next === 'in-progress' ? 'Start' : next === 'ready' ? 'Mark Ready' : 'Complete'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function StaffDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [orders, setOrders] = useState<StaffOrder[]>(MOCK_STAFF_ORDERS);

  const activeOrders = orders.filter((o) => o.status !== 'completed');
  const completedToday = orders.filter((o) => o.status === 'completed').length;
  const revenueToday = orders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const handleStatusChange = (id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0D0604' }}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Dark header */}
      <LinearGradient
        colors={['#1A0A04', '#3D1F0D']}
        style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.staffLabel, { fontFamily: 'Inter_400Regular' }]}>Staff Portal</Text>
            <Text style={[styles.staffName, { fontFamily: 'Inter_700Bold' }]}>{user?.name}</Text>
            <Text style={[styles.staffId, { fontFamily: 'Inter_400Regular' }]}>ID: {(user as any)?.staffId}</Text>
          </View>
          <View style={styles.shiftBadge}>
            <View style={styles.shiftDot} />
            <Text style={[styles.shiftText, { fontFamily: 'Inter_500Medium' }]}>On Shift</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsSection}>
        <Text style={[styles.sectionLabel, { color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_500Medium' }]}>
          TODAY'S OVERVIEW
        </Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Revenue"
            value={`$${revenueToday.toFixed(0)}`}
            subtitle="total today"
            gradient={['#C8833A', '#8B4513']}
          />
          <StatCard
            label="Completed"
            value={`${completedToday}`}
            subtitle="orders done"
            dark
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Active" value={`${activeOrders.length}`} subtitle="orders live" dark />
          <StatCard label="Pending" value={`${pendingCount}`} subtitle="awaiting start" dark />
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_600SemiBold' }]}>
          Quick Actions
        </Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              style={[styles.actionCard, { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: colors.radius }]}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '25' }]}>
                <Feather name={action.icon as any} size={20} color={action.color} />
              </View>
              <Text style={[styles.actionLabel, { color: '#fff', fontFamily: 'Inter_500Medium' }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Active Orders */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_600SemiBold' }]}>
          Active Orders
        </Text>
        {activeOrders.length === 0 ? (
          <View style={[styles.emptyOrders, { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: colors.radius }]}>
            <Feather name="check-circle" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={[styles.emptyText, { color: 'rgba(255,255,255,0.4)' }]}>All clear — no active orders</Text>
          </View>
        ) : (
          activeOrders.map((order) => (
            <OrderRow key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  staffLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  staffName: {
    color: '#fff',
    fontSize: 22,
  },
  staffId: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  shiftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(80, 200, 80, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  shiftDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  shiftText: {
    color: '#4ADE80',
    fontSize: 13,
  },
  statsSection: {
    padding: 20,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '47%',
    padding: 16,
    gap: 10,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 13,
  },
  orderCard: {
    padding: 16,
    gap: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNum: {
    fontSize: 16,
    marginBottom: 2,
  },
  orderMeta: {
    fontSize: 12,
  },
  orderTime: {
    fontSize: 11,
  },
  orderDivider: {
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
    marginTop: 4,
  },
  orderTotal: {
    fontSize: 16,
  },
  nextBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 13,
  },
  emptyOrders: {
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
