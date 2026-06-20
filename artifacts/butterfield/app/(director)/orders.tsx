import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView,
  Linking, Modal, Platform, Pressable,
  RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getWholesaleInvoiceUrl } from '@/lib/api';
import type { ApiOrder, PosTransaction } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { orderToPrintJob, sendReceiptPrint } from '@/lib/printer';
import { normalizeOrderItems, summarizeOrderItems } from '@/lib/orderItems';
import {
  STATUS_COLORS, STATUS_LABEL, ACTION_LABEL, WHOLESALE_NEXT,
  getCustomerNextStatuses, ORDER_STATUS_SECTIONS, getOrderSectionKey,
} from '@/lib/orderStatus';
import { OrderDetailModal, CalendarModal, PosTabContent, OrderCard, OrdersSectionHeader } from '@/components/director';
import {
  sydneyDateStr, getErrorMessage, fmtHourLabel, sydDate, isSameDay,
  isThisMonth, isThisWeek, getOrderTimelineDate, fmtDateChip,
} from '@/components/director/ordersHelpers';
import { styles } from '@/components/director/ordersStyles';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const NAVY   = '#1A2B4A';
const PURPLE = '#8B5CF6';
const RED_CONST = '#DC2626';
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FILTER_TABS = [
  { key: 'all',              label: 'All' },
  { key: 'active',           label: 'Active' },
  { key: 'scheduled_all',    label: 'Scheduled' },
  { key: 'received',         label: 'Pending' },
  { key: 'being_prepared',   label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'completed',        label: 'Done' },
  { key: 'wholesale',        label: 'Wholesale' },
  { key: 'cancelled',        label: 'Cancelled' },
];


// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorOrdersScreen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCancelRefund = user?.role === 'director' || user?.role === 'master';
  const params = useLocalSearchParams<{
    drillMode?: string;
    drillValue?: string;
    tab?: string;
  }>();

  const [channelTab, setChannelTab] = useState<'app' | 'pos'>('app');
  const [posDayStr, setPosDayStr]   = useState<string>(sydneyDateStr());
  const [filter, setFilter]         = useState('all');
  const [viewMode, setViewMode]     = useState<'today' | 'week' | 'month' | 'date'>('today');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<ApiOrder | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [drillHour, setDrillHour]     = useState<number | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const drillModeRef = useRef<string | null>(null);

  const isStaff = user?.role === 'staff';
  const { data, isLoading, refetch } = useQuery({
    queryKey: isStaff ? ['staff-orders'] : ['director-orders'],
    queryFn: () => isStaff ? api.staff.allOrders() : api.director.orders(),
    refetchInterval: 20000,
    placeholderData: keepPreviousData,
  });
  const { data: posData, isLoading: posLoading, refetch: posRefetch } = useQuery({
    queryKey: ['director-pos-orders', posDayStr],
    queryFn: () => api.director.posOrders({ date: posDayStr }),
    staleTime: 30_000,
    enabled: channelTab === 'pos' && !isStaff,
  });

  useFocusEffect(
    React.useCallback(() => {
      const dm = params.drillMode;
      const dv = params.drillValue;
      const compositeKey = dm ? `${dm}:${dv ?? ''}` : null;
      if (dm && compositeKey !== drillModeRef.current) {
        drillModeRef.current = compositeKey;
        setFilter('all');
        setDrillHour(null);
        setProductFilter(null);
        if (dm === 'today') {
          setViewMode('today');
        } else if (dm === 'week') {
          setViewMode('week');
        } else if (dm === 'month') {
          setViewMode('month');
        } else if (dm === 'hour' && dv != null) {
          setViewMode('today');
          setDrillHour(parseInt(dv, 10));
        } else if (dm === 'product' && dv) {
          setViewMode('today');
          setProductFilter(dv);
        }
      } else if (!dm) {
        drillModeRef.current = null;
        setDrillHour(null);
        setProductFilter(null);
        setFilter('active');
        setViewMode(isStaff ? 'week' : 'today');
        setSelectedDate(new Date());
      }
      // Handle tab deep-link param
      if (params.tab === 'pos' && !isStaff) {
        setChannelTab('pos');
      } else if (params.tab === 'app') {
        setChannelTab('app');
      }
    }, [isStaff, params.drillMode, params.drillValue, params.tab]),
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
  const printerIp = (settingsData?.data?.printer_ip ?? '').trim();
  const printerPort = parseInt(settingsData?.data?.printer_port ?? '9100', 10);

  const isDrillActive = !!(params.drillMode);
  const drillLabel = (() => {
    const dm = params.drillMode;
    const dv = params.drillValue;
    if (dm === 'today')   return 'Today\'s revenue';
    if (dm === 'week')    return 'This week\'s revenue';
    if (dm === 'month')   return 'This month\'s revenue';
    if (dm === 'hour' && dv != null)  return `Orders at ${fmtHourLabel(parseInt(dv, 10))}`;
    if (dm === 'product' && dv) return `Orders containing "${dv}"`;
    return null;
  })();

  const printOrder = async (order: ApiOrder) => {
    const orderStore = stores.find((store) => store.id === order.storeId);
    const effectivePrinterIp = (orderStore?.printerIp ?? printerIp ?? '').trim();
    const effectivePrinterPort = orderStore?.printerPort ?? printerPort;
    const effectivePrinterBrand = (orderStore?.printerBrand ?? 'epson') as 'epson' | 'star';
    if (!effectivePrinterIp) {
      Alert.alert('Printer Not Set', 'Set the printer details inside this store before printing orders for it.');
      return;
    }
    setPrintingOrderId(order.id);
    try {
      await sendReceiptPrint(orderToPrintJob(order, effectivePrinterBrand), effectivePrinterIp, effectivePrinterPort);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Printed', 'Receipt sent to the printer.');
    } catch (error) {
      Alert.alert('Print Failed', getErrorMessage(error) || 'Could not send the receipt to the printer.');
    } finally {
      setPrintingOrderId(null);
    }
  };
  // Apply status filter
  const statusFiltered = useMemo(() => {
    if (filter === 'all') return allOrders;
    if (filter === 'active') return allOrders.filter((o) =>
      ['received','being_prepared','ready_for_pickup','pending','processing','dispatched'].includes(o.status)
    );
    if (filter === 'scheduled_all') return allOrders.filter((o) =>
      ['scheduled','accepted'].includes(o.status)
    );
    if (filter === 'wholesale') return allOrders.filter((o) => o.orderSource === 'wholesale');
    return allOrders.filter((o) => o.status === filter);
  }, [allOrders, filter]);

  // Apply drill secondary filters (hour / product) on top of status filter
  const drillFiltered = useMemo(() => {
    let result = statusFiltered;
    if (drillHour !== null) {
      result = result.filter((o) => new Date(o.createdAt).getHours() === drillHour);
    }
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
  const activeTodayOrders = useMemo(
    () =>
      allOrders.filter((order) =>
        ['received', 'being_prepared', 'ready_for_pickup', 'pending', 'processing', 'dispatched'].includes(order.status)
        && isSameDay(getOrderTimelineDate(order), today)
      ),
    [allOrders, today],
  );
  const todayOrders = useMemo(() =>
    drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)),
    [drillFiltered, today]
  );
  // "Earlier this week" tab — excludes today for directors so it doesn't duplicate the today section
  const thisWeekOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o)) && (isStaff || !isSameDay(getOrderTimelineDate(o), today))),
    [drillFiltered, today, isStaff]);
  // Drill-down version — includes today so the figure matches the dashboard week-to-date total
  const weekDrillOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisWeek(getOrderTimelineDate(o))),
    [drillFiltered]);
  const thisMonthOrders = useMemo(() =>
    drillFiltered.filter((o) => isThisMonth(getOrderTimelineDate(o))),
    [drillFiltered]);
  const dateOrders = useMemo(() =>
    drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), selectedDate)),
    [drillFiltered, selectedDate]
  );
  const ordersByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of statusFiltered) {
      const d = getOrderTimelineDate(o);
      const key = sydDate(d);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [statusFiltered]);
  const handleStatusChange = async (orderId: string, status: string, cancelReason?: string) => {
    try {
      if (isStaff) {
        await api.staff.updateOrderStatus(orderId, status);
      } else {
        await api.director.updateOrderStatus(orderId, status, cancelReason);
      }
      await qc.invalidateQueries({ queryKey: isStaff ? ['staff-orders'] : ['director-orders'] });
      if (!isStaff) await qc.invalidateQueries({ queryKey: ['director-stats'] });
      setSelectedOrder((prev) => prev ? { ...prev, status, ...(cancelReason ? { cancelReason } : {}) } : null);
      if (status === 'being_prepared') {
        const order = allOrders.find((o) => o.id === orderId) ?? selectedOrder;
        if (order) {
          const orderStore = stores.find((s) => s.id === order.storeId);
          const shouldAutoPrint = orderStore ? (orderStore.autoPrint !== false) : true;
          if (shouldAutoPrint) {
            await printOrder({ ...order, status });
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    }
  };
  const handleViewInvoice = async (order: ApiOrder) => {
    try {
      // Fetch HTML from custom endpoint → convert to PDF via expo-print (no browser URL).
      let html: string | null = null;
      if (order.id) {
        try {
          const resp = await fetch(getWholesaleInvoiceUrl(order.id));
          if (resp.ok) html = await resp.text();
        } catch { /* fall through */ }
      }

      if (!html) {
        const fallbackUrl = order.invoicePdfUrl ?? order.invoiceUrl;
        if (!fallbackUrl) {
          Alert.alert('Invoice Unavailable', 'This invoice is still being prepared.');
          return;
        }
        await Linking.openURL(fallbackUrl);
        return;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${order.id?.slice(0,8).toUpperCase() ?? ''}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      Alert.alert('Invoice Unavailable', getErrorMessage(error));
    }
  };
  const totalToday = drillFiltered.filter((o) => isSameDay(getOrderTimelineDate(o), today)).length;
  return (
    <DirectorTabScreen title="Orders">
      {/* ── Channel segmented control (director/manager only) ── */}
      {!isStaff && (
        <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', backgroundColor: BG, borderRadius: 12, padding: 3 }}>
            {[
              { key: 'app' as const, label: 'App & Wholesale' },
              { key: 'pos' as const, label: 'POS Terminal' },
            ].map(t => {
              const active = channelTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => { setChannelTab(t.key); Haptics.selectionAsync(); }}
                  style={[{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' }, active && { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? NAVY : MUTED }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {(channelTab === 'pos' && !isStaff) ? (
        <PosTabContent
          dayStr={posDayStr}
          onSetDay={setPosDayStr}
          posOrders={posData?.data ?? []}
          isLoading={posLoading}
          refreshing={refreshing}
          onRefresh={async () => { await posRefetch(); }}
        />
      ) : (
        <>
      {/* Drill-down banner */}
      {isDrillActive && drillLabel && (
        <View style={{ backgroundColor: '#EFF6FF', borderBottomWidth: 1, borderBottomColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
          <View style={{ backgroundColor: BLUE + '20', borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="filter" size={13} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: BLUE, letterSpacing: 0.5 }}>DRILL-DOWN ACTIVE</Text>
            <Text style={{ fontSize: 12, color: '#1E40AF', fontWeight: '500', marginTop: 1 }}>{drillLabel}</Text>
          </View>
          <Pressable
            onPress={() => {
              drillModeRef.current = null;
              router.replace('/(director)/orders' as any);
            }}
            style={{ padding: 4 }}
          >
            <Feather name="x" size={16} color={BLUE} />
          </Pressable>
        </View>
      )}
      {/* Status filter chips */}
      <View style={{ backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <FlatList
          horizontal
          data={FILTER_TABS}
          keyExtractor={(s) => s.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          renderItem={({ item }) => {
            const active = filter === item.key;
            const color = item.key === 'wholesale' ? GREEN : item.key === 'active' ? '#F59E0B' : BLUE;
            return (
              <Pressable
                onPress={() => { setFilter(item.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, { backgroundColor: active ? color : BG, borderColor: active ? color : BORDER }]}
              >
                <Text style={[{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : MUTED }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
      {/* Date view selector */}
      <View style={[styles.dateBar, { backgroundColor: BG, borderBottomColor: BORDER }]}>
        {([
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
              style={[styles.dateTab, { borderBottomWidth: 2, borderBottomColor: active ? BLUE : 'transparent' }]}
            >
              <Text style={[{ fontWeight: active ? '700' : '400', fontSize: 13, color: active ? BLUE : MUTED }]}>
                {m.key === 'date' && viewMode === 'date' ? fmtDateChip(selectedDate) : m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Date picker row (shown when Pick Date is active) */}
      {viewMode === 'date' && (
        <Pressable
          onPress={() => setShowCalendar(true)}
          style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="calendar" size={16} color={BLUE} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: BLUE }}>
              {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={MUTED} />
        </Pressable>
      )}
      {/* Content */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 0, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {(() => {
            // Resolve the active date-range bucket
            const [orders, title, emptyMsg, needsTopGap] = (() => {
              if (viewMode === 'today')  return [todayOrders,     "Today's Orders",                                                                       'No orders today yet',          false] as const;
              if (viewMode === 'week')   return [isDrillActive ? weekDrillOrders : thisWeekOrders,
                                                isDrillActive ? 'This Week (7 Days)' : (isStaff ? 'This Week' : 'Earlier This Week'),
                                                isDrillActive ? 'No orders this week' : 'No other orders this week',                                      true] as const;
              if (viewMode === 'month')  return [thisMonthOrders, new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),              'No orders this month yet',     true] as const;
              return                           [dateOrders,       fmtDateChip(selectedDate),                                                               'No orders on this date',       false] as const;
            })();

            // When "All" is selected, bucket by status section
            const sectionedGroups: Array<{ key: string; label: string; accentColor: string; items: ApiOrder[] }> =
              filter === 'all' && orders.length > 0
                ? (() => {
                    const map: Record<string, ApiOrder[]> = {};
                    for (const o of orders) {
                      const sk = getOrderSectionKey(o);
                      (map[sk] ??= []).push(o);
                    }
                    return ORDER_STATUS_SECTIONS
                      .map(s => ({ key: s.key, label: s.label, accentColor: s.accentColor, items: map[s.key] ?? [] }))
                      .filter(s => s.items.length > 0);
                  })()
                : [];

            const renderCard = (o: ApiOrder) => (
              <OrderCard
                key={o.id}
                order={o}
                onPress={() => { setSelectedOrder(o); Haptics.selectionAsync(); }}
                onPrint={() => printOrder(o)}
                printing={printingOrderId === o.id}
              />
            );

            return (
              <>
                {needsTopGap && <View style={{ height: 8 }} />}
                <OrdersSectionHeader title={title} count={orders.length} />
                {orders.length === 0 ? (
                  <View style={styles.emptySection}>
                    <Feather name="coffee" size={28} color={BORDER} />
                    <Text style={styles.emptyText}>{emptyMsg}</Text>
                  </View>
                ) : sectionedGroups.length > 0 ? (
                  sectionedGroups.map(group => (
                    <View key={group.key}>
                      {/* Status section header */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 }}>
                        <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: group.accentColor }} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 }}>
                          {group.label}
                        </Text>
                        <View style={{ backgroundColor: group.accentColor + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: group.accentColor }}>{group.items.length}</Text>
                        </View>
                      </View>
                      {group.items.map(renderCard)}
                      <View style={{ height: 8 }} />
                    </View>
                  ))
                ) : (
                  orders.map(renderCard)
                )}
              </>
            );
          })()}
        </ScrollView>
      )}
      {/* Order detail modal */}
      <OrderDetailModal
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
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error));
          }
        }}
        onPrintReceipt={() => selectedOrder ? printOrder(selectedOrder) : Promise.resolve()}
        onViewInvoice={() => selectedOrder ? handleViewInvoice(selectedOrder) : Promise.resolve()}
        printing={printingOrderId === selectedOrder?.id}
        canCancelRefund={canCancelRefund}
      />

      {/* Calendar date picker */}
      <CalendarModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        selectedDate={selectedDate}
        onSelectDate={(d) => setSelectedDate(d)}
        ordersByDate={ordersByDate}
      />
        </>
      )}
    </DirectorTabScreen>
  );
}
