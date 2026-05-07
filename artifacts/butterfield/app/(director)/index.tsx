import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const PINK   = '#EC4899';

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)  return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function useLiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      return now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' });
    };
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// KPI Tile
function KpiTile({ icon, label, value, color, alert, onPress }: {
  icon: string; label: string; value: string | number; color: string; alert?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[kpi.tile, { backgroundColor: CARD, borderColor: alert ? color + '60' : BORDER }]}>
      <View style={[kpi.iconBox, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={16} color={color} />
        {alert && <View style={kpi.alertDot} />}
      </View>
      <Text style={[kpi.value, { color: TEXT }]}>{value}</Text>
      <Text style={[kpi.label, { color: MUTED }]}>{label}</Text>
    </Pressable>
  );
}

// Quick action button
function QuickBtn({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={[qa.btn, { backgroundColor: CARD, borderColor: BORDER }]}>
      <View style={[qa.icon, { backgroundColor: color + '18' }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[qa.label, { color: TEXT }]}>{label}</Text>
    </Pressable>
  );
}

export default function DirectorControlCentre() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const clock = useLiveClock();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.director.stats(),
    refetchInterval: 30000,
  });

  const { data: activityData, refetch: refetchActivity } = useQuery({
    queryKey: ['director-activity'],
    queryFn: () => api.director.activity(),
    refetchInterval: 60000,
  });

  const s = data?.data;
  const activity: any[] = activityData?.data ?? [];
  const hasAlerts = (s?.users.pendingStaff ?? 0) > 0 || (s?.users.pendingWholesale ?? 0) > 0 || (s?.issues.high ?? 0) > 0;

  const todayStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchActivity(); }} tintColor={BLUE} />}
    >
      {/* Identity strip */}
      <View style={[styles.identityStrip, { paddingTop: insets.top > 0 ? 8 : 16 }]}>
        <View>
          <Text style={[styles.todayDate, { fontFamily: 'Inter_400Regular' }]}>{todayStr}</Text>
          <Text style={[styles.userName, { fontFamily: 'Inter_700Bold' }]}>Welcome, {user?.name?.split(' ')[0] ?? 'Director'}</Text>
        </View>
        <View style={styles.clockBox}>
          <Feather name="clock" size={12} color={BLUE} />
          <Text style={[styles.clockText, { fontFamily: 'Inter_700Bold' }]}>{clock}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 14 }}>

        {isLoading ? (
          <View style={{ alignItems: 'center', marginTop: 80 }}>
            <ActivityIndicator color={BLUE} size="large" />
            <Text style={{ color: MUTED, marginTop: 12, fontFamily: 'Inter_400Regular' }}>Loading control centre…</Text>
          </View>
        ) : (
          <>
            {/* ── Revenue hero ────────────────────────────────────── */}
            <View style={[styles.revCard, { backgroundColor: NAVY }]}>
              <View style={styles.revHeader}>
                <Text style={[styles.revTitle, { fontFamily: 'Inter_700Bold' }]}>REVENUE</Text>
                <View style={styles.liveChip}>
                  <View style={styles.liveDot} />
                  <Text style={[styles.liveText, { fontFamily: 'Inter_700Bold' }]}>LIVE</Text>
                </View>
              </View>
              <View style={styles.revRow}>
                {[
                  { label: 'Today',      value: fmtAUD(s?.revenue.today ?? 0) },
                  { label: 'This Week',  value: fmtAUD(s?.revenue.week  ?? 0) },
                  { label: 'This Month', value: fmtAUD(s?.revenue.month ?? 0) },
                ].map((r, i) => (
                  <View key={r.label} style={[styles.revItem, i > 0 && styles.revItemBorder]}>
                    <Text style={[styles.revAmount, { fontFamily: 'Inter_700Bold' }]}>{r.value}</Text>
                    <Text style={[styles.revLabel,  { fontFamily: 'Inter_400Regular' }]}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Urgent alerts ───────────────────────────────────── */}
            {hasAlerts && (
              <View style={[styles.alertCard, { backgroundColor: '#FFF1F0', borderColor: '#FCA5A5' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={[styles.alertDotBig, { backgroundColor: RED }]} />
                  <Text style={[styles.alertHeading, { fontFamily: 'Inter_700Bold', color: '#7F1D1D' }]}>Urgent — Action Required</Text>
                </View>
                {(s?.users.pendingStaff ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="user-check" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontFamily: 'Inter_400Regular', color: '#991B1B' }]}>{s?.users.pendingStaff} staff account{s?.users.pendingStaff !== 1 ? 's' : ''} awaiting approval</Text>
                    <Text style={[styles.reviewLink, { fontFamily: 'Inter_700Bold', color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.users.pendingWholesale ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="package" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontFamily: 'Inter_400Regular', color: '#991B1B' }]}>{s?.users.pendingWholesale} wholesale application{s?.users.pendingWholesale !== 1 ? 's' : ''} pending</Text>
                    <Text style={[styles.reviewLink, { fontFamily: 'Inter_700Bold', color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.issues.high ?? 0) > 0 && (
                  <Pressable
                    style={styles.alertRow}
                    onPress={() =>
                      Alert.alert(
                        `${s?.issues.high} High-Priority Issue${s?.issues.high !== 1 ? 's' : ''}`,
                        'Staff-submitted issues are managed through the Staff Portal.\n\nAsk your on-duty manager to review and resolve open issues, or approve a staff account to give them access.',
                        [
                          { text: 'View Staff', onPress: () => router.navigate('/(director)/users' as any) },
                          { text: 'Dismiss', style: 'cancel' },
                        ],
                      )
                    }
                  >
                    <Feather name="alert-triangle" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontFamily: 'Inter_400Regular', color: '#991B1B' }]}>{s?.issues.high} high-priority issue{s?.issues.high !== 1 ? 's' : ''} open</Text>
                    <Text style={[styles.reviewLink, { fontFamily: 'Inter_700Bold', color: '#991B1B' }]}>View →</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Quick actions ───────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_600SemiBold' }]}>QUICK ACTIONS</Text>
              <View style={styles.qaGrid}>
                <QuickBtn icon="plus-square"   label="Add Product"    color={BLUE}   onPress={() => router.navigate('/(director)/products' as any)} />
                <QuickBtn icon="user-plus"     label="Add Staff"      color={PURPLE} onPress={() => router.navigate('/(director)/users' as any)} />
                <QuickBtn icon="package"       label="Add Wholesale"  color={GREEN}  onPress={() => router.navigate('/(director)/users' as any)} />
                <QuickBtn icon="shopping-bag"  label="View Orders"    color={AMBER}  onPress={() => router.navigate('/(director)/orders' as any)} />
                <QuickBtn icon="star"          label="Rewards"        color={PINK}   onPress={() => router.navigate('/(director)/settings' as any)} />
                <QuickBtn icon="bell"          label="Notifications"  color="#06B6D4" onPress={() => router.navigate('/(director)/settings' as any)} />
                <QuickBtn icon="bar-chart-2"   label="Reports"        color={NAVY}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <QuickBtn icon="settings"      label="App Settings"   color={MUTED}  onPress={() => router.navigate('/(director)/settings' as any)} />
              </View>
            </View>

            {/* ── KPI grid ────────────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_600SemiBold' }]}>TODAY'S OVERVIEW</Text>
              <View style={styles.kpiGrid}>
                <KpiTile icon="shopping-bag"   label="Orders today"     value={s?.orders.today     ?? 0} color={BLUE}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <KpiTile icon="zap"            label="Active orders"    value={s?.orders.active    ?? 0} color={GREEN}  alert={(s?.orders.active ?? 0) > 0} />
                <KpiTile icon="users"          label="Staff clocked in" value={s?.staff.clockedIn  ?? 0} color={PURPLE} />
                <KpiTile icon="alert-triangle" label="Long shifts"      value={s?.staff.longShifts ?? 0} color={AMBER}  alert={(s?.staff.longShifts ?? 0) > 0} />
                <KpiTile icon="package"        label="Sold out"         value={s?.products.soldOut  ?? 0} color={RED}   alert={(s?.products.soldOut ?? 0) > 0} onPress={() => router.navigate('/(director)/products' as any)} />
                <KpiTile icon="trending-down"  label="Low stock"        value={s?.products.lowStock ?? 0} color={AMBER} alert={(s?.products.lowStock ?? 0) > 0} onPress={() => router.navigate('/(director)/products' as any)} />
                <KpiTile icon="alert-octagon"  label="Open issues"      value={s?.issues.open       ?? 0} color={RED}   alert={(s?.issues.open ?? 0) > 0} />
                <KpiTile icon="trash-2"        label="Wastage today"    value={s?.wastage.countToday ?? 0} color={PURPLE} />
                <KpiTile icon="gift"           label="Birthdays today"  value={s?.customers.birthdayToday ?? 0} color={PINK} />
                <KpiTile icon="mail"           label="Pending leave"    value={s?.staff.pendingLeave ?? 0} color={AMBER} />
                <KpiTile icon="message-circle" label="New feedback"     value={s?.customers.unreadFeedback ?? 0} color={BLUE} />
                <KpiTile icon="package"        label="WS pending"       value={s?.orders.wholesaleNew ?? 0} color={GREEN} alert={(s?.orders.wholesaleNew ?? 0) > 0} />
              </View>
            </View>

            {/* ── Wastage cost banner ──────────────────────────────── */}
            {(s?.wastage.costToday ?? 0) > 0 && (
              <View style={[styles.wastageCard, { backgroundColor: '#FDF4FF', borderColor: '#E9D5FF' }]}>
                <Feather name="trash-2" size={16} color={PURPLE} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wastageTitle, { fontFamily: 'Inter_600SemiBold', color: PURPLE }]}>Today's Wastage Cost</Text>
                  <Text style={[styles.wastageSub, { fontFamily: 'Inter_400Regular', color: MUTED }]}>
                    {s?.wastage.countToday} item{s?.wastage.countToday !== 1 ? 's' : ''} logged — estimated {fmtAUD(s?.wastage.costToday ?? 0)} lost
                  </Text>
                </View>
              </View>
            )}

            {/* ── Activity feed ────────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontFamily: 'Inter_600SemiBold' }]}>RECENT ACTIVITY</Text>
              {activity.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Feather name="activity" size={28} color={BORDER} />
                  <Text style={[styles.emptyText, { fontFamily: 'Inter_400Regular', color: MUTED }]}>No recent activity</Text>
                </View>
              ) : (
                <View style={[styles.activityList, { backgroundColor: CARD, borderColor: BORDER }]}>
                  {activity.slice(0, 12).map((ev: any, i: number) => (
                    <View key={ev.id + i} style={[styles.activityRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <View style={[styles.activityIcon, { backgroundColor: ev.color + '18' }]}>
                        <Feather name={ev.icon as any} size={13} color={ev.color} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.activityTitle, { fontFamily: 'Inter_600SemiBold', color: TEXT }]} numberOfLines={1}>{ev.title}</Text>
                        <Text style={[styles.activitySub,   { fontFamily: 'Inter_400Regular',  color: MUTED }]} numberOfLines={1}>{ev.sub}</Text>
                      </View>
                      <Text style={[styles.activityTime, { fontFamily: 'Inter_400Regular', color: MUTED }]}>{timeAgo(ev.at)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  identityStrip: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BG },
  todayDate:     { fontSize: 12, color: MUTED },
  userName:      { fontSize: 20, color: TEXT },
  clockBox:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CARD, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  clockText:     { fontSize: 14, color: BLUE },
  revCard:       { borderRadius: 20, padding: 20, gap: 16 },
  revHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  revTitle:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5 },
  liveChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  liveText:      { color: GREEN, fontSize: 10, letterSpacing: 1 },
  revRow:        { flexDirection: 'row' },
  revItem:       { flex: 1, alignItems: 'center' },
  revItemBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  revAmount:     { color: '#fff', fontSize: 18 },
  revLabel:      { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 },
  alertCard:     { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  alertDotBig:   { width: 8, height: 8, borderRadius: 4 },
  alertHeading:  { fontSize: 13 },
  alertRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertRowText:  { flex: 1, fontSize: 13 },
  reviewLink:    { fontSize: 12 },
  sectionTitle:  { fontSize: 11, color: MUTED, letterSpacing: 1.5, marginBottom: 10 },
  qaGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  wastageCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  wastageTitle:  { fontSize: 13 },
  wastageSub:    { fontSize: 12, marginTop: 2 },
  activityList:  { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  activityIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityTitle: { fontSize: 13 },
  activitySub:   { fontSize: 11 },
  activityTime:  { fontSize: 11 },
  emptyCard:     { alignItems: 'center', gap: 10, padding: 32, borderRadius: 14, borderWidth: 1 },
  emptyText:     { fontSize: 14 },
});

const kpi = StyleSheet.create({
  tile:     { width: '47.5%', backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  iconBox:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  alertDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  value:    { fontSize: 26, fontFamily: 'Inter_700Bold' },
  label:    { fontSize: 11, fontFamily: 'Inter_500Medium' },
});

const qa = StyleSheet.create({
  btn:   { width: '23%', borderRadius: 14, borderWidth: 1, padding: 10, gap: 6, alignItems: 'center' },
  icon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },
});
