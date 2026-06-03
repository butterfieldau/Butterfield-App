import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { api, type CrmCustomer } from '@/lib/api';

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

const TIER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  blue:     { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  bronze:   { label: 'Blue',     color: '#0C4DA2', bg: '#DBECFF' },
  silver:   { label: 'Silver',   color: '#374151', bg: '#F3F4F6' },
  gold:     { label: 'Gold',     color: '#92400E', bg: '#FDE68A' },
  black:    { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
  platinum: { label: 'Black',    color: '#0F172A', bg: '#E2E8F0' },
};

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  active:    { color: GREEN,  bg: '#DCFCE7' },
  inactive:  { color: MUTED,  bg: '#F3F4F6' },
  suspended: { color: RED,    bg: '#FEE2E2' },
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

// ── Simple profile sheet ──────────────────────────────────────────────────────
function ProfileSheet({ customer, onClose }: { customer: CrmCustomer; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  const rows = [
    { label: 'Email',           value: customer.email },
    { label: 'Phone',           value: customer.phone ?? '—' },
    { label: 'Joined',          value: fmtDate(customer.createdAt) },
    { label: 'Last order',      value: customer.lastOrderAt ? fmtDate(customer.lastOrderAt) : 'No orders' },
    { label: 'Total orders',    value: String(customer.orderCount) },
    { label: 'Total spend',     value: fmtAUD(customer.totalSpentCents) },
    { label: 'Loyalty points',  value: String(customer.profile?.loyaltyPoints ?? 0) },
    { label: 'Coffee stamps',   value: String(customer.profile?.stampCount ?? 0) },
  ];

  const tierCfg = TIER_CFG[customer.profile?.loyaltyTier ?? ''] ?? null;
  const statusCfg = STATUS_CFG[customer.status ?? 'active'] ?? STATUS_CFG.active;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
          <Pressable onPress={onClose} style={s.headerBtn} hitSlop={10}>
            <Feather name="arrow-left" size={20} color={TEXT} />
          </Pressable>
          <Text style={s.headerTitle} numberOfLines={1}>{customer.name}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={[s.hero, { borderBottomColor: BORDER }]}>
            <View style={s.avatarLg}>
              <Text style={s.avatarLgText}>{initials(customer.name)}</Text>
            </View>
            <Text style={s.heroName}>{customer.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              {tierCfg && (
                <View style={[s.pill, { backgroundColor: tierCfg.bg }]}>
                  <Text style={[s.pillTx, { color: tierCfg.color }]}>{tierCfg.label} tier</Text>
                </View>
              )}
              <View style={[s.pill, { backgroundColor: statusCfg.bg }]}>
                <Text style={[s.pillTx, { color: statusCfg.color, textTransform: 'capitalize' }]}>{customer.status ?? 'active'}</Text>
              </View>
              {customer.wholesaleAccount != null && (
                <View style={[s.pill, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={[s.pillTx, { color: '#065F46' }]}>Wholesale</Text>
                </View>
              )}
            </View>
          </View>

          {/* Info rows */}
          <View style={s.section}>
            {rows.map((r, i) => (
              <View key={r.label} style={[s.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                <Text style={s.rowLabel}>{r.label}</Text>
                <Text style={s.rowValue} numberOfLines={1}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Wholesale badge if applicable */}
          {customer.wholesaleAccount?.companyName && (
            <View style={[s.section, { marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Feather name="briefcase" size={15} color={GREEN} />
                <Text style={s.sectionTitle}>Wholesale</Text>
              </View>
              <View style={[s.row, { borderBottomWidth: 0 }]}>
                <Text style={s.rowLabel}>Company</Text>
                <Text style={s.rowValue}>{customer.wholesaleAccount.companyName}</Text>
              </View>
            </View>
          )}

          {/* Auto badges/tags */}
          {customer.badges.length > 0 && (
            <View style={[s.section, { marginTop: 8 }]}>
              <Text style={[s.sectionTitle, { marginBottom: 10 }]}>Tags</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {customer.badges.map(b => (
                  <View key={b} style={[s.pill, { backgroundColor: BG, borderWidth: 1, borderColor: BORDER }]}>
                    <Text style={[s.pillTx, { color: MUTED, textTransform: 'capitalize' }]}>{b.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Customer row ──────────────────────────────────────────────────────────────
function CustomerRow({ item, onPress, isLast }: { item: CrmCustomer; onPress: () => void; isLast: boolean }) {
  const tierCfg = TIER_CFG[item.profile?.loyaltyTier ?? ''] ?? null;
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={[s.customerRow, !isLast && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
    >
      <View style={s.avatar}>
        <Text style={s.avatarText}>{initials(item.name)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.name}>{item.name}</Text>
        <Text style={s.meta}>{item.email}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={s.meta}>{fmtAUD(item.totalSpentCents)} · {item.orderCount} order{item.orderCount !== 1 ? 's' : ''}</Text>
          {tierCfg && (
            <View style={[s.pillSm, { backgroundColor: tierCfg.bg }]}>
              <Text style={[s.pillSmTx, { color: tierCfg.color }]}>{tierCfg.label}</Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={MUTED} />
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorCustomerProfilesScreen() {
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<CrmCustomer | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-accounts', search],
    queryFn:  () => api.director.customers.list({ search }),
    staleTime: 30_000,
  });

  const customers: CrmCustomer[] = data?.data ?? [];
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);

  return (
    <DirectorStandaloneScreen title="Customer Accounts">
      {/* Search */}
      <View style={[s.searchWrap, { borderBottomColor: BORDER }]}>
        <View style={[s.searchBox, { borderColor: BORDER }]}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: TEXT }}
            placeholder="Search name, email, phone…"
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x-circle" size={16} color={MUTED} />
            </Pressable>
          )}
        </View>
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
          ListHeaderComponent={
            customers.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <Text style={{ fontSize: 13, color: MUTED, fontWeight: '500' }}>
                  {customers.length} customer{customers.length !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 15 }}>
                {search ? 'No customers match your search.' : 'No customers yet.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <CustomerRow
              item={item}
              onPress={() => setSelected(item)}
              isLast={index === customers.length - 1}
            />
          )}
        />
      )}

      {selected && (
        <ProfileSheet customer={selected} onClose={() => setSelected(null)} />
      )}
    </DirectorStandaloneScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  headerBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT },

  searchWrap: { backgroundColor: CARD, borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },

  customerRow: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  avatar:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '700', color: BLUE },
  name:        { fontSize: 15, fontWeight: '700', color: TEXT },
  meta:        { fontSize: 12, color: MUTED },
  pillSm:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  pillSmTx:    { fontSize: 10, fontWeight: '600' },

  // Profile sheet
  hero:         { backgroundColor: CARD, paddingHorizontal: 20, paddingVertical: 28, alignItems: 'center', borderBottomWidth: 1, gap: 4 },
  avatarLg:     { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLgText: { fontSize: 28, fontWeight: '700', color: BLUE },
  heroName:     { fontSize: 24, fontWeight: '700', color: TEXT },
  pill:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillTx:       { fontSize: 12, fontWeight: '600' },

  section:      { backgroundColor: CARD, marginTop: 8, paddingHorizontal: 20, paddingVertical: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  rowLabel:     { fontSize: 13, color: MUTED },
  rowValue:     { fontSize: 14, color: TEXT, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
});
