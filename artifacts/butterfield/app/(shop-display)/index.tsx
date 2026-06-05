import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ShopDisplayOrder } from '@/lib/api';
import { normalizeOrderItems } from '@/lib/orderItems';
import { getShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';
import { sendReceiptPrint, orderToPrintJob } from '@/lib/printer';

const BG    = '#EFF6FF';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const GREEN = '#16A34A';
const RED   = '#EF4444';

type OrderFilterMode = 'today' | 'week' | 'date';
type QueueMode = 'active' | 'completed' | 'cancelled';
type FeatherIconName = ComponentProps<typeof Feather>['name'];

const STATUS_ACTIONS = [
  { id: 'being_prepared',  label: 'Accept',    icon: 'check-circle', color: BLUE  },
  { id: 'ready_for_pickup',label: 'Ready',     icon: 'bell',         color: GREEN },
  { id: 'completed',       label: 'Completed', icon: 'archive',      color: NAVY  },
  { id: 'cancelled',       label: 'Cancel',    icon: 'x-circle',     color: RED   },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: FeatherIconName;
  color: string;
}>;

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received:        { label: 'Received',   bg: '#DBEAFE', fg: '#1D4ED8' },
  being_prepared:  { label: 'Preparing',  bg: '#FEF3C7', fg: '#92400E' },
  ready_for_pickup:{ label: 'Ready',      bg: '#DCFCE7', fg: '#166534' },
  completed:       { label: 'Completed',  bg: '#E5E7EB', fg: '#374151' },
  cancelled:       { label: 'Cancelled',  bg: '#FEE2E2', fg: '#B91C1C' },
  refunded:        { label: 'Refunded',   bg: '#F3E8FF', fg: '#7C3AED' },
};

const ACTIVE_STATUSES = ['received', 'being_prepared', 'ready_for_pickup'] as const;
const COMPLETED_STATUSES = ['completed'] as const;
const CANCELLED_STATUSES = ['cancelled', 'refunded'] as const;

const NEXT_STATUS_ACTIONS: Partial<Record<ShopDisplayOrder['status'], ReadonlyArray<(typeof STATUS_ACTIONS)[number]['id']>>> = {
  received: ['being_prepared', 'cancelled'],
  being_prepared: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['completed'],
};

function formatTime(value?: string | null) {
  if (!value) return 'ASAP';
  return new Date(value).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}

function getSydneyDayParts(input: string | Date) {
  const date = new Date(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? 1);
  return { year, month, day };
}

function startOfSydneyDay(input: string | Date) {
  const { year, month, day } = getSydneyDayParts(input);
  return new Date(year, month - 1, day);
}

function endOfSydneyDay(input: string | Date) {
  const d = startOfSydneyDay(input);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfSydneyWeek(input: string | Date) {
  const d = startOfSydneyDay(input);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfSydneyWeek(input: string | Date) {
  const d = startOfSydneyWeek(input);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function orderSortTime(order: ShopDisplayOrder) {
  const source = order.createdAt ?? order.scheduledFor ?? order.updatedAt ?? null;
  return source ? new Date(source).getTime() : 0;
}

function sameSydneyDay(left: string | Date, right: string | Date) {
  return startOfSydneyDay(left).getTime() === startOfSydneyDay(right).getTime();
}

function toSydneyDateKey(input: string | Date) {
  const { year, month, day } = getSydneyDayParts(input);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function orderSubtitle(order: ShopDisplayOrder) {
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
  const [filterMode, setFilterMode] = useState<OrderFilterMode>('today');
  const [queueMode, setQueueMode] = useState<QueueMode>('active');
  const [selectedDate, setSelectedDate] = useState(() => startOfSydneyDay(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<ShopDisplayOrder | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [detailOrder, setDetailOrder] = useState<ShopDisplayOrder | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
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

  const { data: storeData } = useQuery({
    queryKey: ['shop-display-store'],
    queryFn: () => api.shopDisplay.store(),
    staleTime: 60_000,
  });
  const store = storeData?.data?.[0] ?? null;

  const rows: ShopDisplayOrder[] = data?.data ?? [];

  const dateFilteredRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => orderSortTime(b) - orderSortTime(a));
    const now = new Date();
    const dayStart = startOfSydneyDay(now);
    const dayEnd = endOfSydneyDay(now);
    const weekStart = startOfSydneyWeek(now);
    const weekEnd = endOfSydneyWeek(now);
    return sorted.filter((order) => {
      const createdAt = order.createdAt ?? order.scheduledFor ?? order.updatedAt;
      if (!createdAt) return true;
      const createdDate = new Date(createdAt);
      if (filterMode === 'today') return createdDate >= dayStart && createdDate <= dayEnd;
      if (filterMode === 'week') return createdDate >= weekStart && createdDate <= weekEnd;
      return sameSydneyDay(createdDate, selectedDate);
    });
  }, [filterMode, rows, selectedDate]);

  const filteredRows = useMemo(() => {
    if (queueMode === 'completed') {
      return dateFilteredRows.filter((order) => COMPLETED_STATUSES.includes(order.status as (typeof COMPLETED_STATUSES)[number]));
    }
    if (queueMode === 'cancelled') {
      return dateFilteredRows.filter((order) => CANCELLED_STATUSES.includes(order.status as (typeof CANCELLED_STATUSES)[number]));
    }
    return dateFilteredRows.filter((order) => ACTIVE_STATUSES.includes(order.status as (typeof ACTIVE_STATUSES)[number]));
  }, [dateFilteredRows, queueMode]);

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

  const queueCounts = useMemo(() => ({
    active: dateFilteredRows.filter((order) => ACTIVE_STATUSES.includes(order.status as (typeof ACTIVE_STATUSES)[number])).length,
    completed: dateFilteredRows.filter((order) => COMPLETED_STATUSES.includes(order.status as (typeof COMPLETED_STATUSES)[number])).length,
    cancelled: dateFilteredRows.filter((order) => CANCELLED_STATUSES.includes(order.status as (typeof CANCELLED_STATUSES)[number])).length,
  }), [dateFilteredRows]);

  const ordersByDate = useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, order) => {
      const source = order.createdAt ?? order.scheduledFor ?? order.updatedAt;
      if (!source) return acc;
      const key = toSydneyDateKey(source);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [rows]);
  const selectedModeLabel = filterMode === 'today'
    ? 'Today'
    : filterMode === 'week'
      ? 'This week'
      : `Selected: ${selectedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
  const queueLabel = queueMode === 'active' ? 'Live queue' : queueMode === 'completed' ? 'Completed' : 'Cancelled';
  const summaryViewLabel = filterMode === 'today'
    ? `${queueLabel} today`
    : filterMode === 'week'
      ? `${queueLabel} this week`
      : `${queueLabel} on date`;
  const queueSubLabel = queueMode === 'active'
    ? 'Orders needing action'
    : queueMode === 'completed'
      ? 'Finished orders'
      : 'Removed orders';

  const today = useMemo(() => {
    const d = startOfSydneyDay(new Date());
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const sixMonthsAgo = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - 6);
    return d;
  }, [today]);
  const twoYearsAgo = useMemo(() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - 2);
    return d;
  }, [today]);
  const canGoPrev = new Date(calYear, calMonth, 1) > new Date(twoYearsAgo.getFullYear(), twoYearsAgo.getMonth(), 1);
  const canGoNext = new Date(calYear, calMonth, 1) < new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarCells: (number | null)[] = useMemo(() => {
    const cells: (number | null)[] = [
      ...Array(firstDayOfMonth).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [daysInMonth, firstDayOfMonth]);
  const visibleMonthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const dateOf = (day: number) => new Date(calYear, calMonth, day);
  const isSelectedDay = (day: number) =>
    selectedDate.getFullYear() === calYear &&
    selectedDate.getMonth() === calMonth &&
    selectedDate.getDate() === day;
  const isTodayDay = (day: number) =>
    today.getFullYear() === calYear &&
    today.getMonth() === calMonth &&
    today.getDate() === day;
  const isArchivedDay = (day: number) => dateOf(day) < sixMonthsAgo;
  const isFutureDay = (day: number) => {
    const d = dateOf(day);
    d.setHours(0, 0, 0, 0);
    return d > today;
  };
  const dateKey = (day: number) => `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const openDatePicker = () => {
    setCalYear(selectedDate.getFullYear());
    setCalMonth(selectedDate.getMonth());
    setPickerOpen(true);
  };

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (calMonth === 0) {
      setCalYear((year) => year - 1);
      setCalMonth(11);
      return;
    }
    setCalMonth((month) => month - 1);
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (calMonth === 11) {
      setCalYear((year) => year + 1);
      setCalMonth(0);
      return;
    }
    setCalMonth((month) => month + 1);
  };

  const updateStatus = async (id: string, status: string, cancelReason?: string) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(id);
    Haptics.selectionAsync();
    try {
      await api.shopDisplay.updateOrderStatus(id, status, cancelReason);
      setAlertOrderId(cur => cur === id ? null : cur);
      await qc.invalidateQueries({ queryKey: ['shop-display-orders'] });
      setQueueMode('active');

      if (status === 'being_prepared') {
        const order = rows.find(o => o.id === id);
        if (order) void printOrder(order);
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const printOrder = async (order: ShopDisplayOrder) => {
    if (!store?.printerIp) {
      Alert.alert('No printer configured', 'This store does not have a receipt printer IP address set. Ask a director to configure it in Store Settings.');
      return;
    }
    try {
      const job = orderToPrintJob(order);
      await sendReceiptPrint(job, store.printerIp, store.printerPort ?? 9100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Print failed', msg);
    }
  };

  const openCancelModal = (order: ShopDisplayOrder) => {
    setCancellingOrder(order);
    setCancelReasonText('');
  };

  const confirmCancel = async () => {
    if (!cancellingOrder || !cancelReasonText.trim()) return;
    const reason = cancelReasonText.trim();
    setCancellingOrder(null);
    await updateStatus(cancellingOrder.id, 'cancelled', reason);
  };

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  const numCols = isWide ? 2 : 1;

  const renderCard = ({ item }: { item: ShopDisplayOrder }) => {
    const total   = `$${((item.totalCents ?? 0) / 100).toFixed(2)}`;
    const isAlert = alertOrderId === item.id;
    const meta    = STATUS_META[item.status] ?? STATUS_META.received;
    const lines   = normalizeOrderItems(item.items);
    const availableActions = NEXT_STATUS_ACTIONS[item.status] ?? [];
    const isUpdating = updatingOrderId === item.id;
    const primaryAction = STATUS_ACTIONS.find((action) => availableActions.find((status) => status === action.id && status !== 'cancelled'));
    const secondaryAction = STATUS_ACTIONS.find((action) => action.id === 'cancelled' && availableActions.includes('cancelled'));

    return (
      <Pressable onPress={() => setDetailOrder(item)}>
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
          {lines.map((line, i: number) => (
            <View key={`${item.id}-${i}`} style={s.lineItem}>
              <Text style={s.lineMain}>{line.quantity} × {line.name}</Text>
              {line.variantName ? <Text style={s.lineSub}>{line.variantName}</Text> : null}
              {line.notableOptions.length > 0 ? <Text style={s.lineSub}>{line.notableOptions.join(' · ')}</Text> : null}
              {line.baristaNote ? <Text style={s.lineSub}>{line.baristaNote}</Text> : null}
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
        {availableActions.length > 0 ? (
        <View style={s.actionRail}>
          {primaryAction ? (
            <Pressable
              disabled={isUpdating}
              onPress={() => void updateStatus(item.id, primaryAction.id)}
              style={[
                s.primaryActionTile,
                { backgroundColor: primaryAction.color },
                isUpdating && s.actionBtnDisabled,
              ]}
            >
              <Feather name={primaryAction.icon} size={20} color="#fff" />
              <View style={{ gap: 2 }}>
                <Text style={s.primaryActionText}>{isUpdating ? 'Updating…' : primaryAction.label}</Text>
                <Text style={s.primaryActionHint}>
                  {primaryAction.id === 'being_prepared'
                    ? 'Move into prep'
                    : primaryAction.id === 'ready_for_pickup'
                      ? 'Mark ready for collection'
                      : 'Finish and remove from queue'}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {secondaryAction ? (
            <Pressable
              disabled={isUpdating}
              onPress={() => openCancelModal(item)}
              style={[s.secondaryActionTile, isUpdating && s.actionBtnDisabled]}
            >
              <Feather name={secondaryAction.icon} size={16} color={RED} />
              <Text style={s.secondaryActionText}>Cancel Order</Text>
            </Pressable>
          ) : null}
        </View>
        ) : (
          <View style={s.archivedNotice}>
            <Feather name={queueMode === 'completed' ? 'archive' : 'slash'} size={15} color={MUTED} />
            <Text style={s.archivedNoticeText}>
              {queueMode === 'completed' ? 'This order has been completed.' : 'This order has been removed from the live queue.'}
            </Text>
          </View>
        )}
      </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── Compact control bar ───────────────────────────────────── */}
      <View style={s.controlCard}>
        {/* Row 1: queue mode */}
        <View style={s.tileGrid}>
          {/* Date filter — left side */}
          <Pressable
            onPress={() => setFilterMode('today')}
            style={[s.tileButton, filterMode === 'today' && s.tileButtonSecondaryActive]}
          >
            <Text style={[s.tileButtonText, filterMode === 'today' && s.tileButtonSecondaryActiveText]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => setFilterMode('week')}
            style={[s.tileButton, filterMode === 'week' && s.tileButtonSecondaryActive]}
          >
            <Text style={[s.tileButtonText, filterMode === 'week' && s.tileButtonSecondaryActiveText]}>This week</Text>
          </Pressable>
          <Pressable
            onPress={openDatePicker}
            style={[s.tileButton, filterMode === 'date' && s.tileButtonSecondaryActive]}
          >
            <Feather name="calendar" size={13} color={filterMode === 'date' ? '#fff' : NAVY} />
            <Text style={[s.tileButtonText, filterMode === 'date' && s.tileButtonSecondaryActiveText]}>
              {filterMode === 'date'
                ? selectedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                : 'Date'}
            </Text>
          </Pressable>
          {/* Divider */}
          <View style={s.tileDivider} />
          {/* Queue mode — right side */}
          {([
            { key: 'active',    label: 'Live',      count: queueCounts.active },
            { key: 'completed', label: 'Completed',  count: queueCounts.completed },
            { key: 'cancelled', label: 'Cancelled',  count: queueCounts.cancelled },
          ] as const).map((q) => {
            const active = queueMode === q.key;
            return (
              <Pressable
                key={q.key}
                onPress={() => setQueueMode(q.key)}
                style={[s.tileButton, active && s.tileButtonActive]}
              >
                <Text style={[s.tileButtonText, active && s.tileButtonTextActive]}>{q.label}</Text>
                <Text style={[s.tileButtonCount, active && s.tileButtonCountActive]}>{q.count}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Orders list */}
      <FlatList
        ref={listRef}
        key={numCols}
        data={filteredRows}
        keyExtractor={item => item.id}
        numColumns={numCols}
        columnWrapperStyle={isWide ? { gap: 14, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={[
          { padding: isWide ? 0 : 16, paddingBottom: 40, gap: 14 },
          isWide && { paddingTop: 14 },
        ]}
        refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={async () => { setManualRefreshing(true); await refetch(); setManualRefreshing(false); }} tintColor={BLUE} />}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="inbox" size={40} color={MUTED} />
            <Text style={s.emptyText}>
              {queueMode === 'active'
                ? 'No live app orders right now'
                : queueMode === 'completed'
                  ? 'No completed orders in this view'
                  : 'No cancelled orders in this view'}
            </Text>
          </View>
        }
        renderItem={renderCard}
      />

      {/* ── Cancel reason modal ─────────────────────────────────── */}
      <Modal
        visible={!!cancellingOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setCancellingOrder(null)}
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Pressable style={s.cancelModalBackdrop} onPress={() => setCancellingOrder(null)}>
            <Pressable style={s.cancelModalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={s.cancelModalHeader}>
                <View style={s.cancelModalIconWrap}>
                  <Feather name="x-circle" size={22} color={RED} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cancelModalTitle}>Cancel Order</Text>
                  <Text style={s.cancelModalSub} numberOfLines={1}>
                    #{cancellingOrder?.id.slice(0, 6).toUpperCase()} · {cancellingOrder?.customerName ?? 'Customer'}
                  </Text>
                </View>
                <Pressable onPress={() => setCancellingOrder(null)} style={s.cancelModalClose}>
                  <Feather name="x" size={18} color={MUTED} />
                </Pressable>
              </View>

              <Text style={s.cancelModalLabel}>Reason for cancellation</Text>
              <TextInput
                style={[
                  s.cancelModalInput,
                  { borderColor: cancelReasonText.trim() ? BORDER : '#FECACA' },
                ]}
                placeholder="e.g. Customer requested cancellation, item out of stock…"
                placeholderTextColor={MUTED}
                value={cancelReasonText}
                onChangeText={setCancelReasonText}
                multiline
                numberOfLines={3}
                autoFocus
              />
              {!cancelReasonText.trim() && (
                <Text style={s.cancelModalHint}>A reason is required before cancelling.</Text>
              )}

              <Text style={s.cancelModalRefundNote}>
                <Feather name="refresh-ccw" size={12} color={MUTED} /> A refund will be automatically initiated if a Stripe payment was taken.
              </Text>

              <View style={s.cancelModalActions}>
                <Pressable
                  onPress={() => setCancellingOrder(null)}
                  style={[s.cancelModalBtn, s.cancelModalBtnSecondary]}
                >
                  <Text style={s.cancelModalBtnSecondaryText}>Keep Order</Text>
                </Pressable>
                <Pressable
                  onPress={() => void confirmCancel()}
                  disabled={!cancelReasonText.trim() || !!updatingOrderId}
                  style={[
                    s.cancelModalBtn,
                    { backgroundColor: cancelReasonText.trim() ? RED : '#FCA5A5' },
                  ]}
                >
                  <Text style={s.cancelModalBtnPrimaryText}>
                    {updatingOrderId ? 'Cancelling…' : 'Confirm Cancel'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={s.sheetHeader}>
            <Pressable onPress={() => setPickerOpen(false)} style={s.sheetCloseBtn}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={s.sheetHeaderTitle}>Pick a Date</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={s.monthHeader}>
              <Pressable onPress={prevMonth} style={s.monthStepper} hitSlop={8}>
                <Feather name="chevron-left" size={22} color={canGoPrev ? TEXT : BORDER} />
              </Pressable>
              <Text style={s.monthTitle}>{visibleMonthLabel}</Text>
              <Pressable onPress={nextMonth} style={s.monthStepper} hitSlop={8}>
                <Feather name="chevron-right" size={22} color={canGoNext ? TEXT : BORDER} />
              </Pressable>
            </View>

            <View style={s.weekdayRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <Text key={day} style={s.weekdayText}>{day}</Text>
              ))}
            </View>

            {Array.from({ length: calendarCells.length / 7 }, (_, row) => (
              <View key={row} style={s.calendarRow}>
                {calendarCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                  if (day === null) return <View key={col} style={s.emptyCalendarCell} />;
                  const selected = isSelectedDay(day);
                  const todayCell = isTodayDay(day);
                  const archived = isArchivedDay(day);
                  const future = isFutureDay(day);
                  const count = ordersByDate[dateKey(day)] ?? 0;
                  const textColor = selected ? '#fff' : future ? BORDER : archived ? '#C7C7CC' : todayCell ? BLUE : TEXT;
                  return (
                    <Pressable
                      key={col}
                      onPress={() => {
                        if (future) return;
                        setSelectedDate(new Date(calYear, calMonth, day));
                        setFilterMode('date');
                        setPickerOpen(false);
                        Haptics.selectionAsync();
                      }}
                      style={s.calendarPressable}
                    >
                      <View style={[s.calendarBubble, selected && s.calendarBubbleSelected, !selected && todayCell && s.calendarBubbleToday]}>
                        <Text style={[s.calendarDayText, { color: textColor }, (selected || todayCell) && s.calendarDayTextStrong]}>{day}</Text>
                      </View>
                      {count > 0 && !future ? (
                        <View style={[s.calendarDot, { backgroundColor: archived ? '#C7C7CC' : BLUE }]} />
                      ) : (
                        <View style={s.calendarDotSpacer} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={s.sheetActions}>
              <Pressable
                onPress={() => {
                  setFilterMode('today');
                  setPickerOpen(false);
                }}
                style={[s.modalActionBtn, s.modalActionSecondary]}
              >
                <Text style={s.modalActionSecondaryText}>Today</Text>
              </Pressable>
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={[s.modalActionBtn, s.modalActionPrimary]}
              >
                <Text style={s.modalActionPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Order Detail Modal ───────────────────────────────────── */}
      <Modal
        visible={!!detailOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailOrder(null)}
      >
        {detailOrder ? (() => {
          const d = detailOrder;
          const total = `$${((d.totalCents ?? 0) / 100).toFixed(2)}`;
          const meta = STATUS_META[d.status] ?? STATUS_META.received;
          const lines = normalizeOrderItems(d.items);
          const availableActions = NEXT_STATUS_ACTIONS[d.status] ?? [];
          const isUpdating = updatingOrderId === d.id;
          const primaryAction = STATUS_ACTIONS.find((a) => availableActions.find((s2) => s2 === a.id && s2 !== 'cancelled'));
          const secondaryAction = STATUS_ACTIONS.find((a) => a.id === 'cancelled' && availableActions.includes('cancelled'));
          return (
            <Pressable style={s.detailBackdrop} onPress={() => setDetailOrder(null)}>
              <Pressable style={s.detailSheet} onPress={(e) => e.stopPropagation()}>
                {/* Header */}
                <View style={s.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailOrderNum}>#{d.id.slice(0, 6).toUpperCase()}</Text>
                    <Text style={s.detailCustomer}>{d.customerName ?? 'Customer'}</Text>
                    <Text style={s.detailMeta}>{orderSubtitle(d)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    <Pressable onPress={() => setDetailOrder(null)} style={s.detailCloseBtn}>
                      <Feather name="x" size={18} color={TEXT} />
                    </Pressable>
                    <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={s.detailBody} showsVerticalScrollIndicator={false}>
                  {/* Items */}
                  <Text style={s.detailSectionLabel}>Items</Text>
                  <View style={{ gap: 6 }}>
                    {lines.map((line, i) => (
                      <View key={i} style={s.detailLineItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={s.detailLineMain}>{line.quantity} × {line.name}</Text>
                        </View>
                        {line.variantName ? <Text style={s.detailLineSub}>{line.variantName}</Text> : null}
                        {line.notableOptions.length > 0 ? <Text style={s.detailLineSub}>{line.notableOptions.join(' · ')}</Text> : null}
                        {line.baristaNote ? (
                          <View style={s.detailBaristaNote}>
                            <Feather name="message-square" size={11} color={BLUE} />
                            <Text style={s.detailBaristaText}>{line.baristaNote}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>

                  {/* Notes */}
                  {d.notes ? (
                    <View style={{ marginTop: 14 }}>
                      <Text style={s.detailSectionLabel}>Order notes</Text>
                      <View style={s.detailNotesBox}>
                        <Feather name="file-text" size={13} color={NAVY} />
                        <Text style={s.detailNotesText}>{d.notes}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Total */}
                  <View style={s.detailTotalRow}>
                    <Text style={s.detailTotalLabel}>Total</Text>
                    <Text style={s.detailTotalValue}>{total}</Text>
                  </View>
                </ScrollView>

                {/* Actions */}
                <View style={s.detailActions}>
                  {/* Print */}
                  <Pressable
                    onPress={() => void printOrder(d)}
                    style={s.detailPrintBtn}
                  >
                    <Feather name="printer" size={16} color={NAVY} />
                    <Text style={s.detailPrintText}>Print</Text>
                  </Pressable>

                  {secondaryAction ? (
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => { setDetailOrder(null); openCancelModal(d); }}
                      style={[s.detailCancelBtn, isUpdating && s.actionBtnDisabled]}
                    >
                      <Feather name="x-circle" size={15} color={RED} />
                      <Text style={s.detailCancelText}>Cancel</Text>
                    </Pressable>
                  ) : null}

                  {primaryAction ? (
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => { void updateStatus(d.id, primaryAction.id); setDetailOrder(null); }}
                      style={[s.detailPrimaryBtn, { backgroundColor: primaryAction.color }, isUpdating && s.actionBtnDisabled]}
                    >
                      <Feather name={primaryAction.icon} size={17} color="#fff" />
                      <Text style={s.detailPrimaryText}>{isUpdating ? 'Updating…' : primaryAction.label}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            </Pressable>
          );
        })() : null}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },


  card:            { backgroundColor: CARD, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: BORDER, gap: 8 },
  cardWide:        { flex: 1 },
  cardAlert:       { borderColor: BLUE, shadowColor: BLUE, shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },

  cardHeader:      { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  orderNum:        { color: BLUE, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 1 },
  customerName:    { color: TEXT, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  orderMeta:       { color: MUTED, fontSize: 12, fontWeight: '500', marginTop: 1, lineHeight: 16 },
  orderTotal:      { color: TEXT, fontSize: 17, fontWeight: '800' },

  statusPill:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:      { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },

  sectionLabel:    { color: NAVY, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  lineItem:        { backgroundColor: BG, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, gap: 2 },
  lineMain:        { color: TEXT, fontSize: 13, fontWeight: '700' },
  lineSub:         { color: MUTED, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  noteText:        { color: TEXT, fontSize: 13, lineHeight: 18 },

  actionBtnDisabled: { opacity: 0.55 },
  actionRail:      { gap: 8, marginTop: 2 },
  primaryActionTile: { minHeight: 54, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  primaryActionHint: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '600' },
  secondaryActionTile: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF5F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { color: RED, fontSize: 13, fontWeight: '800' },
  archivedNotice:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  archivedNoticeText: { color: MUTED, fontSize: 12, fontWeight: '600' },

  cancelModalBackdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cancelModalSheet:          { backgroundColor: CARD, borderRadius: 24, padding: 20, width: '100%', maxWidth: 480, gap: 12 },
  cancelModalHeader:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelModalIconWrap:       { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  cancelModalTitle:          { fontSize: 17, fontWeight: '800', color: TEXT },
  cancelModalSub:            { fontSize: 13, color: MUTED, fontWeight: '500', marginTop: 2 },
  cancelModalClose:          { width: 32, height: 32, borderRadius: 16, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  cancelModalLabel:          { fontSize: 13, fontWeight: '700', color: TEXT },
  cancelModalInput:          { backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1.5, padding: 12, fontSize: 14, color: TEXT, minHeight: 80, textAlignVertical: 'top' },
  cancelModalHint:           { fontSize: 12, color: RED, fontWeight: '600', marginTop: -4 },
  cancelModalRefundNote:     { fontSize: 12, color: MUTED, fontWeight: '500', lineHeight: 18 },
  cancelModalActions:        { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelModalBtn:            { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  cancelModalBtnSecondary:   { backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  cancelModalBtnSecondaryText: { color: TEXT, fontSize: 14, fontWeight: '700' },
  cancelModalBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  emptyWrap:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:       { textAlign: 'center', color: MUTED, fontSize: 16, fontWeight: '500' },
  controlCard:     { marginHorizontal: 16, marginTop: 18, marginBottom: 8, padding: 8, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  tileGrid:        { flexDirection: 'row', gap: 6, alignItems: 'center' },
  tileButton:      { flex: 1, height: 56, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tileButtonActive:{ backgroundColor: BLUE, borderColor: BLUE },
  tileButtonSecondaryActive: { backgroundColor: NAVY, borderColor: NAVY },
  tileButtonText:  { color: NAVY, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tileButtonTextActive: { color: '#fff' },
  tileButtonSecondaryActiveText: { color: '#fff' },
  tileButtonCount: { color: MUTED, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  tileButtonCountActive: { color: 'rgba(255,255,255,0.85)' },
  tileDivider:     { width: 1, height: 32, backgroundColor: BORDER, marginHorizontal: 2 },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  sheetCloseBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  sheetHeaderTitle:{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT },
  sheetContent:    { padding: 20 },
  monthHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  monthStepper:    { padding: 10 },
  monthTitle:      { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT },
  weekdayRow:      { flexDirection: 'row', marginBottom: 10 },
  weekdayText:     { flex: 1, textAlign: 'center', color: MUTED, fontSize: 11, fontWeight: '600' },
  calendarRow:     { flexDirection: 'row', marginBottom: 4 },
  emptyCalendarCell:{ flex: 1, height: 50 },
  calendarPressable:{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  calendarBubble:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  calendarBubbleSelected: { backgroundColor: BLUE },
  calendarBubbleToday: { backgroundColor: `${BLUE}18` },
  calendarDayText: { fontSize: 14, fontWeight: '400' },
  calendarDayTextStrong: { fontWeight: '700' },
  calendarDot:     { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  calendarDotSpacer:{ width: 5, height: 5, marginTop: 1 },
  sheetActions:    { marginTop: 20, flexDirection: 'row', gap: 10 },
  modalActionBtn:  { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  modalActionSecondary: { backgroundColor: BG },
  modalActionPrimary: { backgroundColor: BLUE },
  modalActionSecondaryText: { color: NAVY, fontSize: 14, fontWeight: '800' },
  modalActionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  detailBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  detailSheet:     { backgroundColor: CARD, borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '88%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  detailHeader:    { flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  detailOrderNum:  { color: BLUE, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 2 },
  detailCustomer:  { color: TEXT, fontSize: 20, fontWeight: '800', lineHeight: 24 },
  detailMeta:      { color: MUTED, fontSize: 13, fontWeight: '500', marginTop: 3 },
  detailCloseBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  detailBody:      { padding: 20, gap: 6 },
  detailSectionLabel: { color: NAVY, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  detailLineItem:  { backgroundColor: BG, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  detailLineMain:  { color: TEXT, fontSize: 15, fontWeight: '700', flex: 1 },
  detailLinePrice: { color: TEXT, fontSize: 14, fontWeight: '700' },
  detailLineSub:   { color: MUTED, fontSize: 13, fontWeight: '500', lineHeight: 17 },
  detailBaristaNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  detailBaristaText: { color: BLUE, fontSize: 12, fontWeight: '600', flex: 1 },
  detailNotesBox:  { backgroundColor: '#FFF9E6', borderRadius: 12, borderWidth: 1, borderColor: '#F5D87A', padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailNotesText: { color: '#7A5C00', fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  detailTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },
  detailTotalLabel:{ color: MUTED, fontSize: 14, fontWeight: '700' },
  detailTotalValue:{ color: TEXT, fontSize: 22, fontWeight: '900' },
  detailActions:   { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  detailPrintBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG },
  detailPrintText: { color: NAVY, fontSize: 13, fontWeight: '800' },
  detailCancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  detailCancelText:{ color: RED, fontSize: 13, fontWeight: '800' },
  detailPrimaryBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  detailPrimaryText:{ color: '#fff', fontSize: 15, fontWeight: '800' },
});
