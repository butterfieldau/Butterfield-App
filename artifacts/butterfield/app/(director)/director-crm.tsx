import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CrmInsights, type CrmSegment } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, icon, color, sub }: {
  label: string; value: string | number; icon: string; color: string; sub?: string;
}) {
  return (
    <View style={[s.metricCard, { borderLeftColor: color }]}>
      <View style={[s.metricIcon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
    </View>
  );
}

// ── Segment notify modal ──────────────────────────────────────────────────────
function SegmentNotifyModal({ segment, onClose }: { segment: CrmSegment; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing fields', 'Please enter a title and message.');
      return;
    }
    setSending(true);
    try {
      const res = await api.director.customers.segmentNotify(segment.key, title.trim(), body.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent!', `Notification sent to ${res.sent} customer${res.sent !== 1 ? 's' : ''} in ${segment.label}.`);
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[s.modalHeader, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
          <Pressable onPress={onClose} style={s.headerBtn} hitSlop={10}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={s.modalTitle}>Notify Segment</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={[s.card, { backgroundColor: segment.color + '12', borderColor: segment.color + '30' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.segIconSm, { backgroundColor: segment.color + '20' }]}>
                <Feather name={segment.icon as any} size={16} color={segment.color} />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{segment.label}</Text>
                <Text style={{ fontSize: 12, color: MUTED }}>{segment.count} customer{segment.count !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Notification title</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Special offer for VIP members"
              placeholderTextColor={MUTED}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Message</Text>
            <TextInput
              style={[s.input, { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Write your message here…"
              placeholderTextColor={MUTED}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={300}
            />
            <Text style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>{body.length}/300</Text>
          </View>

          <Pressable
            onPress={send}
            disabled={sending || !title.trim() || !body.trim()}
            style={[s.sendBtn, { opacity: sending || !title.trim() || !body.trim() ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Feather name="send" size={16} color="#fff" />
                <Text style={s.sendBtnText}>Send to {segment.count} customer{segment.count !== 1 ? 's' : ''}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────
function DashboardTab({ insights, isLoading, onRefresh, refreshing }: {
  insights: CrmInsights | null;
  isLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  const metrics = [
    { label: 'Total Customers',    value: insights?.totalCustomers ?? 0,         icon: 'users',       color: BLUE },
    { label: 'New This Month',     value: insights?.newThisMonth ?? 0,            icon: 'user-plus',   color: GREEN },
    { label: 'Repeat Customers',   value: insights?.repeatCustomers ?? 0,         icon: 'refresh-cw',  color: '#8B5CF6' },
    { label: 'Inactive',           value: insights?.inactiveCount ?? 0,           icon: 'clock',       color: '#EF4444' },
    { label: 'VIP Customers',      value: insights?.vipCount ?? 0,                icon: 'star',        color: '#7C3AED' },
    { label: 'Rewards Members',    value: insights?.rewardsMemberCount ?? 0,      icon: 'gift',        color: '#059669' },
    { label: 'Coffee Stamp Users', value: insights?.coffeeStampUserCount ?? 0,    icon: 'coffee',      color: '#92400E' },
    { label: 'Avg Customer Spend', value: fmtAUD(insights?.avgSpendCents ?? 0),   icon: 'trending-up', color: '#D97706' },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 0, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      <Text style={s.sectionHeading}>Customer Overview</Text>
      <View style={s.metricsGrid}>
        {metrics.map(m => (
          <MetricCard key={m.label} {...m} />
        ))}
      </View>

      {(insights?.topSpenders?.length ?? 0) > 0 && (
        <>
          <Text style={[s.sectionHeading, { marginTop: 24 }]}>Top Spenders</Text>
          <View style={s.card}>
            {insights!.topSpenders.map((sp, i, arr) => (
              <View key={sp.userId} style={[s.spenderRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                <View style={s.spenderRank}><Text style={s.spenderRankText}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT }}>{sp.name}</Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>{sp.totalVisits} visit{sp.totalVisits !== 1 ? 's' : ''}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: NAVY }}>{fmtAUD(sp.totalSpentCents)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ── Segments tab ──────────────────────────────────────────────────────────────
function SegmentsTab({ segments, isLoading, onRefresh, refreshing }: {
  segments: CrmSegment[];
  isLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [notifyTarget, setNotifyTarget] = useState<CrmSegment | null>(null);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BLUE} size="large" />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={segments}
        keyExtractor={s => s.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListHeaderComponent={
          <Text style={[s.sectionHeading, { marginBottom: 12 }]}>Customer Segments</Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: seg }) => (
          <View style={[s.segCard, { borderLeftColor: seg.color }]}>
            <View style={[s.segIcon, { backgroundColor: seg.color + '18' }]}>
              <Feather name={seg.icon as any} size={20} color={seg.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.segLabel}>{seg.label}</Text>
                <View style={[s.segCountBadge, { backgroundColor: seg.color + '18' }]}>
                  <Text style={[s.segCountText, { color: seg.color }]}>{seg.count}</Text>
                </View>
              </View>
              <Text style={s.segDesc}>{seg.description}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/director-customer-profiles', params: { segment: seg.key, segmentLabel: seg.label } } as any);
                }}
                style={s.segAction}
              >
                <Feather name="users" size={14} color={BLUE} />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNotifyTarget(seg);
                }}
                style={[s.segAction, { backgroundColor: seg.color + '15', borderColor: seg.color + '40' }]}
              >
                <Feather name="bell" size={14} color={seg.color} />
              </Pressable>
            </View>
          </View>
        )}
      />
      {notifyTarget && (
        <SegmentNotifyModal segment={notifyTarget} onClose={() => setNotifyTarget(null)} />
      )}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DirectorCrmScreen() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'segments'>('dashboard');
  const [refreshingDash, setRefreshingDash] = useState(false);
  const [refreshingSeg, setRefreshingSeg]   = useState(false);

  const { data: insightsData, isLoading: loadingInsights, refetch: refetchInsights } = useQuery({
    queryKey: ['crm-insights'],
    queryFn:  () => api.director.customers.insights(),
    staleTime: 60_000,
  });

  const { data: segmentsData, isLoading: loadingSegments, refetch: refetchSegments } = useQuery({
    queryKey: ['crm-segments'],
    queryFn:  () => api.director.customers.segments(),
    staleTime: 60_000,
  });

  const insights: CrmInsights | null = (insightsData?.data as any) ?? null;
  const segments: CrmSegment[]       = segmentsData?.data ?? [];

  const onRefreshDash = async () => { setRefreshingDash(true); await refetchInsights(); setRefreshingDash(false); };
  const onRefreshSeg  = async () => { setRefreshingSeg(true);  await refetchSegments();  setRefreshingSeg(false); };

  return (
    <DirectorStandaloneScreen title="CRM">
      {/* Tab bar */}
      <View style={s.tabBar}>
        {(['dashboard', 'segments'] as const).map(tab => (
          <Pressable
            key={tab}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(tab); }}
            style={[s.tab, activeTab === tab && s.tabActive]}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === 'dashboard' ? 'Dashboard' : 'Segments'}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'dashboard' ? (
        <DashboardTab
          insights={insights}
          isLoading={loadingInsights}
          onRefresh={onRefreshDash}
          refreshing={refreshingDash}
        />
      ) : (
        <SegmentsTab
          segments={segments}
          isLoading={loadingSegments}
          onRefresh={onRefreshSeg}
          refreshing={refreshingSeg}
        />
      )}
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: BLUE },
  tabText: { fontSize: 14, fontWeight: '600', color: MUTED },
  tabTextActive: { color: BLUE },

  sectionHeading: { fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '47.5%',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    gap: 4,
  },
  metricIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  metricValue: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.5 },
  metricLabel: { fontSize: 12, color: MUTED, fontWeight: '500', lineHeight: 16 },
  metricSub:   { fontSize: 11, color: MUTED, fontWeight: '400' },

  card: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  spenderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  spenderRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  spenderRankText: { fontSize: 12, fontWeight: '700', color: BLUE },

  segCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    borderLeftWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  segIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segIconSm: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
  segDesc:  { fontSize: 12, color: MUTED },
  segCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  segCountText:  { fontSize: 12, fontWeight: '700' },
  segAction: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EAF3FF', borderWidth: 1, borderColor: '#DBEAFE',
  },

  // Notify modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT,
  },
  sendBtn: {
    backgroundColor: NAVY, borderRadius: 12, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
