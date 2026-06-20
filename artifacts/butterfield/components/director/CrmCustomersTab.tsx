import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Modal,
  Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  api,
  type CrmCustomer, type CrmInsights,
} from '@/lib/api';
import { CrmCustomerDetailModal } from './CrmCustomerDetailModal';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';
const SCREEN_WIDTH = Dimensions.get('window').width;

const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  blue:     { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  bronze:   { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  silver:   { label: 'Silver',   color: '#374151', bg: '#F3F4F6' },
  gold:     { label: 'Gold',     color: '#92400E', bg: '#FDE68A' },
  black:    { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
  platinum: { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
};

const BADGE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  vip:               { label: 'VIP',           bg: '#EDE9FE', text: '#5B21B6' },
  loyal:             { label: 'Loyal',          bg: '#DCFCE7', text: '#166534' },
  returning:         { label: 'Returning',      bg: '#EBF8FF', text: '#0369A1' },
  new:               { label: 'New',            bg: '#F3F4F6', text: '#6B7280' },
  high_spend:        { label: 'High Spend',     bg: '#FEF3C7', text: '#92400E' },
  frequent_buyer:    { label: 'Frequent',       bg: '#DBEAFE', text: '#1E40AF' },
  inactive:          { label: 'Inactive',       bg: '#FEE2E2', text: '#991B1B' },
  wholesale_partner: { label: 'Wholesale',      bg: '#D1FAE5', text: '#065F46' },
  needs_follow_up:   { label: 'Follow Up',      bg: '#FFF7ED', text: '#C2410C' },
  flagged:           { label: 'Flagged',        bg: '#FEE2E2', text: '#B91C1C' },
  at_risk:           { label: 'At Risk',        bg: '#FEF3C7', text: '#B45309' },
  issue:             { label: 'Issue',          bg: '#FEE2E2', text: '#DC2626' },
  regular:           { label: 'Regular',        bg: '#DCFCE7', text: '#15803D' },
  birthday_offer:    { label: 'Birthday Offer', bg: '#FDF4FF', text: '#9333EA' },
};

const ALL_MANUAL_BADGES = [
  'vip', 'high_spend', 'needs_follow_up', 'flagged', 'loyal', 'frequent_buyer',
  'inactive', 'at_risk', 'issue', 'regular', 'birthday_offer',
];

const SEGMENT_CHIPS = [
  { key: '', label: 'All' },
  { key: 'vip', label: 'VIP' },
  { key: 'high_spend', label: 'High Spend' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'new', label: 'New' },
  { key: 'coffee_regular', label: 'Coffee' },
  { key: 'rewards_member', label: 'Rewards' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'pickup', label: 'Pickup' },
  { key: 'wholesale', label: 'Wholesale' },
];

const SEGMENT_LABEL: Record<string, string> = {
  vip: 'VIP', high_spend: 'High Spenders', inactive: 'Inactive', new: 'New',
  coffee_regular: 'Coffee Regulars', rewards_member: 'Rewards Members',
  delivery: 'Delivery', pickup: 'Pickup', wholesale: 'Wholesale',
};

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string | null | undefined) {
  return new Date(iso ?? '').toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function isoToDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '';
}
function ddMmYyyyToIso(s: string): string | null {
  const parts = s.trim().split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}
function autoFormatBd(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}


// ── Customer row ──────────────────────────────────────────────────────────────
function CustomerRow({ item, onPress, isLast }: { item: CrmCustomer; onPress: () => void; isLast: boolean }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[row.wrap, !isLast && row.border]}
    >
      {item.profileImage ? (
        <Image source={{ uri: item.profileImage }} style={row.avatarImage} contentFit="cover" />
      ) : (
        <View style={row.avatarFallback}>
          <Text style={row.avatarText}>{initials(item.name)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={row.name}>{item.name}</Text>
        <Text style={row.meta}>{item.email}</Text>
        <Text style={row.meta}>
          {fmtAUD(item.totalSpentCents)}
          <Text style={{ color: MUTED }}> · </Text>
          {item.orderCount} {item.orderCount === 1 ? 'order' : 'orders'}
          {item.lastOrderAt ? <Text style={{ color: MUTED }}> · last {fmtDate(item.lastOrderAt)}</Text> : null}
        </Text>
        {item.badges.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {item.badges.slice(0, 3).map(b => {
              const cfg = BADGE_CFG[b];
              if (!cfg) return null;
              return (
                <View key={b} style={{ backgroundColor: cfg.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: cfg.text }}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} />
    </Pressable>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────
type DatePreset      = '' | '7d' | '30d' | '90d';
type SpendPreset     = '' | '50' | '200' | '500';
type OrderPreset     = '' | '1' | '5' | '10';
type LastOrderPreset = '' | 'active7' | 'active30' | 'inactive30';

export interface CrmFilterState {
  dateFrom?: string; dateTo?: string;
  minSpendCents?: number; maxSpendCents?: number;
  minOrders?: number; maxOrders?: number;
  lastOrderFrom?: string; lastOrderTo?: string;
  searchOrders?: string;
}

function FilterPanel({ visible, onClose, onApply }: {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: CrmFilterState) => void;
}) {
  const insets = useSafeAreaInsets();
  const [datePreset, setDatePreset]           = useState<DatePreset>('');
  const [spendPreset, setSpendPreset]         = useState<SpendPreset>('');
  const [orderPreset, setOrderPreset]         = useState<OrderPreset>('');
  const [lastOrderPreset, setLastOrderPreset] = useState<LastOrderPreset>('');
  const [searchOrders, setSearchOrders]       = useState('');

  const anyActive = !!(datePreset || spendPreset || orderPreset || lastOrderPreset || searchOrders.trim());

  const apply = () => {
    const dateRange = (() => {
      if (!datePreset) return {};
      const days = datePreset === '7d' ? 7 : datePreset === '30d' ? 30 : 90;
      const from  = new Date(Date.now() - days * 86400000);
      return { dateFrom: from.toISOString().slice(0, 10) };
    })();
    const spendMin  = spendPreset  ? parseInt(spendPreset, 10)  * 100 : undefined;
    const orderMin  = orderPreset  ? parseInt(orderPreset, 10)        : undefined;
    const lastRange = (() => {
      if (!lastOrderPreset) return {};
      const now = new Date();
      if (lastOrderPreset === 'active7')    return { lastOrderFrom: new Date(now.getTime() - 7  * 86400000).toISOString().slice(0, 10) };
      if (lastOrderPreset === 'active30')   return { lastOrderFrom: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) };
      if (lastOrderPreset === 'inactive30') return { lastOrderTo:   new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) };
      return {};
    })();
    onApply({ ...dateRange, minSpendCents: spendMin, minOrders: orderMin, ...lastRange, searchOrders: searchOrders.trim() || undefined });
    onClose();
  };

  const clear = () => { setDatePreset(''); setSpendPreset(''); setOrderPreset(''); setLastOrderPreset(''); setSearchOrders(''); };

  const chipRow = (label: string, options: { key: string; label: string }[], value: string, set: (v: any) => void) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={fp.filterLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {options.map(o => (
          <Pressable key={o.key} onPress={() => { Haptics.selectionAsync(); set(value === o.key ? '' : o.key as any); }}
            style={[fp.chip, value === o.key && fp.chipActive]}>
            <Text style={[fp.chipText, value === o.key && fp.chipTextActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[fp.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
          <Pressable onPress={onClose} style={det.headerBtn} hitSlop={10}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={fp.title}>Filters</Text>
          <Pressable onPress={clear} hitSlop={10} style={{ paddingHorizontal: 4 }}>
            <Text style={{ color: anyActive ? RED : MUTED, fontWeight: '600', fontSize: 14 }}>Clear</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {chipRow('Joined', [
            { key: '7d', label: 'Last 7 days' },
            { key: '30d', label: 'Last 30 days' },
            { key: '90d', label: 'Last 90 days' },
          ], datePreset, setDatePreset)}
          {chipRow('Min Total Spend', [
            { key: '50',  label: '$50+' },
            { key: '200', label: '$200+' },
            { key: '500', label: '$500+' },
          ], spendPreset, setSpendPreset)}
          {chipRow('Min Order Count', [
            { key: '1',  label: '1+ orders' },
            { key: '5',  label: '5+ orders' },
            { key: '10', label: '10+ orders' },
          ], orderPreset, setOrderPreset)}
          {chipRow('Last Order', [
            { key: 'active7',    label: 'Active in 7d' },
            { key: 'active30',   label: 'Active in 30d' },
            { key: 'inactive30', label: 'No order 30d+' },
          ], lastOrderPreset, setLastOrderPreset)}
          <View style={{ marginBottom: 18 }}>
            <Text style={fp.filterLabel}>Search Order History</Text>
            <TextInput
              style={[det.input, { marginTop: 6, borderColor: BORDER }]}
              placeholder="e.g. Flat White, Classic Cookie"
              placeholderTextColor={MUTED}
              value={searchOrders}
              onChangeText={setSearchOrders}
              autoCapitalize="none"
            />
          </View>
        </ScrollView>
        <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD }}>
          <Pressable onPress={apply} style={[det.actionBtn, { backgroundColor: NAVY }]}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Apply Filters</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── CRM Insights strip ────────────────────────────────────────────────────────
function InsightsStrip({ insights }: { insights: CrmInsights | null }) {
  if (!insights) return null;
  const metrics = [
    { label: 'Total',    value: insights.totalCustomers ?? 0,  color: BLUE   },
    { label: 'New',      value: insights.newThisMonth ?? 0,    color: GREEN  },
    { label: 'Repeat',   value: insights.repeatCustomers ?? 0, color: PURPLE },
    { label: 'Inactive', value: insights.inactiveCount ?? 0,   color: RED    },
  ];
  const topSpenders = (insights.topSpenders ?? []).slice(0, 5);
  return (
    <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
      <View style={{ flexDirection: 'row' }}>
        {metrics.map((m, i) => (
          <View key={m.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: BORDER }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: m.color }}>{m.value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</Text>
          </View>
        ))}
      </View>
      {topSpenders.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingVertical: 8, gap: 6 }}>
            <Feather name="trending-up" size={13} color={AMBER} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: AMBER, textTransform: 'uppercase', letterSpacing: 0.4 }}>Top spenders:</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 8 }}>
            {topSpenders.map((s, i) => (
              <View key={s.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {i > 0 && <Text style={{ color: BORDER, fontSize: 11 }}>·</Text>}
                <Text style={{ fontSize: 11, color: TEXT, fontWeight: '600' }}>{s.name}</Text>
                <Text style={{ fontSize: 11, color: MUTED }}>({fmtAUD(s.totalSpentCents)})</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Main Customers tab ────────────────────────────────────────────────────────
export function CrmCustomersTab() {
  const [search, setSearch]             = useState('');
  const [segment, setSegment]           = useState('');
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [refreshing, setRefreshing]     = useState(false);
  const [showFilters, setShowFilters]   = useState(false);
  const [filters, setFilters]           = useState<CrmFilterState>({});
  const [showSearch, setShowSearch]     = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined && v !== '').length;
  const hasActiveFilter   = !!(search || segment || activeFilterCount > 0);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-customers', search, segment, filters],
    queryFn:  () => api.director.customers.list({ search, segment: segment || undefined, ...filters }),
    staleTime: 30_000,
  });

  const { data: insightsData } = useQuery({
    queryKey: ['crm-insights'],
    queryFn:  () => api.director.customers.insights(),
    staleTime: 120_000,
  });

  const customers: CrmCustomer[] = data?.data ?? [];
  const insights: CrmInsights | null = (insightsData?.data as any) ?? null;
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <View style={{ flex: 1 }}>
      <InsightsStrip insights={insights} />

      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 9, gap: 8 }}>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setShowSearch(s => !s); }}
            style={[scr.toolBtn, (showSearch || search.length > 0) && scr.toolBtnActive]}
          >
            <Feather name="search" size={14} color={(showSearch || search.length > 0) ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, (showSearch || search.length > 0) && scr.toolBtnTextActive]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setShowSegments(s => !s); }}
            style={[scr.toolBtn, (showSegments || !!segment) && scr.toolBtnActive]}
          >
            <Feather name="layers" size={14} color={(showSegments || !!segment) ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, (showSegments || !!segment) && scr.toolBtnTextActive]}>
              {segment ? (SEGMENT_LABEL[segment] ?? 'Segment') : 'Segments'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowFilters(true); }}
            style={[scr.toolBtn, activeFilterCount > 0 && scr.toolBtnActive]}
          >
            <Feather name="sliders" size={14} color={activeFilterCount > 0 ? '#fff' : MUTED} />
            <Text style={[scr.toolBtnText, activeFilterCount > 0 && scr.toolBtnTextActive]}>
              {activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter'}
            </Text>
          </Pressable>
        </View>

        {showSearch && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
            <View style={[scr.searchInput, { borderColor: BORDER }]}>
              <Feather name="search" size={16} color={MUTED} />
              <TextInput
                style={{ flex: 1, fontSize: 15, color: TEXT }}
                placeholder="Search name, email, phone…"
                placeholderTextColor={MUTED}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoFocus
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <Feather name="x-circle" size={16} color={MUTED} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {showSegments && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 8, flexDirection: 'row' }}>
            {SEGMENT_CHIPS.map(chip => (
              <Pressable
                key={chip.key}
                onPress={() => { Haptics.selectionAsync(); setSegment(chip.key); if (chip.key) setShowSegments(false); }}
                style={[scr.chip, segment === chip.key && scr.chipActive]}
              >
                <Text style={[scr.chipText, segment === chip.key && scr.chipTextActive]}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={c => c.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          style={{ backgroundColor: CARD }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 15 }}>
                {hasActiveFilter ? 'No customers match your filters.' : 'No customers yet.'}
              </Text>
              {hasActiveFilter && (
                <Pressable onPress={() => { setSearch(''); setSegment(''); setFilters({}); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Feather name="x-circle" size={15} color={BLUE} />
                  <Text style={{ color: BLUE, fontSize: 13, fontWeight: '600' }}>Clear all filters</Text>
                </Pressable>
              )}
            </View>
          }
          ListHeaderComponent={
            customers.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: MUTED, fontWeight: '500' }}>
                  {customers.length} customer{customers.length !== 1 ? 's' : ''}
                  {segment ? ` · ${SEGMENT_LABEL[segment] ?? segment}` : ''}
                </Text>
                {hasActiveFilter && (
                  <Pressable onPress={() => { setSearch(''); setSegment(''); setFilters({}); }} hitSlop={8}>
                    <Text style={{ fontSize: 12, color: RED, fontWeight: '600' }}>Clear</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <CustomerRow
              item={item}
              onPress={() => setSelectedId(item.id)}
              isLast={index === customers.length - 1}
            />
          )}
        />
      )}

      <FilterPanel
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={(f) => setFilters(f)}
      />

      {selectedId && (
        <CrmCustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onDelete={() => { setSelectedId(null); refetch(); }}
        />
      )}
    </View>
  );
}

const row = StyleSheet.create({
  wrap:           { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  border:         { borderBottomWidth: 1, borderBottomColor: BORDER },
  avatarImage:    { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF' },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  avatarText:     { fontSize: 15, fontWeight: '700', color: BLUE },
  name:           { fontSize: 15, fontWeight: '700', color: TEXT },
  meta:           { fontSize: 12, color: MUTED },
});

const scr = StyleSheet.create({
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  filterBtn:         { width: 44, height: 44, borderRadius: 12, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  filterBadge:       { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  toolBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  toolBtnActive:     { backgroundColor: NAVY, borderColor: NAVY },
  toolBtnText:       { fontSize: 13, fontWeight: '600', color: MUTED },
  toolBtnTextActive: { color: '#fff' },
  chip:              { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: BG, borderWidth: 1, borderColor: BORDER },
  chipActive:        { backgroundColor: BLUE, borderColor: BLUE },
  chipText:          { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive:    { color: '#fff' },
});

const fp = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  title:       { fontSize: 16, fontWeight: '700', color: TEXT },
  filterLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  chipActive:  { backgroundColor: NAVY, borderColor: NAVY },
  chipText:    { fontSize: 13, fontWeight: '600', color: MUTED },
  chipTextActive: { color: '#fff' },
});

const det = StyleSheet.create({
  headerBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  input:      { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT },
  actionBtn:  { backgroundColor: NAVY, borderRadius: 12, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
