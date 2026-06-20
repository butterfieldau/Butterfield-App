import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable,
  RefreshControl, ScrollView, Text, TextInput, View,
} from 'react-native';
import type { PosTransaction } from '@/lib/api';
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

function PosTransactionCard({ tx }: { tx: PosTransaction }) {
  const statusStyle = POS_STATUS_COLORS[tx.status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const payMethod   = getPosPaymentLabel(tx);
  const hasExtras   = tx.tipCents > 0 || tx.surchargeCents > 0 || tx.discountCents > 0;
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
  dayStr, onSetDay, posOrders, isLoading, refreshing, onRefresh,
}: {
  dayStr: string; onSetDay: (d: string) => void;
  posOrders: PosTransaction[]; isLoading: boolean;
  refreshing: boolean; onRefresh: () => Promise<void>;
}) {
  const todayStr = sydneyDateStr();
  const isToday  = dayStr === todayStr;

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
        <FlatList
          horizontal
          data={POS_CHIP_FILTERS}
          keyExtractor={c => c.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
          renderItem={({ item: chip }) => {
            const active = chipFilter === chip.key;
            const color  = chip.key === 'refunded' ? PURPLE : chip.key === 'voided' ? RED_CONST : BLUE;
            return (
              <Pressable
                onPress={() => { setChipFilter(chip.key); Haptics.selectionAsync(); }}
                style={[styles.filterChip, { backgroundColor: active ? color : BG, borderColor: active ? color : BORDER }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : MUTED }}>
                  {chip.label}
                </Text>
              </Pressable>
            );
          }}
        />
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

          {sections.map(section => (
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
              {section.items.map(tx => <PosTransactionCard key={tx.id} tx={tx} />)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
