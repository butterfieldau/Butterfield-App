import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PosHistoryOrder } from '@/lib/api';
import { useOffline } from '@/context/OfflineContext';
import PosPinModal from '@/components/PosPinModal';
import styles from './posStyles';
import { BLUE, BORDER, CHERRY, DARK, MID, MUTED, WHITE } from './types';
import { startLinklyStream } from './linklyStream';
import { sendLinklyReceiptPrint, sendReceiptPrint } from '@/lib/printer';
import type { LinklyStreamControl } from './linklyStream';
import { fmtCents } from './types';

type HistoryFilter = 'all' | 'active' | 'voided' | 'failed-print';

export default function HistoryModal({
  onClose, onVoidSuccess, storeData, isShopDisplay,
  printStatusMap, onUpdatePrintStatus, initialFilter,
}: {
  onClose: () => void;
  onVoidSuccess: (id: string) => void;
  storeData?: any;
  isShopDisplay?: boolean;
  printStatusMap?: Record<string, 'pending' | 'printed' | 'failed'>;
  onUpdatePrintStatus?: (orderId: string, status: 'pending' | 'printed' | 'failed') => void;
  initialFilter?: HistoryFilter;
}) {
  const queryClient = useQueryClient();
  const { failedItems, retryItem, dismissItem } = useOffline();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(initialFilter ?? 'all');
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  const [reprintingAll, setReprintingAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['pos-history'],
    queryFn: ({ pageParam }) => api.pos.ordersPage({ cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
  });

  const allOrders: PosHistoryOrder[] = data?.pages.flatMap(p => p.data) ?? [];

  const sydneyDateKey = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

  const todayKey = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const yesterdayKey = new Date(now - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

  const fmtDayLabel = (dateKey: string): string => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const voidMutation = useMutation({
    mutationFn: (vars: { id: string; supervisorPin: string }) => api.pos.voidOrder(vars.id, vars.supervisorPin),
    onSuccess: (_, vars) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Voided', 'Transaction has been voided.');
      onVoidSuccess(vars.id);
      queryClient.invalidateQueries({ queryKey: ['pos-history'] });
      refetch();
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).');
    },
  });

  const [pinForVoid, setPinForVoid] = useState<PosHistoryOrder | null>(null);
  const [pinForRefund, setPinForRefund] = useState<{ order: PosHistoryOrder; reason?: string } | null>(null);

  const [refundLinklyStep, setRefundLinklyStep] = useState<'idle' | 'initiating' | 'waiting' | 'approved' | 'declined'>('idle');
  const [refundLinklySessionId, setRefundLinklySessionId] = useState<string | null>(null);
  const [refundLinklyText, setRefundLinklyText] = useState('');
  const refundLinklyPollRef = useRef<LinklyStreamControl | null>(null);
  const refundReceiptPrintedRef = useRef<Set<string>>(new Set());
  const [pendingRefundPayload, setPendingRefundPayload] = useState<{ orderId: string; amountCents: number; reason?: string } | null>(null);

  const stopRefundLinklyPoll = () => {
    if (refundLinklyPollRef.current) { refundLinklyPollRef.current.cancel(); refundLinklyPollRef.current = null; }
  };

  const resetRefundLinklyState = () => {
    stopRefundLinklyPoll();
    setRefundLinklyStep('idle');
    setRefundLinklySessionId(null);
    setRefundLinklyText('');
    setPendingRefundPayload(null);
  };

  const handleRefundLinklyCancel = async () => {
    if (refundLinklySessionId) { try { await api.pos.linklyCancel(refundLinklySessionId); } catch {} }
    resetRefundLinklyState();
  };

  const refundMutation = useMutation({
    mutationFn: (vars: { orderId: string; amountCents: number; reason?: string; supervisorPin?: string; linklySessionId?: string }) =>
      api.pos.refundOrder(vars.orderId, { amountCents: vars.amountCents, reason: vars.reason, supervisorPin: vars.supervisorPin, linklySessionId: vars.linklySessionId }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const { isFullRefund, refundAmountCents } = res as any;
      resetRefundLinklyState();
      Alert.alert('Refund Issued', `${isFullRefund ? 'Full' : 'Partial'} refund of ${fmtCents(refundAmountCents)} processed.`);
      queryClient.invalidateQueries({ queryKey: ['pos-history'] });
      refetch();
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      resetRefundLinklyState();
      Alert.alert('Refund Failed', err?.message ?? 'Could not process refund.');
    },
  });

  const handleRefund = (order: PosHistoryOrder) => {
    Alert.alert(
      'Issue Refund',
      `Refund order #${order.orderNumber} (${fmtCents(order.totalCents)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Full Refund', style: 'destructive', onPress: () => setPinForRefund({ order, reason: 'Full refund' }) },
      ],
    );
  };

  const filteredOrders = useMemo(() => {
    if (filter === 'active') return allOrders.filter(o => o.status !== 'cancelled');
    if (filter === 'voided') return allOrders.filter(o => o.status === 'cancelled');
    if (filter === 'failed-print') return allOrders.filter(o => (printStatusMap?.[o.id] ?? 'pending') === 'failed');
    return allOrders;
  }, [allOrders, filter, printStatusMap]);

  const countActive = allOrders.filter(o => o.status !== 'cancelled').length;
  const countVoided = allOrders.filter(o => o.status === 'cancelled').length;
  const countFailedPrint = allOrders.filter(o => (printStatusMap?.[o.id] ?? 'pending') === 'failed').length;

  const todayOrders = useMemo(() => allOrders.filter(o => sydneyDateKey(o.createdAt) === todayKey), [allOrders, todayKey]);
  const todayRevenue = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0);
  const todayCountActive = todayOrders.filter(o => o.status !== 'cancelled').length;
  const todayCountVoided = todayOrders.filter(o => o.status === 'cancelled').length;

  type ListRow =
    | { type: 'header'; dateKey: string; label: string; count: number; revenueCents: number }
    | { type: 'item'; order: PosHistoryOrder };

  const listData = useMemo((): ListRow[] => {
    const groups = new Map<string, PosHistoryOrder[]>();
    for (const order of filteredOrders) {
      const key = sydneyDateKey(order.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }
    const rows: ListRow[] = [];
    for (const [dateKey, orders] of groups) {
      const label = dateKey === todayKey ? 'Today' : dateKey === yesterdayKey ? 'Yesterday' : fmtDayLabel(dateKey);
      const count = orders.filter(o => o.status !== 'cancelled').length;
      const revenueCents = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0);
      rows.push({ type: 'header', dateKey, label, count, revenueCents });
      for (const order of orders) rows.push({ type: 'item', order });
    }
    return rows;
  }, [filteredOrders, todayKey, yesterdayKey]);

  const handleReprint = async (order: PosHistoryOrder) => {
    const store = storeData as any;
    if (!store?.printerIp) { Alert.alert('No Printer', 'Configure a printer IP in Settings to reprint receipts.'); return; }
    setReprintingId(order.id);
    onUpdatePrintStatus?.(order.id, 'pending');
    const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
    try {
      await sendReceiptPrint({
        orderId: order.id, customerName: order.customerName ?? 'Customer', type: 'pickup',
        items: order.items.map(i => {
          const pi = i as typeof i & { selectedOptions?: Array<{ optionName?: string | null; textValue?: string | null }>; notes?: string | null };
          const unitPriceCents = i.unitPriceCents ?? (pi as any).unitCents ?? (pi as any).lineCents ?? (pi as any).basePriceCents ?? 0;
          return { name: i.productName, quantity: i.quantity, unitPriceCents, variantName: i.variantName ?? undefined, options: (pi.selectedOptions ?? []).map((o: any) => o.optionName ?? o.textValue ?? '').filter(Boolean) as string[], notes: pi.notes?.trim() || undefined };
        }),
        totalCents: order.totalCents, discountCents: order.discountCents, surchargeCents: order.surchargeCents,
        notes: order.notes?.trim() || undefined, printerBrand: (store.printerBrand ?? 'epson') as 'epson' | 'star', paymentMethod: order.paymentMethod,
      }, store.printerIp, store.printerPort ?? 9100, fetchBytes as Parameters<typeof sendReceiptPrint>[3]);
      onUpdatePrintStatus?.(order.id, 'printed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      onUpdatePrintStatus?.(order.id, 'failed');
      Alert.alert('Print Failed', e?.message ?? 'Could not reach printer.');
    } finally {
      setReprintingId(null);
    }
  };

  const handleReprintAll = async () => {
    const failedOrders = allOrders.filter(o => (printStatusMap?.[o.id] ?? 'pending') === 'failed');
    if (!failedOrders.length) return;
    setReprintingAll(true);
    for (const order of failedOrders) { try { await handleReprint(order); } catch {} }
    setReprintingAll(false);
  };

  const statusColor = (s: string) => {
    if (s === 'cancelled') return CHERRY;
    if (s === 'received' || s === 'preparing') return '#F59E0B';
    return '#16A34A';
  };

  const statusLabel = (s: string) => {
    if (s === 'cancelled') return 'Voided';
    if (s === 'received') return 'Received';
    if (s === 'preparing') return 'Preparing';
    if (s === 'ready') return 'Ready';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const fmtTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso));
    } catch { return ''; }
  };

  const canVoid = (order: PosHistoryOrder) => order.status !== 'cancelled' && now - new Date(order.createdAt).getTime() < 5 * 60 * 1000;

  const FILTER_CHIPS: { key: HistoryFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allOrders.length },
    { key: 'active', label: 'Active', count: countActive },
    { key: 'voided', label: 'Voided', count: countVoided },
    ...(countFailedPrint > 0 ? [{ key: 'failed-print' as HistoryFilter, label: 'Print Failed', count: countFailedPrint }] : []),
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Text style={styles.sheetTitle}>Sales History</Text>
            {filter === 'failed-print' && countFailedPrint > 0 && (
              <TouchableOpacity
                onPress={handleReprintAll}
                disabled={reprintingAll}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${CHERRY}18`, borderWidth: 1, borderColor: `${CHERRY}40`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                activeOpacity={0.75}
              >
                {reprintingAll ? <ActivityIndicator size="small" color={CHERRY} /> : <Feather name="printer" size={13} color={CHERRY} />}
                <Text style={{ color: CHERRY, fontSize: 12, fontWeight: '700' }}>{reprintingAll ? 'Reprinting…' : `Reprint all (${countFailedPrint})`}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Pressable onPress={() => refetch()} hitSlop={12} disabled={isRefetching}>
            <Feather name="refresh-cw" size={18} color={isRefetching ? MUTED : BLUE} />
          </Pressable>
        </View>

        <View style={styles.historySummaryBar}>
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Today's Sales</Text>
            <Text style={styles.historySummaryValue}>{todayCountActive}</Text>
          </View>
          <View style={styles.historySummaryDivider} />
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Today's Revenue</Text>
            <Text style={styles.historySummaryValue}>{fmtCents(todayRevenue)}</Text>
          </View>
          <View style={styles.historySummaryDivider} />
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Today's Voids</Text>
            <Text style={[styles.historySummaryValue, { color: CHERRY }]}>{todayCountVoided}</Text>
          </View>
        </View>

        <View style={styles.historyFilterRow}>
          {FILTER_CHIPS.map(chip => (
            <Pressable key={chip.key} onPress={() => setFilter(chip.key)} style={[styles.historyFilterChip, filter === chip.key && styles.historyFilterChipActive]}>
              <Text style={[styles.historyFilterChipText, filter === chip.key && styles.historyFilterChipTextActive]}>{chip.label}</Text>
              <View style={[styles.historyFilterCount, filter === chip.key && styles.historyFilterCountActive]}>
                <Text style={[styles.historyFilterCountText, filter === chip.key && styles.historyFilterCountTextActive]}>{chip.count}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {failedItems.length > 0 && (
          <View style={styles.failedSyncSection}>
            <View style={styles.failedSyncHeader}>
              <Feather name="alert-circle" size={15} color={CHERRY} />
              <Text style={styles.failedSyncTitle}>Sync Failed ({failedItems.length})</Text>
            </View>
            <Text style={styles.failedSyncSubtitle}>These orders could not be submitted. Retry or dismiss each one.</Text>
            {failedItems.map(item => (
              <View key={item.idempotencyKey} style={styles.failedSyncRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.failedSyncItems} numberOfLines={1}>{item.itemSummary || 'Order'}</Text>
                  <Text style={styles.failedSyncMeta}>{fmtCents(item.totalCents)}{item.customerName ? ` · ${item.customerName}` : ''}{item.syncError ? ` · ${item.syncError}` : ''}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => retryItem(item.idempotencyKey)} style={styles.failedSyncRetryBtn}>
                    <Text style={styles.failedSyncRetryText}>Retry</Text>
                  </Pressable>
                  <Pressable onPress={() => dismissItem(item.idempotencyKey)} style={styles.failedSyncDismissBtn}>
                    <Text style={styles.failedSyncDismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
            <Feather name="inbox" size={48} color={MUTED} />
            <Text style={{ color: MID, fontSize: 16, fontWeight: '600' }}>{allOrders.length === 0 ? 'No transactions today' : `No ${filter} transactions`}</Text>
            <Text style={{ color: MUTED, textAlign: 'center', fontSize: 14 }}>{allOrders.length === 0 ? 'POS sales will appear here as they are completed.' : 'Try a different filter above.'}</Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={row => row.type === 'header' ? `hdr-${row.dateKey}` : row.order.id}
            contentContainerStyle={{ padding: 12, gap: 0 }}
            showsVerticalScrollIndicator={false}
            onRefresh={refetch}
            refreshing={isRefetching}
            renderItem={({ item: row }) => {
              if (row.type === 'header') {
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 14, paddingBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: MID, letterSpacing: 0.3 }}>{row.label}</Text>
                    <Text style={{ fontSize: 12, color: MUTED }}>{row.count} sale{row.count !== 1 ? 's' : ''}  ·  {fmtCents(row.revenueCents)}</Text>
                  </View>
                );
              }
              const item = row.order;
              const expanded = expandedId === item.id;
              const voidable = canVoid(item);
              const isVoiding = voidMutation.isPending && voidMutation.variables?.id === item.id;
              return (
                <View style={[styles.historyRow, item.status === 'cancelled' && styles.historyRowVoided]}>
                  <Pressable onPress={() => setExpandedId(expanded ? null : item.id)} style={styles.historyRowHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.historyOrderNum}>#{item.orderNumber}</Text>
                        <View style={[styles.historyStatusBadge, { backgroundColor: statusColor(item.status) + '22' }]}>
                          <Text style={[styles.historyStatusText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
                        </View>
                        {(printStatusMap?.[item.id] === 'failed') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${CHERRY}18`, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Feather name="printer" size={10} color={CHERRY} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: CHERRY }}>Print failed</Text>
                          </View>
                        )}
                        {(printStatusMap?.[item.id] === 'printed') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#16A34A18', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Feather name="check" size={10} color="#16A34A" />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#16A34A' }}>Printed</Text>
                          </View>
                        )}
                        {(printStatusMap?.[item.id] === 'pending') && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B18', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <ActivityIndicator size="small" color="#F59E0B" style={{ transform: [{ scale: 0.6 }] }} />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#F59E0B' }}>Printing…</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Feather name="clock" size={11} color={MUTED} />
                        <Text style={styles.historyMeta}>{fmtTime(item.createdAt)}</Text>
                        {item.customerName && (
                          <><Text style={styles.historyMetaDot}>·</Text><Feather name="user" size={11} color={MUTED} /><Text style={styles.historyMeta}>{item.customerName}</Text></>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.historyTotal, item.status === 'cancelled' && { color: MUTED, textDecorationLine: 'line-through' }]}>{fmtCents(item.totalCents)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name={item.paymentMethod === 'cash' ? 'dollar-sign' : 'credit-card'} size={12} color={MUTED} />
                        <Text style={styles.historyPayMethod}>{item.paymentMethod === 'cash' ? 'Cash' : 'EFTPOS'}</Text>
                      </View>
                    </View>
                    <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={MUTED} style={{ marginLeft: 8 }} />
                  </Pressable>

                  {expanded && (
                    <View style={styles.historyItemsSection}>
                      {item.items.map((li, idx) => (
                        <View key={idx} style={styles.historyLineItem}>
                          <Text style={styles.historyLineQty}>{li.quantity}×</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyLineName}>{li.productName}{li.variantName ? ` (${li.variantName})` : ''}</Text>
                            {(li as any).notes ? <Text style={styles.historyLineNote}>{(li as any).notes}</Text> : null}
                          </View>
                          <Text style={styles.historyLinePrice}>{fmtCents(((li as any).unitPriceCents ?? (li as any).unitCents ?? (li as any).totalPriceCents ?? (li as any).lineCents ?? (li as any).basePriceCents ?? 0) * li.quantity)}</Text>
                        </View>
                      ))}
                      {item.notes && <Text style={styles.historyOrderNote}>Note: {item.notes}</Text>}

                      {(item.surchargeCents > 0 || (item as any).splitPayments) && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, gap: 4 }}>
                          {item.surchargeCents > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={styles.historyLineNote}>Surcharge</Text>
                              <Text style={[styles.historyLineNote, { color: '#EA580C' }]}>+{fmtCents(item.surchargeCents)}</Text>
                            </View>
                          )}
                          {(item as any).splitPayments?.length > 0 && (
                            <View style={{ gap: 2 }}>
                              {(item as any).splitPayments.map((sp: any, si: number) => (
                                <View key={si} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                  <Text style={styles.historyLineNote}>{sp.method === 'cash' ? 'Cash' : 'EFTPOS'}</Text>
                                  <Text style={styles.historyLineNote}>{fmtCents(sp.amountCents)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.historyVoidRow}>
                        <TouchableOpacity
                          onPress={() => { Haptics.selectionAsync(); handleReprint(item); }}
                          disabled={reprintingId === item.id}
                          style={[styles.historyReprintBtn, printStatusMap?.[item.id] === 'failed' && { backgroundColor: `${CHERRY}12`, borderColor: `${CHERRY}50` }]}
                          activeOpacity={0.8}
                        >
                          {reprintingId === item.id ? <ActivityIndicator size="small" color={printStatusMap?.[item.id] === 'failed' ? CHERRY : BLUE} /> : <Feather name="printer" size={13} color={printStatusMap?.[item.id] === 'failed' ? CHERRY : BLUE} />}
                          <Text style={[styles.historyReprintBtnText, printStatusMap?.[item.id] === 'failed' && { color: CHERRY, fontWeight: '700' }]}>{printStatusMap?.[item.id] === 'failed' ? 'Retry print' : 'Reprint'}</Text>
                        </TouchableOpacity>

                        {item.status !== 'cancelled' && voidable && (
                          <TouchableOpacity onPress={() => setPinForVoid(item)} style={styles.historyVoidBtn} disabled={isVoiding} activeOpacity={0.8}>
                            {isVoiding ? <ActivityIndicator size="small" color={WHITE} /> : <><Feather name="x-circle" size={13} color={WHITE} /><Text style={styles.historyVoidBtnText}>Void</Text></>}
                          </TouchableOpacity>
                        )}
                        {item.status !== 'cancelled' && !voidable && (
                          <Text style={styles.historyVoidExpired}>Void window expired</Text>
                        )}
                        {item.status !== 'cancelled' && !voidable && (
                          <TouchableOpacity
                            onPress={() => handleRefund(item)}
                            style={styles.historyRefundBtn}
                            disabled={refundMutation.isPending && (refundMutation.variables as any)?.orderId === item.id}
                            activeOpacity={0.8}
                          >
                            {refundMutation.isPending && (refundMutation.variables as any)?.orderId === item.id ? <ActivityIndicator size="small" color={WHITE} /> : <><Feather name="rotate-ccw" size={13} color={WHITE} /><Text style={styles.historyRefundBtnText}>Refund</Text></>}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
            ListFooterComponent={
              hasNextPage ? (
                <TouchableOpacity onPress={() => fetchNextPage()} disabled={isFetchingNextPage} style={styles.loadMoreBtn} activeOpacity={0.8}>
                  {isFetchingNextPage ? <ActivityIndicator size="small" color={BLUE} /> : <Text style={styles.loadMoreText}>Load older transactions</Text>}
                </TouchableOpacity>
              ) : null
            }
          />
        )}

        {pinForRefund && (
          <PosPinModal
            onClose={() => setPinForRefund(null)}
            onSuccess={async (pin) => {
              const { order, reason } = pinForRefund;
              setPinForRefund(null);
              if (order.paymentMethod === 'eftpos') {
                setRefundLinklyStep('initiating');
                setRefundLinklyText('Connecting to terminal…');
                setPendingRefundPayload({ orderId: order.id, amountCents: order.totalCents, reason });
                try {
                  const res = await api.pos.linklyInitiateRefund(order.id, order.totalCents, pin);
                  const sessionId = (res as any)?.data?.sessionId as string;
                  if (!sessionId) throw new Error('No session ID returned from terminal.');
                  setRefundLinklySessionId(sessionId);
                  setRefundLinklyStep('waiting');
                  setRefundLinklyText('Present the original card to the terminal');
                  refundLinklyPollRef.current = startLinklyStream(sessionId, (text) => setRefundLinklyText(text), (d) => {
                    refundLinklyPollRef.current = null;
                    if (d.approved) {
                      setRefundLinklyStep('approved');
                      setRefundLinklyText('Refund approved');
                      if (!refundReceiptPrintedRef.current.has(sessionId)) {
                        refundReceiptPrintedRef.current.add(sessionId);
                        if (d.receiptText && storeData?.autoPrint && storeData?.printerIp) {
                          const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
                          sendLinklyReceiptPrint({ lines: (d.receiptText as string).split('\n'), printerBrand: storeData?.printerBrand ?? 'epson' }, storeData.printerIp, storeData.printerPort ?? 9100, fetchBytes).catch(() => {});
                        }
                        refundMutation.mutate({ orderId: order.id, amountCents: order.totalCents, reason, linklySessionId: sessionId });
                      }
                    } else {
                      setRefundLinklyStep('declined');
                      setRefundLinklyText(d.responseText || 'Declined by terminal');
                    }
                  }, undefined, () => { refundLinklyPollRef.current = null; setRefundLinklyStep('declined'); setRefundLinklyText('Refund timed out — please retry.'); });
                } catch (err: any) {
                  setRefundLinklyStep('declined');
                  setRefundLinklyText(err?.message ?? 'Could not reach Linkly terminal.');
                }
              } else {
                refundMutation.mutate({ orderId: order.id, amountCents: order.totalCents, reason, supervisorPin: pin });
              }
            }}
          />
        )}

        {pinForVoid && (
          <PosPinModal
            onClose={() => setPinForVoid(null)}
            onSuccess={(pin) => { const order = pinForVoid; setPinForVoid(null); voidMutation.mutate({ id: order.id, supervisorPin: pin }); }}
          />
        )}

        {refundLinklyStep !== 'idle' && (
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 24, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <View style={[styles.eftposInstructions, { width: '100%' }]}>
              {(refundLinklyStep === 'initiating' || refundLinklyStep === 'waiting') && (
                <>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.eftposText}>{refundLinklyText || 'Connecting…'}</Text>
                  <Text style={styles.eftposSubText}>Present the original card to the terminal</Text>
                  <TouchableOpacity onPress={handleRefundLinklyCancel} style={[styles.presetBtn, { borderColor: '#FECACA', backgroundColor: '#FFF1F2' }]} activeOpacity={0.75}>
                    <Text style={[styles.presetBtnText, { color: CHERRY }]}>Cancel Refund</Text>
                  </TouchableOpacity>
                </>
              )}
              {refundLinklyStep === 'approved' && (
                <><Feather name="check-circle" size={44} color="#16A34A" /><Text style={[styles.eftposText, { color: '#16A34A' }]}>Refund Approved</Text><Text style={styles.eftposSubText}>Processing…</Text></>
              )}
              {refundLinklyStep === 'declined' && (
                <>
                  <Feather name="x-circle" size={44} color={CHERRY} />
                  <Text style={[styles.eftposText, { color: CHERRY }]}>Refund Declined</Text>
                  {!!refundLinklyText && <Text style={styles.eftposSubText}>{refundLinklyText}</Text>}
                  <TouchableOpacity onPress={resetRefundLinklyState} style={styles.presetBtn} activeOpacity={0.75}>
                    <Text style={styles.presetBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

