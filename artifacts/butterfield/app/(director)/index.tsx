import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { PortalHeader } from '@/components/PortalHeader';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { StaffDashboard } from './_staff-dashboard';
import { fmtAUD, timeAgo, fmtDateBox} from '@/components/director/dashboardHelpers';
import { RevenueRangePicker, KpiTile, QuickBtn, DeltaBadge, AovCustomerRow, HourlyInsightsChart } from '@/components/director';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';
import { useFocusStatusBar, useScrollStatusBar } from '@/hooks/useScrollStatusBar';

const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

// ── Director/Master dashboard ─────────────────────────────────────────────────
function DirectorDashboardInner({ onScroll }: { onScroll?: (e: any) => void }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-stats'],
    queryFn: () => api.director.stats(),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const { data: activityData, refetch: refetchActivity } = useQuery({
    queryKey: ['director-activity'],
    queryFn: () => api.director.activity(),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
  });

  const { data: insightsData, refetch: refetchInsights } = useQuery({
    queryKey: ['director-insights'],
    queryFn: () => api.director.insights(),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const { data: sparklinesData, refetch: refetchSparklines } = useQuery({
    queryKey: ['director-sparklines'],
    queryFn: () => api.director.sparklines(),
    refetchInterval: 60000,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const [showRevPicker, setShowRevPicker]     = useState(false);
  const [customRevTotal, setCustomRevTotal]   = useState<number | null>(null);
  const [customRevRange, setCustomRevRange]   = useState<{ from: Date; to: Date } | null>(null);
  const [customRevLoading, setCustomRevLoading] = useState(false);

  const handleApplyRevRange = async (from: Date, to: Date) => {
    setCustomRevLoading(true);
    setCustomRevRange({ from, to });
    try {
      const res = await api.director.revenue(from.toISOString(), to.toISOString());
      setCustomRevTotal(res.data.total);
    } catch {
      setCustomRevTotal(null);
    } finally {
      setCustomRevLoading(false);
    }
  };

  const s        = data?.data;
  const activity: any[] = activityData?.data ?? [];
  const insights = insightsData?.data;
  const hasAlerts = (s?.users.pendingStaff ?? 0) > 0 || (s?.users.pendingWholesale ?? 0) > 0 || (s?.issues.high ?? 0) > 0;

  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchActivity, refetchInsights, refetchSparklines);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={BLUE} />}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT, flex: 1 }}>Dashboard</Text>
          {isLoading && <ActivityIndicator color={BLUE} size="small" />}
        </View>

        <>
            {/* ── Revenue hero ─────────────────────────────────── */}
            <View style={[styles.revCard, { backgroundColor: NAVY }]}>
              <View style={styles.revHeader}>
                <Text style={[styles.revTitle, { fontWeight: '700' }]}>REVENUE</Text>
                <View style={styles.liveChip}>
                  <View style={styles.liveDot} />
                  <Text style={[styles.liveText, { fontWeight: '700' }]}>LIVE</Text>
                </View>
              </View>
              <View style={styles.revRow}>
                {([
                  { label: 'Today',      value: fmtAUD(s?.revenue.today ?? 0), delta: s?.revenue.todayDeltaPct, cmp: 'vs same time last week', drillMode: 'today' },
                  { label: 'This Week',  value: fmtAUD(s?.revenue.week  ?? 0), delta: s?.revenue.weekDeltaPct,  cmp: 'vs prior week-to-date',  drillMode: 'week'  },
                  { label: 'This Month', value: fmtAUD(s?.revenue.month ?? 0), delta: s?.revenue.monthDeltaPct, cmp: 'vs prior month-to-date', drillMode: 'month' },
                ] as const).map((r, i) => (
                  <Pressable
                    key={r.label}
                    style={({ pressed }) => [styles.revItem, i > 0 && styles.revItemBorder, { opacity: pressed ? 0.75 : 1 }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.push({ pathname: '/(director)/orders', params: { drillMode: r.drillMode } } as any);
                    }}
                  >
                    <Text style={[styles.revAmount, { fontWeight: '700' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{r.value}</Text>
                    <Text style={[styles.revLabel,  { fontWeight: '400' }]}>{r.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <DeltaBadge pct={r.delta} dark />
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 5, padding: 3 }}>
                        <Feather name="chevron-right" size={9} color="rgba(255,255,255,0.5)" />
                      </View>
                    </View>
                    {r.delta != null && (
                      <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: '400', marginTop: 1 }}>{r.cmp}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
              {/* Custom date range row */}
              <Pressable
                onPress={() => { setShowRevPicker(true); Haptics.selectionAsync(); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="calendar" size={14} color="rgba(255,255,255,0.65)" />
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: '500' }}>
                    {customRevRange ? `${fmtDateBox(customRevRange.from)} – ${fmtDateBox(customRevRange.to)}` : 'Custom Date Range'}
                  </Text>
                </View>
                {customRevLoading ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.65)" />
                ) : customRevTotal !== null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{fmtAUD(customRevTotal)}</Text>
                    <Pressable onPress={() => { setCustomRevTotal(null); setCustomRevRange(null); }}>
                      <Feather name="x-circle" size={16} color="rgba(255,255,255,0.45)" />
                    </Pressable>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.45)" />
                )}
              </Pressable>
            </View>

            {/* Revenue range picker */}
            <RevenueRangePicker
              visible={showRevPicker}
              onClose={() => setShowRevPicker(false)}
              onApply={handleApplyRevRange}
            />

            {/* ── Insights Today: hourly chart + channel strip ─── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>INSIGHTS TODAY</Text>

              {/* Hourly chart */}
              {insights ? (
                <HourlyInsightsChart
                  hours={insights.hourly}
                  lastWeekHourly={insights.lastWeekHourly ?? []}
                  totalRevenueCents={insights.totalRevenueCents}
                  lastWeekRevCents={s?.revenue.lastWeekCents ?? 0}
                />
              ) : (
                <View style={[styles.emptyCard, { paddingVertical: 28 }]}>
                  <ActivityIndicator color={BLUE} />
                </View>
              )}
            </View>

            {/* ── Channel KPI strip ───────────────────────────── */}
            {s?.channels && (
              <View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {/* App */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app', filterParam: 'all' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${BLUE}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="smartphone" size={13} color={BLUE} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>APP</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.appOrders.countToday}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>orders</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE, marginTop: 4 }}>{fmtAUD(s.channels.appOrders.revenueTodayCents)}</Text>
                  </Pressable>
                  {/* POS */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'pos' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${PURPLE}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="monitor" size={13} color={PURPLE} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>POS</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.posTransactions.countToday}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>transactions</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE, marginTop: 4 }}>{fmtAUD(s.channels.posTransactions.revenueTodayCents)}</Text>
                  </Pressable>
                  {/* Wholesale */}
                  <Pressable
                    onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'wholesale' } } as any); }}
                    style={[styles.channelCard, { flex: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${GREEN}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="package" size={13} color={GREEN} />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.4 }}>WHOLESALE</Text>
                    </View>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>{s.channels.wholesaleOrders.activeCount}</Text>
                    <Text style={{ fontSize: 11, color: MUTED, fontWeight: '400', marginTop: 1 }}>active orders</Text>
                    {s.channels.wholesaleOrders.outstandingCents > 0 && (
                      <Text style={{ fontSize: 13, fontWeight: '600', color: GREEN, marginTop: 4 }}>{fmtAUD(s.channels.wholesaleOrders.outstandingCents)}</Text>
                    )}
                    {s.channels.wholesaleOrders.outstandingCents === 0 && (
                      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Feather name="chevron-right" size={11} color={GREEN} />
                        <Text style={{ fontSize: 11, color: GREEN, fontWeight: '500' }}>View all</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── AOV + Customer split ─────────────────────────── */}
            {s && (
              <AovCustomerRow
                aovCents={s.revenue.aovTodayCents ?? 0}
                aovDelta={s.revenue.aovDeltaPct}
                newCust={s.revenue.newCustomersToday ?? 0}
                returningCust={s.revenue.returningCustomersToday ?? 0}
                totalSessions={insights?.totalSessions ?? 0}
                aovSparkline={sparklinesData?.data?.aov}
                sessionsSparkline={sparklinesData?.data?.sessions}
              />
            )}

            {/* ── Urgent alerts ─────────────────────────────────── */}
            {hasAlerts && (
              <View style={[styles.alertCard, { backgroundColor: '#FFF1F0', borderColor: '#FCA5A5' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={[styles.alertDotBig, { backgroundColor: RED }]} />
                  <Text style={[styles.alertHeading, { fontWeight: '700', color: '#7F1D1D' }]}>Urgent — Action Required</Text>
                </View>
                {(s?.users.pendingStaff ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="user-check" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.users.pendingStaff} staff account{s?.users.pendingStaff !== 1 ? 's' : ''} awaiting approval</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.users.pendingWholesale ?? 0) > 0 && (
                  <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                    <Feather name="package" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.users.pendingWholesale} wholesale application{s?.users.pendingWholesale !== 1 ? 's' : ''} pending</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>Review →</Text>
                  </Pressable>
                )}
                {(s?.issues.high ?? 0) > 0 && (
                  <Pressable
                    style={styles.alertRow}
                    onPress={() => Alert.alert(
                      `${s?.issues.high} High-Priority Issue${s?.issues.high !== 1 ? 's' : ''}`,
                      'Staff-submitted issues are managed through the Staff Portal.\n\nAsk your on-duty manager to review and resolve open issues, or approve a staff account to give them access.',
                      [
                        { text: 'View Staff', onPress: () => router.navigate('/(director)/users' as any) },
                        { text: 'Dismiss', style: 'cancel' },
                      ],
                    )}
                  >
                    <Feather name="alert-triangle" size={13} color="#991B1B" />
                    <Text style={[styles.alertRowText, { fontWeight: '400', color: '#991B1B' }]}>{s?.issues.high} high-priority issue{s?.issues.high !== 1 ? 's' : ''} open</Text>
                    <Text style={[styles.reviewLink,   { fontWeight: '700',   color: '#991B1B' }]}>View →</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Quick actions ──────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>QUICK ACTIONS</Text>
              <View style={styles.qaGrid}>
                {/* Row 1 — most-used, highest urgency */}
                <QuickBtn icon="shopping-bag" label="Orders"     color={GREEN}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <QuickBtn icon="box"          label="Products"   color={BLUE}    onPress={() => router.navigate('/(director)/products' as any)} />
                <QuickBtn icon="bar-chart-2"  label="Reports"    color={NAVY}    onPress={() => router.push('/director-reports' as any)} />
                <QuickBtn icon="users"        label="Staff"      color={PURPLE}  onPress={() => router.push({ pathname: '/(director)/users', params: { tab: 'Staff' } } as any)} />
                {/* Row 2 — secondary actions */}
                <QuickBtn icon="bell"         label="Notify"     color="#06B6D4" onPress={() => router.push('/director-settings-notify' as any)} />
                <QuickBtn icon="briefcase"    label="Wholesale"  color={AMBER}   onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'wholesale' } } as any)} />
                <QuickBtn icon="clipboard"    label="Tasks"      color={BLUE}    onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
                <QuickBtn icon="settings"     label="Settings"   color={NAVY}    onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'system' } } as any)} />
              </View>
            </View>

            {/* ── KPI grid ── ordered: urgency first, then operational context ── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>TODAY'S OVERVIEW</Text>
              <View style={styles.kpiGrid}>
                {/* Tier 1 — requires immediate action */}
                <KpiTile icon="zap"            label="Active orders"    value={s?.orders.active      ?? 0} color={GREEN}  alert={(s?.orders.active ?? 0) > 0}       onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app', filterParam: 'active' } } as any); }} />
                <KpiTile icon="package"        label="WS pending"       value={s?.orders.wholesaleNew ?? 0} color={AMBER} alert={(s?.orders.wholesaleNew ?? 0) > 0}  onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'wholesale', filterParam: 'pending' } } as any); }} />
                <KpiTile icon="alert-octagon"  label="Open issues"      value={s?.issues.open        ?? 0} color={RED}    alert={(s?.issues.open ?? 0) > 0}          onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'issues' } } as any)} />
                <KpiTile icon="package"        label="Sold out"         value={s?.products.soldOut   ?? 0} color={RED}    alert={(s?.products.soldOut ?? 0) > 0}     onPress={() => router.navigate('/(director)/products' as any)} />
                {/* Tier 2 — today's key metrics */}
                <KpiTile icon="shopping-bag"   label="Orders today"     value={s?.orders.today       ?? 0} color={BLUE}   onPress={() => router.navigate('/(director)/orders' as any)} />
                <KpiTile icon="trending-down"  label="Low stock"        value={s?.products.lowStock  ?? 0} color={AMBER}  alert={(s?.products.lowStock ?? 0) > 0}    onPress={() => router.navigate('/(director)/products' as any)} />
                {/* Tier 3 — operational context */}
                <KpiTile icon="users"          label="Staff clocked in" value={s?.staff.clockedIn    ?? 0} color={PURPLE} helper={`Week wages ${fmtAUD(s?.staff.weekWagesOwedCents ?? 0)}`} onPress={() => router.push('/director-staff-hours' as any)} />
                <KpiTile icon="mail"           label="Pending leave"    value={s?.staff.pendingLeave  ?? 0} color={AMBER}  onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'leave' } } as any)} />
                <KpiTile icon="clipboard"      label="Open tasks"       value={s?.tasks?.open        ?? 0} color={BLUE}   onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
                <KpiTile icon="trash-2"        label="Wastage today"    value={s?.wastage.countToday  ?? 0} color={PURPLE} helper={`Week loss ${fmtAUD(s?.wastage.costWeek ?? 0)}`} onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)} />
              </View>
            </View>

            {/* ── Wastage cost banner ───────────────────────────── */}
            {((s?.wastage.costToday ?? 0) > 0 || (s?.wastage.costWeek ?? 0) > 0) && (
              <Pressable
                onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)}
                style={[styles.wastageCard, { backgroundColor: '#FDF4FF', borderColor: '#E9D5FF' }]}
              >
                <Feather name="trash-2" size={16} color={PURPLE} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.wastageTitle, { fontWeight: '600', color: PURPLE }]}>This Week's Wastage Cost</Text>
                  <Text style={[styles.wastageSub, { fontWeight: '400', color: MUTED }]}>
                    {s?.wastage.countWeek ?? 0} item{(s?.wastage.countWeek ?? 0) !== 1 ? 's' : ''} logged — estimated {fmtAUD(s?.wastage.costWeek ?? 0)} lost
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={PURPLE} />
              </Pressable>
            )}

            {/* ── Activity feed ─────────────────────────────────── */}
            <View>
              <Text style={[styles.sectionTitle, { fontWeight: '600' }]}>RECENT ACTIVITY</Text>
              {activity.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Feather name="activity" size={28} color={BORDER} />
                  <Text style={[styles.emptyText, { fontWeight: '400', color: MUTED }]}>No recent activity</Text>
                </View>
              ) : (
                <View style={styles.activityList}>
                  {activity.slice(0, 12).map((ev: any, i: number) => (
                    <View key={ev.id + i} style={[styles.activityRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}>
                      <View style={[styles.activityIcon, { backgroundColor: ev.color + '18' }]}>
                        <Feather name={ev.icon as any} size={13} color={ev.color} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.activityTitle, { fontWeight: '600', color: TEXT }]} numberOfLines={1}>{ev.title}</Text>
                        <Text style={[styles.activitySub,   { fontWeight: '400',  color: MUTED }]} numberOfLines={1}>{ev.sub}</Text>
                      </View>
                      <Text style={[styles.activityTime, { fontWeight: '400', color: MUTED }]}>{timeAgo(ev.at)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
  activityList:  { borderRadius: 20, borderWidth: 1, overflow: 'hidden', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  activityRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  activityIcon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityTitle: { fontSize: 13 },
  activitySub:   { fontSize: 11 },
  activityTime:  { fontSize: 11 },
  emptyCard:     { alignItems: 'center', gap: 10, padding: 32, borderRadius: 20, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  emptyText:     { fontSize: 14 },
  channelCard:   { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
});

// ── Role-aware wrapper ─────────────────────────────────────────────────────────
const BADGE_LABEL: Record<string, string> = {
  master:   'MASTER',
  director: 'DIRECTOR',
};
const BADGE_COLOR: Record<string, string> = {
  master:   '#7C3AED',
  director: '#EF4444',
};

function DirectorHomeInner() {
  const { user, logout } = useAuth();
  const { barStyle, handleScroll, onHeaderLayout } = useScrollStatusBar('light-content');
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />
      <View onLayout={onHeaderLayout}>
        <PortalHeader
          badge={BADGE_LABEL[user?.role ?? ''] ?? 'DIRECTOR'}
          badgeColor={BADGE_COLOR[user?.role ?? ''] ?? '#EF4444'}
          backgroundColor={NAVY}
          onLogout={() => logout().then(() => router.replace('/(auth)/login' as any))}
        />
      </View>
      <DirectorDashboardInner onScroll={handleScroll} />
    </View>
  );
}

export default function DirectorHome() {
  const { user } = useAuth();
  const role = user?.role;
  useFocusStatusBar(role === 'staff' || role === 'manager' ? 'dark-content' : 'light-content');
  if (role === 'staff' || role === 'manager') {
    return <StaffDashboard />;
  }
  return <DirectorHomeInner />;
}
