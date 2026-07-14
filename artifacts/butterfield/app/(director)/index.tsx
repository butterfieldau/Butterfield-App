import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { StaffDashboard } from './_staff-dashboard';
import { fmtAUD, timeAgo, fmtDateBox } from '@/components/director/dashboardHelpers';
import { RevenueRangePicker, KpiTile, QuickBtn, DeltaBadge, AovCustomerRow, HourlyInsightsChart } from '@/components/director';
import { STATUS_COLORS, STATUS_LABEL } from '@/lib/orderStatus';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';
import { useFocusStatusBar } from '@/hooks/useScrollStatusBar';

// ── Director/Master dashboard ─────────────────────────────────────────────────
function DirectorDashboardInner({ onScroll }: { onScroll?: (e: any) => void }) {
  const { user } = useAuth();
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })();
  const firstName = user?.name?.split(' ')[0] ?? 'Director';
  const dateLabel = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' });

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

  const { data: liveOrders } = useQuery({
    queryKey: ['director-live-orders'],
    queryFn: () => api.director.orders(),
    refetchInterval: 15000,
    staleTime: 10_000,
    select: (d) =>
      (d?.data ?? [])
        .filter(o => !['completed', 'delivered', 'cancelled', 'refunded'].includes(o.status))
        .slice(0, 6),
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
  const pendingApprovals = (s?.users.pendingStaff ?? 0) + (s?.users.pendingWholesale ?? 0);

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
      <View style={{ paddingHorizontal: 16, gap: 20, paddingTop: 20 }}>

        {/* ── Greeting ────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{greeting},{'\n'}{firstName}</Text>
            <Text style={styles.greetingSub}>{dateLabel}</Text>
          </View>
          {isLoading && <ActivityIndicator color={BLUE} size="small" style={{ marginTop: 10 }} />}
        </View>

        {/* ── Revenue strip (white card) ───────────────────────── */}
        <View style={styles.revCard}>
          {([
            { label: 'Today',      value: fmtAUD(s?.revenue.today ?? 0), delta: s?.revenue.todayDeltaPct,  drillMode: 'today' },
            { label: 'Week',       value: fmtAUD(s?.revenue.week  ?? 0), delta: s?.revenue.weekDeltaPct,   drillMode: 'week'  },
            { label: 'Month',      value: fmtAUD(s?.revenue.month ?? 0), delta: s?.revenue.monthDeltaPct,  drillMode: 'month' },
          ] as const).map((r, i) => (
            <React.Fragment key={r.label}>
              {i > 0 && <View style={styles.revDivider} />}
              <Pressable
                style={({ pressed }) => [styles.revCol, { opacity: pressed ? 0.7 : 1 }]}
                onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { drillMode: r.drillMode } } as any); }}
              >
                <Text style={styles.revColLabel}>{r.label.toUpperCase()}</Text>
                <Text style={styles.revColAmt}>{r.value}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                  {r.delta != null && (
                    <>
                      <Feather
                        name={r.delta >= 0 ? 'arrow-up-right' : 'arrow-down-right'}
                        size={13}
                        color={r.delta >= 0 ? GREEN : RED}
                      />
                      <Text style={[styles.revDelta, { color: r.delta >= 0 ? GREEN : RED }]}>
                        {Math.abs(Math.round(r.delta))}%
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            </React.Fragment>
          ))}
          {/* Custom date range row */}
          <View style={styles.revDivider} />
          <Pressable
            onPress={() => { setShowRevPicker(true); Haptics.selectionAsync(); }}
            style={[styles.revCol, { minWidth: 54 }]}
          >
            <Text style={styles.revColLabel}>CUSTOM</Text>
            {customRevLoading ? (
              <ActivityIndicator size="small" color={BLUE} style={{ marginTop: 4 }} />
            ) : customRevTotal !== null ? (
              <>
                <Text style={[styles.revColAmt, { fontSize: 14 }]}>{fmtAUD(customRevTotal)}</Text>
                <Pressable onPress={() => { setCustomRevTotal(null); setCustomRevRange(null); }}>
                  <Text style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Clear ✕</Text>
                </Pressable>
              </>
            ) : (
              <Feather name="calendar" size={18} color={BLUE} style={{ marginTop: 4 }} />
            )}
          </Pressable>
        </View>

        <RevenueRangePicker
          visible={showRevPicker}
          onClose={() => setShowRevPicker(false)}
          onApply={handleApplyRevRange}
        />

        {/* ── KPI 4-tile grid ──────────────────────────────────── */}
        <View style={styles.kpi4Grid}>
          <KpiCard
            label="Active Orders" value={s?.orders.active ?? 0} color={BLUE}
            alert={(s?.orders.active ?? 0) > 0}
            onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app', filterParam: 'active' } } as any); }}
          />
          <KpiCard
            label="New Customers" value={s?.revenue.newCustomersToday ?? 0} color={GREEN}
            onPress={() => { Haptics.selectionAsync(); router.navigate('/(director)/users' as any); }}
          />
          <KpiCard
            label="Staff On Shift" value={s?.staff.clockedIn ?? 0} color={PURPLE}
            onPress={() => { Haptics.selectionAsync(); router.push('/director-staff-hours' as any); }}
          />
          <KpiCard
            label="Pending Approvals" value={pendingApprovals} color={RED}
            alert={pendingApprovals > 0}
            onPress={() => { Haptics.selectionAsync(); router.navigate('/(director)/users' as any); }}
          />
        </View>

        {/* ── Live Orders horizontal scroll ────────────────────── */}
        {(liveOrders?.length ?? 0) > 0 && (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionHeading}>Live Orders</Text>
              <Pressable onPress={() => { Haptics.selectionAsync(); router.navigate('/(director)/orders' as any); }}>
                <Text style={styles.seeAll}>See All</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 16 }}
              style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
            >
              {(liveOrders ?? []).map(order => {
                const col = STATUS_COLORS[order.status] ?? STATUS_COLORS.received;
                const lbl = STATUS_LABEL[order.status] ?? order.status;
                const orderRef = `#${order.orderNumber ?? order.id.slice(0, 6).toUpperCase()}`;
                const customerLabel = order.customerName ?? 'Customer';
                return (
                  <Pressable
                    key={order.id}
                    onPress={() => { Haptics.selectionAsync(); router.navigate('/(director)/orders' as any); }}
                    style={({ pressed }) => [styles.liveOrderCard, { opacity: pressed ? 0.8 : 1 }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={styles.liveOrderId}>{orderRef}</Text>
                      <Text style={styles.liveOrderTime}>{timeAgo(order.createdAt)}</Text>
                    </View>
                    <Text style={styles.liveOrderName} numberOfLines={1}>{customerLabel}</Text>
                    <View style={[styles.statusChip, { backgroundColor: col.bg }]}>
                      <Text style={[styles.statusChipText, { color: col.text }]}>{lbl}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Recent Activity ──────────────────────────────────── */}
        <View>
          <Text style={styles.sectionHeading}>Recent Activity</Text>
          {activity.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="activity" size={28} color={BORDER} />
              <Text style={{ fontSize: 14, color: MUTED }}>No recent activity</Text>
            </View>
          ) : (
            <View style={styles.activityCard}>
              {activity.slice(0, 8).map((ev: any, i: number) => (
                <View key={ev.id + i} style={[styles.activityRow, i > 0 && styles.activityRowBorder]}>
                  <View style={styles.activityCircle}>
                    <Feather name={ev.icon as any} size={17} color={BLUE} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>{ev.title}</Text>
                    <Text style={styles.activitySub} numberOfLines={1}>{ev.sub}</Text>
                  </View>
                  <Text style={styles.activityTime}>{timeAgo(ev.at)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Insights Today: hourly chart ─────────────────────── */}
        <View>
          <Text style={styles.sectionLabel}>INSIGHTS TODAY</Text>
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

        {/* ── Channel KPI strip ─────────────────────────────────── */}
        {s?.channels && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
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
            </Pressable>
          </View>
        )}

        {/* ── AOV + Customer split ──────────────────────────────── */}
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

        {/* ── Urgent alerts ─────────────────────────────────────── */}
        {hasAlerts && (
          <View style={[styles.alertCard, { backgroundColor: '#FFF1F0', borderColor: '#FCA5A5' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RED }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#7F1D1D' }}>Urgent — Action Required</Text>
            </View>
            {(s?.users.pendingStaff ?? 0) > 0 && (
              <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                <Feather name="user-check" size={13} color="#991B1B" />
                <Text style={[styles.alertRowText, { color: '#991B1B' }]}>{s?.users.pendingStaff} staff account{s?.users.pendingStaff !== 1 ? 's' : ''} awaiting approval</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>Review →</Text>
              </Pressable>
            )}
            {(s?.users.pendingWholesale ?? 0) > 0 && (
              <Pressable onPress={() => router.navigate('/(director)/users' as any)} style={styles.alertRow}>
                <Feather name="package" size={13} color="#991B1B" />
                <Text style={[styles.alertRowText, { color: '#991B1B' }]}>{s?.users.pendingWholesale} wholesale application{s?.users.pendingWholesale !== 1 ? 's' : ''} pending</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>Review →</Text>
              </Pressable>
            )}
            {(s?.issues.high ?? 0) > 0 && (
              <Pressable
                style={styles.alertRow}
                onPress={() => Alert.alert(
                  `${s?.issues.high} High-Priority Issue${s?.issues.high !== 1 ? 's' : ''}`,
                  'Staff-submitted issues are managed through the Staff Portal.',
                  [
                    { text: 'View Staff', onPress: () => router.navigate('/(director)/users' as any) },
                    { text: 'Dismiss', style: 'cancel' },
                  ],
                )}
              >
                <Feather name="alert-triangle" size={13} color="#991B1B" />
                <Text style={[styles.alertRowText, { color: '#991B1B' }]}>{s?.issues.high} high-priority issue{s?.issues.high !== 1 ? 's' : ''} open</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>View →</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ── Quick actions ──────────────────────────────────────── */}
        <View>
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <QuickBtn icon="shopping-bag" label="Orders"    color={GREEN}   onPress={() => router.navigate('/(director)/orders' as any)} />
            <QuickBtn icon="box"          label="Products"  color={BLUE}    onPress={() => router.navigate('/(director)/products' as any)} />
            <QuickBtn icon="bar-chart-2"  label="Reports"   color={BLUE}    onPress={() => router.push('/director-reports' as any)} />
            <QuickBtn icon="users"        label="Staff"     color={PURPLE}  onPress={() => router.push({ pathname: '/(director)/users', params: { tab: 'Staff' } } as any)} />
            <QuickBtn icon="bell"         label="Notify"    color="#06B6D4" onPress={() => router.push('/director-settings-notify' as any)} />
            <QuickBtn icon="briefcase"    label="Wholesale" color={AMBER}   onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'wholesale' } } as any)} />
            <QuickBtn icon="clipboard"    label="Tasks"     color={BLUE}    onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
            <QuickBtn icon="settings"     label="Settings"  color={BLUE}    onPress={() => router.push({ pathname: '/director-more-category', params: { category: 'system' } } as any)} />
          </View>
        </View>

        {/* ── Full KPI grid ─────────────────────────────────────── */}
        <View>
          <Text style={styles.sectionLabel}>TODAY'S OVERVIEW</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <KpiTile icon="zap"            label="Active orders"    value={s?.orders.active      ?? 0} color={GREEN}  alert={(s?.orders.active ?? 0) > 0}       onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'app', filterParam: 'active' } } as any); }} />
            <KpiTile icon="package"        label="WS pending"       value={s?.orders.wholesaleNew ?? 0} color={AMBER} alert={(s?.orders.wholesaleNew ?? 0) > 0}  onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(director)/orders', params: { tab: 'wholesale', filterParam: 'pending' } } as any); }} />
            <KpiTile icon="alert-octagon"  label="Open issues"      value={s?.issues.open        ?? 0} color={RED}    alert={(s?.issues.open ?? 0) > 0}          onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'issues' } } as any)} />
            <KpiTile icon="package"        label="Sold out"         value={s?.products.soldOut   ?? 0} color={RED}    alert={(s?.products.soldOut ?? 0) > 0}     onPress={() => router.navigate('/(director)/products' as any)} />
            <KpiTile icon="shopping-bag"   label="Orders today"     value={s?.orders.today       ?? 0} color={BLUE}   onPress={() => router.navigate('/(director)/orders' as any)} />
            <KpiTile icon="trending-down"  label="Low stock"        value={s?.products.lowStock  ?? 0} color={AMBER}  alert={(s?.products.lowStock ?? 0) > 0}    onPress={() => router.navigate('/(director)/products' as any)} />
            <KpiTile icon="users"          label="Staff clocked in" value={s?.staff.clockedIn    ?? 0} color={PURPLE} helper={`Week wages ${fmtAUD(s?.staff.weekWagesOwedCents ?? 0)}`} onPress={() => router.push('/director-staff-hours' as any)} />
            <KpiTile icon="mail"           label="Pending leave"    value={s?.staff.pendingLeave  ?? 0} color={AMBER}  onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'leave' } } as any)} />
            <KpiTile icon="clipboard"      label="Open tasks"       value={s?.tasks?.open        ?? 0} color={BLUE}   onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any)} />
            <KpiTile icon="trash-2"        label="Wastage today"    value={s?.wastage.countToday  ?? 0} color={PURPLE} helper={`Week loss ${fmtAUD(s?.wastage.costWeek ?? 0)}`} onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)} />
          </View>
        </View>

        {/* ── Wastage cost banner ───────────────────────────────── */}
        {((s?.wastage.costToday ?? 0) > 0 || (s?.wastage.costWeek ?? 0) > 0) && (
          <Pressable
            onPress={() => router.push({ pathname: '/(director)/staffhub', params: { tab: 'wastage' } } as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: '#FDF4FF', borderColor: '#E9D5FF' }}
          >
            <Feather name="trash-2" size={16} color={PURPLE} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: PURPLE }}>This Week's Wastage Cost</Text>
              <Text style={{ fontSize: 12, marginTop: 2, color: MUTED }}>
                {s?.wastage.countWeek ?? 0} item{(s?.wastage.countWeek ?? 0) !== 1 ? 's' : ''} logged — estimated {fmtAUD(s?.wastage.costWeek ?? 0)} lost
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={PURPLE} />
          </Pressable>
        )}

      </View>
    </ScrollView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, alert, onPress }: { label: string; value: number; color: string; alert?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.kpiCard, { opacity: pressed ? 0.85 : 1 }]}
    >
      {alert && <View style={styles.kpiDot} />}
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  greeting:    { fontSize: 32, fontWeight: '700', color: TEXT, letterSpacing: -0.5, lineHeight: 38 },
  greetingSub: { fontSize: 15, color: MUTED, marginTop: 4, fontWeight: '500' },

  // White revenue strip
  revCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    paddingVertical: 16,
  },
  revCol:      { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  revColLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  revColAmt:   { fontSize: 20, fontWeight: '700', color: TEXT },
  revDelta:    { fontSize: 12, fontWeight: '700' },
  revDivider:  { width: StyleSheet.hairlineWidth, height: 48, backgroundColor: '#E5E7EB' },

  // 4-tile KPI grid
  kpi4Grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: {
    width: '48%', flexGrow: 1,
    backgroundColor: CARD, borderRadius: 20, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    position: 'relative',
  },
  kpiDot:  { position: 'absolute', top: 12, right: 12, width: 9, height: 9, borderRadius: 5, backgroundColor: RED },
  kpiValue:{ fontSize: 34, fontWeight: '700', color: TEXT, lineHeight: 38 },
  kpiLabel:{ fontSize: 13, color: MUTED, fontWeight: '500', marginTop: 4, lineHeight: 17 },

  // Section headings
  sectionRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeading:{ fontSize: 17, fontWeight: '600', color: TEXT },
  sectionLabel:  { fontSize: 11, color: MUTED, letterSpacing: 1.5, fontWeight: '600', marginBottom: 10 },
  seeAll:        { fontSize: 15, fontWeight: '500', color: BLUE },

  // Live order cards
  liveOrderCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
    minWidth: 148,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  liveOrderId:   { fontSize: 14, fontWeight: '700', color: TEXT },
  liveOrderTime: { fontSize: 12, color: MUTED, fontWeight: '500' },
  liveOrderName: { fontSize: 15, fontWeight: '500', color: TEXT, marginBottom: 10 },
  statusChip:    { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusChipText:{ fontSize: 12, fontWeight: '700' },

  // Activity feed (circular icons)
  activityCard: {
    backgroundColor: CARD, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  activityRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  activityRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F0F0F0' },
  activityCircle:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityTitle:     { fontSize: 15, fontWeight: '600', color: TEXT },
  activitySub:       { fontSize: 13, color: MUTED },
  activityTime:      { fontSize: 13, color: MUTED, flexShrink: 0 },

  // Alert card
  alertCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 6 },
  alertRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertRowText: { flex: 1, fontSize: 13 },

  // Channel cards (smaller, reuse from existing)
  channelCard: {
    backgroundColor: CARD, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },

  emptyCard: {
    alignItems: 'center', gap: 10, padding: 32, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: CARD, borderColor: BORDER,
  },
});

// ── Role-aware wrapper ─────────────────────────────────────────────────────────
function DirectorHomeInner() {
  return (
    <DirectorTabScreen title="Dashboard" hideHeader>
      <DirectorDashboardInner />
    </DirectorTabScreen>
  );
}

export default function DirectorHome() {
  const { user } = useAuth();
  const role = user?.role;
  useFocusStatusBar('dark-content');
  if (role === 'staff' || role === 'manager') {
    return <StaffDashboard />;
  }
  return <DirectorHomeInner />;
}
