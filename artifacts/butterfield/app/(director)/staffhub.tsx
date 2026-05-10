import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#40C0F2';
const RED    = '#F40009';
const AMBER  = '#F59E0B';
const GREEN  = '#22C55E';
const PURPLE = '#8B5CF6';
const PINK   = '#EC4899';

type Tab = 'issues' | 'wastage' | 'leave' | 'feedback';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'issues',   label: 'Issues',   icon: 'alert-triangle' },
  { key: 'wastage',  label: 'Wastage',  icon: 'trash-2'        },
  { key: 'leave',    label: 'Leave',    icon: 'calendar'       },
  { key: 'feedback', label: 'Feedback', icon: 'message-circle' },
];

function timeAgo(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAUD(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function priorityColor(p: string) {
  if (p === 'urgent' || p === 'high') return RED;
  if (p === 'medium') return AMBER;
  return MUTED;
}

function statusColor(s: string) {
  if (s === 'open')        return RED;
  if (s === 'in_progress') return AMBER;
  if (s === 'resolved')    return GREEN;
  return MUTED;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <Text style={[s.badgeText, { color }]}>{label.replace('_', ' ').toUpperCase()}</Text>
    </View>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={s.empty}>
      <Feather name={icon as any} size={32} color={BORDER} />
      <Text style={s.emptyText}>{message}</Text>
    </View>
  );
}

// ── Issues tab ────────────────────────────────────────────────────────────────
function IssuesTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-all-issues'],
    queryFn: () => api.director.allIssues(),
    staleTime: 0,
  });
  const issues: any[] = data?.data ?? [];

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.director.resolveIssue(id, status),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['director-all-issues'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleAction = (issue: any) => {
    const opts: any[] = [];
    if (issue.status === 'open') {
      opts.push({ text: 'Mark In Progress', onPress: () => resolve.mutate({ id: issue.id, status: 'in_progress' }) });
      opts.push({ text: 'Mark Resolved',    onPress: () => resolve.mutate({ id: issue.id, status: 'resolved' }) });
    } else if (issue.status === 'in_progress') {
      opts.push({ text: 'Mark Resolved',    onPress: () => resolve.mutate({ id: issue.id, status: 'resolved' }) });
    }
    if (issue.status !== 'closed') {
      opts.push({ text: 'Close Issue',      onPress: () => resolve.mutate({ id: issue.id, status: 'closed' }) });
    }
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(issue.title, `${issue.description}\n\nReported by: ${issue.staffName ?? 'Unknown'}\nCategory: ${issue.category}\nPriority: ${issue.priority}`, opts);
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {issues.length === 0
        ? <EmptyState icon="check-circle" message="No issues reported" />
        : issues.map((item: any) => (
          <Pressable key={item.id} onPress={() => handleAction(item)} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: priorityColor(item.priority) + '18' }]}>
                <Feather name="alert-triangle" size={15} color={priorityColor(item.priority)} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'} · {item.category}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </View>
            <Text style={[s.cardDesc, { color: MUTED }]} numberOfLines={2}>{item.description}</Text>
            <View style={s.cardFooter}>
              <Badge label={item.priority} color={priorityColor(item.priority)} />
              <Badge label={item.status}   color={statusColor(item.status)} />
              <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Wastage tab ───────────────────────────────────────────────────────────────
function WastageTab() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-all-wastage'],
    queryFn: () => api.director.allWastage(),
    staleTime: 0,
  });
  const wastage: any[] = data?.data ?? [];

  const handlePress = (item: any) => {
    const cost = item.estimatedCostCents ? fmtAUD(item.estimatedCostCents) : 'Not estimated';
    Alert.alert(
      `Wastage: ${item.productName}`,
      `Staff: ${item.staffName ?? 'Unknown'}\nQuantity: ${item.quantity} ${item.unit}\nReason: ${item.reason}\nEst. cost: ${cost}${item.notes ? `\nNotes: ${item.notes}` : ''}`,
      [{ text: 'OK' }],
    );
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  const totalCost = wastage.reduce((sum, w) => sum + (w.estimatedCostCents ?? 0), 0);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {totalCost > 0 && (
        <View style={[s.summaryCard, { backgroundColor: PURPLE + '12', borderColor: PURPLE + '40' }]}>
          <Feather name="trash-2" size={16} color={PURPLE} />
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: PURPLE }]}>Total Wastage Cost</Text>
            <Text style={[s.summarySub, { color: MUTED }]}>{wastage.length} entries · estimated {fmtAUD(totalCost)} lost</Text>
          </View>
        </View>
      )}
      {wastage.length === 0
        ? <EmptyState icon="trash-2" message="No wastage logged" />
        : wastage.map((item: any) => (
          <Pressable key={item.id} onPress={() => handlePress(item)} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: PURPLE + '18' }]}>
                <Feather name="trash-2" size={15} color={PURPLE} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.productName}</Text>
                <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item.estimatedCostCents ? (
                  <Text style={[s.cost, { color: PURPLE }]}>{fmtAUD(item.estimatedCostCents)}</Text>
                ) : null}
                <Feather name="chevron-right" size={16} color={MUTED} />
              </View>
            </View>
            <View style={s.cardFooter}>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]}>{item.quantity} {item.unit}</Text>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]}>·</Text>
              <Text style={[s.badgeText, { color: MUTED, fontSize: 11 }]} numberOfLines={1}>{item.reason}</Text>
              <Text style={[s.cardTime, { color: MUTED, marginLeft: 'auto' }]}>{timeAgo(item.createdAt)}</Text>
            </View>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Leave tab ─────────────────────────────────────────────────────────────────
function LeaveTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-all-leave'],
    queryFn: () => api.director.allLeave(),
    staleTime: 0,
  });
  const leave: any[] = data?.data ?? [];

  const reviewMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      api.director.approveLeave(id, approved),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['director-all-leave'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const leaveTypeColor = (t: string) => {
    if (t === 'annual')   return BLUE;
    if (t === 'sick')     return AMBER;
    if (t === 'personal') return PINK;
    return MUTED;
  };
  const leaveStatusColor = (s: string) => {
    if (s === 'approved') return GREEN;
    if (s === 'rejected') return RED;
    return AMBER;
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {leave.length === 0
        ? <EmptyState icon="calendar" message="No leave requests" />
        : leave.map((item: any) => (
          <View key={item.id} style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: leaveTypeColor(item.type) + '18' }]}>
                <Feather name="calendar" size={15} color={leaveTypeColor(item.type)} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.cardTitle, { color: TEXT }]} numberOfLines={1}>{item.staffName ?? 'Unknown staff'}</Text>
                <Text style={[s.cardSub,   { color: MUTED }]} numberOfLines={1}>
                  {fmtDate(item.startDate)} → {fmtDate(item.endDate)}
                </Text>
              </View>
              <Badge label={item.status} color={leaveStatusColor(item.status)} />
            </View>
            <Text style={[s.cardDesc, { color: MUTED }]} numberOfLines={2}>{item.reason}</Text>
            <View style={s.cardFooter}>
              <Badge label={item.type} color={leaveTypeColor(item.type)} />
              <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            {item.status === 'pending' && (
              <View style={s.actionRow}>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: RED + '12', borderColor: RED + '40' }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    Alert.alert('Reject Leave', `Reject leave for ${item.staffName}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reject', style: 'destructive', onPress: () => reviewMut.mutate({ id: item.id, approved: false }) },
                    ]);
                  }}
                >
                  <Feather name="x" size={14} color={RED} />
                  <Text style={[s.actionBtnText, { color: RED }]}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: GREEN + '12', borderColor: GREEN + '40' }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    Alert.alert('Approve Leave', `Approve leave for ${item.staffName}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Approve', onPress: () => reviewMut.mutate({ id: item.id, approved: true }) },
                    ]);
                  }}
                >
                  <Feather name="check" size={14} color={GREEN} />
                  <Text style={[s.actionBtnText, { color: GREEN }]}>Approve</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      }
    </ScrollView>
  );
}

// ── Feedback tab ──────────────────────────────────────────────────────────────
function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-all-feedback'],
    queryFn: () => api.director.allFeedback(),
    staleTime: 0,
  });
  const feedback: any[] = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-all-feedback'] });
      qc.invalidateQueries({ queryKey: ['director-stats'] });
    },
  });

  const ratingColor = (r: number) => {
    if (r >= 4) return GREEN;
    if (r >= 3) return AMBER;
    return RED;
  };

  const handlePress = (item: any) => {
    if (!item.isRead) markRead.mutate(item.id);
    Alert.alert(
      `Feedback${item.rating ? ` · ${item.rating}/5 ⭐` : ''}`,
      `${item.message}\n\nCategory: ${item.category ?? 'General'}\nSubmitted: ${fmtDate(item.createdAt)}`,
      [{ text: 'OK' }],
    );
  };

  if (isLoading) return <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} />;

  const unread = feedback.filter(f => !f.isRead).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      showsVerticalScrollIndicator={false}
    >
      {unread > 0 && (
        <View style={[s.summaryCard, { backgroundColor: BLUE + '12', borderColor: BLUE + '40' }]}>
          <Feather name="message-circle" size={16} color={BLUE} />
          <Text style={[s.summaryTitle, { color: BLUE }]}>{unread} unread feedback item{unread !== 1 ? 's' : ''} — tap to mark read</Text>
        </View>
      )}
      {feedback.length === 0
        ? <EmptyState icon="message-circle" message="No feedback submitted yet" />
        : feedback.map((item: any) => (
          <Pressable key={item.id} onPress={() => handlePress(item)}
            style={[s.card, { backgroundColor: CARD, borderColor: item.isRead ? BORDER : BLUE + '50', opacity: item.isRead ? 0.85 : 1 }]}
          >
            <View style={s.cardHeader}>
              <View style={[s.iconBox, { backgroundColor: item.rating ? ratingColor(item.rating) + '18' : MUTED + '18' }]}>
                <Feather name="message-circle" size={15} color={item.rating ? ratingColor(item.rating) : MUTED} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                {item.rating ? (
                  <Text style={[s.cardTitle, { color: TEXT }]}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
                ) : (
                  <Text style={[s.cardTitle, { color: TEXT }]}>Feedback</Text>
                )}
                <Text style={[s.cardSub, { color: MUTED }]} numberOfLines={1}>{item.category ?? 'General'}</Text>
              </View>
              {!item.isRead && <View style={s.unreadDot} />}
              <Text style={[s.cardTime, { color: MUTED }]}>{timeAgo(item.createdAt)}</Text>
            </View>
            <Text style={[s.cardDesc, { color: TEXT }]} numberOfLines={3}>{item.message}</Text>
          </Pressable>
        ))
      }
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function StaffHubScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [activeTab, setActiveTab] = useState<Tab>(params.tab ?? 'issues');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { backgroundColor: BG, borderBottomColor: BORDER }]}>
        <Text style={s.headerTitle}>Staff Hub</Text>
        <Text style={s.headerSub}>Issues · Wastage · Leave · Feedback</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[s.tabBar, { backgroundColor: CARD, borderBottomColor: BORDER, flex: 1 }]}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
                style={[s.tabBtn, active && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
              >
                <Feather name={tab.icon as any} size={14} color={active ? BLUE : MUTED} />
                <Text style={[s.tabLabel, { color: active ? BLUE : MUTED }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {activeTab === 'issues'   && <IssuesTab />}
      {activeTab === 'wastage'  && <WastageTab />}
      {activeTab === 'leave'    && <LeaveTab />}
      {activeTab === 'feedback' && <FeedbackTab />}
    </View>
  );
}

const s = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: TEXT },
  headerSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 2 },
  tabBar:      { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabLabel:    { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle:   { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cardSub:     { fontSize: 12, fontFamily: 'Inter_400Regular' },
  cardDesc:    { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  cardFooter:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTime:    { fontSize: 11, fontFamily: 'Inter_400Regular' },
  badge:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actionRow:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  cost:        { fontSize: 13, fontFamily: 'Inter_700Bold' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  summaryTitle:{ fontSize: 13, fontFamily: 'Inter_600SemiBold', flex: 1 },
  summarySub:  { fontSize: 12, fontFamily: 'Inter_400Regular' },
  empty:       { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyText:   { fontSize: 14, fontFamily: 'Inter_400Regular', color: MUTED },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE, marginRight: 4 },
});
