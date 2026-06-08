import { Feather } from '@expo/vector-icons';
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
import { api, type LoginHistoryEntry } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function LoginCard({ item }: { item: LoginHistoryEntry }) {
  return (
    <View style={styles.card}>
      <View style={[styles.statusDot, { backgroundColor: item.success ? GREEN : RED }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.statusLabel, { color: item.success ? GREEN : RED }]}>
            {item.success ? 'Login success' : 'Login failed'}
          </Text>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.emailText}>{item.email ?? 'Unknown email'}</Text>
        {item.role ? <Text style={styles.metaText}>Role: {item.role}</Text> : null}
        {!item.success && item.failReason ? (
          <Text style={[styles.metaText, { color: RED }]}>Reason: {item.failReason}</Text>
        ) : null}
        {item.ip ? <Text style={styles.metaText}>IP: {item.ip}</Text> : null}
        {item.userAgent ? (
          <Text style={styles.metaText} numberOfLines={1}>{item.userAgent}</Text>
        ) : null}
      </View>
    </View>
  );
}

const SUCCESS_FILTERS = [
  { label: 'All',     value: undefined },
  { label: 'Success', value: true },
  { label: 'Failed',  value: false },
];

const DATE_RANGE_OPTIONS = [
  { label: 'All time', from: undefined },
  { label: 'Today',    from: () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); } },
  { label: '7 days',   from: () => new Date(Date.now() - 7 * 86400000).toISOString() },
  { label: '30 days',  from: () => new Date(Date.now() - 30 * 86400000).toISOString() },
];

export default function DirectorLoginHistoryScreen() {
  const [successFilter, setSuccessFilter] = useState<boolean | undefined>(undefined);
  const [dateRangeIdx, setDateRangeIdx] = useState(0);
  const [emailSearch, setEmailSearch] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const dateRange = DATE_RANGE_OPTIONS[dateRangeIdx];
  const fromDate = typeof dateRange.from === 'function' ? dateRange.from() : dateRange.from;

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

  const entries = data?.data ?? [];
  const total   = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSuccessFilter(value: boolean | undefined) {
    setSuccessFilter(value);
    setPage(1);
  }

  function handleDateRange(idx: number) {
    setDateRangeIdx(idx);
    setPage(1);
  }

  function handleEmailSearch() {
    setEmailQuery(emailSearch.trim());
    setPage(1);
  }

  return (
    <DirectorStandaloneScreen title="Login History" subtitle={`${total} events`}>
      <View style={styles.container}>
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>STATUS</Text>
          <View style={styles.filterRow}>
            {SUCCESS_FILTERS.map(f => (
              <Pressable
                key={String(f.value)}
                style={[styles.chip, successFilter === f.value && styles.chipActive]}
                onPress={() => handleSuccessFilter(f.value)}
              >
                <Text style={[styles.chipText, successFilter === f.value && styles.chipTextActive]}>
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

          <Text style={styles.filterLabel}>SEARCH BY EMAIL</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={emailSearch}
              onChangeText={setEmailSearch}
              onSubmitEditing={handleEmailSearch}
              placeholder="e.g. staff@demo.com"
              placeholderTextColor={MUTED}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            <Pressable style={styles.searchBtn} onPress={handleEmailSearch}>
              <Feather name="search" size={16} color="#fff" />
            </Pressable>
            {emailQuery ? (
              <Pressable style={styles.clearBtn} onPress={() => { setEmailSearch(''); setEmailQuery(''); setPage(1); }}>
                <Feather name="x" size={14} color={MUTED} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={NAVY} style={{ marginTop: 40 }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="log-in" size={36} color={MUTED} />
            <Text style={styles.emptyText}>No login events found</Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={i => i.id}
            renderItem={({ item }) => <LoginCard item={item} />}
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
  container:       { flex: 1, backgroundColor: BG },
  filterSection:   { backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  filterLabel:     { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  filterRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip:            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  chipActive:      { backgroundColor: NAVY, borderColor: NAVY },
  chipText:        { fontSize: 13, color: TEXT },
  chipTextActive:  { color: '#fff' },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchInput:     { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: TEXT, backgroundColor: '#F9FAFB' },
  searchBtn:       { backgroundColor: NAVY, borderRadius: 10, padding: 10 },
  clearBtn:        { padding: 8 },
  card:            { flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  statusDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 12 },
  cardBody:        { flex: 1 },
  cardRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  statusLabel:     { fontSize: 14, fontWeight: '600' },
  dateText:        { fontSize: 12, color: MUTED },
  emailText:       { fontSize: 13, color: TEXT, marginBottom: 2 },
  metaText:        { fontSize: 12, color: MUTED, marginTop: 1 },
  empty:           { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:       { fontSize: 16, color: MUTED },
  pager:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 },
  pageBtn:         { padding: 8, borderRadius: 8, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  pageBtnDisabled: { opacity: 0.4 },
  pageText:        { fontSize: 14, color: MUTED },
});
