import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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

const BG = 'transparent';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const GREEN = '#16A34A';
const RED   = '#EF4444';

type OrderFilterMode = 'today' | 'week' | 'date';

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

function toSydneyDate(input: string | Date) {
  return new Date(new Date(input).toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
}

function startOfSydneyDay(input: string | Date) {
  const d = toSydneyDate(input);
  d.setHours(0, 0, 0, 0);
  return d;
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

function orderSortTime(order: any) {
  const source = order.createdAt ?? order.scheduledFor ?? order.updatedAt ?? null;
  return source ? new Date(source).getTime() : 0;
}

function sameSydneyDay(left: string | Date, right: string | Date) {
  return startOfSydneyDay(left).getTime() === startOfSydneyDay(right).getTime();
}

function monthMatrix(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
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
  const [filterMode, setFilterMode] = useState<OrderFilterMode>('today');
  const [selectedDate, setSelectedDate] = useState(() => startOfSydneyDay(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfSydneyDay(new Date()));
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

  const filteredRows = useMemo(() => {
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

  const calendarCells = useMemo(() => monthMatrix(pickerMonth), [pickerMonth]);
  const visibleMonth = pickerMonth;
  const selectedModeLabel = filterMode === 'today'
    ? 'Today'
    : filterMode === 'week'
      ? 'This week'
      : `Selected: ${selectedDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
  const summaryViewLabel = filterMode === 'today'
    ? 'Orders today'
    : filterMode === 'week'
      ? 'Orders this week'
      : 'Orders on date';
  const completedViewLabel = filterMode === 'today'
    ? 'Completed today'
    : filterMode === 'week'
      ? 'Completed this week'
      : 'Completed on date';

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
          <Text style={s.summaryLabel}>{summaryViewLabel}</Text>
          <Text style={s.summaryValue}>{filteredRows.filter(o => !['completed', 'cancelled', 'refunded'].includes(o.status)).length}</Text>
        </View>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>{completedViewLabel}</Text>
          <Text style={s.summaryValue}>{filteredRows.filter(o => o.status === 'completed').length}</Text>
        </View>
        <View style={[s.summaryCard, isWide && { paddingVertical: 14 }]}>
          <Text style={s.summaryLabel}>Last refresh</Text>
          <Text style={[s.summaryValue, { fontSize: isWide ? 22 : 18 }]}>
            {new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      <View style={s.filterPanel}>
        <View style={s.filterRow}>
          <Pressable
            onPress={() => setFilterMode('today')}
            style={[s.filterChip, filterMode === 'today' && s.filterChipActive]}
          >
            <Text style={[s.filterChipText, filterMode === 'today' && s.filterChipTextActive]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => setFilterMode('week')}
            style={[s.filterChip, filterMode === 'week' && s.filterChipActive]}
          >
            <Text style={[s.filterChipText, filterMode === 'week' && s.filterChipTextActive]}>This week</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setPickerMonth(selectedDate);
              setPickerOpen(true);
            }}
            style={[s.filterChip, filterMode === 'date' && s.filterChipActive]}
          >
            <Feather name="calendar" size={14} color={filterMode === 'date' ? '#fff' : NAVY} />
            <Text style={[s.filterChipText, filterMode === 'date' && s.filterChipTextActive]}>Select date</Text>
          </Pressable>
        </View>
        <Text style={s.filterLabel}>{selectedModeLabel}</Text>
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
            <Text style={s.emptyText}>No live app orders right now</Text>
          </View>
        }
        renderItem={renderCard}
      />

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Pressable onPress={() => setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} style={s.monthNavBtn}>
                <Feather name="chevron-left" size={18} color={NAVY} />
              </Pressable>
              <Text style={s.modalTitle}>{monthLabel(visibleMonth)}</Text>
              <Pressable onPress={() => setPickerMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} style={s.monthNavBtn}>
                <Feather name="chevron-right" size={18} color={NAVY} />
              </Pressable>
            </View>
            <View style={s.weekdayRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <Text key={day} style={s.weekdayText}>{day}</Text>
              ))}
            </View>
            <View style={s.calendarGrid}>
              {calendarCells.map((day, index) => {
                const active = day ? sameSydneyDay(day, selectedDate) : false;
                return (
                  <Pressable
                    key={`${visibleMonth.toISOString()}-${index}-${day ? day.getDate() : 'empty'}`}
                    disabled={!day}
                    onPress={() => {
                      if (!day) return;
                      setSelectedDate(startOfSydneyDay(day));
                      setFilterMode('date');
                    }}
                    style={[s.dayCell, active && s.dayCellActive, !day && s.dayCellEmpty]}
                  >
                    {day ? <Text style={[s.dayCellText, active && s.dayCellTextActive]}>{day.getDate()}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={s.modalActions}>
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
          </Pressable>
        </Pressable>
      </Modal>
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
  filterPanel:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 },
  filterRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 14, paddingVertical: 10 },
  filterChipActive:{ backgroundColor: NAVY, borderColor: NAVY },
  filterChipText:  { color: NAVY, fontSize: 13, fontWeight: '800' },
  filterChipTextActive: { color: '#fff' },
  filterLabel:     { color: MUTED, fontSize: 12, fontWeight: '600', marginLeft: 2 },
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
  modalCard:       { backgroundColor: CARD, borderRadius: 22, padding: 16, gap: 14 },
  modalHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle:      { color: TEXT, fontSize: 18, fontWeight: '800' },
  monthNavBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  weekdayRow:      { flexDirection: 'row', justifyContent: 'space-between' },
  weekdayText:     { width: `${100 / 7}%`, textAlign: 'center', color: MUTED, fontSize: 11, fontWeight: '800' },
  calendarGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayCell:         { width: '13.2%', aspectRatio: 1, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  dayCellEmpty:    { backgroundColor: 'transparent', borderColor: 'transparent' },
  dayCellActive:   { backgroundColor: NAVY, borderColor: NAVY },
  dayCellText:     { color: TEXT, fontSize: 13, fontWeight: '800' },
  dayCellTextActive: { color: '#fff' },
  modalActions:    { flexDirection: 'row', gap: 10 },
  modalActionBtn:  { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  modalActionSecondary: { backgroundColor: BG },
  modalActionPrimary: { backgroundColor: BLUE },
  modalActionSecondaryText: { color: NAVY, fontSize: 14, fontWeight: '800' },
  modalActionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
