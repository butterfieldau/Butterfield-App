import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ShopDisplayOrder } from '@/lib/api';
import { normalizeOrderItems } from '@/lib/orderItems';
import { getShopDisplaySoundEnabled } from '@/lib/shopDisplayMode';

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
      return dateFilteredRows.filter((order) => COMPLETED_STATUSES.includes(order.status));
    }
    if (queueMode === 'cancelled') {
      return dateFilteredRows.filter((order) => CANCELLED_STATUSES.includes(order.status));
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
    completed: dateFilteredRows.filter((order) => COMPLETED_STATUSES.includes(order.status)).length,
    cancelled: dateFilteredRows.filter((order) => CANCELLED_STATUSES.includes(order.status)).length,
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

  const updateStatus = async (id: string, status: string) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(id);
    Haptics.selectionAsync();
    try {
      await api.shopDisplay.updateOrderStatus(id, status);
      setAlertOrderId(cur => cur === id ? null : cur);
      await qc.invalidateQueries({ queryKey: ['shop-display-orders'] });
      setQueueMode('active');
    } finally {
      setUpdatingOrderId(null);
    }
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
              onPress={() => void updateStatus(item.id, secondaryAction.id)}
              style={[s.secondaryActionTile, isUpdating && s.actionBtnDisabled]}
            >
              <Feather name={secondaryAction.icon} size={16} color={RED} />
              <Text style={s.secondaryActionText}>Cancel</Text>
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
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Summary strip */}
      <View style={[s.summaryRow, isWide && s.summaryRowWide]}>
        <View style={[s.summaryCard, s.summaryCardHero, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>{queueMode === 'active' ? 'Live queue' : queueMode === 'completed' ? 'Completed' : 'Cancelled'}</Text>
          <Text style={s.summaryValue}>{filteredRows.length}</Text>
          <Text style={s.summaryCaption}>{selectedModeLabel}</Text>
        </View>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Queue split</Text>
          <Text style={[s.summaryValue, { fontSize: isWide ? 22 : 18 }]}>
            {queueCounts.active} / {queueCounts.completed} / {queueCounts.cancelled}
          </Text>
          <Text style={s.summaryCaption}>Live / done / cancelled</Text>
        </View>
        <View style={[s.summaryCard, s.summaryCardTight, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Last refresh</Text>
          <Text style={[s.summaryValue, { fontSize: isWide ? 22 : 18 }]}>
            {new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      <View style={s.controlCard}>
        <View style={s.tileGrid}>
          {([
            { key: 'active', label: `Live (${queueCounts.active})` },
            { key: 'completed', label: `Completed (${queueCounts.completed})` },
            { key: 'cancelled', label: `Cancelled (${queueCounts.cancelled})` },
          ] as const).map((queue) => {
            const active = queueMode === queue.key;
            return (
              <Pressable
                key={queue.key}
                onPress={() => setQueueMode(queue.key)}
                style={[s.tileButton, active && s.tileButtonActive]}
              >
                <Text style={[s.tileButtonText, active && s.tileButtonTextActive]}>{queue.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.tileGrid}>
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
            <Feather name="calendar" size={14} color={filterMode === 'date' ? '#fff' : NAVY} />
            <Text style={[s.tileButtonText, filterMode === 'date' && s.tileButtonSecondaryActiveText]}>Select date</Text>
          </Pressable>
        </View>

        <Text style={s.filterLabel}>{queueSubLabel} · {selectedModeLabel}</Text>
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={BLUE} />}
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
    </View>
  );
}

const s = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  summaryRow:      { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  summaryRowWide:  { paddingHorizontal: 16, paddingBottom: 0 },
  summaryCard:     { flex: 1, backgroundColor: CARD, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: BORDER, gap: 2 },
  summaryCardHero: { flex: 1.15 },
  summaryCardTight:{ flex: 0.9 },
  summaryLabel:    { color: MUTED, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue:    { color: TEXT, fontSize: 24, fontWeight: '800', marginTop: 2 },
  summaryCaption:  { color: MUTED, fontSize: 12, fontWeight: '600', marginTop: 2 },

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

  actionBtnDisabled: { opacity: 0.55 },
  actionRail:      { gap: 10, marginTop: 2 },
  primaryActionTile: { minHeight: 74, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryActionText: { color: '#fff', fontSize: 19, fontWeight: '800' },
  primaryActionHint: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' },
  secondaryActionTile: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF5F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { color: RED, fontSize: 14, fontWeight: '800' },
  archivedNotice:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  archivedNoticeText: { color: MUTED, fontSize: 13, fontWeight: '600' },

  emptyWrap:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText:       { textAlign: 'center', color: MUTED, fontSize: 16, fontWeight: '500' },
  controlCard:     { marginHorizontal: 16, marginTop: 12, marginBottom: 10, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, gap: 10 },
  tileGrid:        { flexDirection: 'row', gap: 8 },
  tileButton:      { flex: 1, minHeight: 58, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileButtonActive:{ backgroundColor: BLUE, borderColor: BLUE },
  tileButtonSecondaryActive: { backgroundColor: NAVY, borderColor: NAVY },
  tileButtonText:  { color: NAVY, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  tileButtonTextActive: { color: '#fff' },
  tileButtonSecondaryActiveText: { color: '#fff' },
  filterLabel:     { color: MUTED, fontSize: 12, fontWeight: '600', marginLeft: 2, marginTop: 2 },
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
});
