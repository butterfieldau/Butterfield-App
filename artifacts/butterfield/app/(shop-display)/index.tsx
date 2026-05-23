import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const NAVY = '#1A2B4A';
const GREEN = '#16A34A';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const STATUS_ACTIONS = [
  { id: 'being_prepared', label: 'Accept / Preparing', color: BLUE },
  { id: 'ready_for_pickup', label: 'Ready', color: GREEN },
  { id: 'completed', label: 'Completed', color: NAVY },
  { id: 'cancelled', label: 'Cancelled', color: RED },
] as const;

function formatOrderTime(value?: string | null) {
  if (!value) return 'ASAP';
  return new Date(value).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function orderSubtitle(order: any) {
  const bits = [
    order.type === 'delivery' ? 'Delivery' : 'Pickup',
    order.stripePaymentStatus ? `Payment ${order.stripePaymentStatus}` : null,
    order.scheduledFor ? `For ${formatOrderTime(order.scheduledFor)}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

function playNewOrderAlert(name: string, numberLabel: string, soundEnabled: boolean) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (!soundEnabled) return;
  Notifications.scheduleNotificationAsync({
    content: {
      title: 'New Butterfield app order',
      body: `${name} · ${numberLabel}`,
      sound: 'default',
    },
    trigger: null,
  }).catch(() => {});
}

export default function ShopDisplayOrdersScreen() {
  const qc = useQueryClient();
  const [alertOrderId, setAlertOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenOrdersRef = useRef<Record<string, string>>({});
  const bootedRef = useRef(false);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabled).catch(() => {});
  }, []);

  const ordersQuery = useQuery({
    queryKey: ['shop-display-orders'],
    queryFn: () => api.shopDisplay.orders(),
    refetchInterval: 7000,
  });

  const rows = ordersQuery.data?.data ?? [];

  useEffect(() => {
    const currentMap: Record<string, string> = {};
    for (const order of rows) currentMap[order.id] = order.status;

    if (!bootedRef.current) {
      seenOrdersRef.current = currentMap;
      bootedRef.current = true;
      return;
    }

    const previousMap = seenOrdersRef.current;
    const fresh = rows.find((order) => !previousMap[order.id] && order.status === 'received');
    if (fresh) {
      setAlertOrderId(fresh.id);
      playNewOrderAlert(fresh.customerName ?? 'Customer', `#${fresh.id.slice(0, 6).toUpperCase()}`, soundEnabled);
    }
    seenOrdersRef.current = currentMap;
  }, [rows, soundEnabled]);

  const activeCount = useMemo(
    () => rows.filter((order) => !['completed', 'cancelled', 'refunded'].includes(order.status)).length,
    [rows],
  );

  const updateStatus = async (id: string, status: string) => {
    Haptics.selectionAsync();
    await api.shopDisplay.updateOrderStatus(id, status);
    setAlertOrderId((current) => (current === id ? null : current));
    qc.invalidateQueries({ queryKey: ['shop-display-orders'] });
  };

  if (ordersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Live app orders</Text>
          <Text style={styles.summaryValue}>{activeCount}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Last refresh</Text>
          <Text style={styles.summaryValueSmall}>{new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={ordersQuery.isRefetching} onRefresh={() => ordersQuery.refetch()} tintColor={BLUE} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No live app orders right now.</Text>}
        renderItem={({ item }) => {
          const total = `$${((item.totalCents ?? 0) / 100).toFixed(2)}`;
          const isAlert = alertOrderId === item.id;
          return (
            <View style={[styles.orderCard, isAlert && styles.orderCardAlert]}>
              <View style={styles.orderTopRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.orderNumber}>#{item.id.slice(0, 6).toUpperCase()}</Text>
                  <Text style={styles.customerName}>{item.customerName ?? 'Customer'}</Text>
                  <Text style={styles.orderMeta}>{orderSubtitle(item)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.orderTotal}>{total}</Text>
                  <View style={[styles.statusPill, item.status === 'received' ? styles.statusReceived : item.status === 'ready_for_pickup' ? styles.statusReady : item.status === 'completed' ? styles.statusCompleted : styles.statusPreparing]}>
                    <Text style={styles.statusText}>{String(item.status).replace(/_/g, ' ')}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Items</Text>
              <View style={{ gap: 8 }}>
                {(Array.isArray(item.items) ? item.items : []).map((line: any, index: number) => (
                  <View key={`${item.id}-${index}`} style={styles.lineItem}>
                    <Text style={styles.lineMain}>{line.quantity} x {line.productName ?? line.name}</Text>
                    {line.variantName ? <Text style={styles.lineSub}>{line.variantName}</Text> : null}
                    {Array.isArray(line.selectedOptions) && line.selectedOptions.length ? (
                      <Text style={styles.lineSub}>
                        {line.selectedOptions.map((option: any) => option.optionName ?? option.groupName ?? option.textValue).filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    {Array.isArray(line.packSelections) && line.packSelections.length ? (
                      <Text style={styles.lineSub}>{line.packSelections.join(' · ')}</Text>
                    ) : null}
                  </View>
                ))}
              </View>

              {item.notes ? (
                <>
                  <Text style={styles.sectionLabel}>Customer notes</Text>
                  <Text style={styles.noteText}>{item.notes}</Text>
                </>
              ) : null}

              <View style={styles.actionsGrid}>
                {STATUS_ACTIONS.map((action) => (
                  <Pressable
                    key={action.id}
                    onPress={() => void updateStatus(item.id, action.id)}
                    style={[styles.actionButton, { backgroundColor: action.color }]}
                  >
                    <Text style={styles.actionButtonText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  summaryRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: { flex: 1, backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: BORDER },
  summaryLabel: { color: MUTED, fontSize: 13, fontWeight: '700' },
  summaryValue: { color: TEXT, fontSize: 30, fontWeight: '800', marginTop: 6 },
  summaryValueSmall: { color: TEXT, fontSize: 22, fontWeight: '800', marginTop: 10 },
  emptyText: { textAlign: 'center', color: MUTED, paddingTop: 40, fontSize: 16 },
  orderCard: { backgroundColor: CARD, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: BORDER, gap: 12 },
  orderCardAlert: { borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.14, shadowRadius: 14, elevation: 3 },
  orderTopRow: { flexDirection: 'row', gap: 12 },
  orderNumber: { color: BLUE, fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  customerName: { color: TEXT, fontSize: 24, fontWeight: '800' },
  orderMeta: { color: MUTED, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  orderTotal: { color: TEXT, fontSize: 24, fontWeight: '800' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusReceived: { backgroundColor: '#DBEAFE' },
  statusPreparing: { backgroundColor: '#FEF3C7' },
  statusReady: { backgroundColor: '#DCFCE7' },
  statusCompleted: { backgroundColor: '#E5E7EB' },
  statusText: { color: TEXT, fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  sectionLabel: { color: NAVY, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 },
  lineItem: { backgroundColor: BG, borderRadius: 14, padding: 12, gap: 4 },
  lineMain: { color: TEXT, fontSize: 17, fontWeight: '700' },
  lineSub: { color: MUTED, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  noteText: { color: TEXT, fontSize: 15, lineHeight: 22 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  actionButton: { minWidth: '48%', flex: 1, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
});
