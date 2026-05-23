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
  useWindowDimensions,
  View,
} from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

const BG    = '#F5F6FA';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const GREEN = '#16A34A';
const RED   = '#EF4444';

const STATUS_ACTIONS = [
  { id: 'being_prepared',  label: 'Accept',    icon: 'check-circle', color: BLUE  },
  { id: 'ready_for_pickup',label: 'Ready',     icon: 'bell',         color: GREEN },
  { id: 'completed',       label: 'Completed', icon: 'archive',      color: NAVY  },
  { id: 'cancelled',       label: 'Cancel',    icon: 'x-circle',     color: RED   },
] as const;

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received:        { label: 'Received',   bg: '#DBEAFE', fg: '#1D4ED8' },
  being_prepared:  { label: 'Preparing',  bg: '#FEF3C7', fg: '#92400E' },
  ready_for_pickup:{ label: 'Ready',      bg: '#DCFCE7', fg: '#166534' },
  completed:       { label: 'Completed',  bg: '#E5E7EB', fg: '#374151' },
  cancelled:       { label: 'Cancelled',  bg: '#FEE2E2', fg: '#B91C1C' },
  refunded:        { label: 'Refunded',   bg: '#F3E8FF', fg: '#7C3AED' },
};

function formatTime(value?: string | null) {
  if (!value) return 'ASAP';
  return new Date(value).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function orderSubtitle(order: any) {
  return [
    order.type === 'delivery' ? 'Delivery' : 'Pickup',
    order.stripePaymentStatus ? `Payment ${order.stripePaymentStatus}` : null,
    order.scheduledFor ? `For ${formatTime(order.scheduledFor)}` : null,
  ].filter(Boolean).join(' · ');
}

function playNewOrderAlert(name: string, label: string, soundEnabled: boolean) {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (!soundEnabled) return;
  Notifications.scheduleNotificationAsync({
    content: { title: 'New Butterfield order', body: `${name} · ${label}`, sound: 'default' },
    trigger: null,
  }).catch(() => {});
}

export default function ShopDisplayOrdersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const listRef = useRef(null);
  useScrollToTop(listRef);

  const qc = useQueryClient();
  const [alertOrderId, setAlertOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const seenRef = useRef<Record<string, string>>({});
  const bootedRef = useRef(false);

  useEffect(() => {
    getShopDisplaySoundEnabled().then(setSoundEnabled).catch(() => {});
  }, []);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['shop-display-orders'],
    queryFn: () => api.shopDisplay.orders(),
    refetchInterval: 7000,
  });

  const rows: any[] = data?.data ?? [];

  useEffect(() => {
    const currentMap: Record<string, string> = {};
    for (const o of rows) currentMap[o.id] = o.status;
    if (!bootedRef.current) { seenRef.current = currentMap; bootedRef.current = true; return; }
    const prev = seenRef.current;
    const fresh = rows.find(o => !prev[o.id] && o.status === 'received');
    if (fresh) {
      setAlertOrderId(fresh.id);
      playNewOrderAlert(fresh.customerName ?? 'Customer', `#${fresh.id.slice(0, 6).toUpperCase()}`, soundEnabled);
    }
    seenRef.current = currentMap;
  }, [rows, soundEnabled]);

  const activeCount = useMemo(() =>
    rows.filter(o => !['completed', 'cancelled', 'refunded'].includes(o.status)).length,
  [rows]);

  const completedToday = useMemo(() =>
    rows.filter(o => o.status === 'completed').length,
  [rows]);

  const updateStatus = async (id: string, status: string) => {
    Haptics.selectionAsync();
    await api.shopDisplay.updateOrderStatus(id, status);
    setAlertOrderId(cur => cur === id ? null : cur);
    qc.invalidateQueries({ queryKey: ['shop-display-orders'] });
  };

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  const numCols = isWide ? 2 : 1;

  const renderCard = ({ item }: { item: any }) => {
    const total   = `$${((item.totalCents ?? 0) / 100).toFixed(2)}`;
    const isAlert = alertOrderId === item.id;
    const meta    = STATUS_META[item.status] ?? STATUS_META.received;

    return (
      <View style={[s.card, isAlert && s.cardAlert, isWide && s.cardWide]}>
        {/* Header row */}
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNum}>#{item.id.slice(0, 6).toUpperCase()}</Text>
            <Text style={s.customerName} numberOfLines={1}>{item.customerName ?? 'Customer'}</Text>
            <Text style={s.orderMeta}>{orderSubtitle(item)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={s.orderTotal}>{total}</Text>
            <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
              <Text style={[s.statusText, { color: meta.fg }]}>{meta.label}</Text>
            </View>
          </View>
        </View>

        {/* Items */}
        <View style={{ gap: 6 }}>
          <Text style={s.sectionLabel}>Items</Text>
          {(Array.isArray(item.items) ? item.items : []).map((line: any, i: number) => (
            <View key={`${item.id}-${i}`} style={s.lineItem}>
              <Text style={s.lineMain}>{line.quantity} × {line.productName ?? line.name}</Text>
              {line.variantName ? <Text style={s.lineSub}>{line.variantName}</Text> : null}
              {Array.isArray(line.selectedOptions) && line.selectedOptions.length ? (
                <Text style={s.lineSub}>
                  {line.selectedOptions.map((o: any) => o.optionName ?? o.groupName ?? o.textValue).filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {Array.isArray(line.packSelections) && line.packSelections.length ? (
                <Text style={s.lineSub}>{line.packSelections.join(' · ')}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Notes */}
        {item.notes ? (
          <View>
            <Text style={s.sectionLabel}>Notes</Text>
            <Text style={s.noteText}>{item.notes}</Text>
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={[s.actions, isWide && s.actionsWide]}>
          {STATUS_ACTIONS.map(action => (
            <Pressable
              key={action.id}
              onPress={() => void updateStatus(item.id, action.id)}
              style={[s.actionBtn, { backgroundColor: action.color }, isWide && s.actionBtnWide]}
            >
              <Feather name={action.icon as any} size={isWide ? 18 : 15} color="#fff" />
              <Text style={[s.actionText, isWide && s.actionTextWide]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Summary strip */}
      <View style={[s.summaryRow, isWide && s.summaryRowWide]}>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Live orders</Text>
          <Text style={s.summaryValue}>{activeCount}</Text>
        </View>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Completed today</Text>
          <Text style={s.summaryValue}>{completedToday}</Text>
        </View>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Last refresh</Text>
          <Text style={[s.summaryValue, { fontSize: isWide ? 22 : 18 }]}>
            {new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {/* Orders list */}
      <FlatList
        ref={listRef}
        key={numCols}
        data={rows}
        keyExtractor={item => item.id}
        numColumns={numCols}
        columnWrapperStyle={isWide ? { gap: 14, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={[
          { padding: isWide ? 0 : 16, paddingBottom: 40, gap: 14 },
          isWide && { paddingTop: 14 },
        ]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={BLUE} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="inbox" size={40} color={MUTED} />
            <Text style={s.emptyText}>No live app orders right now</Text>
          </View>
        }
        renderItem={renderCard}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  summaryRow:      { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  summaryRowWide:  { paddingHorizontal: 16, paddingBottom: 0 },
  summaryCard:     { flex: 1, backgroundColor: CARD, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: BORDER, gap: 2 },
  summaryLabel:    { color: MUTED, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue:    { color: TEXT, fontSize: 24, fontWeight: '800', marginTop: 2 },

  card:            { backgroundColor: CARD, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: BORDER, gap: 12 },
  cardWide:        { flex: 1 },
  cardAlert:       { borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },

  cardHeader:      { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  orderNum:        { color: BLUE, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2 },
  customerName:    { color: TEXT, fontSize: 20, fontWeight: '800', lineHeight: 24 },
  orderMeta:       { color: MUTED, fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  orderTotal:      { color: TEXT, fontSize: 22, fontWeight: '800' },

  statusPill:      { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:      { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },

  sectionLabel:    { color: NAVY, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  lineItem:        { backgroundColor: BG, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  lineMain:        { color: TEXT, fontSize: 15, fontWeight: '700' },
  lineSub:         { color: MUTED, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  noteText:        { color: TEXT, fontSize: 14, lineHeight: 20 },

  actions:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  actionsWide:     { flexWrap: 'nowrap' },
  actionBtn:       { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10 },
  actionBtnWide:   { flexBasis: 0, flexGrow: 1, paddingVertical: 16 },
  actionText:      { color: '#fff', fontSize: 14, fontWeight: '800' },
  actionTextWide:  { fontSize: 15 },

  emptyWrap:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:       { textAlign: 'center', color: MUTED, fontSize: 16, fontWeight: '500' },
});
