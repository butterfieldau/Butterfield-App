import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PosTransaction } from '@/lib/api';

const NAVY  = '#1A2B4A';
const BG    = '#EFF6FF';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORD  = '#E5E7EB';
const BLUE  = '#1493FF';
const GREEN = '#22C55E';
const PURPLE= '#8B5CF6';
const AMBER = '#F59E0B';
const RED   = '#EF4444';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:   { bg: '#DCFCE7', text: '#166534' },
  completed:  { bg: '#F3F4F6', text: '#6B7280' },
  refunded:   { bg: '#F3E8FF', text: '#6B21A8' },
  voided:     { bg: '#FEE2E2', text: '#991B1B' },
  cancelled:  { bg: '#FEE2E2', text: '#991B1B' },
};

const METHOD_CONFIG: Record<string, { label: string; color: string }> = {
  eftpos: { label: 'EFTPOS',  color: BLUE   },
  cash:   { label: 'Cash',    color: GREEN  },
  split:  { label: 'Split',   color: PURPLE },
};

function localDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA');
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function formatDayLabel(dateStr: string): string {
  const today = localDateStr();
  const yesterday = shiftDate(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getPaymentLabel(tx: PosTransaction): { label: string; color: string } {
  if (tx.splitPayments && Array.isArray(tx.splitPayments) && tx.splitPayments.length > 1) {
    return METHOD_CONFIG.split;
  }
  const pm = (tx.paymentMethod ?? 'eftpos').toLowerCase();
  return METHOD_CONFIG[pm] ?? { label: pm.toUpperCase(), color: MUTED };
}

function summariseItems(items: any[]): string {
  if (!items || items.length === 0) return 'No items';
  const names = items.map((i: any) => {
    const qty = i.quantity ?? i.qty ?? 1;
    const name = i.name ?? i.productName ?? 'Item';
    return qty > 1 ? `${qty}× ${name}` : name;
  });
  if (names.length <= 3) return names.join(', ');
  return names.slice(0, 2).join(', ') + ` & ${names.length - 2} more`;
}

function PosCard({ tx }: { tx: PosTransaction }) {
  const statusStyle = STATUS_COLORS[tx.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const payMethod = getPaymentLabel(tx);
  const hasExtras = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.orderNum}>{tx.orderNumber ?? tx.id.slice(0, 8).toUpperCase()}</Text>
            <View style={[s.pill, { backgroundColor: statusStyle.bg }]}>
              <Text style={[s.pillText, { color: statusStyle.text }]}>
                {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={s.timestamp}>{fmtTime(tx.createdAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={s.total}>{fmtCents(tx.totalCents)}</Text>
          <View style={[s.pill, { backgroundColor: payMethod.color + '18' }]}>
            <Text style={[s.pillText, { color: payMethod.color }]}>{payMethod.label}</Text>
          </View>
        </View>
      </View>

      <View style={s.divider} />

      <Text style={s.items} numberOfLines={2}>
        {summariseItems(tx.items)}
      </Text>

      {hasExtras && (
        <View style={s.extraRow}>
          {tx.discountCents > 0 && (
            <Text style={[s.extraText, { color: GREEN }]}>−{fmtCents(tx.discountCents)} disc</Text>
          )}
          {tx.surchargeCents > 0 && (
            <Text style={s.extraText}>+{fmtCents(tx.surchargeCents)} surcharge</Text>
          )}
          {tx.tipCents > 0 && (
            <Text style={[s.extraText, { color: AMBER }]}>+{fmtCents(tx.tipCents)} tip</Text>
          )}
        </View>
      )}

      {tx.operatorName || tx.notes ? (
        <View style={s.footerRow}>
          {tx.operatorName ? (
            <View style={s.operatorRow}>
              <Feather name="user" size={11} color={MUTED} />
              <Text style={s.operatorText}>{tx.operatorName}</Text>
            </View>
          ) : null}
          {tx.notes ? (
            <Text style={s.notes} numberOfLines={1}>"{tx.notes}"</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function PosOrdersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(localDateStr());

  const todayStr = localDateStr();
  const isToday = selectedDate === todayStr;

  const { data, isLoading, error } = useQuery({
    queryKey: ['director-pos-orders', selectedDate],
    queryFn: () => api.director.posOrders({ date: selectedDate }),
    staleTime: 30_000,
  });

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['director-pos-orders', selectedDate] });
  }, [qc, selectedDate]));

  const transactions: PosTransaction[] = useMemo(
    () => data?.data ?? [],
    [data],
  );

  const dailyRevenue = useMemo(
    () => transactions
      .filter(tx => tx.status !== 'cancelled' && tx.status !== 'voided' && tx.status !== 'refunded')
      .reduce((sum, tx) => sum + tx.totalCents, 0),
    [transactions],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['director-pos-orders', selectedDate] });
    setRefreshing(false);
  }, [qc, selectedDate]);

  function goBack() {
    setSelectedDate(prev => shiftDate(prev, -1));
  }

  function goForward() {
    if (!isToday) setSelectedDate(prev => shiftDate(prev, 1));
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerBadge}>
          <Text style={s.headerBadgeText}>DIRECTOR</Text>
        </View>
        <Text style={s.headerTitle}>POS Transactions</Text>
        <Text style={s.headerSub}>Terminal sales history — read only</Text>
      </View>

      {/* Day navigation strip */}
      <View style={s.dayNav}>
        <Pressable onPress={goBack} style={s.dayArrow} hitSlop={12}>
          <Feather name="chevron-left" size={22} color={NAVY} />
        </Pressable>

        <View style={s.dayLabelWrap}>
          <Feather name="calendar" size={13} color={MUTED} style={{ marginRight: 5 }} />
          <Text style={s.dayLabel}>{formatDayLabel(selectedDate)}</Text>
        </View>

        <Pressable
          onPress={goForward}
          style={[s.dayArrow, isToday && s.dayArrowDisabled]}
          disabled={isToday}
          hitSlop={12}
        >
          <Feather name="chevron-right" size={22} color={isToday ? BORD : NAVY} />
        </Pressable>
      </View>

      {/* Info banner */}
      <View style={s.banner}>
        <Feather name="info" size={14} color={BLUE} />
        <Text style={s.bannerText}>
          POS transactions are managed from the POS terminal. Status updates and refunds must be processed there.
        </Text>
      </View>

      {isLoading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="alert-circle" size={32} color={RED} />
          <Text style={{ color: RED, marginTop: 12, textAlign: 'center', fontSize: 14 }}>
            Failed to load POS transactions
          </Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: BLUE, borderRadius: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </View>
      ) : transactions.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Feather name="monitor" size={40} color={MUTED} />
          <Text style={{ color: MUTED, marginTop: 12, fontSize: 15, fontWeight: '600' }}>
            {isToday ? 'No POS transactions yet today' : 'No transactions on this day'}
          </Text>
          <Text style={{ color: MUTED, marginTop: 4, fontSize: 13, textAlign: 'center' }}>
            {isToday
              ? 'Transactions processed at the terminal will appear here.'
              : 'Use the arrows above to navigate to another day.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PosCard tx={item} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />
          }
          ListHeaderComponent={
            <View style={s.summaryRow}>
              <Text style={s.count}>
                {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
              </Text>
              {dailyRevenue > 0 && (
                <Text style={s.revenue}>{fmtCents(dailyRevenue)}</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 4,
  },
  headerBadge: {
    backgroundColor: RED,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerTitle:     { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerSub:       { color: 'rgba(255,255,255,0.65)', fontSize: 13 },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORD,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  dayArrow:         { padding: 6 },
  dayArrowDisabled: { opacity: 0.35 },
  dayLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  count:   { fontSize: 12, color: MUTED, fontWeight: '600' },
  revenue: { fontSize: 13, color: TEXT, fontWeight: '700' },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORD,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  orderNum:   { fontSize: 15, fontWeight: '700', color: TEXT },
  timestamp:  { fontSize: 12, color: MUTED },
  total:      { fontSize: 17, fontWeight: '700', color: TEXT },
  items:      { fontSize: 13, color: MUTED, lineHeight: 18 },

  pill:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORD },

  extraRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  extraText:{ fontSize: 12, color: MUTED },

  footerRow:    { gap: 4 },
  operatorRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  operatorText: { fontSize: 12, color: MUTED },
  notes:        { fontSize: 12, color: MUTED, fontStyle: 'italic' },
});
