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
import { styles } from './directorOrdersStyles';
import { fmtTime } from './ordersHelpers';
import {
  BG, SURFACE, SURFACE_RAISED, BORDER,
  TEXT, TEXT_MUTED, TEXT_FAINT,
  BRAND, BRAND_DARK, BRAND_DIM, BRAND_TEXT_ON,
  GREEN, GREEN_DIM, AMBER, AMBER_DIM,
  RED, RED_DIM, BLUE, BLUE_DIM,
  PURPLE, PURPLE_DIM,
} from './commandCenterColors';

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
  split:  { label: 'Split',  color: PURPLE },
};

function getPosPaymentLabel(tx: PosTransaction): { label: string; color: string } {
  if (tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1) {
    return POS_METHOD_CONFIG.split;
  }
  const pm = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  return POS_METHOD_CONFIG[pm] ?? { label: pm.toUpperCase(), color: TEXT_MUTED };
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
  received:  { bg: GREEN_DIM, text: GREEN },
  completed: { bg: SURFACE,   text: TEXT_MUTED },
  refunded:  { bg: PURPLE_DIM, text: PURPLE },
  voided:    { bg: RED_DIM,    text: RED },
  cancelled: { bg: RED_DIM,    text: RED },
};

function PosTransactionCard({
  tx,
  onVoid,
  onRefund,
  onReprint,
  onRestore,
}: {
  tx: PosTransaction;
  onVoid?: () => void;
  onRefund?: () => void;
  onReprint?: () => void;
  onRestore?: () => void;
}) {
  const statusStyle = POS_STATUS_COLORS[tx.status] ?? { bg: SURFACE, text: TEXT_MUTED };
  const payMethod   = getPosPaymentLabel(tx);
  const hasExtras   = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;
  // Void is for sales that haven't settled yet; once a POS sale is completed
  // (paid out), use Refund instead so refunds are tracked and reconciled properly.
  const canVoid     = !['voided', 'cancelled', 'refunded', 'completed'].includes(tx.status);
  const canRefund   = tx.status === 'completed';
  const canReprint  = tx.status !== 'cancelled';
  const canRestore  = tx.status === 'voided';
  return (
    <View style={{ backgroundColor: SURFACE_RAISED, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 8, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>
              {tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase()}
            </Text>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: statusStyle.bg }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: statusStyle.text, letterSpacing: 0.3 }}>
                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1).toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: TEXT_MUTED }}>{fmtTime(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT }}>{fmtCents(tx.totalCents)}</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: payMethod.color + '18' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: payMethod.color }}>{payMethod.label.toUpperCase()}</Text>
          </View>
        </View>
      </View>
      <View style={{ height: 1, backgroundColor: BORDER }} />
      <Text style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 18 }} numberOfLines={2}>
        {summarisePosItems(tx.items)}
      </Text>
      {hasExtras && (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {tx.discountCents > 0 && <Text style={{ fontSize: 12, color: GREEN }}>−{fmtCents(tx.discountCents)} disc</Text>}
          {tx.surchargeCents > 0 && <Text style={{ fontSize: 12, color: TEXT_MUTED }}>+{fmtCents(tx.surchargeCents)} surcharge</Text>}
          {tx.tipCents > 0 && <Text style={{ fontSize: 12, color: AMBER }}>+{fmtCents(tx.tipCents)} tip</Text>}
        </View>
      )}
      {tx.operatorName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="user" size={11} color={TEXT_MUTED} />
          <Text style={{ fontSize: 12, color: TEXT_MUTED }}>{tx.operatorName}</Text>
        </View>
      ) : null}
      {/* Per-row actions: void / refund / reprint / restore */}
      {(canVoid || canRefund || canReprint || canRestore) && (
        <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8, marginTop: 2 }}>
          {canReprint && onReprint && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); onReprint(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="printer" size={12} color={TEXT_MUTED} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: TEXT_MUTED }}>Reprint</Text>
            </Pressable>
          )}
          {canRefund && onRefund && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRefund(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: PURPLE_DIM, borderWidth: 1, borderColor: PURPLE + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="rotate-ccw" size={12} color={PURPLE} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: PURPLE }}>Refund</Text>
            </Pressable>
          )}
          {canVoid && onVoid && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onVoid(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="x-circle" size={12} color={RED} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: RED }}>Void</Text>
            </Pressable>
          )}
          {canRestore && onRestore && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onRestore(); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                backgroundColor: GREEN_DIM, borderWidth: 1, borderColor: GREEN + '30', borderRadius: 10, paddingVertical: 7 }}
            >
              <Feather name="rotate-ccw" size={12} color={GREEN} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: GREEN }}>Restore</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const POS_SECTIONS = [
  { key: 'active',   label: 'In Progress',      statuses: ['received', 'being_prepared'],       accentColor: AMBER },
  { key: 'done',     label: 'Completed',         statuses: ['completed'],                        accentColor: GREEN },
  { key: 'issues',   label: 'Refunded / Voided', statuses: ['refunded', 'voided', 'cancelled'], accentColor: RED },
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

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.director.unvoidPosTransaction(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: txQueryKey });
      const previous = queryClient.getQueryData<{ data: PosTransaction[] }>(txQueryKey);
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(txQueryKey, context.previous);
      Alert.alert('Restore failed', 'Could not restore this transaction. Please try again.');
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

  const handleRestore = (tx: PosTransaction) => {
    const label = tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase();
    Alert.alert(
      'Restore Transaction',
      `Restore ${label} back to its status before it was voided?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => restoreMutation.mutate(tx.id),
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
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D131C', borderBottomWidth: showSearch ? 0 : 1, borderBottomColor: BORDER, paddingHorizontal: 8, paddingVertical: 10 }}>
        <Pressable onPress={() => onSetDay(shiftPosDate(dayStr, -1))} style={{ padding: 8 }} hitSlop={12}>
          <Feather name="chevron-left" size={22} color={TEXT_MUTED} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{formatPosDay(dayStr).toUpperCase()}</Text>
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
          <Feather name={showSearch ? 'x' : 'search'} size={18} color={showSearch ? BRAND : TEXT_MUTED} />
        </Pressable>
        <Pressable
          onPress={() => { if (!isToday) onSetDay(shiftPosDate(dayStr, 1)); }}
          style={[{ padding: 8 }, isToday && { opacity: 0.35 }]}
          disabled={isToday}
          hitSlop={12}
        >
          <Feather name="chevron-right" size={22} color={isToday ? TEXT_FAINT : TEXT_MUTED} />
        </Pressable>
      </View>

      {showSearch && (
        <View style={{ backgroundColor: '#0D131C', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, gap: 8, borderWidth: 1, borderColor: BORDER }}>
            <Feather name="search" size={15} color={TEXT_MUTED} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: TEXT, padding: 0 }}
              placeholder="Search receipt #, item, or amount…"
              placeholderTextColor={TEXT_FAINT}
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
                <Feather name="x-circle" size={15} color={TEXT_MUTED} />
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
            const color  = chip.key === 'refunded' ? PURPLE : chip.key === 'voided' ? RED : BLUE;
            return (
              <Pressable
                key={chip.key}
                onPress={() => { setChipFilter(chip.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, { backgroundColor: active ? color : SURFACE, borderColor: active ? color : BORDER }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? BRAND_TEXT_ON : TEXT_MUTED }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
          <ActivityIndicator color={BRAND} size="large" />
        </View>
      ) : posOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BG }}>
          <Feather name="monitor" size={36} color={TEXT_FAINT} style={{ opacity: 0.4 }} />
          <Text style={{ color: TEXT_MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
            {isToday ? 'No POS transactions today' : 'No transactions on this day'}
          </Text>
          <Text style={{ color: TEXT_FAINT, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            {isToday ? 'Terminal sales will appear here in real time.' : 'Use the arrows to navigate to another day.'}
          </Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BG }}>
          <Feather name="search" size={36} color={TEXT_FAINT} />
          <Text style={{ color: TEXT_MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>No matching transactions</Text>
          <Text style={{ color: TEXT_FAINT, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            Try a different search term or filter.
          </Text>
          {hasActiveFilters && (
            <Pressable
              onPress={() => { setSearchQuery(''); setChipFilter('all'); }}
              style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: BRAND, borderRadius: 20 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: BRAND_TEXT_ON }}>Clear filters</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: BG }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
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
              <View style={{ backgroundColor: SURFACE_RAISED, borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: BRAND }} />
                <Text style={{ fontSize: 11, fontWeight: '800', color: BRAND, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 16 }}>TOTAL REVENUE</Text>
                
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ fontSize: 44, fontWeight: '900', color: TEXT, letterSpacing: -1 }}>{fmtCents(revenue)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 14, color: TEXT_MUTED }}>{count} tickets</Text>
                    <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: BORDER }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Feather name="trending-up" size={14} color={GREEN} />
                      <Text style={{ fontSize: 14, color: GREEN, fontWeight: '600' }}>Live</Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>AVG TICKET</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT }}>{fmtCents(avgCents)}</Text>
                  </View>
                  {topItem && (
                    <View style={{ flex: 1, backgroundColor: SURFACE, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>TOP SELLER</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }} numberOfLines={1}>{topItem[0]}</Text>
                    </View>
                  )}
                </View>

                <View style={{ marginTop: 20, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED }}>EFTPOS ({Math.round(eftposCents/revenue*100)||0}%)</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT_MUTED }}>CASH ({Math.round(cashCents/revenue*100)||0}%)</Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: SURFACE, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                    <View style={{ flex: eftposCents || 0, backgroundColor: BLUE }} />
                    <View style={{ flex: cashCents || 0, backgroundColor: GREEN }} />
                  </View>
                </View>
              </View>
            );
          })()}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>
              {hasActiveFilters
                ? `${filteredOrders.length} of ${posOrders.length} TRANSACTION${posOrders.length !== 1 ? 'S' : ''}`
                : `${posOrders.length} TRANSACTION${posOrders.length !== 1 ? 'S' : ''}`}
            </Text>
            {dailyRevenue > 0 && (
              <View style={{ backgroundColor: BRAND_DIM, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: BRAND, fontWeight: '700', fontSize: 11 }}>{fmtCents(dailyRevenue)}</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 12 }}>
                    <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: period.color }} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_MUTED, letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>{period.label}</Text>
                    <View style={{ backgroundColor: SURFACE, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: BORDER }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: TEXT }}>{items.length}</Text>
                    </View>
                    {periodRevenue > 0 && (
                      <Text style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: '600' }}>{fmtCents(periodRevenue)}</Text>
                    )}
                  </View>
                  {items.map(tx => (
                    <PosTransactionCard
                      key={tx.id}
                      tx={tx}
                      onVoid={() => handleVoid(tx)}
                      onRefund={() => handleRefund(tx)}
                      onReprint={() => handleReprint(tx)}
                      onRestore={() => handleRestore(tx)}
                    />
                  ))}
                </View>
              );
            });
          })() : (
            sections.map(section => (
              <View key={section.key} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 12 }}>
                  <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: section.accentColor }} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_MUTED, letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>
                    {section.label}
                  </Text>
                  <View style={{ backgroundColor: SURFACE, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: BORDER }}>
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
                    onRestore={() => handleRestore(tx)}
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
              { label: 'Cash Sales',          value: fmtCents(cashCents),   color: GREEN,    show: true },
              { label: 'EFTPOS / Card', value: fmtCents(eftposCents), color: BLUE,     show: true },
              { label: `Voids (${voidedCount})`, value: `${voidedCount} order${voidedCount !== 1 ? 's' : ''}`, color: RED, show: voidedCount > 0 },
              { label: 'Refunds',       value: fmtCents(refundedCents), color: PURPLE, show: refundedCents > 0 },
            ].filter(r => r.show);
            return (
              <View style={{ marginTop: 24, backgroundColor: SURFACE_RAISED, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SURFACE }}>
                  <Feather name="bar-chart-2" size={14} color={BRAND} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT, letterSpacing: 1, textTransform: 'uppercase' }}>Daily Summary</Text>
                </View>
                {rows.map((row) => (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: row.color }} />
                      <Text style={{ fontSize: 13, color: TEXT_MUTED, fontWeight: '500' }}>{row.label}</Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>{row.value}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: SURFACE }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT }}>Net total</Text>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: BRAND }}>{fmtCents(cashCents + eftposCents)}</Text>
                </View>
              </View>
            );
          })()}
        </ScrollView>
      )}
    </View>
  );
}
