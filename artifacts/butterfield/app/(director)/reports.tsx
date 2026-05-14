import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorFeedback } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

const TABS = ['Revenue', 'Feedback'] as const;
type TabKey = typeof TABS[number];

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <View style={{ height: 6, backgroundColor: BORDER, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={[styles.statBox, { backgroundColor: CARD, borderColor: BORDER }]}>
      <Text style={[styles.statVal, { color: color ?? TEXT }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function RevenueTab() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-reports'],
    queryFn: () => api.director.reports(),
    staleTime: 60_000,
  });
  const r = data?.data;
  const maxDaily = Math.max(...(r?.dailyRevenue?.map(d => d.totalCents) ?? [1]));

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
    >
      {/* Revenue stats */}
      <Text style={styles.section}>REVENUE</Text>
      <View style={styles.statRow}>
        <StatBox label="Today"     value={fmtAUD(r?.revenue.today ?? 0)} color={BLUE} />
        <StatBox label="This Week" value={fmtAUD(r?.revenue.week  ?? 0)} />
        <StatBox label="This Month"value={fmtAUD(r?.revenue.month ?? 0)} />
      </View>

      {/* Order stats */}
      <Text style={styles.section}>ORDERS</Text>
      <View style={styles.statRow}>
        <StatBox label="Today"     value={String(r?.orders.today ?? 0)} />
        <StatBox label="This Week" value={String(r?.orders.week  ?? 0)} />
        <StatBox label="This Month"value={String(r?.orders.month ?? 0)} />
      </View>

      <View style={styles.statRow}>
        <StatBox label="Avg Order Value" value={fmtAUD(r?.orders.avgValueCents ?? 0)} sub="(7 days)" />
        <StatBox label="New Customers"   value={String(r?.customers.newWeek ?? 0)} sub="this week" color={GREEN} />
        <StatBox label="Total Customers" value={String(r?.customers.total ?? 0)} />
      </View>

      {/* Order type breakdown */}
      {(r?.byType?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>BY ORDER TYPE (THIS MONTH)</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.byType.map(t => (
              <View key={t.type} style={styles.breakRow}>
                <Text style={styles.breakLabel}>{t.type.replace('_', ' ').toUpperCase()}</Text>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <MiniBar value={t.count} max={r!.orders.month || 1} color={BLUE} />
                </View>
                <Text style={styles.breakCount}>{t.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Order status breakdown */}
      {(r?.byStatus?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>BY STATUS (THIS MONTH)</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.byStatus.map(s => {
              const c = s.status === 'completed' ? GREEN : s.status === 'cancelled' ? RED : AMBER;
              return (
                <View key={s.status} style={styles.breakRow}>
                  <Text style={styles.breakLabel}>{s.status.replace('_', ' ').toUpperCase()}</Text>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <MiniBar value={s.count} max={r!.orders.month || 1} color={c} />
                  </View>
                  <Text style={styles.breakCount}>{s.count}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* 30-day daily revenue */}
      {(r?.dailyRevenue?.length ?? 0) > 0 && (
        <>
          <Text style={styles.section}>DAILY REVENUE — LAST 30 DAYS</Text>
          <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            {r!.dailyRevenue.slice(-14).map((d, i) => (
              <View key={i} style={styles.breakRow}>
                <Text style={[styles.breakLabel, { width: 64 }]}>{fmtDateShort(d.day)}</Text>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <MiniBar value={d.totalCents} max={maxDaily} color={NAVY} />
                </View>
                <Text style={styles.breakCount}>{fmtAUD(d.totalCents)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-feedback'],
    queryFn: () => api.director.allFeedback(),
  });
  const feedback = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-feedback'] }),
  });

  const CATS: Record<string, { color: string; bg: string }> = {
    general:  { color: '#0369A1', bg: '#EBF8FF' },
    product:  { color: '#5B21B6', bg: '#EDE9FE' },
    service:  { color: '#166534', bg: '#DCFCE7' },
    app:      { color: '#854D0E', bg: '#FEF9C3' },
    complaint:{ color: '#991B1B', bg: '#FEF2F2' },
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <FlatList
      data={feedback}
      keyExtractor={f => f.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Feather name="message-square" size={32} color={MUTED} />
          <Text style={styles.emptyText}>No feedback yet</Text>
        </View>
      }
      renderItem={({ item: f }: { item: DirectorFeedback }) => {
        const cat = CATS[f.category] ?? { color: MUTED, bg: BG };
        return (
          <Pressable
            style={[styles.card, { backgroundColor: f.isRead ? CARD : '#F0F9FF', borderColor: f.isRead ? BORDER : BLUE + '40' }]}
            onPress={() => {
              if (!f.isRead) {
                Haptics.selectionAsync();
                markRead.mutate(f.id);
              }
            }}
          >
            <View style={styles.fbHeader}>
              <View style={[styles.pill, { backgroundColor: cat.bg }]}>
                <Text style={[styles.pillText, { color: cat.color }]}>{f.category.toUpperCase()}</Text>
              </View>
              {f.rating != null && (
                <View style={styles.ratingRow}>
                  {[1,2,3,4,5].map(n => (
                    <Feather key={n} name="star" size={11} color={n <= f.rating! ? AMBER : BORDER} />
                  ))}
                </View>
              )}
              <Text style={styles.fbDate}>{fmtDate(f.createdAt)}</Text>
              {!f.isRead && <View style={[styles.dot, { backgroundColor: BLUE, width: 8, height: 8 }]} />}
            </View>
            <Text style={styles.fbMessage}>{f.message}</Text>
          </Pressable>
        );
      }}
    />
  );
}

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Revenue');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Sub-tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: BORDER }]}>
        {TABS.map(t => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Revenue'  && <RevenueTab />}
      {tab === 'Feedback' && <FeedbackTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:   { fontSize: 14, fontWeight: '400', color: '#8E8E93' },
  tabBar:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:     { fontSize: 13, fontWeight: '600' },
  section:     { fontSize: 11, fontWeight: '700', color: '#8E8E93', letterSpacing: 1.5 },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  statRow:     { flexDirection: 'row', gap: 8 },
  statBox:     { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  statVal:     { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  statLabel:   { fontSize: 10, fontWeight: '500', color: '#8E8E93', textAlign: 'center' },
  statSub:     { fontSize: 9, fontWeight: '400', color: '#8E8E93', textAlign: 'center' },
  breakRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakLabel:  { fontSize: 11, fontWeight: '500', color: '#8E8E93', width: 80 },
  breakCount:  { fontSize: 12, fontWeight: '700', color: '#1C1C1E', textAlign: 'right', width: 60 },
  pill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  fbHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fbDate:      { fontSize: 11, fontWeight: '400', color: '#8E8E93', marginLeft: 'auto' },
  fbMessage:   { fontSize: 14, fontWeight: '400', color: '#1C1C1E', lineHeight: 20 },
  ratingRow:   { flexDirection: 'row', gap: 2 },
});
