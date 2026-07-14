import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, type AuditLogEntry } from '@/lib/api';
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

function actionColor(action: string): string {
  return ACTION_COLORS[action] ?? NAVY;
}

function shortAction(action: string): string {
  return action.replace(/^pos\./, 'POS: ')
               .replace(/^auth\./, 'Auth: ')
               .replace(/^settings\./, 'Settings: ')
               .replace(/^director\./, 'Director: ')
               .replace(/_/g, ' ')
               .replace(/\b\w/g, c => c.toUpperCase());
}

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

const EVENT_TYPE_FILTERS = [
  { label: 'All',      value: '' },
  { label: 'POS',      value: 'pos' },
  { label: 'Auth',     value: 'auth' },
  { label: 'Settings', value: 'settings' },
  { label: 'Director', value: 'director' },
];

const DATE_RANGE_OPTIONS = [
  { label: 'All time', from: undefined, to: undefined },
  { label: 'Today',    from: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }, to: undefined },
  { label: '7 days',   from: () => new Date(Date.now() - 7 * 86400000).toISOString(), to: undefined },
  { label: '30 days',  from: () => new Date(Date.now() - 30 * 86400000).toISOString(), to: undefined },
];

function AuditCard({ item }: { item: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = actionColor(item.action);

  const metaStr = tryParseJson(item.metadataJson);
  const beforeStr = tryParseJson(item.beforeJson);
  const afterStr = tryParseJson(item.afterJson);
  const hasDetails = metaStr || beforeStr || afterStr;

  return (
    <Pressable
      style={styles.card}
      onPress={() => hasDetails && setExpanded(e => !e)}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.actionLabel, { color }]}>{shortAction(item.action)}</Text>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.actorText}>
          {item.actorName ?? 'Unknown'} · {item.actorRole ?? 'n/a'}
        </Text>
        {item.entityType && item.entityId ? (
          <Text style={styles.metaText}>
            {item.entityType} · {item.entityId.slice(0, 16)}
          </Text>
        ) : null}
        {item.reason ? (
          <Text style={styles.metaText}>Reason: {item.reason}</Text>
        ) : null}
        {hasDetails ? (
          <View style={styles.expandHint}>
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={MUTED} />
            <Text style={styles.expandHintText}>{expanded ? 'Hide details' : 'Show details'}</Text>
          </View>
        ) : null}
        {expanded && (
          <View style={styles.detailsBox}>
            {metaStr ? (
              <>
                <Text style={styles.detailsLabel}>Metadata</Text>
                <Text style={styles.detailsJson}>{metaStr}</Text>
              </>
            ) : null}
            {beforeStr ? (
              <>
                <Text style={styles.detailsLabel}>Before</Text>
                <Text style={styles.detailsJson}>{beforeStr}</Text>
              </>
            ) : null}
            {afterStr ? (
              <>
                <Text style={styles.detailsLabel}>After</Text>
                <Text style={styles.detailsJson}>{afterStr}</Text>
              </>
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function DirectorAuditLogScreen() {
  const [activeFilter, setActiveFilter] = useState('');
  const [dateRangeIdx, setDateRangeIdx] = useState(0);
  const [actorSearch, setActorSearch] = useState('');
  const [committedActor, setCommittedActor] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const dateRange = DATE_RANGE_OPTIONS[dateRangeIdx];
  const fromDate = typeof dateRange.from === 'function' ? dateRange.from() : dateRange.from;

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

  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleFilterPress(value: string) {
    setActiveFilter(value);
    setPage(1);
  }

  function handleDateRange(idx: number) {
    setDateRangeIdx(idx);
    setPage(1);
  }

  function commitActorSearch() {
    setCommittedActor(actorSearch.trim());
    setPage(1);
  }

  function clearActorSearch() {
    setActorSearch('');
    setCommittedActor('');
    setPage(1);
  }

  return (
    <DirectorStandaloneScreen title="Audit Log" subtitle={`${total} events`}>
      <View style={styles.container}>
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>EVENT TYPE</Text>
          <View style={styles.filterRow}>
            {EVENT_TYPE_FILTERS.map(f => (
              <Pressable
                key={f.value}
                style={[styles.chip, activeFilter === f.value && styles.chipActive]}
                onPress={() => handleFilterPress(f.value)}
              >
                <Text style={[styles.chipText, activeFilter === f.value && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterLabel}>DATE RANGE</Text>
          <View style={styles.filterRow}>
            {DATE_RANGE_OPTIONS.map((d, idx) => (
              <Pressable
                key={d.label}
                style={[styles.chip, dateRangeIdx === idx && styles.chipActive]}
                onPress={() => handleDateRange(idx)}
              >
                <Text style={[styles.chipText, dateRangeIdx === idx && styles.chipTextActive]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterLabel}>USER / ACTOR</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name…"
              placeholderTextColor={MUTED}
              value={actorSearch}
              onChangeText={setActorSearch}
              onSubmitEditing={commitActorSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {committedActor ? (
              <Pressable style={styles.clearBtn} onPress={clearActorSearch}>
                <Feather name="x" size={16} color={MUTED} />
              </Pressable>
            ) : (
              <Pressable style={styles.searchBtn} onPress={commitActorSearch}>
                <Feather name="search" size={16} color={CARD} />
              </Pressable>
            )}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="shield" size={36} color={MUTED} />
            <Text style={styles.emptyText}>No audit events found</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={i => i.id}
            renderItem={({ item }) => <AuditCard item={item} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
            onRefresh={refetch}
            refreshing={isFetching && !isLoading}
            ListFooterComponent={
              totalPages > 1 ? (
                <View style={styles.pager}>
                  <Pressable
                    style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                    onPress={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <Feather name="chevron-left" size={18} color={page <= 1 ? MUTED : NAVY} />
                  </Pressable>
                  <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
                  <Pressable
                    style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                    onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <Feather name="chevron-right" size={18} color={page >= totalPages ? MUTED : NAVY} />
                  </Pressable>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: BG },
  filterSection:  { backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  filterLabel:    { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  filterRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  searchRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchInput:    { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 10, fontSize: 14, color: TEXT, backgroundColor: BG },
  searchBtn:      { width: 36, height: 36, borderRadius: 8, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  clearBtn:       { width: 36, height: 36, borderRadius: 8, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  chipActive:     { backgroundColor: NAVY, borderColor: NAVY },
  chipText:       { fontSize: 13, color: TEXT },
  chipTextActive: { color: '#fff' },
  card:           { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  dot:            { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 12 },
  cardBody:       { flex: 1 },
  cardRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  actionLabel:    { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  dateText:       { fontSize: 12, color: MUTED },
  actorText:      { fontSize: 13, color: TEXT, marginBottom: 2 },
  metaText:       { fontSize: 12, color: MUTED, marginTop: 1 },
  expandHint:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  expandHintText: { fontSize: 11, color: MUTED },
  detailsBox:     { marginTop: 8, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: BORDER },
  detailsLabel:   { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 4, marginTop: 6 },
  detailsJson:    { fontSize: 11, color: TEXT, fontFamily: 'monospace', lineHeight: 16 },
  empty:          { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:      { fontSize: 16, color: MUTED },
  pager:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  pageBtn:        { padding: 8, borderRadius: 8, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  pageBtnDisabled:{ opacity: 0.4 },
  pageText:       { fontSize: 14, color: MUTED },
});
