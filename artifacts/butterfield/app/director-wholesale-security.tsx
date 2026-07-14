import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const NAVY   = '#0F2044';
const BLUE   = '#1493FF';
const BG     = '#F8FAFF';
const CARD   = '#fff';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const TEXT   = '#1C1C1E';

const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  screenshot_detected:                    { bg: '#FEF3C7', text: '#92400E' },
  screen_recording_detected:              { bg: '#FEF3C7', text: '#92400E' },
  wholesale_terms_accepted:               { bg: '#F0FDF4', text: '#15803D' },
  wholesale_access_blocked_terms_not_accepted: { bg: '#FEE2E2', text: '#991B1B' },
};

const EVENT_LABELS: Record<string, string> = {
  screenshot_detected:                    '⚠ Screenshot',
  screen_recording_detected:              '⚠ Screen Recording',
  wholesale_terms_accepted:               '✓ Terms Accepted',
  wholesale_access_blocked_terms_not_accepted: 'Access Blocked',
};

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString([], {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type Tab = 'events' | 'acceptances';

export default function DirectorWholesaleSecurityScreen() {
  const insets = useSafeAreaInsets();
  const [tab,           setTab]           = useState<Tab>('events');
  const [filterType,    setFilterType]    = useState('');
  const [filterBiz,     setFilterBiz]     = useState('');

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents, isRefetching: eventsRefetching } = useQuery({
    queryKey: ['wholesale-security-events', filterType, filterBiz],
    queryFn:  () => api.director.wholesaleSecurityEvents({ eventType: filterType || undefined, businessName: filterBiz || undefined }),
    refetchInterval: 30_000,
  });

  const { data: acceptancesData, isLoading: acceptancesLoading, refetch: refetchAcceptances, isRefetching: acceptancesRefetching } = useQuery({
    queryKey: ['wholesale-terms-acceptances'],
    queryFn:  () => api.director.wholesaleTermsAcceptances(),
    refetchInterval: 60_000,
  });

  const events      = eventsData?.data ?? [];
  const acceptances = acceptancesData?.data ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Wholesale Security</Text>
          <Text style={styles.headerSub}>Screenshots & terms acceptances</Text>
        </View>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <Pressable onPress={() => setTab('events')} style={[styles.tabBtn, tab === 'events' && styles.tabBtnActive]}>
          <Text style={[styles.tabBtnText, tab === 'events' && styles.tabBtnTextActive]}>Security Events</Text>
          {events.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{events.length}</Text></View>
          )}
        </Pressable>
        <Pressable onPress={() => setTab('acceptances')} style={[styles.tabBtn, tab === 'acceptances' && styles.tabBtnActive]}>
          <Text style={[styles.tabBtnText, tab === 'acceptances' && styles.tabBtnTextActive]}>Terms Acceptances</Text>
          {acceptances.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{acceptances.length}</Text></View>
          )}
        </Pressable>
      </View>

      {tab === 'events' ? (
        <>
          {/* Filters */}
          <View style={styles.filterRow}>
            <View style={styles.filterInputWrap}>
              <Feather name="filter" size={13} color={MUTED} />
              <TextInput
                style={styles.filterInput}
                placeholder="Event type…"
                placeholderTextColor={MUTED}
                value={filterType}
                onChangeText={setFilterType}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.filterInputWrap}>
              <Feather name="briefcase" size={13} color={MUTED} />
              <TextInput
                style={styles.filterInput}
                placeholder="Business name…"
                placeholderTextColor={MUTED}
                value={filterBiz}
                onChangeText={setFilterBiz}
              />
            </View>
          </View>

          {eventsLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
          ) : (
            <FlatList
              data={events}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={eventsRefetching} onRefresh={refetchEvents} tintColor={BLUE} />}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="shield" size={32} color={MUTED} />
                  <Text style={styles.emptyText}>No security events found</Text>
                </View>
              }
              renderItem={({ item }) => {
                const colors = EVENT_COLORS[item.eventType] ?? { bg: '#F3F4F6', text: '#374151' };
                const label  = EVENT_LABELS[item.eventType] ?? item.eventType;
                return (
                  <View style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={[styles.eventBadge, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.eventBadgeText, { color: colors.text }]}>{label}</Text>
                      </View>
                      <Text style={styles.cardTime}>{fmtDate(item.createdAt as unknown as string)}</Text>
                    </View>
                    <Text style={styles.cardBiz}>{item.businessName ?? '—'}</Text>
                    <Text style={styles.cardEmail}>{item.email ?? '—'}</Text>
                    <View style={styles.cardMeta}>
                      <Text style={styles.metaChip}>📱 {item.devicePlatform ?? '—'}</Text>
                      {item.screenName ? <Text style={styles.metaChip}>🖥 {item.screenName}</Text> : null}
                      {item.termsVersion ? <Text style={styles.metaChip}>📄 {item.termsVersion}</Text> : null}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </>
      ) : (
        acceptancesLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={BLUE} />
        ) : (
          <FlatList
            data={acceptances}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={acceptancesRefetching} onRefresh={refetchAcceptances} tintColor={BLUE} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="file-text" size={32} color={MUTED} />
                <Text style={styles.emptyText}>No acceptances recorded</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.eventBadge, { backgroundColor: '#F0FDF4' }]}>
                    <Text style={[styles.eventBadgeText, { color: '#15803D' }]}>✓ Terms Accepted</Text>
                  </View>
                  <Text style={styles.cardTime}>{fmtDate(item.acceptedAt as unknown as string)}</Text>
                </View>
                <Text style={styles.cardBiz}>{item.businessName ?? '—'}</Text>
                {item.contactName ? (
                  <Text style={styles.cardContact}>{item.contactName}</Text>
                ) : null}
                <Text style={styles.cardEmail}>{item.email ?? '—'}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaChip}>📄 {item.termsVersion}</Text>
                  <Text style={styles.metaChip}>📱 {item.devicePlatform ?? '—'}</Text>
                  {item.appVersion ? <Text style={styles.metaChip}>v{item.appVersion}</Text> : null}
                  {item.ipAddress  ? <Text style={styles.metaChip}>🌐 {item.ipAddress}</Text> : null}
                </View>
              </View>
            )}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1, backgroundColor: BG },

  header:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  backBtn:           { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  headerTitle:       { fontSize: 17, fontWeight: '700', color: NAVY },
  headerSub:         { fontSize: 12, color: MUTED, marginTop: 1 },

  tabRow:            { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  tabBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabBtnActive:      { borderBottomWidth: 2, borderBottomColor: BLUE },
  tabBtnText:        { fontSize: 14, fontWeight: '600', color: MUTED },
  tabBtnTextActive:  { color: BLUE },
  badge:             { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText:         { fontSize: 11, fontWeight: '700', color: BLUE },

  filterRow:         { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  filterInputWrap:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  filterInput:       { flex: 1, fontSize: 13, color: TEXT },

  listContent:       { padding: 14, gap: 10 },

  card:              { backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardTop:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  eventBadge:        { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  eventBadgeText:    { fontSize: 12, fontWeight: '700' },
  cardTime:          { fontSize: 11, color: MUTED },
  cardBiz:           { fontSize: 14, fontWeight: '700', color: TEXT },
  cardContact:       { fontSize: 13, fontWeight: '500', color: TEXT, marginTop: 2 },
  cardEmail:         { fontSize: 12, color: MUTED, marginTop: 1, marginBottom: 8 },
  cardMeta:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip:          { fontSize: 11, color: MUTED, backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },

  empty:             { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText:         { fontSize: 15, color: MUTED },
});
