import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Linking } from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { LinklyTransactionStatus, ShopDisplayOrder } from '@/lib/api';
import { getShopDisplayIdle } from '@/lib/shopDisplayMode';
import { normalizeOrderItems } from '@/lib/orderItems';
import { sendReceiptPrint, sendOpenDrawer, orderToPrintJob } from '@/lib/printer';
import { isStoreOpenForAsap } from '@/lib/storeSchedule';

const BG    = '#EFF6FF';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const BLUE  = '#1493FF';
const NAVY  = '#1A2B4A';
const GREEN = '#16A34A';
const RED   = '#EF4444';
const AMBER = '#D97706';

type OrderFilterMode = 'today' | 'week' | 'date';
type QueueMode = 'active' | 'completed' | 'cancelled';
type FeatherIconName = ComponentProps<typeof Feather>['name'];

const STATUS_ACTIONS = [
  { id: 'accepted',         label: 'Accept Order',     icon: 'check-circle', color: BLUE  },
  { id: 'being_prepared',   label: 'Start Preparing',  icon: 'check-circle', color: BLUE  },
  { id: 'ready_for_pickup', label: 'Ready for Pickup', icon: 'bell',         color: GREEN },
  { id: 'out_for_delivery', label: 'Out for Delivery', icon: 'truck',        color: BLUE  },
  { id: 'completed',        label: 'Completed',        icon: 'archive',      color: NAVY  },
  { id: 'cancelled',        label: 'Cancel',           icon: 'x-circle',     color: RED   },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: FeatherIconName;
  color: string;
}>;

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received:                   { label: 'Received',          bg: '#DBEAFE', fg: '#1D4ED8' },
  scheduled:                  { label: 'Scheduled',          bg: '#FFF7ED', fg: '#C2410C' },
  accepted:                   { label: 'Confirmed',           bg: '#EFF6FF', fg: '#2563EB' },
  being_prepared:             { label: 'Preparing',           bg: '#FEF3C7', fg: '#92400E' },
  ready_for_pickup:           { label: 'Ready',               bg: '#DCFCE7', fg: '#166534' },
  out_for_delivery:           { label: 'Out for Delivery',    bg: '#F5F3FF', fg: '#7C3AED' },
  completed:                  { label: 'Completed',           bg: '#E5E7EB', fg: '#374151' },
  cancelled:                  { label: 'Cancelled',           bg: '#FEE2E2', fg: '#B91C1C' },
  refunded:                   { label: 'Refunded',            bg: '#F3E8FF', fg: '#7C3AED' },
  pending_customer_approval:  { label: 'Awaiting Approval',  bg: '#FEF3C7', fg: '#92400E' },
};

const ACTIVE_STATUSES = ['received', 'scheduled', 'accepted', 'being_prepared', 'ready_for_pickup', 'out_for_delivery', 'pending_customer_approval'] as const;
const COMPLETED_STATUSES = ['completed'] as const;
const CANCELLED_STATUSES = ['cancelled', 'refunded'] as const;

function getNextStatusActions(order: ShopDisplayOrder): ReadonlyArray<string> {
  const isDelivery = order.type === 'delivery';
  const isQuickPickup = !isDelivery && !order.scheduledFor;
  if (isQuickPickup) {
    return ({
      received:       ['being_prepared', 'cancelled'],
      being_prepared: ['completed'],
    } as Record<string, string[]>)[order.status] ?? [];
  }
  if (!isDelivery) {
    // Scheduled pickup
    return ({
      scheduled:        ['accepted', 'cancelled'],
      accepted:         ['being_prepared', 'cancelled'],
      being_prepared:   ['ready_for_pickup', 'cancelled'],
      ready_for_pickup: ['completed'],
    } as Record<string, string[]>)[order.status] ?? [];
  }
  // Delivery
  return ({
    scheduled:        ['accepted', 'cancelled'],
    accepted:         ['being_prepared', 'cancelled'],
    being_prepared:   ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['completed'],
  } as Record<string, string[]>)[order.status] ?? [];
}

function formatTime(value?: string | null) {
  if (!value) return 'ASAP';
  return new Date(value).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
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

function fmtPaymentStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function orderSubtitle(order: ShopDisplayOrder) {
  return [
    order.type === 'delivery' ? 'Delivery' : 'Pickup',
    order.stripePaymentStatus ? `Payment: ${fmtPaymentStatus(order.stripePaymentStatus)}` : null,
    order.scheduledFor ? `For ${formatTime(order.scheduledFor)}` : null,
  ].filter(Boolean).join(' · ');
}

export default function ShopDisplayOrdersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const listRef = useRef(null);
  useScrollToTop(listRef);

  const qc = useQueryClient();
  const [alertOrderId, setAlertOrderId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<OrderFilterMode>('today');
  const [queueMode, setQueueMode] = useState<QueueMode>('active');
  const [selectedDate, setSelectedDate] = useState(() => startOfSydneyDay(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<ShopDisplayOrder | null>(null);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [detailOrder, setDetailOrder] = useState<ShopDisplayOrder | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [eftposOrder, setEftposOrder] = useState<ShopDisplayOrder | null>(null);
  const [eftposSessionId, setEftposSessionId] = useState<string | null>(null);
  const [eftposStarting, setEftposStarting] = useState(false);
  const [eftposStatus, setEftposStatus] = useState<LinklyTransactionStatus | null>(null);
  const eftposIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Modify Order state ───────────────────────────────────────────────────
  const [modifyOrderId, setModifyOrderId] = useState<string | null>(null);
  const [modifyItems, setModifyItems] = useState<any[]>([]);
  const [modifyReason, setModifyReason] = useState('');
  const [modifyLoading, setModifyLoading] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productPickerQuery, setProductPickerQuery] = useState('');

  const { data: productsData } = useQuery({
    queryKey: ['shop-display-products'],
    queryFn: () => api.shopDisplay.products(),
    staleTime: 5 * 60_000,
  });
  const allProducts: any[] = (productsData as any)?.data ?? [];

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['shop-display-orders'],
    queryFn: () => api.shopDisplay.orders(),
    refetchInterval: () => getShopDisplayIdle() ? 60_000 : 10_000,
    gcTime: 0,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const { data: storeData } = useQuery({
    queryKey: ['shop-display-store'],
    queryFn: () => api.shopDisplay.store(),
    staleTime: 5 * 60_000,
  });
  const store = storeData?.data?.[0] ?? null;

  const { data: printerConfigData } = useQuery({
    queryKey: ['shop-display-printer-config'],
    queryFn: () => api.shopDisplay.getPrinterConfig(),
    staleTime: 10 * 60_000,
  });
  const printerConfig = printerConfigData?.data ?? null;

  const { data: linklyData } = useQuery({
    queryKey: ['linkly-config'],
    queryFn: () => api.shopDisplay.getLinklyConfig(),
    staleTime: 60_000,
  });
  const linklyEnabled = (linklyData?.data?.linklyEnabled && linklyData?.data?.linklyConfigComplete) ?? false;

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

  const searchFilteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return [...rows].sort((a, b) => orderSortTime(b) - orderSortTime(a)).filter((order) => {
      const name = (order.customerName ?? '').toLowerCase();
      const num  = (order.orderNumber ?? '').toLowerCase();
      const id   = order.id.slice(0, 8).toLowerCase();
      return name.includes(q) || num.includes(q) || id.includes(q);
    });
  }, [rows, searchQuery]);


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
    setSearchOpen(false);
    setSearchQuery('');
    setPickerOpen(true);
  };

  const closeDatePicker = () => {
    setPickerOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
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

      if (status === 'being_prepared' && printerConfig?.autoPrint) {
        const order = rows.find(o => o.id === id);
        if (order) void printOrder(order);
      }
      if (status === 'completed' && printerConfig?.autoDrawer && printerConfig?.printerIp) {
        const order = rows.find(o => o.id === id);
        // App orders are pre-paid via Stripe — never open the drawer for them.
        const isPrepaid = !!(order?.stripePaymentIntentId);
        if (!isPrepaid) {
          const drawerPin = ((printerConfig.drawerPin ?? 0) === 1 ? 1 : 0) as 0 | 1;
          sendOpenDrawer(printerConfig.printerIp, printerConfig.printerPort ?? 9100, api.shopDisplay.printerBytes, drawerPin, printerConfig.printerBrand as 'epson' | 'star' | undefined).catch(() => {});
        }
      }
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const printOrder = async (order: ShopDisplayOrder) => {
    const ip = printerConfig?.printerIp ?? null;
    if (!ip) {
      Alert.alert('No printer configured', 'Set up a printer IP in Settings → Receipt Printer before printing.');
      return;
    }
    const port = printerConfig?.printerPort ?? 9100;
    const brand = printerConfig?.printerBrand === 'star' ? 'star' : 'epson';
    // Never open the drawer for app orders — they are pre-paid via Stripe.
    const isPrepaid = !!(order.stripePaymentIntentId);
    const autoDrawer = !isPrepaid && (printerConfig?.autoDrawer ?? false);
    const drawerPin = ((printerConfig?.drawerPin ?? 0) === 1 ? 1 : 0) as 0 | 1;
    try {
      const job = orderToPrintJob(order, brand);
      await sendReceiptPrint({ ...job, autoDrawer, drawerPin }, ip, port, api.shopDisplay.printerBytes);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Print failed', msg);
    }
  };

  const startEftpos = async (order: ShopDisplayOrder) => {
    setEftposOrder(order);
    setEftposSessionId(null);
    setEftposStatus(null);
    setEftposStarting(true);
    try {
      const res = await api.shopDisplay.startLinklyTransaction(order.id);
      setEftposSessionId(res.data.sessionId);
      setEftposStatus({ status: 'pending', responseText: 'Waiting for card…', approved: false, complete: false });
    } catch (e: any) {
      Alert.alert('EFTPOS Error', e?.message ?? 'Failed to start transaction. Check terminal connection.');
      setEftposOrder(null);
    } finally {
      setEftposStarting(false);
    }
  };

  const cancelEftpos = async () => {
    if (eftposIntervalRef.current) { clearInterval(eftposIntervalRef.current); eftposIntervalRef.current = null; }
    const sid = eftposSessionId;
    if (sid) {
      try { await api.shopDisplay.cancelLinklyTransaction(sid); } catch {}
    }
    setEftposOrder(null);
    setEftposSessionId(null);
    setEftposStatus(null);
  };

  useEffect(() => {
    if (!eftposSessionId || !eftposOrder) return;
    eftposIntervalRef.current = setInterval(async () => {
      try {
        const res = await api.shopDisplay.pollLinklyTransaction(eftposSessionId);
        setEftposStatus(res.data);
        if (res.data.complete) {
          if (eftposIntervalRef.current) { clearInterval(eftposIntervalRef.current); eftposIntervalRef.current = null; }
          if (res.data.approved) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await qc.invalidateQueries({ queryKey: ['shop-display-orders'] });
          }
          // Auto-dismiss after 3 s for both approved and declined
          setTimeout(() => { setEftposOrder(null); setEftposSessionId(null); setEftposStatus(null); }, 3000);
        }
      } catch {}
    }, 2000);
    return () => { if (eftposIntervalRef.current) { clearInterval(eftposIntervalRef.current); eftposIntervalRef.current = null; } };
  }, [eftposSessionId, eftposOrder]);

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
    const availableActions = getNextStatusActions(item);
    const isUpdating = updatingOrderId === item.id;
    const primaryAction = STATUS_ACTIONS.find((action) => availableActions.find((status) => status === action.id && status !== 'cancelled'));
    const secondaryAction = STATUS_ACTIONS.find((action) => action.id === 'cancelled' && availableActions.includes('cancelled'));

    return (
      <Pressable onPress={() => setDetailOrder(item)} style={[s.card, isAlert && s.cardAlert, isWide && s.cardWide]}>
        {/* Header row */}
        <View style={s.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.orderNum}>{item.orderNumber ?? `#${item.id.slice(0, 6).toUpperCase()}`}</Text>
            <Text style={s.customerName} numberOfLines={1}>{item.customerName ?? 'Customer'}</Text>
            <Text style={s.orderMeta}>
              {item.type === 'delivery'
                ? <Text style={{ color: '#D20001', fontWeight: '700' }}>Delivery</Text>
                : item.scheduledFor ? 'Pickup' : 'ASAP Pickup'}
              {(item.stripePaymentStatus || item.scheduledFor) ? ' · ' : null}
              {item.stripePaymentStatus ? `Payment: ${fmtPaymentStatus(item.stripePaymentStatus)}` : null}
              {item.stripePaymentStatus && item.scheduledFor ? ' · ' : null}
              {item.scheduledFor ? `For ${formatTime(item.scheduledFor)}` : null}
            </Text>
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
        {/* EFTPOS charge button — shown when Linkly enabled and payment pending */}
        {linklyEnabled && availableActions.length > 0 &&
          item.stripePaymentStatus !== 'succeeded' &&
          (item.stripePaymentStatus === 'pending' || !item.stripePaymentStatus) ? (
          <Pressable
            onPress={() => void startEftpos(item)}
            style={s.eftposBtn}
          >
            <Feather name="credit-card" size={15} color="#4F46E5" />
            <Text style={s.eftposBtnText}>Charge EFTPOS  ·  ${((item.totalCents ?? 0) / 100).toFixed(2)}</Text>
          </Pressable>
        ) : null}

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
                  {primaryAction.id === 'accepted'
                    ? 'Confirm this order'
                    : primaryAction.id === 'being_prepared'
                      ? 'Move into prep'
                      : primaryAction.id === 'ready_for_pickup'
                        ? 'Mark ready for collection'
                        : primaryAction.id === 'out_for_delivery'
                          ? 'Mark out for delivery'
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
                    {cancellingOrder?.orderNumber ?? `#${cancellingOrder?.id.slice(0, 6).toUpperCase()}`} · {cancellingOrder?.customerName ?? 'Customer'}
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

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDatePicker}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={s.sheetHeader}>
            <Pressable onPress={closeDatePicker} style={s.sheetCloseBtn}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            {searchOpen ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F2F8', borderRadius: 10, paddingHorizontal: 10, gap: 8, height: 36, marginHorizontal: 8 }}>
                <Feather name="search" size={15} color={MUTED} />
                <TextInput
                  autoFocus
                  placeholder="Name or order number…"
                  placeholderTextColor={MUTED}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{ flex: 1, fontSize: 14, color: NAVY, paddingVertical: 0 }}
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                />
              </View>
            ) : (
              <Text style={s.sheetHeaderTitle}>Pick a Date</Text>
            )}
            <Pressable
              onPress={() => { setSearchOpen(v => !v); setSearchQuery(''); }}
              style={[s.sheetCloseBtn, searchOpen && { backgroundColor: NAVY, borderRadius: 8 }]}
            >
              <Feather name="search" size={20} color={searchOpen ? '#fff' : TEXT} />
            </Pressable>
          </View>

          {/* Search results */}
          {searchOpen ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {searchQuery.trim().length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                  <Feather name="search" size={36} color={MUTED} />
                  <Text style={{ color: MUTED, fontSize: 14 }}>Type a customer name or order number</Text>
                </View>
              ) : searchFilteredRows.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
                  <Feather name="inbox" size={36} color={MUTED} />
                  <Text style={{ color: MUTED, fontSize: 14 }}>No orders found</Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{searchFilteredRows.length} result{searchFilteredRows.length !== 1 ? 's' : ''}</Text>
                  {searchFilteredRows.map((order) => {
                    const meta = STATUS_META[order.status] ?? STATUS_META.received;
                    const total = `$${((order.totalCents ?? 0) / 100).toFixed(2)}`;
                    const isDelivery = order.type === 'delivery';
                    const timeStr = new Date(order.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' });
                    return (
                      <Pressable
                        key={order.id}
                        onPress={() => { closeDatePicker(); setDetailOrder(order); }}
                        style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: BORDER }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ gap: 2 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: NAVY }}>{order.orderNumber ?? `#${order.id.slice(0, 6).toUpperCase()}`}</Text>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT }}>{order.customerName ?? 'Customer'}</Text>
                            <Text style={{ fontSize: 12, color: isDelivery ? '#D20001' : MUTED, fontWeight: isDelivery ? '700' : '500' }}>
                              {isDelivery ? 'Delivery' : order.scheduledFor ? 'Pickup' : 'ASAP Pickup'} · {timeStr}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: NAVY }}>{total}</Text>
                            <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                              <Text style={[s.statusText, { color: meta.fg }]}>{meta.label}</Text>
                            </View>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </ScrollView>
          ) : (
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
                        closeDatePicker();
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
                  closeDatePicker();
                }}
                style={[s.modalActionBtn, s.modalActionSecondary]}
              >
                <Text style={s.modalActionSecondaryText}>Today</Text>
              </Pressable>
              <Pressable
                onPress={closeDatePicker}
                style={[s.modalActionBtn, s.modalActionPrimary]}
              >
                <Text style={s.modalActionPrimaryText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── EFTPOS Transaction Modal ─────────────────────────────── */}
      {eftposOrder ? (() => {
        const isApproved = eftposStatus?.approved && eftposStatus?.complete;
        const isDeclined = !eftposStatus?.approved && eftposStatus?.complete;
        const statusText = eftposStarting ? 'Connecting to terminal…' : (eftposStatus?.responseText ?? 'Waiting for card…');
        const total = `$${((eftposOrder.totalCents ?? 0) / 100).toFixed(2)}`;
        const iconName = isApproved ? 'check-circle' : isDeclined ? 'x-circle' : 'credit-card';
        const iconColor = isApproved ? GREEN : isDeclined ? RED : '#4F46E5';
        const iconBg = isApproved ? '#DCFCE7' : isDeclined ? '#FEE2E2' : '#EEF2FF';
        return (
          <Modal visible transparent animationType="fade" onRequestClose={cancelEftpos}
            supportedOrientations={['portrait','landscape','landscape-left','landscape-right']}>
            <View style={s.eftposBackdrop}>
              <View style={s.eftposSheet}>
                <View style={[s.eftposIconWrap, { backgroundColor: iconBg }]}>
                  <Feather name={iconName} size={32} color={iconColor} />
                </View>

                <Text style={s.eftposCustomer}>{eftposOrder.customerName ?? 'Customer'}</Text>
                <Text style={s.eftposOrderNum}>{eftposOrder.orderNumber ?? `#${eftposOrder.id.slice(0, 6).toUpperCase()}`}</Text>
                <Text style={s.eftposAmount}>{total}</Text>

                {(eftposStarting || (!eftposStatus?.complete)) && (
                  <ActivityIndicator color="#4F46E5" size="large" style={{ marginTop: 8 }} />
                )}

                <Text style={[
                  s.eftposStatusText,
                  isApproved && { color: GREEN },
                  isDeclined && { color: RED },
                ]}>{statusText}</Text>

                {isDeclined && (
                  <Text style={s.eftposDeclinedHint}>Card declined. Ask the customer to try again or use another payment method.</Text>
                )}

                {!isApproved && (
                  <Pressable
                    onPress={() => void cancelEftpos()}
                    style={[s.eftposCancelBtn, isDeclined && { backgroundColor: '#FEE2E2' }]}
                  >
                    <Text style={[s.eftposCancelText, isDeclined && { color: RED }]}>
                      {isDeclined ? 'Dismiss' : 'Cancel Transaction'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </Modal>
        );
      })() : null}

      {/* ── Order Detail Modal ───────────────────────────────────── */}
      {detailOrder ? (() => {
        const d = detailOrder;
        const total = `$${((d.totalCents ?? 0) / 100).toFixed(2)}`;
        const meta = STATUS_META[d.status] ?? STATUS_META.received;
        const lines = normalizeOrderItems(d.items);
        const availableActions = getNextStatusActions(d);
        const isUpdating = updatingOrderId === d.id;
        const primaryAction = STATUS_ACTIONS.find((a) => availableActions.find((ss: string) => ss === a.id && ss !== 'cancelled'));
        const secondaryAction = STATUS_ACTIONS.find((a) => a.id === 'cancelled' && availableActions.includes('cancelled'));
        const isDelivery = d.type === 'delivery';
        const deliveryAddr = [d.street, d.suburb, d.postcode].filter(Boolean).join(', ') || d.deliveryAddress || null;
        const paymentLabel = d.isPaid ? 'Paid' : d.stripePaymentStatus ? d.stripePaymentStatus.replace(/_/g, ' ') : 'Pending';
        const paymentColour = d.isPaid || d.stripePaymentStatus === 'succeeded' ? '#16A34A' : '#D97706';
        const orderTime = new Date(d.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' });
        const scheduledLabel = d.scheduledFor ? new Date(d.scheduledFor).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' }) : null;
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setDetailOrder(null)}>
            <View style={s.detailBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetailOrder(null)} />
              <View style={s.detailSheet}>
                {/* ── Header ── */}
                <View style={s.detailHeader}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.detailOrderNum}>{d.orderNumber ?? `#${d.id.slice(0, 8).toUpperCase()}`}</Text>
                    <Text style={s.detailCustomer}>{d.customerName ?? 'Customer'}</Text>
                    <Text style={s.detailTimestamp}>{orderTime}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 10 }}>
                    <Pressable onPress={() => setDetailOrder(null)} style={s.detailCloseBtn}>
                      <Feather name="x" size={18} color={TEXT} />
                    </Pressable>
                    <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                  </View>
                </View>

                {/* ── Scrollable body ── */}
                <ScrollView style={s.detailScroll} contentContainerStyle={s.detailBody} showsVerticalScrollIndicator={false}>

                  {/* Customer info */}
                  <Text style={s.detailSectionLabel}>Customer</Text>
                  <View style={s.detailInfoCard}>
                    <View style={s.detailInfoRow}>
                      <Feather name="user" size={13} color={NAVY} />
                      <Text style={s.detailInfoText}>{d.customerName ?? '—'}</Text>
                    </View>
                    {d.customerEmail ? (
                      <View style={s.detailInfoRow}>
                        <Feather name="mail" size={13} color={NAVY} />
                        <Text style={s.detailInfoText}>{d.customerEmail}</Text>
                      </View>
                    ) : null}
                    {d.customerPhone ? (
                      <Pressable
                        style={s.detailInfoRow}
                        onPress={() => Linking.openURL(`tel:${d.customerPhone}`).catch(() => {})}
                      >
                        <Feather name="phone" size={13} color={BLUE} />
                        <Text style={[s.detailInfoText, { color: BLUE, textDecorationLine: 'underline' }]}>{d.customerPhone}</Text>
                      </Pressable>
                    ) : null}
                    {(d as any).contactPhone && (d as any).contactPhone !== d.customerPhone ? (
                      <Pressable
                        style={s.detailInfoRow}
                        onPress={() => Linking.openURL(`tel:${(d as any).contactPhone}`).catch(() => {})}
                      >
                        <Feather name="phone" size={13} color={BLUE} />
                        <Text style={[s.detailInfoText, { color: BLUE, textDecorationLine: 'underline' }]}>{(d as any).contactPhone}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Fulfilment */}
                  <Text style={[s.detailSectionLabel, { marginTop: 14 }]}>
                    {isDelivery ? 'Delivery' : d.scheduledFor ? 'Pickup' : 'ASAP Pickup'}
                  </Text>
                  <View style={s.detailInfoCard}>
                    <View style={s.detailInfoRow}>
                      <Feather name={isDelivery ? 'truck' : 'shopping-bag'} size={13} color={NAVY} />
                      <Text style={s.detailInfoText}>{isDelivery ? 'Home delivery' : 'In-store pickup'}</Text>
                    </View>
                    {scheduledLabel ? (
                      <View style={s.detailInfoRow}>
                        <Feather name="clock" size={13} color={NAVY} />
                        <Text style={s.detailInfoText}>{scheduledLabel}</Text>
                      </View>
                    ) : null}
                    {isDelivery && deliveryAddr ? (
                      <View style={s.detailInfoRow}>
                        <Feather name="map-pin" size={13} color={NAVY} />
                        <Text style={s.detailInfoText}>{deliveryAddr}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Payment */}
                  <Text style={[s.detailSectionLabel, { marginTop: 14 }]}>Payment</Text>
                  <View style={s.detailInfoCard}>
                    <View style={s.detailInfoRow}>
                      <Feather name="credit-card" size={13} color={NAVY} />
                      <Text style={[s.detailInfoText, { color: paymentColour, fontWeight: '700', textTransform: 'capitalize' }]}>{paymentLabel}</Text>
                    </View>
                    {d.loyaltyPointsUsed && d.loyaltyPointsUsed > 0 ? (
                      <View style={s.detailInfoRow}>
                        <Feather name="star" size={13} color={NAVY} />
                        <Text style={s.detailInfoText}>{d.loyaltyPointsUsed} loyalty points redeemed</Text>
                      </View>
                    ) : null}
                    {d.discountCents && d.discountCents > 0 ? (
                      <View style={s.detailInfoRow}>
                        <Feather name="tag" size={13} color={NAVY} />
                        <Text style={s.detailInfoText}>Discount −${(d.discountCents / 100).toFixed(2)}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Items */}
                  <Text style={[s.detailSectionLabel, { marginTop: 14 }]}>Items ordered</Text>
                  <View style={{ gap: 6 }}>
                    {lines.map((line, i) => (
                      <View key={i} style={s.detailLineItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <Text style={[s.detailLineMain, { flex: 1 }]}>{line.quantity} × {line.name}</Text>
                          <Text style={s.detailLinePrice}>${(line.lineTotalCents / 100).toFixed(2)}</Text>
                        </View>
                        {line.variantName ? <Text style={s.detailLineSub}>{line.variantName}</Text> : null}
                        {line.notableOptions.length > 0 ? <Text style={s.detailLineSub}>{line.notableOptions.join(' · ')}</Text> : null}
                        {line.isFreeReward ? <Text style={[s.detailLineSub, { color: '#16A34A', fontWeight: '700' }]}>Free reward</Text> : null}
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
                        <Feather name="file-text" size={13} color="#92400E" />
                        <Text style={s.detailNotesText}>{d.notes}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Awaiting Approval banner */}
                  {d.status === 'pending_customer_approval' ? (
                    <View style={{ marginTop: 14, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A', gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="clock" size={14} color={AMBER} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', flex: 1 }}>Awaiting Customer Approval</Text>
                      </View>
                      {(d as any).modificationExpiresAt ? (
                        <Text style={{ fontSize: 12, color: '#78350F' }}>
                          Expires {new Date((d as any).modificationExpiresAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' })} — auto-cancels if unanswered
                        </Text>
                      ) : null}
                      {(d as any).modificationReason ? (
                        <Text style={{ fontSize: 12, color: '#92400E', fontStyle: 'italic' }}>Reason: "{(d as any).modificationReason}"</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Total */}
                  <View style={s.detailTotalRow}>
                    <Text style={s.detailTotalLabel}>Order total</Text>
                    <Text style={s.detailTotalValue}>{total}</Text>
                  </View>
                  {d.loyaltyPointsEarned && d.loyaltyPointsEarned > 0 ? (
                    <Text style={s.detailPointsNote}>+{d.loyaltyPointsEarned} loyalty points earned</Text>
                  ) : null}
                </ScrollView>

                {/* ── Actions ── */}
                <View style={s.detailActions}>
                  <Pressable onPress={() => void printOrder(d)} style={s.detailPrintBtn}>
                    <Feather name="printer" size={15} color={NAVY} />
                    <Text style={s.detailPrintText}>Print</Text>
                  </Pressable>
                  {/* Modify Order — only for modifiable statuses, not already awaiting approval */}
                  {['received', 'scheduled', 'accepted', 'being_prepared'].includes(d.status) && d.status !== 'pending_customer_approval' ? (
                    <Pressable
                      onPress={async () => {
                        setModifyItems(normalizeOrderItems(d.items).map(li => ({
                          productId: (li as any).productId ?? null,
                          variantId: (li as any).variantId ?? null,
                          name: li.name,
                          variantName: li.variantName,
                          quantity: li.quantity,
                          unitCents: li.unitCents ?? Math.round(li.lineTotalCents / li.quantity),
                        })));
                        setModifyReason('');
                        setProductPickerQuery('');
                        setModifyOrderId(d.id);
                        setLoadingProducts(true);
                        try {
                          const res = await api.director.availableProductsForOrder(d.id);
                          setAvailableProducts(res.data ?? []);
                        } catch { setAvailableProducts([]); } finally { setLoadingProducts(false); }
                      }}
                      style={[s.detailCancelBtn, { borderColor: AMBER }]}
                    >
                      <Feather name="edit-2" size={15} color={AMBER} />
                      <Text style={[s.detailCancelText, { color: AMBER }]}>Modify</Text>
                    </Pressable>
                  ) : null}
                  {secondaryAction && d.status !== 'pending_customer_approval' ? (
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => { setDetailOrder(null); openCancelModal(d); }}
                      style={[s.detailCancelBtn, isUpdating && s.actionBtnDisabled]}
                    >
                      <Feather name="x-circle" size={15} color={RED} />
                      <Text style={s.detailCancelText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                  {/* For pending_customer_approval, show a Cancel button that cancels the order */}
                  {d.status === 'pending_customer_approval' ? (
                    <Pressable
                      disabled={isUpdating}
                      onPress={() => { setDetailOrder(null); openCancelModal(d); }}
                      style={[s.detailCancelBtn, isUpdating && s.actionBtnDisabled]}
                    >
                      <Feather name="x-circle" size={15} color={RED} />
                      <Text style={s.detailCancelText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                  {primaryAction && d.status !== 'pending_customer_approval' ? (
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
              </View>
            </View>
          </Modal>
        );
      })() : null}

      {/* ── Modify Order Sheet ───────────────────────────────────────── */}
      {modifyOrderId ? (() => {
        const modifiedTotalCents = modifyItems.reduce((sum, it) => sum + ((it.unitCents ?? 0) * (it.quantity ?? 1)), 0);
        const canSubmit = modifyReason.trim().length > 0 && modifyItems.some(it => (it.quantity ?? 0) > 0);
        const filteredProducts = productPickerQuery.trim()
          ? availableProducts.filter(p =>
              p.name.toLowerCase().includes(productPickerQuery.toLowerCase()) ||
              p.variants?.some((v: any) => v.name.toLowerCase().includes(productPickerQuery.toLowerCase()))
            )
          : availableProducts.slice(0, 20);
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => setModifyOrderId(null)}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setModifyOrderId(null)} />
                <View style={{ backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: 'auto', maxHeight: '90%', flex: 1 }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                    <Pressable onPress={() => setModifyOrderId(null)} style={{ padding: 6 }}>
                      <Feather name="x" size={20} color={TEXT} />
                    </Pressable>
                    <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 16, color: TEXT }}>Modify Order</Text>
                    <View style={{ width: 32 }} />
                  </View>
                  <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                    {/* A: Current items */}
                    <Text style={{ fontSize: 11, fontWeight: '800', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current Items</Text>
                    {modifyItems.map((item, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: item.quantity === 0 ? '#FEE2E2' : BG, borderRadius: 10, padding: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: item.quantity === 0 ? RED : TEXT, textDecorationLine: item.quantity === 0 ? 'line-through' : 'none' }}>
                            {item.name}{item.variantName ? ` · ${item.variantName}` : ''}
                          </Text>
                          <Text style={{ fontSize: 12, color: MUTED }}>${((item.unitCents ?? 0) / 100).toFixed(2)} each</Text>
                        </View>
                        {/* Quantity stepper */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Pressable
                            onPress={() => setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(0, (it.quantity ?? 1) - 1) } : it))}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Feather name="minus" size={14} color={item.quantity === 0 ? RED : TEXT} />
                          </Pressable>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: item.quantity === 0 ? RED : TEXT, minWidth: 20, textAlign: 'center' }}>{item.quantity ?? 1}</Text>
                          <Pressable
                            onPress={() => setModifyItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: (it.quantity ?? 1) + 1 } : it))}
                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Feather name="plus" size={14} color={TEXT} />
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {/* B: Add items */}
                    <Text style={{ fontSize: 11, fontWeight: '800', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5 }}>Add Items</Text>
                    <TextInput
                      style={{ backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: TEXT }}
                      placeholder="Search products…"
                      placeholderTextColor={MUTED}
                      value={productPickerQuery}
                      onChangeText={setProductPickerQuery}
                    />
                    {loadingProducts ? <ActivityIndicator size="small" color={BLUE} /> : (
                      <View style={{ gap: 6 }}>
                        {filteredProducts.map((p: any) => (
                          <View key={p.id}>
                            {/* Product with no variants */}
                            {p.variants.length === 0 && (
                              <Pressable
                                onPress={() => setModifyItems(prev => {
                                  const existing = prev.findIndex(it => it.productId === p.id && !it.variantId);
                                  if (existing >= 0) return prev.map((it, i) => i === existing ? { ...it, quantity: it.quantity + 1 } : it);
                                  return [...prev, { productId: p.id, variantId: null, name: p.name, variantName: null, quantity: 1, unitCents: p.salePriceCents ?? p.priceCents }];
                                })}
                                style={{ backgroundColor: BG, borderRadius: 10, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                              >
                                <Text style={{ fontSize: 13, fontWeight: '600', color: TEXT }}>{p.name}</Text>
                                <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>+ ${((p.salePriceCents ?? p.priceCents) / 100).toFixed(2)}</Text>
                              </Pressable>
                            )}
                            {/* Product with variants */}
                            {p.variants.map((v: any) => (
                              <Pressable
                                key={v.id}
                                onPress={() => setModifyItems(prev => {
                                  const existing = prev.findIndex(it => it.productId === p.id && it.variantId === v.id);
                                  if (existing >= 0) return prev.map((it, i) => i === existing ? { ...it, quantity: it.quantity + 1 } : it);
                                  return [...prev, { productId: p.id, variantId: v.id, name: p.name, variantName: v.name, quantity: 1, unitCents: v.priceCents }];
                                })}
                                style={{ backgroundColor: BG, borderRadius: 10, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                              >
                                <Text style={{ fontSize: 13, color: TEXT }}>{p.name} · <Text style={{ fontWeight: '600' }}>{v.name}</Text></Text>
                                <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>+ ${(v.priceCents / 100).toFixed(2)}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ))}
                      </View>
                    )}

                    {/* C: Reason */}
                    <Text style={{ fontSize: 11, fontWeight: '800', color: NAVY, textTransform: 'uppercase', letterSpacing: 0.5 }}>Reason for Change *</Text>
                    <TextInput
                      style={{ backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: modifyReason.trim() ? BORDER : '#FECACA', padding: 12, fontSize: 14, color: TEXT, minHeight: 72, textAlignVertical: 'top' }}
                      placeholder="e.g. Item out of stock — replaced with similar product"
                      placeholderTextColor={MUTED}
                      value={modifyReason}
                      onChangeText={setModifyReason}
                      multiline
                    />

                    {/* Live total */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: BG, borderRadius: 10, padding: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: NAVY }}>New Total</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: BLUE }}>${(modifiedTotalCents / 100).toFixed(2)}</Text>
                    </View>
                  </ScrollView>

                  {/* Footer CTA */}
                  <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: BORDER }}>
                    <Pressable
                      disabled={!canSubmit || modifyLoading}
                      onPress={async () => {
                        if (!modifyOrderId || !canSubmit) return;
                        const itemsToSend = modifyItems.filter(it => (it.quantity ?? 0) > 0);
                        if (itemsToSend.length === 0) {
                          Alert.alert('No Items', 'All items removed — use Cancel Order instead.');
                          return;
                        }
                        setModifyLoading(true);
                        try {
                          await api.director.modifyOrderItems(modifyOrderId, itemsToSend, modifyReason.trim());
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setModifyOrderId(null);
                          qc.invalidateQueries({ queryKey: ['shop-display-orders'] }).catch(() => {});
                        } catch (err: any) {
                          Alert.alert('Error', err?.message ?? 'Failed to send modification.');
                        } finally {
                          setModifyLoading(false);
                        }
                      }}
                      style={{ backgroundColor: canSubmit && !modifyLoading ? BLUE : BORDER, borderRadius: 14, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      {modifyLoading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <><Feather name="send" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Send for Approval</Text></>
                      }
                    </Pressable>
                    <Pressable
                      onPress={() => setModifyOrderId(null)}
                      style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: MUTED, fontWeight: '600', fontSize: 14 }}>Discard Changes</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })() : null}

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

  detailBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  detailSheet:        { backgroundColor: CARD, borderRadius: 24, width: '100%', maxWidth: 580, maxHeight: '90%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 30, elevation: 16 },
  detailHeader:       { flexDirection: 'row', alignItems: 'flex-start', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12 },
  detailOrderNum:     { color: BLUE, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 2 },
  detailCustomer:     { color: TEXT, fontSize: 21, fontWeight: '800', lineHeight: 25 },
  detailTimestamp:    { color: MUTED, fontSize: 12, fontWeight: '500', marginTop: 2 },
  detailCloseBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  detailScroll:       { flexShrink: 1 },
  detailBody:         { padding: 20, paddingBottom: 8, gap: 6 },
  detailSectionLabel: { color: NAVY, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  detailInfoCard:     { backgroundColor: BG, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 8, paddingHorizontal: 12, gap: 8 },
  detailInfoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailInfoText:     { color: TEXT, fontSize: 14, fontWeight: '500', flex: 1 },
  detailLineItem:     { backgroundColor: BG, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  detailLineMain:     { color: TEXT, fontSize: 14, fontWeight: '700' },
  detailLinePrice:    { color: TEXT, fontSize: 14, fontWeight: '700' },
  detailLineSub:      { color: MUTED, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  detailBaristaNote:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  detailBaristaText:  { color: BLUE, fontSize: 12, fontWeight: '600', flex: 1 },
  detailNotesBox:     { backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A', padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailNotesText:    { color: '#92400E', fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  detailTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },
  detailTotalLabel:   { color: MUTED, fontSize: 14, fontWeight: '700' },
  detailTotalValue:   { color: TEXT, fontSize: 24, fontWeight: '900' },
  detailPointsNote:   { color: '#16A34A', fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 4, marginBottom: 8 },
  detailActions:      { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  detailPrintBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG },
  detailPrintText:    { color: NAVY, fontSize: 13, fontWeight: '800' },
  detailCancelBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  detailCancelText:   { color: RED, fontSize: 13, fontWeight: '800' },
  detailPrimaryBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  detailPrimaryText:  { color: '#fff', fontSize: 15, fontWeight: '800' },

  eftposBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, borderColor: '#C7D2FE', backgroundColor: '#EEF2FF', paddingVertical: 11, marginTop: 2 },
  eftposBtnText:      { color: '#4F46E5', fontSize: 14, fontWeight: '800' },
  eftposBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  eftposSheet:        { backgroundColor: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: 380, alignItems: 'center', gap: 10 },
  eftposIconWrap:     { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  eftposCustomer:     { fontSize: 22, fontWeight: '900', color: NAVY, textAlign: 'center' },
  eftposOrderNum:     { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 1, textAlign: 'center' },
  eftposAmount:       { fontSize: 40, fontWeight: '900', color: TEXT, textAlign: 'center', marginVertical: 6 },
  eftposStatusText:   { fontSize: 16, fontWeight: '700', color: NAVY, textAlign: 'center', marginTop: 6 },
  eftposDeclinedHint: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18, marginTop: 2 },
  eftposCancelBtn:    { marginTop: 12, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 32, backgroundColor: '#F3F4F6' },
  eftposCancelText:   { color: NAVY, fontSize: 15, fontWeight: '700' },
});
