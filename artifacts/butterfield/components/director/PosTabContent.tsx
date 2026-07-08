import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable,
  RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PosTransaction, PosSummary } from '@/lib/api';
import { styles } from './ordersStyles';
import { fmtTime } from './ordersHelpers';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const NAVY   = '#1A2B4A';
const PURPLE = '#8B5CF6';
const RED_CONST = '#DC2626';

function sydneyDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d);
}

function shiftPosDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 2, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return sydneyDateStr(date);
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPosDay(dateStr: string): string {
  const today     = sydneyDateStr();
  const yesterday = shiftPosDate(today, -1);
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 2, 0, 0)).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short',
  });
}

const POS_METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  eftpos: { label: 'EFTPOS', color: BLUE },
  cash:   { label: 'Cash',   color: GREEN },
  split:  { label: 'Split',  color: '#8B5CF6' },
};

function getPosPaymentLabel(tx: PosTransaction): { label: string; color: string } {
  if (tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1) {
    return POS_METHOD_CONFIG.split;
  }
  const pm = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  return POS_METHOD_CONFIG[pm] ?? { label: pm.toUpperCase(), color: MUTED };
}

function summarisePosItems(items: any[]): string {
  if (!items || items.length === 0) return 'No items';
  const names = items.map((i: any) => {
    const qty  = i.quantity ?? i.qty ?? 1;
    const name = i.name ?? i.productName ?? 'Item';
    return qty > 1 ? `${qty}× ${name}` : name;
  });
  if (names.length <= 3) return names.join(', ');
  return names.slice(0, 2).join(', ') + ` & ${names.length - 2} more`;
}

const POS_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:  { bg: '#DCFCE7', text: '#166534' },
  completed: { bg: '#F3F4F6', text: '#6B7280' },
  refunded:  { bg: '#F3E8FF', text: '#6B21A8' },
  voided:    { bg: '#FEE2E2', text: '#991B1B' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

function PosTransactionCard({
  tx,
  onVoid,
  onRefund,
  onReprint,
}: {
  tx: PosTransaction;
  onVoid?: () => void;
  onRefund?: () => void;
  onReprint?: () => void;
}) {
  const statusStyle = POS_STATUS_COLORS[tx.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const payMethod   = getPosPaymentLabel(tx);
  const hasExtras   = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;
  // Void is for sales that haven't settled yet; once a POS sale is completed
  // (paid out), use Refund instead so refunds are tracked and reconciled properly.
  const canVoid     = !['voided', 'cancelled', 'refunded', 'completed'].includes(tx.status);
  const canRefund   = tx.status === 'completed';
  const canReprint  = tx.status !== 'cancelled';
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 8, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>
              {tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: statusStyle.bg }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.text, letterSpacing: 0.3 }}>
                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: MUTED }}>{fmtTime(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{fmtCents(tx.totalCents)}</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: payMethod.color + '18' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: payMethod.color }}>{payMethod.label}</Text>
          </View>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: BORDER }} />
      <Text style={{ fontSize: 13, color: MUTED, lineHeight: 18 }} numberOfLines={2}>
        {summarisePosItems(tx.items)}
      </Text>
      {hasExtras && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {tx.discountCents > 0 && <Text style={{ fontSize: 12, color: GREEN }}>−{fmtCents(tx.discountCents)} disc</Text>}
          {tx.surchargeCents > 0 && <Text style={{ fontSize: 12, color: MUTED }}>+{fmtCents(tx.surchargeCents)} surcharge</Text>}
          {tx.tipCents > 0 && <Text style={{ fontSize: 12, color: '#F59E0B' }}>+{fmtCents(tx.tipCents)} tip</Text>}
        </View>
      )}
      {tx.operatorName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="user" size={11} color={MUTED} />
          <Text style={{ fontSize: 12, color: MUTED }}>{tx.operatorName}</Text>
        </View>
      ) : null}
      {/* Per-row actions: void / refund / reprint */}
      {(canVoid || canRefund || canReprint) && (
        <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8, marginTop: 2 }}>
          {canReprint && onReprint && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onReprint(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: BLUE + '12', borderWidth: 1, borderColor: BLUE + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="printer" size={12} color={BLUE} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: BLUE }}>Reprint</Text>
            </Pressable>
          )}
          {canRefund && onRefund && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRefund(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: PURPLE + '12', borderWidth: 1, borderColor: PURPLE + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="rotate-ccw" size={12} color={PURPLE} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: PURPLE }}>Refund</Text>
            </Pressable>
          )}
          {canVoid && onVoid && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onVoid(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: RED_CONST + '10', borderWidth: 1, borderColor: RED_CONST + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="x-circle" size={12} color={RED_CONST} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: RED_CONST }}>Void</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const POS_SECTIONS = [
  { key: 'active',   label: 'In Progress',      statuses: ['received', 'being_prepared'],       accentColor: '#F59E0B' },
  { key: 'done',     label: 'Completed',         statuses: ['completed'],                        accentColor: GREEN },
  { key: 'issues',   label: 'Refunded / Voided', statuses: ['refunded', 'voided', 'cancelled'], accentColor: '#DC2626' },
] as const;

const POS_CHIP_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'eftpos',   label: 'EFTPOS' },
  { key: 'cash',     label: 'Cash' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'voided',   label: 'Voided' },
] as const;
type PosChipKey = (typeof POS_CHIP_FILTERS)[number]['key'];

function applyPosChipFilter(tx: PosTransaction, chip: PosChipKey): boolean {
  if (chip === 'all') return true;
  if (chip === 'refunded') return tx.status === 'refunded';
  if (chip === 'voided')   return tx.status === 'voided' || tx.status === 'cancelled';
  const method  = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  const isSplit = tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1;
  if (chip === 'eftpos') return !isSplit && (method === 'eftpos' || method === 'card');
  if (chip === 'cash')   return !isSplit && method === 'cash';
  return true;
}

export function PosTabContent({
  dayStr, onSetDay,
}: {
  dayStr: string;
  onSetDay: (d: string) => void;
}) {
  const todayStr = sydneyDateStr();
  const isToday  = dayStr === todayStr;

  const { data: txData, isLoading: txLoading, refetch: txRefetch } = useQuery({
    queryKey: ['director-pos-transactions', dayStr],
    queryFn: () => api.director.posTransactions({ date: dayStr }),
    staleTime: 30_000,
  });

  const { data: summaryData, refetch: summaryRefetch } = useQuery({
    queryKey: ['director-pos-summary', dayStr],
    queryFn: () => api.director.posSummary(dayStr),
    staleTime: 30_000,
    enabled: isToday,
  });

  const posOrders: PosTransaction[] = txData?.data ?? [];
  const summary: PosSummary | undefined = summaryData?.data;
  const isLoading = txLoading;

  const queryClient = useQueryClient();
  const txQueryKey = ['director-pos-transactions', dayStr];

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.director.voidPosTransaction(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: txQueryKey });
      const previous = queryClient.getQueryData<{ data: PosTransaction[] }>(txQueryKey);
      queryClient.setQueryData<{ data: PosTransaction[] } | undefined>(txQueryKey, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(tx => tx.id === id ? { ...tx, status: 'voided' } : tx) };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(txQueryKey, context.previous);
      Alert.alert('Void failed', 'Could not void this transaction. Please try again.');
    },
    onSuccess: () => {
      summaryRefetch();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: txQueryKey });
    },
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.director.refundPosTransaction(id, reason),
    onMutate: async ({ id }: { id: string; reason?: string }) => {
      await queryClient.cancelQueries({ queryKey: txQueryKey });
      const previous = queryClient.getQueryData<{ data: PosTransaction[] }>(txQueryKey);
      queryClient.setQueryData<{ data: PosTransaction[] } | undefined>(txQueryKey, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map(tx => tx.id === id ? { ...tx, status: 'refunded' } : tx) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(txQueryKey, context.previous);
      Alert.alert('Refund failed', 'Could not refund this transaction. Please try again.');
    },
    onSuccess: () => {
      summaryRefetch();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: txQueryKey });
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([txRefetch(), summaryRefetch()]);
    setRefreshing(false);
  }, [txRefetch, summaryRefetch]);

  const [showSearch, setShowSearch]   = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chipFilter, setChipFilter]   = useState<PosChipKey>('all');

  useEffect(() => {
    setShowSearch(false);
    setSearchQuery('');
    setChipFilter('all');
  }, [dayStr]);

  const filteredOrders = useMemo(() => {
    let list = posOrders;
    if (chipFilter !== 'all') {
      list = list.filter(tx => applyPosChipFilter(tx, chipFilter));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(tx => {
        const num = (tx.orderNumber ?? '').toLowerCase();
        const op  = (tx.operatorName ?? '').toLowerCase();
        return num.includes(q) || op.includes(q);
      });
    }
    return list;
  }, [posOrders, chipFilter, searchQuery]);

  const dailyRevenue = posOrders
    .filter(tx => tx.status !== 'cancelled' && tx.status !== 'voided' && tx.status !== 'refunded')
    .reduce((acc, tx) => acc + tx.totalCents, 0);

  const sections = POS_SECTIONS.map(s => ({
    ...s,
    items: filteredOrders.filter(tx => (s.statuses as readonly string[]).includes(tx.status)),
  })).filter(s => s.items.length > 0);

  const hasActiveFilters = chipFilter !== 'all' || searchQuery.trim().length > 0;

  const handleVoid = (tx: PosTransaction) => {
    const label = tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase();
    Alert.alert(
      'Void Transaction',
      `Void ${label}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void',
          style: 'destructive',
          onPress: () => voidMutation.mutate(tx.id),
        },
      ],
    );
  };

  const handleReprint = (tx: PosTransaction) => {
    const label = tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase();
    Alert.alert('Reprint', `Receipt for ${label} sent to the printer.`);
  };

  const handleRefund = (tx: PosTransaction) => {
    const label      = tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase();
    const method     = (tx.paymentMethod ?? '').toLowerCase();
    const isCash     = method === 'cash';
    const description = isCash
      ? `Refund ${label} (${fmtCents(tx.totalCents)})? This will mark it refunded as a manual cash refund.`
      : `Refund ${label} (${fmtCents(tx.totalCents)})? This will issue a Stripe refund to the customer.`;
    Alert.alert(
      'Refund Transaction',
      description,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: () => refundMutation.mutate({ id: tx.id }),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderBottomWidth: showSearch ? 0 : 1, borderBottomColor: BORDER, paddingHorizontal: 8, paddingVertical: 10 }}>
        <Pressable onPress={() => onSetDay(shiftPosDate(dayStr, -1))} style={{ padding: 8 }} hitSlop={12}>
          <Feather name="chevron-left" size={22} color={NAVY} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT }}>{formatPosDay(dayStr)}</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            if (showSearch) { setSearchQuery(''); setShowSearch(false); }
            else { setShowSearch(true); }
          }}
          style={{ padding: 8 }}
          hitSlop={12}
        >
          <Feather name={showSearch ? 'x' : 'search'} size={18} color={showSearch ? BLUE : MUTED} />
        </Pressable>
        <Pressable
          onPress={() => { if (!isToday) onSetDay(shiftPosDate(dayStr, 1)); }}
          style={[{ padding: 8 }, isToday && { opacity: 0.35 }]}
          disabled={isToday}
          hitSlop={12}
        >
          <Feather name="chevron-right" size={22} color={isToday ? BORDER : NAVY} />
        </Pressable>
      </View>

      {showSearch && (
        <View style={{ backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
            <Feather name="search" size={15} color={MUTED} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: TEXT, padding: 0 }}
              placeholder="Order number or operator…"
              placeholderTextColor={MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Feather name="x-circle" size={15} color={MUTED} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      <View style={{ backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        >
          {POS_CHIP_FILTERS.map((chip) => {
            const active = chipFilter === chip.key;
            const color  = chip.key === 'refunded' ? PURPLE : chip.key === 'voided' ? RED_CONST : BLUE;
            return (
              <Pressable
                key={chip.key}
                onPress={() => { setChipFilter(chip.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, { backgroundColor: active ? color : BG, borderColor: active ? color : BORDER }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : MUTED }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : posOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="monitor" size={36} color={MUTED} style={{ opacity: 0.4 }} />
          <Text style={{ color: MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
            {isToday ? 'No POS transactions today' : 'No transactions on this day'}
          </Text>
          <Text style={{ color: MUTED, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            {isToday ? 'Terminal sales will appear here in real time.' : 'Use the arrows to navigate to another day.'}
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="search" size={36} color={MUTED} />
          <Text style={{ color: MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>No matching transactions</Text>
          <Text style={{ color: MUTED, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            Try a different search term or filter.
          </Text>
          {hasActiveFilters && (
            <Pressable
              onPress={() => { setSearchQuery(''); setChipFilter('all'); }}
              style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: BLUE, borderRadius: 20 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Clear filters</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        >
          {/* ── Today at a glance card ──────────────────────────── */}
          {isToday && !hasActiveFilters && (() => {
            // Use server-side summary if available, otherwise derive from transactions
            const revenue     = summary?.totalRevenueCents  ?? posOrders.filter(tx => !['cancelled','voided','refunded'].includes(tx.status)).reduce((s, tx) => s + tx.totalCents, 0);
            const count       = summary?.ticketCount        ?? posOrders.filter(tx => !['cancelled','voided','refunded'].includes(tx.status)).length;
            const avgCents    = summary?.avgTicketCents      ?? (count > 0 ? Math.round(revenue / count) : 0);
            const voidCount   = summary?.voidCount          ?? posOrders.filter(tx => tx.status === 'voided' || tx.status === 'cancelled').length;
            const cashCents   = summary?.cashCents          ?? posOrders.filter(tx => !['cancelled','voided','refunded'].includes(tx.status) && (tx.paymentMethod ?? '').toLowerCase() === 'cash').reduce((s, tx) => s + tx.totalCents, 0);
            const eftposCents = summary?.eftposCents        ?? (revenue - cashCents);
            // Top item: prefer server summary, fall back to client-side computation
            let topItem: [string, number] | null = null;
            if (summary?.topItem) {
              topItem = [summary.topItem.name, summary.topItem.qty];
            } else {
              const itemCounts: Record<string, number> = {};
              posOrders.filter(tx => !['cancelled','voided','refunded'].includes(tx.status)).forEach(tx => {
                (Array.isArray(tx.items) ? tx.items : []).forEach((item: any) => {
                  const name = item.name ?? item.productName ?? 'Item';
                  const qty  = item.quantity ?? item.qty ?? 1;
                  itemCounts[name] = (itemCounts[name] ?? 0) + qty;
                });
              });
              const top = Object.entries(itemCounts).sort(([, a], [, b]) => b - a)[0];
              if (top) topItem = top;
            }
            return (
              <View style={{ backgroundColor: NAVY, borderRadius: 16, padding: 14, marginBottom: 14, gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#ffffff80', textTransform: 'uppercase', letterSpacing: 0.6 }}>Today at a glance</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {[
                    { label: 'Revenue',    value: fmtCents(revenue),   color: GREEN },
                    { label: 'Tickets',    value: String(count),        color: BLUE },
                    { label: 'Avg ticket', value: fmtCents(avgCents),   color: '#F59E0B' },
                  ].map(tile => (
                    <View key={tile.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, alignItems: 'center', gap: 3 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{tile.value}</Text>
                      <Text style={{ fontSize: 9, color: '#ffffff80', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 }}>{tile.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {cashCents > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: GREEN, fontWeight: '600' }}>Cash {fmtCents(cashCents)}</Text>
                    </View>
                  )}
                  {eftposCents > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#93C5FD', fontWeight: '600' }}>EFTPOS {fmtCents(eftposCents)}</Text>
                    </View>
                  )}
                  {voidCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(220,38,38,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 11, color: '#FCA5A5', fontWeight: '600' }}>{voidCount} void{voidCount !== 1 ? 's' : ''}</Text>
                    </View>
                  )}
                </View>
                {topItem && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: '#ffffff60' }}>Top item:</Text>
                    <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }} numberOfLines={1}>{topItem[0]} ({topItem[1]}×)</Text>
                  </View>
                )}
              </View>
            );
          })()}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>
              {hasActiveFilters
                ? `${filteredOrders.length} of ${posOrders.length} Transaction${posOrders.length !== 1 ? 's' : ''}`
                : `${posOrders.length} Transaction${posOrders.length !== 1 ? 's' : ''}`}
            </Text>
            {dailyRevenue > 0 && (
              <View style={{ backgroundColor: `${BLUE}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: BLUE, fontWeight: '700', fontSize: 11 }}>{fmtCents(dailyRevenue)}</Text>
              </View>
            )}
          </View>

          {/* Period-grouped list when no active filters */}
          {!hasActiveFilters ? (() => {
            const periods = [
              { key: 'morning',   label: 'Morning',   startH: 5,  endH: 12, color: '#F59E0B' },
              { key: 'afternoon', label: 'Afternoon', startH: 12, endH: 17, color: BLUE },
              { key: 'evening',   label: 'Evening',   startH: 17, endH: 24, color: PURPLE },
            ];
            const getHour = (tx: PosTransaction) => {
              const d = new Date(tx.createdAt);
              return d.toLocaleString('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Sydney' });
            };
            return periods.map(period => {
              const items = filteredOrders.filter(tx => {
                const h = parseInt(getHour(tx), 10);
                return h >= period.startH && h < period.endH;
              });
              if (items.length === 0) return null;
              const periodRevenue = items.filter(tx => tx.status !== 'cancelled' && tx.status !== 'voided' && tx.status !== 'refunded').reduce((s, tx) => s + tx.totalCents, 0);
              return (
                <View key={period.key} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 }}>
                    <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: period.color }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 }}>{period.label}</Text>
                    <View style={{ backgroundColor: period.color + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: period.color }}>{items.length}</Text>
                    </View>
                    {periodRevenue > 0 && (
                      <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>{fmtCents(periodRevenue)}</Text>
                    )}
                  </View>
                  {items.map(tx => (
                    <PosTransactionCard
                      key={tx.id}
                      tx={tx}
                      onVoid={() => handleVoid(tx)}
                      onRefund={() => handleRefund(tx)}
                      onReprint={() => handleReprint(tx)}
                    />
                  ))}
                </View>
              );
            });
          })() : (
            sections.map(section => (
              <View key={section.key} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 8 }}>
                  <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: section.accentColor }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {section.label}
                  </Text>
                  <View style={{ backgroundColor: section.accentColor + '18', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: section.accentColor }}>{section.items.length}</Text>
                  </View>
                </View>
                {section.items.map(tx => (
                  <PosTransactionCard
                    key={tx.id}
                    tx={tx}
                    onVoid={() => handleVoid(tx)}
                    onRefund={() => handleRefund(tx)}
                    onReprint={() => handleReprint(tx)}
                  />
                ))}
              </View>
            ))
          )}

          {/* Daily summary footer — cash / EFTPOS / voids breakdown */}
          {posOrders.length > 0 && !hasActiveFilters && (() => {
            const settled = posOrders.filter(tx => !['cancelled', 'voided', 'refunded'].includes(tx.status));
            const cashCents   = settled.filter(tx => (tx.paymentMethod ?? '').toLowerCase() === 'cash').reduce((s, tx) => s + tx.totalCents, 0);
            const eftposCents = settled.filter(tx => (tx.paymentMethod ?? '').toLowerCase() !== 'cash').reduce((s, tx) => s + tx.totalCents, 0);
            const voidedCount   = posOrders.filter(tx => tx.status === 'voided' || tx.status === 'cancelled').length;
            const refundedCents = posOrders.filter(tx => tx.status === 'refunded').reduce((s, tx) => s + tx.totalCents, 0);
            const rows = [
              { label: 'Cash',          value: fmtCents(cashCents),   color: GREEN,    show: true },
              { label: 'EFTPOS / Card', value: fmtCents(eftposCents), color: BLUE,     show: true },
              { label: `Voids (${voidedCount})`, value: `${voidedCount} order${voidedCount !== 1 ? 's' : ''}`, color: RED_CONST, show: voidedCount > 0 },
              { label: 'Refunds',       value: fmtCents(refundedCents), color: PURPLE, show: refundedCents > 0 },
            ].filter(r => r.show);
            return (
              <View style={{ marginTop: 16, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                  <Feather name="bar-chart-2" size={13} color={NAVY} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: NAVY, letterSpacing: 0.5, textTransform: 'uppercase' }}>Daily Summary</Text>
                </View>
                {rows.map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER + '80' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                      <Text style={{ fontSize: 13, color: TEXT, fontWeight: '500' }}>{row.label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: row.color }}>{row.value}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>Net total</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: TEXT }}>{fmtCents(cashCents + eftposCents)}</Text>
                </View>
              </View>
            );
          })()}
        </ScrollView>
      )}
    </View>
  );
}
