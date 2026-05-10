import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  scheduleClockInReminder,
  cancelClockInReminder,
  scheduleClockOutReminder,
  cancelClockOutReminder,
  sendClockInConfirmation,
  sendClockOutConfirmation,
} from '@/lib/staffNotifications';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const PURPLE = '#7C3AED';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#16A34A';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

function formatDuration(totalMins: number): string {
  if (totalMins === 0) return '0m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatTime12(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => { scheduleClockInReminder(); }, []);

  const [tick, setTick] = useState(0);
  const [breakActiveType, setBreakActiveType] = useState<'paid' | 'unpaid' | null>(null);
  const [breakStartMs, setBreakStartMs] = useState<number>(0);
  const [accUnpaidBreakMs, setAccUnpaidBreakMs] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: shiftData, refetch: refetchShift, isRefetching: shiftRefetching } = useQuery({
    queryKey: ['manager-current-shift'], queryFn: () => api.staff.currentShift(), retry: 1,
  });
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['manager-shift-stats'], queryFn: () => api.staff.shiftStats(), retry: 1,
  });
  const { data: dirStats, refetch: refetchDirStats } = useQuery({
    queryKey: ['director-stats'], queryFn: () => api.director.stats(), retry: 1,
  });

  const shift = shiftData?.data;
  const stats = statsData?.data;
  const ds    = dirStats?.data;
  const isClocked = !!(shift && !shift.clockOut);
  const hourlyRateCents = stats?.hourlyRateCents ?? 0;

  useEffect(() => {
    if (isClocked) {
      intervalRef.current = setInterval(() => setTick(t => t + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isClocked]);

  const currentUnpaidMs = breakActiveType === 'unpaid' && breakStartMs
    ? accUnpaidBreakMs + (Date.now() - breakStartMs)
    : accUnpaidBreakMs;

  const liveElapsedMins = isClocked && shift
    ? Math.max(0, Math.floor((Date.now() - new Date(shift.clockIn).getTime() - currentUnpaidMs) / 60000))
    : 0;

  const liveEarned = isClocked && shift && hourlyRateCents > 0
    ? ((liveElapsedMins / 60) * (hourlyRateCents / 100)).toFixed(2)
    : null;

  const handleClockIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await api.staff.clockIn();
      setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['manager-current-shift'] });
      refetchStats();
      const clockInTime = res?.data?.clockIn ?? new Date().toISOString();
      cancelClockInReminder();
      scheduleClockOutReminder(clockInTime);
      sendClockInConfirmation();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'End your shift now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock Out', style: 'destructive', onPress: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        try {
          const unpaidMins = Math.floor(currentUnpaidMs / 60000);
          const res = await api.staff.clockOut(unpaidMins);
          setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
          qc.invalidateQueries({ queryKey: ['manager-current-shift'] });
          refetchStats();
          cancelClockOutReminder();
          scheduleClockInReminder();
          sendClockOutConfirmation(res.data.hoursWorked ?? '0h');
          Alert.alert('Shift ended', `Total paid time: ${res.data.hoursWorked}`);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleBreakToggle = (type: 'paid' | 'unpaid') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (breakActiveType !== null) {
      const elapsed = Date.now() - breakStartMs;
      if (breakActiveType === 'unpaid') setAccUnpaidBreakMs(prev => prev + elapsed);
      setBreakActiveType(null); setBreakStartMs(0);
    } else {
      setBreakActiveType(type); setBreakStartMs(Date.now());
    }
  };

  const todayMins   = stats?.todayMins ?? 0;
  const weekMins    = stats?.weekMins ?? 0;
  const todayEarnings = stats && hourlyRateCents > 0 ? ((stats.todayEarningsCents ?? 0) / 100).toFixed(2) : null;
  const weekEarnings  = stats && hourlyRateCents > 0 ? ((stats.weekEarningsCents ?? 0) / 100).toFixed(2) : null;

  const recentOrders: any[] = ds?.recentOrders ?? [];
  const pendingApprovals    = ds?.staff?.pendingApprovals ?? 0;
  const ordersToday         = ds?.orders?.today ?? 0;
  const activeOrders        = ds?.orders?.active ?? 0;
  const pendingLeave        = ds?.staff?.pendingLeaveRequests ?? 0;

  const kpis = [
    { label: 'Orders Today', value: String(ordersToday), icon: 'shopping-bag' as const, color: '#3B82F6' },
    { label: 'Active Now',   value: String(activeOrders), icon: 'activity' as const,     color: GREEN },
    { label: 'Pending Staff',value: String(pendingApprovals), icon: 'user-check' as const, color: AMBER },
    { label: 'Leave Pending',value: String(pendingLeave), icon: 'umbrella' as const,     color: PURPLE },
  ];

  const STATUS_COLORS: Record<string, string> = {
    received: '#3B82F6', being_prepared: AMBER, ready_for_pickup: GREEN,
    completed: MUTED, cancelled: RED,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={shiftRefetching}
          onRefresh={() => { refetchShift(); refetchStats(); refetchDirStats(); }}
          tintColor={PURPLE}
        />
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 16 }}>

        {/* ── Greeting ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <View>
            <Text style={[s.greeting, { color: MUTED }]}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</Text>
            <Text style={[s.name, { color: TEXT }]}>{user?.name?.split(' ')[0] ?? 'Manager'}</Text>
          </View>
          <View style={[s.managerBadge, { backgroundColor: PURPLE + '18', borderColor: PURPLE + '40' }]}>
            <Feather name="shield" size={12} color={PURPLE} />
            <Text style={[s.managerBadgeText, { color: PURPLE }]}>MANAGER</Text>
          </View>
        </View>

        {/* ── Clock Card ── */}
        <View style={[s.clockCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.clockHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="clock" size={13} color={MUTED} />
              <Text style={[s.clockLabel, { color: MUTED }]}>MY SHIFT</Text>
            </View>
            {isClocked && (
              <View style={s.liveBadge}>
                <View style={[s.liveDot, { backgroundColor: GREEN }]} />
                <Text style={[s.liveText, { color: GREEN }]}>LIVE</Text>
              </View>
            )}
          </View>

          {!isClocked ? (
            <>
              <Text style={[s.bigStatus, { color: TEXT }]}>Off duty</Text>
              <Text style={[s.clockSub, { color: MUTED }]}>Tap below to start your shift.</Text>
              <Pressable onPress={handleClockIn} style={[s.mainBtn, { backgroundColor: PURPLE }]}>
                <Feather name="play-circle" size={18} color="#fff" />
                <Text style={s.mainBtnText}>Clock In</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[s.bigElapsed, { color: TEXT }]} key={tick}>
                {formatDuration(liveElapsedMins)}
              </Text>
              <Text style={[s.clockSub, { color: MUTED }]}>
                Started {shift ? formatTime12(shift.clockIn) : '—'}
                {liveEarned ? ` · Earned $${liveEarned}` : ''}
              </Text>
              <View style={s.breakRow}>
                <Pressable
                  onPress={() => handleBreakToggle('paid')}
                  style={[s.breakBtn, { borderColor: BORDER }, breakActiveType === 'paid' && { backgroundColor: '#FFF8E7', borderColor: '#D97706' }]}
                >
                  <Feather name="coffee" size={13} color={breakActiveType === 'paid' ? '#D97706' : TEXT} />
                  <Text style={[s.breakBtnText, { color: breakActiveType === 'paid' ? '#D97706' : TEXT }]}>
                    {breakActiveType === 'paid' ? 'End break' : 'Paid break'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleBreakToggle('unpaid')}
                  disabled={breakActiveType === 'paid'}
                  style={[s.breakBtn, { borderColor: BORDER }, breakActiveType === 'unpaid' && { backgroundColor: '#FFF1F0', borderColor: '#F87171' }, breakActiveType === 'paid' && { opacity: 0.4 }]}
                >
                  <Feather name="pause" size={13} color={breakActiveType === 'unpaid' ? RED : TEXT} />
                  <Text style={[s.breakBtnText, { color: breakActiveType === 'unpaid' ? RED : TEXT }]}>
                    {breakActiveType === 'unpaid' ? 'End break' : 'Unpaid break'}
                  </Text>
                </Pressable>
              </View>
              <Pressable onPress={handleClockOut} style={[s.mainBtn, { backgroundColor: RED }]}>
                <Feather name="stop-circle" size={18} color="#fff" />
                <Text style={s.mainBtnText}>Clock Out</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── Shift stats ── */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Text style={[s.statLabel, { color: MUTED }]}>TODAY (PAID)</Text>
            <Text style={[s.statDuration, { color: TEXT }]}>{formatDuration(todayMins)}</Text>
            {todayEarnings && <Text style={[s.statEarnings, { color: MUTED }]}>${todayEarnings}</Text>}
          </View>
          <View style={[s.statCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Text style={[s.statLabel, { color: MUTED }]}>THIS WEEK</Text>
            <Text style={[s.statDuration, { color: TEXT }]}>{formatDuration(weekMins)}</Text>
            {weekEarnings && <Text style={[s.statEarnings, { color: MUTED }]}>${weekEarnings}</Text>}
          </View>
        </View>

        {/* ── Store KPIs ── */}
        <Text style={[s.sectionTitle, { color: MUTED }]}>STORE OVERVIEW</Text>
        <View style={s.kpiGrid}>
          {kpis.map((k) => (
            <View key={k.label} style={[s.kpiCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={[s.kpiIcon, { backgroundColor: k.color + '18' }]}>
                <Feather name={k.icon} size={16} color={k.color} />
              </View>
              <Text style={[s.kpiValue, { color: TEXT }]}>{k.value}</Text>
              <Text style={[s.kpiLabel, { color: MUTED }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick actions ── */}
        <Text style={[s.sectionTitle, { color: MUTED }]}>QUICK ACTIONS</Text>
        <View style={s.actionsRow}>
          {[
            { icon: 'shopping-bag' as const, label: 'Orders',     onPress: () => router.push('/(manager)/orders') },
            { icon: 'users'       as const, label: 'People',      onPress: () => router.push('/(manager)/users') },
            { icon: 'clock'       as const, label: 'Timesheets',  onPress: () => router.push('/(manager)/timesheets') },
            { icon: 'settings'    as const, label: 'Settings',    onPress: () => router.push('/(manager)/settings') },
          ].map((a) => (
            <Pressable
              key={a.label}
              onPress={() => { Haptics.selectionAsync(); a.onPress(); }}
              style={[s.actionBtn, { backgroundColor: CARD, borderColor: BORDER }]}
            >
              <View style={[s.actionIcon, { backgroundColor: PURPLE + '18' }]}>
                <Feather name={a.icon} size={18} color={PURPLE} />
              </View>
              <Text style={[s.actionLabel, { color: TEXT }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Recent orders ── */}
        {recentOrders.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: MUTED }]}>RECENT ORDERS</Text>
            {recentOrders.slice(0, 6).map((order: any) => {
              const sc = STATUS_COLORS[order.status] ?? '#3B82F6';
              const items: any[] = Array.isArray(order.items) ? order.items : [];
              return (
                <View key={order.id} style={[s.orderCard, { backgroundColor: CARD, borderColor: BORDER, borderLeftColor: sc }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <Text style={[s.orderId, { color: TEXT }]}>#{order.id.slice(0, 6).toUpperCase()}</Text>
                      <View style={[s.statusPill, { backgroundColor: sc + '18' }]}>
                        <Text style={[s.statusText, { color: sc }]}>{order.status.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <Text style={[s.orderItems, { color: MUTED }]} numberOfLines={1}>
                      {items.slice(0, 2).map((i: any) => `${i.quantity}× ${i.productName}`).join(', ')}
                      {items.length > 2 ? ` +${items.length - 2} more` : ''}
                    </Text>
                  </View>
                  <Text style={[s.orderTotal, { color: PURPLE }]}>
                    ${(order.totalCents / 100).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  greeting:        { fontSize: 13, fontFamily: 'Inter_400Regular' },
  name:            { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 2 },
  managerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  managerBadgeText:{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  clockCard:       { borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  clockHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clockLabel:      { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  liveBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot:         { width: 8, height: 8, borderRadius: 4 },
  liveText:        { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  bigStatus:       { fontSize: 38, fontFamily: 'Inter_700Bold', marginTop: 2 },
  bigElapsed:      { fontSize: 38, fontFamily: 'Inter_700Bold', marginTop: 2 },
  clockSub:        { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  mainBtn:         { borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  mainBtnText:     { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  breakRow:        { flexDirection: 'row', gap: 10 },
  breakBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 30, borderWidth: 1, backgroundColor: CARD },
  breakBtnText:    { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statsRow:        { flexDirection: 'row', gap: 12 },
  statCard:        { flex: 1, borderRadius: 14, padding: 14, gap: 2, borderWidth: 1 },
  statLabel:       { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 2 },
  statDuration:    { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statEarnings:    { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  sectionTitle:    { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: 4 },
  kpiGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard:         { width: '47%', borderRadius: 14, padding: 14, gap: 6, borderWidth: 1 },
  kpiIcon:         { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiValue:        { fontSize: 26, fontFamily: 'Inter_700Bold' },
  kpiLabel:        { fontSize: 11, fontFamily: 'Inter_400Regular' },
  actionsRow:      { flexDirection: 'row', gap: 10 },
  actionBtn:       { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 8, borderWidth: 1 },
  actionIcon:      { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionLabel:     { fontSize: 11, fontFamily: 'Inter_500Medium' },
  orderCard:       { borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD },
  orderId:         { fontSize: 13, fontFamily: 'Inter_700Bold' },
  statusPill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText:      { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  orderItems:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED },
  orderTotal:      { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
