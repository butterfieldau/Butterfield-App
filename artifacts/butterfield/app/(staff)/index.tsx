import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#16A34A';

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

export default function StaffDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tick, setTick] = useState(0);
  const [breakActiveType, setBreakActiveType] = useState<'paid' | 'unpaid' | null>(null);
  const [breakStartMs, setBreakStartMs] = useState<number>(0);
  const [accUnpaidBreakMs, setAccUnpaidBreakMs] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: shiftData, refetch: refetchShift, isRefetching: shiftRefetching } = useQuery({
    queryKey: ['current-shift'], queryFn: () => api.staff.currentShift(), retry: 1,
  });
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['staff-shift-stats'], queryFn: () => api.staff.shiftStats(), retry: 1,
  });
  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'], queryFn: () => api.staff.profile(), retry: 1,
  });
  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ['staff-tasks'], queryFn: () => api.staff.tasks(), retry: 1,
  });
  const { data: ordersData, refetch: refetchOrders } = useQuery({
    queryKey: ['all-orders'], queryFn: () => api.staff.allOrders(), retry: 1, refetchInterval: 60000,
  });

  const shift = shiftData?.data;
  const stats = statsData?.data;
  const profile = profileData?.data;
  const isClocked = !!(shift && !shift.clockOut);
  const hourlyRateCents = profile?.hourlyRateCents ?? stats?.hourlyRateCents ?? 2200;

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

  const liveEarned = isClocked && shift
    ? ((liveElapsedMins / 60) * (hourlyRateCents / 100)).toFixed(2)
    : '0.00';

  const handleClockIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await api.staff.clockIn();
      setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      refetchStats();
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
          qc.invalidateQueries({ queryKey: ['current-shift'] });
          refetchStats();
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

  const tasks = tasksData?.data ?? [];
  const completedTasks = tasks.filter((t) => t.isCompleted).length;
  const urgentTasks = tasks.filter((t) => !t.isCompleted).slice(0, 5);

  const todayMins = stats?.todayMins ?? 0;
  const todayEarnings = stats ? ((stats.todayEarningsCents ?? 0) / 100).toFixed(2) : '0.00';
  const weekMins = stats?.weekMins ?? 0;
  const weekEarnings = stats ? ((stats.weekEarningsCents ?? 0) / 100).toFixed(2) : '0.00';

  const allOrders = ordersData?.data ?? [];
  const sydNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const todayStr = sydNow.toDateString();
  const todayScheduled = allOrders
    .filter((o: any) => {
      if (!o.scheduledFor) return false;
      return new Date(o.scheduledFor).toDateString() === todayStr && o.status !== 'cancelled' && o.status !== 'refunded';
    })
    .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  const scheduleGroups: { time: string; orders: any[] }[] = [];
  todayScheduled.forEach((o: any) => {
    const t = new Date(o.scheduledFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });
    const existing = scheduleGroups.find((g) => g.time === t);
    if (existing) existing.orders.push(o);
    else scheduleGroups.push({ time: t, orders: [o] });
  });

  const handleCompleteTask = async (taskId: string, completed: boolean) => {
    Haptics.selectionAsync();
    try {
      await api.staff.completeTask(taskId, !completed);
      qc.invalidateQueries({ queryKey: ['staff-tasks'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={shiftRefetching}
          onRefresh={() => { refetchShift(); refetchTasks(); refetchOrders(); refetchStats(); }}
          tintColor={BLUE}
        />
      }
    >
      {/* Header */}
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { fontFamily: 'Inter_400Regular' }]}>Good shift,</Text>
            <Text style={[styles.name, { fontFamily: 'Inter_700Bold' }]}>{user?.name?.split(' ')[0]} 👋</Text>
          </View>
          <View style={[styles.shiftIndicator, { backgroundColor: isClocked ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', borderColor: isClocked ? '#22C55E' : '#EF4444', borderWidth: 1 }]}>
            <View style={[styles.shiftDot, { backgroundColor: isClocked ? '#22C55E' : '#EF4444' }]} />
            <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: isClocked ? '#22C55E' : '#EF4444' }]}>{isClocked ? 'On Shift' : 'Off Duty'}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 14, paddingTop: 16 }}>

        {/* ── Full Clock Card ── */}
        <View style={[styles.shiftCard, { backgroundColor: CARD }]}>
          <View style={styles.shiftCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="clock" size={13} color={MUTED} />
              <Text style={[styles.shiftCardLabel, { color: MUTED }]}>CURRENT SHIFT</Text>
            </View>
            {isClocked && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveText, { color: GREEN }]}>LIVE</Text>
              </View>
            )}
          </View>

          {!isClocked ? (
            <>
              <Text style={[styles.bigStatus, { color: TEXT }]}>Off duty</Text>
              <Text style={[styles.shiftSub, { color: MUTED }]}>
                Tap below to start your shift. We'll record your location.
              </Text>
              <Pressable onPress={handleClockIn} style={[styles.mainBtn, { backgroundColor: BLUE }]}>
                <Text style={styles.mainBtnText}>Clock in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.bigElapsed, { color: TEXT }]} key={tick}>
                {formatDuration(liveElapsedMins)}
              </Text>
              <Text style={[styles.shiftSub, { color: MUTED }]}>
                Started {shift ? formatTime12(shift.clockIn) : '—'} · Earned ${liveEarned}
              </Text>
              <View style={styles.breakRow}>
                <Pressable
                  onPress={() => handleBreakToggle('paid')}
                  style={[styles.breakBtn, breakActiveType === 'paid' && { backgroundColor: '#FFF8E7', borderColor: '#D97706' }]}
                >
                  <Feather name="coffee" size={13} color={breakActiveType === 'paid' ? '#D97706' : TEXT} />
                  <Text style={[styles.breakBtnText, { color: breakActiveType === 'paid' ? '#D97706' : TEXT }]}>
                    {breakActiveType === 'paid' ? 'End break' : 'Paid break'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleBreakToggle('unpaid')}
                  disabled={breakActiveType === 'paid'}
                  style={[styles.breakBtn, breakActiveType === 'unpaid' && { backgroundColor: '#FFF1F0', borderColor: '#F87171' }, breakActiveType === 'paid' && { opacity: 0.4 }]}
                >
                  <Feather name="pause" size={13} color={breakActiveType === 'unpaid' ? '#EF4444' : TEXT} />
                  <Text style={[styles.breakBtnText, { color: breakActiveType === 'unpaid' ? '#EF4444' : TEXT }]}>
                    {breakActiveType === 'unpaid' ? 'End break' : 'Unpaid break'}
                  </Text>
                </Pressable>
              </View>
              <Pressable onPress={handleClockOut} style={[styles.mainBtn, { backgroundColor: RED }]}>
                <Text style={styles.mainBtnText}>Clock out</Text>
              </Pressable>
            </>
          )}

          <View style={styles.locationRow}>
            <Feather name="map-pin" size={11} color={MUTED} />
            <Text style={[styles.locationText, { color: MUTED }]}>Must be within 150m of the store</Text>
          </View>
        </View>

        {/* Stats mini cards */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: CARD }]}>
            <Text style={[styles.statLabel, { color: MUTED }]}>TODAY (PAID)</Text>
            <Text style={[styles.statDuration, { color: TEXT }]}>{formatDuration(todayMins)}</Text>
            <Text style={[styles.statEarnings, { color: MUTED }]}>${todayEarnings}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: CARD }]}>
            <Text style={[styles.statLabel, { color: MUTED }]}>THIS WEEK</Text>
            <Text style={[styles.statDuration, { color: TEXT }]}>{formatDuration(weekMins)}</Text>
            <Text style={[styles.statEarnings, { color: MUTED }]}>${weekEarnings}</Text>
          </View>
        </View>

        {/* Task progress */}
        <View style={[styles.taskProgress, { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Today's Tasks</Text>
            <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>{completedTasks}/{tasks.length}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: '#F0F0F0' }]}>
            <View style={[styles.progressFill, { width: tasks.length ? `${Math.round(completedTasks / tasks.length * 100)}%` : '0%', backgroundColor: BLUE }]} />
          </View>
        </View>

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, { color: MUTED, fontFamily: 'Inter_600SemiBold' }]}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          {[
            { icon: 'clipboard',      label: 'Tasks',        bg: '#E0F5FE', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'tasks' } }) },
            { icon: 'alert-triangle', label: 'Log Wastage',  bg: '#FEF3C7', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'wastage' } }) },
            { icon: 'tool',           label: 'Report Issue', bg: '#FEE2E2', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'issues' } }) },
            { icon: 'calendar',       label: 'Leave Request',bg: '#F3E8FF', onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'leave' } }) },
          ].map((action) => (
            <Pressable key={action.label} onPress={() => { Haptics.selectionAsync(); action.onPress(); }}
              style={[styles.actionCard, { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER }]}>
              <View style={[styles.actionIcon, { backgroundColor: action.bg, borderRadius: 12 }]}>
                <Feather name={action.icon as any} size={20} color={BLUE} />
              </View>
              <Text style={[styles.actionLabel, { color: TEXT, fontFamily: 'Inter_500Medium' }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Today's schedule */}
        <Text style={[styles.sectionTitle, { color: MUTED, fontFamily: 'Inter_600SemiBold' }]}>TODAY'S SCHEDULE</Text>
        {scheduleGroups.length === 0 ? (
          <View style={[styles.emptySchedule, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
            <Feather name="calendar" size={22} color={BORDER} />
            <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }]}>No scheduled pickups today</Text>
          </View>
        ) : scheduleGroups.map((group) => (
          <View key={group.time} style={{ gap: 8 }}>
            <View style={styles.timeRow}>
              <Feather name="clock" size={12} color={BLUE} />
              <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>{group.time}</Text>
            </View>
            {group.orders.map((order: any) => {
              const items = Array.isArray(order.items) ? order.items : [];
              const statusColors: Record<string, string> = {
                received: '#3B82F6', being_prepared: '#F59E0B', ready_for_pickup: '#22C55E',
                completed: '#6B7280', cancelled: '#EF4444',
              };
              const sc = statusColors[order.status] ?? '#3B82F6';
              return (
                <Pressable key={order.id} onPress={() => router.push('/(staff)/orders')}
                  style={[styles.scheduleCard, { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, borderLeftColor: sc, borderLeftWidth: 3 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={[{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>#{order.id.slice(0, 6).toUpperCase()}</Text>
                      <View style={[{ backgroundColor: `${sc}18`, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }]}>
                        <Text style={[{ color: sc, fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'capitalize' }]}>{order.status.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }]} numberOfLines={1}>
                      {items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.productName}`).join(', ')}
                      {items.length > 3 ? ` +${items.length - 3} more` : ''}
                    </Text>
                  </View>
                  <Text style={[{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Pending tasks */}
        {urgentTasks.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: MUTED, fontFamily: 'Inter_600SemiBold' }]}>PENDING TASKS</Text>
            {urgentTasks.map((task) => (
              <Pressable key={task.id} onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                style={[styles.taskRow, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, borderLeftColor: BLUE, borderLeftWidth: 3 }]}>
                <View style={[styles.taskCheck, { borderColor: task.isCompleted ? '#22C55E' : BORDER, backgroundColor: task.isCompleted ? '#22C55E' : '#fff', borderWidth: 2, borderRadius: 8 }]}>
                  {task.isCompleted && <Feather name="check" size={12} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: task.isCompleted ? MUTED : TEXT, fontFamily: 'Inter_500Medium', fontSize: 14, textDecorationLine: task.isCompleted ? 'line-through' : 'none' }]}>{task.title}</Text>
                  <Text style={[{ color: BLUE, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }]}>{task.category}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  name: { color: '#fff', fontSize: 24 },
  shiftIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shiftDot: { width: 6, height: 6, borderRadius: 3 },
  shiftCard: { borderRadius: 18, padding: 18, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: BORDER },
  shiftCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shiftCardLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  liveText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  bigStatus: { fontSize: 38, fontFamily: 'Inter_700Bold', marginTop: 2 },
  bigElapsed: { fontSize: 38, fontFamily: 'Inter_700Bold', marginTop: 2 },
  shiftSub: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  mainBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 2 },
  mainBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  breakRow: { flexDirection: 'row', gap: 10 },
  breakBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 30, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  breakBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  locationText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, gap: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: 1, borderColor: BORDER },
  statLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 2 },
  statDuration: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statEarnings: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  taskProgress: { padding: 16, gap: 10 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  actionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  taskCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  emptySchedule: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
