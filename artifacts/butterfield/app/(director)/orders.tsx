import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getWholesaleInvoiceUrl } from '@/lib/api';
import type { ApiOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { orderToPrintJob, sendReceiptPrint } from '@/lib/printer';
import { STATUS_COLORS, STATUS_LABEL } from '@/lib/orderStatus';
import {
  CalendarModal, PosTabContent, OrdersSectionHeader,
  EditWholesaleOrderSheet, AdjustWholesaleOrderSheet, CreateWholesaleOrderSheet,
} from '@/components/director';
import DirectorOrderCard from '@/components/director/DirectorOrderCard';
import DirectorOrderDetailModal from '@/components/director/DirectorOrderDetailModal';
import { WholesaleTabContent } from '@/components/director/WholesaleTabContent';
import {
  sydneyDateStr, getErrorMessage, fmtHourLabel, sydDate, isSameDay,
  isThisMonth, isThisWeek, getOrderTimelineDate, fmtDateChip, fmtCents,
} from '@/components/director/ordersHelpers';
import { styles } from '@/components/director/directorOrdersStyles';
import {
  BG, SURFACE, SURFACE_RAISED, BORDER, TEXT, TEXT_MUTED, TEXT_FAINT, BRAND, BRAND_TEXT_ON,
  GREEN, GREEN_DIM, AMBER, AMBER_DIM, RED,
} from '@/components/director/commandCenterColors';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';

const APP_FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'active',           label: 'Active' },
  { key: 'scheduled_all',    label: 'Scheduled' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed',        label: 'Done' },
  { key: 'cancelled',        label: 'Cancelled' },
];

// Local filter for the In-Flight Queue strip only (independent of the main history filter)
const LIVE_FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
] as const;
type LiveFilterKey = (typeof LIVE_FILTER_TABS)[number]['key'];

// Statuses that appear in the live pinned strip (in-flight orders only)
const LIVE_STRIP_STATUSES  = ['received', 'being_prepared', 'ready_for_pickup'];
// Terminal statuses shown in the day-grouped history when no specific filter is active
const TERMINAL_STATUSES    = ['completed', 'cancelled', 'refunded'];

// ── Live active order card (pinned strip) ─────────────────────────────────────
function LiveOrderCard({ order, onPress }: { order: ApiOrder; onPress: () => void }) {
  const col   = STATUS_COLORS[order.status] ?? STATUS_COLORS.received;
  const items = normalizeOrderItems(order.items);
  const summary = summarizeOrderItems(items);
  const label = STATUS_LABEL[order.status] ?? order.status;
  const elapsed = (() => {
    const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
  })();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 200, backgroundColor: SURFACE_RAISED, borderRadius: 14, padding: 12,
        borderWidth: 1, borderColor: BORDER, marginRight: 10,
        borderTopWidth: 3, borderTopColor: BRAND,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }} numberOfLines={1}>
          #{order.orderNumber ?? order.id.slice(-5).toUpperCase()}
        </Text>
        <View style={{ backgroundColor: col?.bg ?? '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: col?.text ?? TEXT_MUTED }}>{label}</Text>
        </View>
      </View>
      {order.customerName && (
        <Text style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4 }} numberOfLines={1}>{order.customerName}</Text>
      )}
      {summary ? (
        <Text style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6 }} numberOfLines={1}>{summary}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Feather name="clock" size={10} color={TEXT_MUTED} />
          <Text style={{ fontSize: 10, color: TEXT_MUTED }}>{elapsed}</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>{fmtCents(order.totalCents ?? 0)}</Text>
      </View>
    </Pressable>
  );
}

// ── Analytics strip (App tab) ─────────────────────────────────────────────────
function AnalyticsStrip({ orders }: { orders: ApiOrder[] }) {
  const total    = orders.length;
  const revenue  = orders.reduce((s, o) => s + (o.totalCents ?? 0), 0);
  const avgCents = total > 0 ? Math.round(revenue / total) : 0;
  const completed = orders.filter((o) => o.status === 'completed').length;
  const nonCancelled = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded').length;
  const fulfilment = nonCancelled > 0 ? Math.round((completed / nonCancelled) * 100) : 0;

  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: BG }}>
      {[
        { label: 'Total Orders', value: String(total),         icon: 'shopping-bag' as const, color: BRAND },
        { label: 'Avg Ticket',   value: fmtCents(avgCents),    icon: 'dollar-sign'  as const, color: AMBER },
        { label: 'Fulfilment',   value: `${fulfilment}%`,      icon: 'check-circle' as const, color: GREEN },
      ].map((tile) => (
        <View key={tile.label} style={{ flex: 1, backgroundColor: SURFACE_RAISED, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', gap: 3 }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: tile.color + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={tile.icon} size={12} color={tile.color} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>{tile.value}</Text>
          <Text style={{ fontSize: 9, color: TEXT_MUTED, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tile.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorOrdersScreen() {
  const qc       = useQueryClient();
  const { user } = useAuth();
  const canCancelRefund = user?.role === 'director' || user?.role === 'master';
  const params = useLocalSearchParams<{ drillMode?: string; drillValue?: string; tab?: string; filterParam?: string }>();

  const [channelTab, setChannelTab] = useState<'app' | 'wholesale' | 'pos'>('app');
  const [posDayStr, setPosDayStr]   = useState<string>(sydneyDateStr());
  const [filter, setFilter]         = useState('active');
  const [viewMode, setViewMode]     = useState<'today' | 'week' | 'month' | 'date' | 'all'>('today');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder]   = useState<ApiOrder | null>(null);
  const [showCalendar, setShowCalendar]     = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [editWholesaleOrder, setEditWholesaleOrder]     = useState<ApiOrder | null>(null);
  const [adjustWholesaleOrder, setAdjustWholesaleOrder] = useState<ApiOrder | null>(null);
  const [showCreateWholesale, setShowCreateWholesale]   = useState(false);
  const [sendingRevisedInvoice, setSendingRevisedInvoice] = useState(false);
  const [markPaidOrder, setMarkPaidOrder]   = useState<ApiOrder | null>(null);
  const [markingPaid, setMarkingPaid]       = useState(false);
  const [drillHour, setDrillHour]         = useState<number | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [wsFilterParam, setWsFilterParam] = useState<string>('all');
  const [liveFilter, setLiveFilter]                 = useState<LiveFilterKey>('all');
  const [historySearchOpen, setHistorySearchOpen]   = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const drillModeRef = useRef<string | null>(null);
  const tabParamAppliedRef = useRef<string | null>(null);

  const isStaff = user?.role === 'staff';

  const { data: staffProfileData, isLoading: staffProfileLoading } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: () => api.staff.profile(),
    enabled: isStaff,
    staleTime: 60_000,
  });
  const canViewOrders = isStaff ? (staffProfileData?.data as any)?.canViewOrders === true : true;

  const { data, isLoading, refetch } = useQuery({
    queryKey: isStaff ? ['staff-orders'] : ['director-orders'],
    queryFn: () => isStaff ? api.staff.allOrders() : api.director.orders(),
    refetchInterval: 20000,
    placeholderData: keepPreviousData,
    enabled: !isStaff || canViewOrders,
  });

  useFocusEffect(
    React.useCallback(() => {
      const dm = params.drillMode;
      const dv = params.drillValue;
      const compositeKey = dm ? `${dm}:${dv ?? ''}` : null;
      if (dm && compositeKey !== drillModeRef.current) {
        drillModeRef.current = compositeKey;
        tabParamAppliedRef.current = null;
        setFilter('all');
        setDrillHour(null);
        setProductFilter(null);
        if (dm === 'today')                   setViewMode('today');
        else if (dm === 'week')               setViewMode('week');
        else if (dm === 'month')              setViewMode('month');
        else if (dm === 'hour' && dv != null) { setViewMode('today'); setDrillHour(parseInt(dv, 10)); }
        else if (dm === 'product' && dv)      { setViewMode('today'); setProductFilter(dv); }
        setChannelTab('app');
      } else if (!dm) {
        drillModeRef.current = null;
        setDrillHour(null);
        setProductFilter(null);
        setFilter('active');
        setViewMode(isStaff ? 'week' : 'today');
        setSelectedDate(new Date());

        // Apply tab + filter deep-link params only once per unique param combination.
        // Using a ref prevents re-applying stale params when the screen re-focuses
        // after the user has manually changed the filter.
        const tabParamKey = (params.tab || params.filterParam)
          ? `${params.tab ?? ''}:${params.filterParam ?? ''}`
          : null;

        if (tabParamKey && tabParamKey !== tabParamAppliedRef.current) {
          tabParamAppliedRef.current = tabParamKey;
          if (params.tab === 'pos' && !isStaff) {
            setChannelTab('pos');
          } else if (params.tab === 'wholesale') {
            setChannelTab('wholesale');
            setWsFilterParam(params.filterParam ?? 'all');
          } else if (params.tab === 'app') {
            setChannelTab('app');
          }
          if (params.filterParam && params.tab !== 'wholesale') {
            setFilter(params.filterParam);
          }
        } else if (!tabParamKey) {
          tabParamAppliedRef.current = null;
        }
      }
    }, [isStaff, params.drillMode, params.drillValue, params.tab, params.filterParam]),
  );

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: settingsData } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
    retry: 1,
    enabled: !isStaff,
  });
  const { data: storesData } = useQuery({
    queryKey: isStaff ? ['staff-stores'] : ['director-stores'],
    queryFn: () => isStaff ? api.staff.stores() : api.director.storesList(),
    staleTime: 60000,
  });

  const allOrders: ApiOrder[] = data?.data ?? [];
  const stores = storesData?.data ?? [];
  const printerIp   = (settingsData?.data?.printer_ip ?? '').trim();
  const printerPort = parseInt(settingsData?.data?.printer_port ?? '9100', 10);

  // Access guard
  if (isStaff && !canViewOrders) {
    if (staffProfileLoading) {
      return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}><ActivityIndicator color={BRAND} size="large" /></View>;
    }
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, padding: 32, gap: 16 }}>
        <Feather name="lock" size={40} color={TEXT_MUTED} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' }}>Access Restricted</Text>
        <Text style={{ fontSize: 14, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 }}>
          You don't have permission to view orders.{'\n'}Ask your manager to enable this.
        </Text>
      </View>
    );
  }

  const isDrillActive = !!(params.drillMode);
  const drillLabel = (() => {
    const dm = params.drillMode; const dv = params.drillValue;
    if (dm === 'today')   return 'Today\'s revenue';
    if (dm === 'week')    return 'This week\'s revenue';
    if (dm === 'month')   return 'This month\'s revenue';
    if (dm === 'hour' && dv != null) return `Orders at ${fmtHourLabel(parseInt(dv, 10))}`;
    if (dm === 'product' && dv)      return `Orders containing "${dv}"`;
    return null;
  })();

  const printOrder = async (order: ApiOrder) => {
    const orderStore = stores.find((s) => s.id === order.storeId);
    const effectivePrinterIp    = (orderStore?.printerIp ?? printerIp ?? '').trim();
    const effectivePrinterPort  = orderStore?.printerPort ?? printerPort;
    const fallbackBrand         = settingsData?.data?.printer_brand === 'star' ? 'star' : 'epson';
    const effectivePrinterBrand = (orderStore?.printerBrand ?? fallbackBrand) as 'epson' | 'star';
    const effectiveAutoDrawer   = !!(orderStore?.autoDrawer);
    const effectiveDrawerPin    = ((orderStore?.drawerPin ?? 0) === 1 ? 1 : 0) as 0 | 1;
    if (!effectivePrinterIp) { Alert.alert('Printer Not Set', 'Set the printer details inside this store first.'); return; }
    setPrintingOrderId(order.id);
    try {
      await sendReceiptPrint(
        { ...orderToPrintJob(order, effectivePrinterBrand), autoDrawer: effectiveAutoDrawer, drawerPin: effectiveDrawerPin },
        effectivePrinterIp, effectivePrinterPort,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Printed', `Receipt sent to the printer (${effectivePrinterBrand === 'star' ? 'Star' : 'Epson'} mode).`);
    } catch (error) {
      Alert.alert('Print Failed', getErrorMessage(error) || 'Could not send the receipt to the printer.');
    } finally {
      setPrintingOrderId(null);
    }
  };

  // App tab — non-wholesale orders only
  const appOrders = useMemo(() => allOrders.filter((o) => o.orderSource !== 'wholesale'), [allOrders]);

  const statusFiltered = useMemo(() => {
    if (filter === 'all') return appOrders;
    if (filter === 'active') return appOrders.filter((o) =>
      ['received','being_prepared','ready_for_pickup','scheduled','accepted'].includes(o.status));
    if (filter === 'scheduled_all') return appOrders.filter((o) => ['scheduled','accepted'].includes(o.status));
    return appOrders.filter((o) => o.status === filter);
  }, [appOrders, filter]);

  const drillFiltered = useMemo(() => {
    let result = statusFiltered;
    if (drillHour !== null) result = result.filter((o) => new Date(o.createdAt).getHours() === drillHour);
    if (productFilter) {
      const needle = productFilter.toLowerCase();
      result = result.filter((o) => {
        try {
          const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items) : []);
          return items.some((it: any) => (it.name ?? it.productName ?? '').toLowerCase().includes(needle));
        } catch { return false; }
      });
    }
    return result;
  }, [statusFiltered, drillHour, productFilter]);

  const today = useMemo(() => new Date(), []);

  const liveActiveOrders = useMemo(
    () => appOrders.filter((o) => LIVE_STRIP_STATUSES.includes(o.status)),
    [appOrders],
  );
  const filteredLiveOrders = useMemo(
    () => liveFilter === 'all' ? liveActiveOrders : liveActiveOrders.filter((o) => o.status === liveFilter),
    [liveActiveOrders, liveFilter],
  );
  const todayOrders      = useMemo(() => drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)), [drillFiltered, today]);
  const thisWeekOrders   = useMemo(() => drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o)) && (isStaff || !isSameDay(getOrderTimelineDate(o), today))), [drillFiltered, today, isStaff]);
  const weekDrillOrders  = useMemo(() => drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o))), [drillFiltered]);
  const thisMonthOrders  = useMemo(() => drillFiltered.filter((o) => isThisMonth(getOrderTimelineDate(o))), [drillFiltered]);
  const dateOrders       = useMemo(() => drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), selectedDate)), [drillFiltered, selectedDate]);
  const ordersByDate     = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of statusFiltered) { const key = sydDate(getOrderTimelineDate(o)); map[key] = (map[key] ?? 0) + 1; }
    return map;
  }, [statusFiltered]);

  const handleStatusChange = async (orderId: string, status: string, cancelReason?: string) => {
    try {
      if (isStaff) await api.staff.updateOrderStatus(orderId, status);
      else         await api.director.updateOrderStatus(orderId, status, cancelReason);
      await qc.invalidateQueries({ queryKey: isStaff ? ['staff-orders'] : ['director-orders'] });
      if (!isStaff) await qc.invalidateQueries({ queryKey: ['director-stats'] });
      setSelectedOrder((prev) => prev ? { ...prev, status, ...(cancelReason ? { cancelReason } : {}) } : null);
      if (status === 'being_prepared') {
        const order = allOrders.find((o) => o.id === orderId) ?? selectedOrder;
        if (order) {
          const orderStore = stores.find((s) => s.id === order.storeId);
          if (orderStore ? (orderStore.autoPrint !== false) : true) await printOrder({ ...order, status });
        }
      }
    } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
  };

  const handleViewInvoice = async (order: ApiOrder) => {
    try {
      let html: string | null = null;
      if (order.id) {
        try { const resp = await fetch(getWholesaleInvoiceUrl(order.id)); if (resp.ok) html = await resp.text(); } catch { /* fall through */ }
      }
      if (!html) {
        const fallbackUrl = order.invoicePdfUrl ?? order.invoiceUrl;
        if (!fallbackUrl) { Alert.alert('Invoice Unavailable', 'This invoice is still being prepared.'); return; }
        await Linking.openURL(fallbackUrl); return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${order.orderNumber ?? order.id?.slice(0,8).toUpperCase() ?? ''}`, UTI: 'com.adobe.pdf' });
      else await Print.printAsync({ uri });
    } catch (error) { Alert.alert('Invoice Unavailable', getErrorMessage(error)); }
  };

  const totalToday = todayOrders.length;

  // ── Render helper for app tab content body ────────────────────────────────
  const renderAppTabBody = () => {
    if (isLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} size="large" />
        </View>
      );
    }
    const [orders, title, emptyMsg] = (() => {
      if (viewMode === 'all')   return [drillFiltered, 'All App Orders', 'No app orders found'] as const;
      if (viewMode === 'today') return [todayOrders, "Today's App Orders", 'No app orders today yet'] as const;
      if (viewMode === 'week')  return [isDrillActive ? weekDrillOrders : thisWeekOrders, isDrillActive ? 'This Week (7 Days)' : (isStaff ? 'This Week' : 'Earlier This Week'), isDrillActive ? 'No orders this week' : 'No other orders this week'] as const;
      if (viewMode === 'month') return [thisMonthOrders, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }), 'No orders this month yet'] as const;
      return [dateOrders, fmtDateChip(selectedDate), 'No orders on this date'] as const;
    })();

    // History: when no specific status filter is active, show terminal orders only
    // (active orders are pinned in the live strip above)
    const historyOrders = (filter === 'all' || filter === 'active')
      ? orders.filter((o) => TERMINAL_STATUSES.includes(o.status))
      : orders;

    // Search by order number / customer name on top of the history list
    const searchedHistoryOrders = historySearchQuery.trim()
      ? historyOrders.filter((o) => {
          const q = historySearchQuery.trim().toLowerCase();
          const num = String(o.orderNumber ?? o.id ?? '').toLowerCase();
          const name = (o.customerName ?? '').toLowerCase();
          return num.includes(q) || name.includes(q);
        })
      : historyOrders;

    // Day-grouped history with revenue subtotals
    const dayGroups = (() => {
      const map: Record<string, ApiOrder[]> = {};
      for (const o of searchedHistoryOrders) {
        const k = sydDate(getOrderTimelineDate(o));
        (map[k] ??= []).push(o);
      }
      return Object.entries(map)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([k, ords]) => {
          const [y, m, d] = k.split('-').map(Number);
          const todayKey = sydDate(new Date());
          const yesterdayKey = sydDate(new Date(Date.now() - 86400000));
          const dt = new Date(Date.UTC(y, m - 1, d, 12));
          const dateLabel = dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
          const prefix = k === todayKey ? 'Today' : k === yesterdayKey ? 'Yesterday' : null;
          return {
            dateKey: k,
            label: prefix ? `${prefix} · ${dateLabel}` : dateLabel,
            revenue: ords.filter(o => o.status !== 'cancelled' && o.status !== 'refunded').reduce((s, o) => s + (o.totalCents ?? 0), 0),
            count: ords.length,
            orders: ords,
          };
        });
    })();

    const renderCard = (o: ApiOrder) => (
      <DirectorOrderCard key={o.id} order={o} onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }} onPrint={() => printOrder(o)} printing={printingOrderId === o.id} />
    );

    return (
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 0, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Hero stat — orders currently in flight + revenue today */}
        <View style={{ alignItems: 'center', paddingVertical: 20, marginBottom: 16, backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: liveActiveOrders.length > 0 ? AMBER : GREEN, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
            {liveActiveOrders.length > 0 ? 'Needs Attention' : 'All Clear'}
          </Text>
          <Text style={{ fontSize: 52, fontWeight: '800', color: TEXT, letterSpacing: -1, lineHeight: 58 }}>{liveActiveOrders.length}</Text>
          <Text style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 12 }}>Orders in flight</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE_RAISED, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: BORDER }}>
            <Feather name="trending-up" size={14} color={GREEN} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>{fmtCents(todayOrders.filter((o) => o.status === 'completed').reduce((s, o) => s + (o.totalCents ?? 0), 0))}</Text>
            <Text style={{ fontSize: 12, color: TEXT_MUTED }}>revenue today</Text>
          </View>
        </View>

        {/* In-Flight Queue — always visible, with its own local status filter */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>In-Flight Queue</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            {LIVE_FILTER_TABS.map((t) => {
              const active = liveFilter === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => { setLiveFilter(t.key); Haptics.selectionAsync(); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: active ? BRAND : SURFACE_RAISED, borderWidth: 1, borderColor: active ? BRAND : BORDER }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: active ? BRAND_TEXT_ON : TEXT_MUTED }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {filteredLiveOrders.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4 }}>
              {filteredLiveOrders.map(item => (
                <LiveOrderCard key={item.id} order={item} onPress={() => { setSelectedOrder(item); Haptics.selectionAsync(); }} />
              ))}
            </ScrollView>
          ) : (
            <View style={{ paddingVertical: 18, alignItems: 'center', backgroundColor: SURFACE, borderRadius: 12, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: TEXT_FAINT, fontSize: 12 }}>No orders in flight{liveFilter !== 'all' ? ' for this filter' : ''}</Text>
            </View>
          )}
        </View>

        {/* Supporting KPIs */}
        <AnalyticsStrip orders={orders} />

        {/* Day-grouped order list with date headers + daily revenue */}
        <OrdersSectionHeader
          title={title}
          count={searchedHistoryOrders.length}
          right={
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setHistorySearchOpen((v) => { if (v) setHistorySearchQuery(''); return !v; }); }}
              hitSlop={10}
              accessibilityLabel={historySearchOpen ? 'Close order history search' : 'Search order history'}
              testID="history-search-toggle"
              style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: historySearchOpen ? BRAND : SURFACE_RAISED, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: historySearchOpen ? BRAND : BORDER }}
            >
              <Feather name={historySearchOpen ? 'x' : 'search'} size={13} color={historySearchOpen ? BRAND_TEXT_ON : TEXT_MUTED} />
            </Pressable>
          }
        />
        {historySearchOpen && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, marginBottom: 10 }}>
            <Feather name="search" size={14} color={TEXT_FAINT} />
            <TextInput
              value={historySearchQuery}
              onChangeText={setHistorySearchQuery}
              placeholder="Search by order # or customer name"
              placeholderTextColor={TEXT_FAINT}
              autoFocus
              testID="history-search-input"
              style={{ flex: 1, color: TEXT, paddingVertical: 9, fontSize: 13 }}
            />
          </View>
        )}
        {dayGroups.length === 0 ? (
          <View style={styles.emptySection}>
            <Feather name="coffee" size={28} color={BORDER} />
            <Text style={styles.emptyText}>{emptyMsg}</Text>
          </View>
        ) : (
          dayGroups.map(group => (
            <View key={group.dateKey} style={{ marginBottom: 4 }}>
              {/* Day header with revenue subtotal */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 2, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: BRAND + '80' }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT, letterSpacing: 0.2 }}>{group.label}</Text>
                  <View style={{ backgroundColor: BG, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>{group.count}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND }}>{fmtCents(group.revenue)}</Text>
              </View>
              {group.orders.map(renderCard)}
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  return (
    <DirectorTabScreen
      title="Orders"
      backgroundColor={BG}
      headerBackgroundColor={SURFACE}
      titleColor={TEXT}
      subtitleColor={TEXT_MUTED}
      statusBarStyle="light-content"
    >
      {/* ── Channel tab bar (director/manager only) ── */}
      {!isStaff && (
        <View style={{ backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BG, borderRadius: 12, padding: 3 }}>
            {([
              { key: 'app'       as const, label: 'App Orders' },
              { key: 'wholesale' as const, label: 'Wholesale' },
              { key: 'pos'       as const, label: 'POS Terminal' },
            ] as const).map((t) => {
              const active = channelTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => { setChannelTab(t.key); Haptics.selectionAsync(); }}
                  style={[{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
                    active && { backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BRAND + '50' }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? BRAND : TEXT_MUTED }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* ── POS tab ─────────────────────────────────────────────── */}
      {channelTab === 'pos' && !isStaff ? (
        <PosTabContent
          dayStr={posDayStr}
          onSetDay={setPosDayStr}
        />
      ) : channelTab === 'wholesale' && !isStaff ? (
        /* ── Wholesale tab ───────────────────────────────────────── */
        <WholesaleTabContent
          allOrders={allOrders}
          isLoading={isLoading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          filter={wsFilterParam}
          onFilterChange={setWsFilterParam}
          onOrderPress={(order) => { setSelectedOrder(order); Haptics.selectionAsync(); }}
          onCreateNew={() => setShowCreateWholesale(true)}
        />
      ) : (
        /* ── App tab ─────────────────────────────────────────────── */
        <>
          {/* Drill-down banner */}
          {isDrillActive && drillLabel && (
            <View style={{ backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
              <View style={{ backgroundColor: BRAND + '20', borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="filter" size={13} color={BRAND} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND, letterSpacing: 0.5 }}>DRILL-DOWN ACTIVE</Text>
                <Text style={{ fontSize: 12, color: TEXT, fontWeight: '500', marginTop: 1 }}>{drillLabel}</Text>
              </View>
              <Pressable onPress={() => { drillModeRef.current = null; router.replace('/(director)/orders' as any); }} style={{ padding: 4 }}>
                <Feather name="x" size={16} color={BRAND} />
              </Pressable>
            </View>
          )}

          {/* Status filter chips */}
          <View style={{ backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}
            >
              {APP_FILTER_TABS.map((t) => {
                const active = filter === t.key;
                const color  = t.key === 'active' ? AMBER : BRAND;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => { setFilter(t.key); Haptics.selectionAsync(); }}
                    style={[styles.filterChip, { backgroundColor: active ? color : SURFACE_RAISED, borderColor: active ? color : BORDER }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? BRAND_TEXT_ON : TEXT_MUTED }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Date view selector */}
          <View style={[styles.dateBar, { backgroundColor: BG, borderBottomColor: BORDER }]}>
            {([
              { key: 'all',   label: 'All' },
              { key: 'today', label: `Today (${totalToday})` },
              { key: 'week',  label: 'This Week' },
              { key: 'month', label: 'Month' },
              { key: 'date',  label: 'Pick Date' },
            ] as const).map((m) => {
              const active = viewMode === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => { setViewMode(m.key); if (m.key === 'date') setShowCalendar(true); Haptics.selectionAsync(); }}
                  style={[styles.dateTab, { borderBottomWidth: 2, borderBottomColor: active ? BRAND : 'transparent' }]}
                >
                  <Text style={{ fontWeight: active ? '700' : '400', fontSize: 13, color: active ? BRAND : TEXT_MUTED }}>
                    {m.key === 'date' && viewMode === 'date' ? fmtDateChip(selectedDate) : m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Date picker row */}
          {viewMode === 'date' && (
            <Pressable
              onPress={() => setShowCalendar(true)}
              style={{ backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="calendar" size={16} color={BRAND} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: BRAND }}>
                  {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={TEXT_MUTED} />
            </Pressable>
          )}

          {renderAppTabBody()}
        </>
      )}

      {/* ── Shared modals (all tabs) ─────────────────────────────── */}
      <DirectorOrderDetailModal
        order={selectedOrder}
        visible={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
        onAcceptOrder={async (orderId) => {
          try {
            await api.director.acceptOrder(orderId);
            await qc.invalidateQueries({ queryKey: ['director-orders'] });
            await qc.invalidateQueries({ queryKey: ['director-stats'] });
            setSelectedOrder((prev) => prev ? { ...prev, status: 'accepted' } : null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
        }}
        onPrintReceipt={() => selectedOrder ? printOrder(selectedOrder) : Promise.resolve()}
        onViewInvoice={() => selectedOrder ? handleViewInvoice(selectedOrder) : Promise.resolve()}
        printing={printingOrderId === selectedOrder?.id}
        canCancelRefund={canCancelRefund}
        onEditWholesale={(order) => { setSelectedOrder(null); setTimeout(() => setEditWholesaleOrder(order), 300); }}
        onAdjustWholesale={(order) => { setSelectedOrder(null); setTimeout(() => setAdjustWholesaleOrder(order), 300); }}
        onMarkPaid={(order) => { setSelectedOrder(null); setTimeout(() => setMarkPaidOrder(order), 300); }}
        onSendRevisedInvoice={async (order) => {
          if (sendingRevisedInvoice) return;
          setSendingRevisedInvoice(true);
          try {
            const result = await api.director.sendRevisedWholesaleInvoice(order.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Invoice Sent', `Revised invoice emailed to ${result.sentTo}.`);
          } catch (err: any) { Alert.alert('Error', err?.message ?? 'Could not send invoice email.'); }
          finally { setSendingRevisedInvoice(false); }
        }}
      />

      <MarkPaidModal
        order={markPaidOrder}
        onClose={() => setMarkPaidOrder(null)}
        marking={markingPaid}
        onConfirm={async (orderId, paymentReference) => {
          setMarkingPaid(true);
          try {
            await api.director.markWholesaleInvoicePaid(orderId, paymentReference);
            await qc.invalidateQueries({ queryKey: ['director-orders'] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setMarkPaidOrder(null);
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Could not mark invoice as paid.');
          } finally {
            setMarkingPaid(false);
          }
        }}
      />

      <EditWholesaleOrderSheet
        order={editWholesaleOrder}
        visible={!!editWholesaleOrder}
        onClose={() => setEditWholesaleOrder(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['director-orders'] }); }}
      />
      <AdjustWholesaleOrderSheet
        order={adjustWholesaleOrder}
        visible={!!adjustWholesaleOrder}
        onClose={() => setAdjustWholesaleOrder(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['director-orders'] }); }}
      />
      <CreateWholesaleOrderSheet
        visible={showCreateWholesale}
        onClose={() => setShowCreateWholesale(false)}
        onCreated={(order: any) => {
          qc.invalidateQueries({ queryKey: ['director-orders'] });
          setShowCreateWholesale(false);
          if (order) setSelectedOrder(order as any);
        }}
      />

      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        ordersByDate={ordersByDate}
      />
    </DirectorTabScreen>
  );
}

function MarkPaidModal({ order, onClose, onConfirm, marking }: {
  order: ApiOrder | null;
  onClose: () => void;
  onConfirm: (orderId: string, paymentReference?: string) => void;
  marking: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [ref, setRef] = useState('');
  useEffect(() => { setRef(''); }, [order?.id]);
  if (!order) return null;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        <View style={{ backgroundColor: SURFACE, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 16, gap: 12, borderWidth: 1, borderColor: BORDER, borderBottomWidth: 0 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginBottom: 4 }} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>Mark as Paid</Text>
          <Text style={{ fontSize: 13, color: TEXT_MUTED }}>
            #{order.orderNumber ?? order.poReference ?? order.id.slice(0, 8).toUpperCase()} · {order.customerName ?? ''}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: TEXT }}>{fmtCents(order.totalCents ?? 0)}</Text>

          <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT_MUTED, marginTop: 4 }}>Payment Reference (optional)</Text>
          <TextInput
            style={{ backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: TEXT, fontSize: 14 }}
            placeholder="e.g. EFT receipt 20240610, BSB transfer"
            placeholderTextColor={TEXT_MUTED}
            value={ref}
            onChangeText={setRef}
            returnKeyType="done"
            autoCapitalize="none"
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: SURFACE_RAISED, borderWidth: 1, borderColor: BORDER, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(order.id, ref.trim() || undefined)}
              disabled={marking}
              style={({ pressed }) => ({ flex: 2, height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN, opacity: pressed || marking ? 0.7 : 1 })}
            >
              {marking
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="check-circle" size={16} color="#fff" />
              }
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{marking ? 'Marking…' : 'Mark as Paid'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
