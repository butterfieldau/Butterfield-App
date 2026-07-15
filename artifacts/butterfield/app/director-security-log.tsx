import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, type AuditLogEntry, type LoginHistoryEntry } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#1493FF';

// ── Shared helpers ────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function tryParseJson(v: unknown): string | null {
  if (!v) return null;
  try {
    const obj = typeof v === 'string' ? JSON.parse(v) : v;
    return JSON.stringify(obj, null, 2);
  } catch {
    return typeof v === 'string' ? v : null;
  }
}

const DATE_RANGE_OPTIONS = [
  { label: 'All time', from: undefined as (() => string) | undefined },
  { label: 'Today',    from: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); } },
  { label: '7 days',   from: () => new Date(Date.now() - 7 * 86400000).toISOString() },
  { label: '30 days',  from: () => new Date(Date.now() - 30 * 86400000).toISOString() },
];

// ── Audit Log tab ─────────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  'pos.refund':                   RED,
  'pos.void':                     RED,
  'pos.discount':                 AMBER,
  'pos.refund_pin_fail':          RED,
  'pos.discount_pin_fail':        RED,
  'auth.login':                   GREEN,
  'auth.login_fail':              RED,
  'settings.pin_verify_fail':     RED,
  'settings.pin_verify_success':  GREEN,
  'director.pos_thresholds_update': BLUE,
};
function actionColor(action: string) { return ACTION_COLORS[action] ?? NAVY; }
function shortAction(action: string) {
  return action.replace(/^pos\./, 'POS: ')
               .replace(/^auth\./, 'Auth: ')
               .replace(/^settings\./, 'Settings: ')
               .replace(/^director\./, 'Director: ')
               .replace(/_/g, ' ')
               .replace(/\b\w/g, c => c.toUpperCase());
}

const AUDIT_TYPE_FILTERS = [
  { label: 'All',      value: '' },
  { label: 'POS',      value: 'pos' },
  { label: 'Auth',     value: 'auth' },
  { label: 'Settings', value: 'settings' },
  { label: 'Director', value: 'director' },
];

function AuditCard({ item }: { item: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = actionColor(item.action);
  const metaStr   = tryParseJson(item.metadataJson);
  const beforeStr = tryParseJson(item.beforeJson);
  const afterStr  = tryParseJson(item.afterJson);
  const hasDetails = !!(metaStr || beforeStr || afterStr);

  return (
    <Pressable style={s.card} onPress={() => hasDetails && setExpanded(e => !e)}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <View style={s.cardBody}>
        <View style={s.cardRow}>
          <Text style={[s.actionLabel, { color }]}>{shortAction(item.action)}</Text>
          <Text style={s.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={s.actorText}>{item.actorName ?? 'Unknown'} · {item.actorRole ?? 'n/a'}</Text>
        {item.entityType && item.entityId ? (
          <Text style={s.metaText}>{item.entityType} · {item.entityId.slice(0, 16)}</Text>
        ) : null}
        {item.reason ? <Text style={s.metaText}>Reason: {item.reason}</Text> : null}
        {hasDetails ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED }}>{expanded ? 'Hide details' : 'Show details'}</Text>
          </View>
        ) : null}
        {expanded && (
          <View style={s.detailsBox}>
            {metaStr   ? <><Text style={s.detailsLabel}>Metadata</Text><Text style={s.detailsJson}>{metaStr}</Text></> : null}
            {beforeStr ? <><Text style={s.detailsLabel}>Before</Text><Text style={s.detailsJson}>{beforeStr}</Text></> : null}
            {afterStr  ? <><Text style={s.detailsLabel}>After</Text><Text style={s.detailsJson}>{afterStr}</Text></> : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function AuditTab() {
  const [activeFilter, setActiveFilter] = useState('');
  const [dateRangeIdx, setDateRangeIdx] = useState(0);
  const [actorSearch, setActorSearch]   = useState('');
  const [committedActor, setCommittedActor] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const dateRange = DATE_RANGE_OPTIONS[dateRangeIdx];
  const fromDate  = dateRange.from ? dateRange.from() : undefined;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['director', 'audit-logs', activeFilter, dateRangeIdx, committedActor, page],
    queryFn: () => api.director.auditLogs({
      type: activeFilter || undefined,
      actorName: committedActor || undefined,
      from: fromDate,
      page,
      pageSize: PAGE_SIZE,
    }),
  });

  const entries    = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.filterSection}>
        <Text style={s.filterLabel}>EVENT TYPE</Text>
        <View style={s.filterRow}>
          {AUDIT_TYPE_FILTERS.map(f => (
            <Pressable
              key={f.value}
              style={[s.chip, activeFilter === f.value && s.chipActive]}
              onPress={() => { setActiveFilter(f.value); setPage(1); }}
            >
              <Text style={[s.chipText, activeFilter === f.value && s.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.filterLabel}>DATE RANGE</Text>
        <View style={s.filterRow}>
          {DATE_RANGE_OPTIONS.map((d, idx) => (
            <Pressable
              key={d.label}
              style={[s.chip, dateRangeIdx === idx && s.chipActive]}
              onPress={() => { setDateRangeIdx(idx); setPage(1); }}
            >
              <Text style={[s.chipText, dateRangeIdx === idx && s.chipTextActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.filterLabel}>USER / ACTOR</Text>
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name…"
            placeholderTextColor={MUTED}
            value={actorSearch}
            onChangeText={setActorSearch}
            onSubmitEditing={() => { setCommittedActor(actorSearch.trim()); setPage(1); }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {committedActor ? (
            <Pressable style={s.clearBtn} onPress={() => { setActorSearch(''); setCommittedActor(''); setPage(1); }}>
              <Feather name="x" size={16} color={MUTED} />
            </Pressable>
          ) : (
            <Pressable style={s.searchBtn} onPress={() => { setCommittedActor(actorSearch.trim()); setPage(1); }}>
              <Feather name="search" size={16} color={CARD} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Feather name="shield" size={36} color={MUTED} />
          <Text style={s.emptyText}>No audit events found</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <AuditCard item={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          onRefresh={refetch}
          refreshing={isFetching && !isLoading}
          ListHeaderComponent={<Text style={s.totalLabel}>{total} events</Text>}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={s.pager}>
                <Pressable style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]} onPress={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  <Feather name="chevron-left" size={18} color={page <= 1 ? MUTED : NAVY} />
                </Pressable>
                <Text style={s.pageText}>Page {page} of {totalPages}</Text>
                <Pressable style={[s.pageBtn, page >= totalPages && s.pageBtnDisabled]} onPress={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <Feather name="chevron-right" size={18} color={page >= totalPages ? MUTED : NAVY} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── Login History tab ─────────────────────────────────────────────────────────
const SUCCESS_FILTERS = [
  { label: 'All',     value: undefined as boolean | undefined },
  { label: 'Success', value: true },
  { label: 'Failed',  value: false },
];

function LoginCard({ item }: { item: LoginHistoryEntry }) {
  return (
    <View style={s.card}>
      <View style={[s.dot, { backgroundColor: item.success ? GREEN : RED }]} />
      <View style={s.cardBody}>
        <View style={s.cardRow}>
          <Text style={[s.actionLabel, { color: item.success ? GREEN : RED }]}>
            {item.success ? 'Login success' : 'Login failed'}
          </Text>
          <Text style={s.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={s.actorText}>{item.email ?? 'Unknown email'}</Text>
        {item.role ? <Text style={s.metaText}>Role: {item.role}</Text> : null}
        {!item.success && item.failReason ? <Text style={[s.metaText, { color: RED }]}>Reason: {item.failReason}</Text> : null}
        {item.ip ? <Text style={s.metaText}>IP: {item.ip}</Text> : null}
        {item.userAgent ? <Text style={s.metaText} numberOfLines={1}>{item.userAgent}</Text> : null}
      </View>
    </View>
  );
}

function LoginTab() {
  const [successFilter, setSuccessFilter] = useState<boolean | undefined>(undefined);
  const [dateRangeIdx, setDateRangeIdx]   = useState(0);
  const [emailSearch, setEmailSearch]     = useState('');
  const [emailQuery, setEmailQuery]       = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const dateRange = DATE_RANGE_OPTIONS[dateRangeIdx];
  const fromDate  = dateRange.from ? dateRange.from() : undefined;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['director', 'login-history', successFilter, dateRangeIdx, emailQuery, page],
    queryFn: () => api.director.loginHistory({
      success: successFilter,
      from: fromDate,
      email: emailQuery || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  });

  const entries    = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.filterSection}>
        <Text style={s.filterLabel}>STATUS</Text>
        <View style={s.filterRow}>
          {SUCCESS_FILTERS.map(f => (
            <Pressable
              key={String(f.value)}
              style={[s.chip, successFilter === f.value && s.chipActive]}
              onPress={() => { setSuccessFilter(f.value); setPage(1); }}
            >
              <Text style={[s.chipText, successFilter === f.value && s.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.filterLabel}>DATE RANGE</Text>
        <View style={s.filterRow}>
          {DATE_RANGE_OPTIONS.map((d, idx) => (
            <Pressable
              key={d.label}
              style={[s.chip, dateRangeIdx === idx && s.chipActive]}
              onPress={() => { setDateRangeIdx(idx); setPage(1); }}
            >
              <Text style={[s.chipText, dateRangeIdx === idx && s.chipTextActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.filterLabel}>SEARCH BY EMAIL</Text>
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            value={emailSearch}
            onChangeText={setEmailSearch}
            onSubmitEditing={() => { setEmailQuery(emailSearch.trim()); setPage(1); }}
            placeholder="e.g. staff@demo.com"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <Pressable style={s.searchBtn} onPress={() => { setEmailQuery(emailSearch.trim()); setPage(1); }}>
            <Feather name="search" size={16} color="#fff" />
          </Pressable>
          {emailQuery ? (
            <Pressable style={s.clearBtn} onPress={() => { setEmailSearch(''); setEmailQuery(''); setPage(1); }}>
              <Feather name="x" size={14} color={MUTED} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={s.empty}>
          <Feather name="log-in" size={36} color={MUTED} />
          <Text style={s.emptyText}>No login events found</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={i => i.id}
          renderItem={({ item }) => <LoginCard item={item} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          onRefresh={refetch}
          refreshing={isFetching && !isLoading}
          ListHeaderComponent={<Text style={s.totalLabel}>{total} events</Text>}
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={s.pager}>
                <Pressable style={[s.pageBtn, page <= 1 && s.pageBtnDisabled]} onPress={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  <Feather name="chevron-left" size={18} color={page <= 1 ? MUTED : NAVY} />
                </Pressable>
                <Text style={s.pageText}>Page {page} of {totalPages}</Text>
                <Pressable style={[s.pageBtn, page >= totalPages && s.pageBtnDisabled]} onPress={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <Feather name="chevron-right" size={18} color={page >= totalPages ? MUTED : NAVY} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
type LogTab = 'audit' | 'logins';

const LOG_TABS: { key: LogTab; label: string; icon: string }[] = [
  { key: 'audit',  label: 'Audit Log',      icon: 'list' },
  { key: 'logins', label: 'Login History',  icon: 'log-in' },
];

export default function DirectorSecurityLogScreen() {
  const [activeTab, setActiveTab] = useState<LogTab>('audit');

  return (
    <DirectorStandaloneScreen title="Security Log" subtitle="Audit events & login history">
      {/* Tab bar */}
      <View style={s.tabBar}>
        {LOG_TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { Haptics.selectionAsync(); setActiveTab(t.key); }}
              style={[s.tabItem, active && s.tabItemActive]}
            >
              <Feather name={t.icon as any} size={15} color={active ? NAVY : MUTED} />
              <Text style={[s.tabLabel, { color: active ? NAVY : MUTED, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === 'audit'  ? <AuditTab /> : <LoginTab />}
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  tabBar:   { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  tabItem:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: NAVY },
  tabLabel: { fontSize: 14 },

  filterSection: { backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  filterLabel:   { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  filterRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  searchRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchInput:   { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, fontSize: 14, color: TEXT, backgroundColor: BG },
  searchBtn:     { width: 36, height: 36, borderRadius: 8, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  clearBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  chip:          { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  chipActive:    { backgroundColor: NAVY, borderColor: NAVY },
  chipText:      { fontSize: 13, color: TEXT },
  chipTextActive:{ color: '#fff' },

  card:       { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  dot:        { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 12 },
  cardBody:   { flex: 1 },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  actionLabel:{ fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  dateText:   { fontSize: 12, color: MUTED },
  actorText:  { fontSize: 13, color: TEXT, marginBottom: 2 },
  metaText:   { fontSize: 12, color: MUTED, marginTop: 1 },
  detailsBox: { marginTop: 8, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: BORDER },
  detailsLabel:{ fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 4, marginTop: 6 },
  detailsJson: { fontSize: 11, color: TEXT, fontFamily: 'monospace', lineHeight: 16 },

  totalLabel: { fontSize: 12, color: MUTED, marginBottom: 8 },
  empty:      { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:  { fontSize: 16, color: MUTED },
  pager:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  pageBtn:    { padding: 8, borderRadius: 8, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  pageBtnDisabled: { opacity: 0.4 },
  pageText:   { fontSize: 14, color: MUTED },
});
