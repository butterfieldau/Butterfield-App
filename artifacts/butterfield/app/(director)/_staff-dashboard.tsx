import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import {
  cancelClockInReminder,
  scheduleClockOutReminder,
  cancelClockOutReminder,
  sendClockInConfirmation,
  sendClockOutConfirmation,
} from '@/lib/staffNotifications';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
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

function parseHoursWorked(raw: string | null | undefined): number {
  if (!raw) return 0;
  const legacyMatch = raw.match(/^(\d+)h\s*(\d+)m$/);
  if (legacyMatch) return parseInt(legacyMatch[1]) + parseInt(legacyMatch[2]) / 60;
  const hOnly = raw.match(/^(\d+)h$/);
  if (hOnly) return parseInt(hOnly[1]);
  const mOnly = raw.match(/^(\d+)m$/);
  if (mOnly) return parseInt(mOnly[1]) / 60;
  const decimal = parseFloat(raw);
  return isNaN(decimal) ? 0 : decimal;
}

function formatDecimalHours(raw: string | null | undefined): string {
  const hrs = parseHoursWorked(raw);
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  if (h === 0 && m === 0) return '0m';
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

function getTaskStatus(task: any): { label: string; bg: string; text: string } {
  if (task.isCompleted) return { label: 'Done', bg: '#DCFCE7', text: '#15803D' };
  const cat = task.category?.toLowerCase() ?? '';
  if (cat === 'closing') return { label: 'Upcoming', bg: '#FEF3C7', text: '#B45309' };
  if (cat === 'opening') return { label: 'Upcoming', bg: '#EFF6FF', text: '#1D4ED8' };
  return { label: 'Pending', bg: '#F3F4F6', text: '#6B7280' };
}

function getCategoryColor(cat: string): string {
  const c = cat?.toLowerCase() ?? '';
  if (c === 'opening')  return '#3B82F6';
  if (c === 'closing')  return '#F59E0B';
  if (c === 'prep')     return '#8B5CF6';
  if (c === 'cleaning') return '#10B981';
  if (c === 'daily')    return '#06B6D4';
  if (c === 'training') return '#EC4899';
  return '#9CA3AF';
}

export function StaffDashboard() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  useEffect(() => {
    cancelClockInReminder();
  }, []);

  const [tick, setTick] = useState(0);
  const [breakActiveType, setBreakActiveType] = useState<'paid' | 'unpaid' | null>(null);
  const [breakStartMs, setBreakStartMs] = useState<number>(0);
  const [accUnpaidBreakMs, setAccUnpaidBreakMs] = useState<number>(0);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef     = useRef<ScrollView>(null);
  const pendingTasksY = useRef<number>(0);

  const scrollToPendingTasks = useCallback(() => {
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ y: pendingTasksY.current, animated: true });
  }, []);

  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number } | undefined>();

  const getFastLocation = useCallback(async (accuracy: Location.Accuracy = Location.Accuracy.Balanced) => {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 120000,
      requiredAccuracy: 500,
    }).catch(() => null);
    if (lastKnown?.coords) {
      return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  }, []);

  const { data: shiftData, refetch: refetchShift } = useQuery({
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
  const canViewOrders = (profileData?.data as any)?.canViewOrders === true;

  const { data: ordersData, refetch: refetchOrders } = useQuery({
    queryKey: ['all-orders'], queryFn: () => api.staff.allOrders(), retry: 1, refetchInterval: 60000,
    enabled: canViewOrders,
  });
  const { data: assignmentsData } = useQuery({
    queryKey: ['my-store-assignments'], queryFn: () => api.staff.myStoreAssignments(), retry: 1,
  });
  const storeAssignments: any[] = assignmentsData?.data ?? [];

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

  const doClockIn = async (coords?: { latitude: number; longitude: number }, storeId?: string) => {
    try {
      const res = await api.staff.clockIn(coords ? { storeId, latitude: coords.latitude, longitude: coords.longitude } : { storeId });
      setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      refetchStats();
      const clockInTime = res?.data?.clockIn ?? new Date().toISOString();
      cancelClockInReminder(); scheduleClockOutReminder(clockInTime); sendClockInConfirmation();
      if (res?.data?.storeName) {
        Alert.alert('Clocked In ✓', `You are now clocked in at ${res.data.storeName}.`);
      }
    } catch (e: any) { Alert.alert('Clock-In Error', e.message); }
  };

  const handleClockIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    let coords: { latitude: number; longitude: number } | undefined;
    const existingPermission = await Location.getForegroundPermissionsAsync().catch(() => null);
    const { status } = existingPermission?.status === 'granted'
      ? existingPermission
      : await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        coords = await getFastLocation(Location.Accuracy.Balanced);
      } catch { /* use undefined */ }
    } else {
      if (storeAssignments.length > 0) {
        Alert.alert('Location Required', 'Staff clock-in is tied to your assigned store, so location access is required here. Please enable Location Services and try again.', [{ text: 'OK' }]);
        return;
      }
      Alert.alert('Location Required', "Location access helps verify you're at the right store. You can continue for now because no store has been assigned to this account yet.", [
        { text: 'Continue Anyway', onPress: async () => { await doClockIn(undefined); } },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    if (!coords && storeAssignments.length > 0) {
      Alert.alert('Location Needed', 'We could not get a valid location, and this account is tied to an assigned store. Please try again with Location Services enabled.', [{ text: 'OK' }]);
      return;
    }

    if (storeAssignments.length > 1 && coords) {
      setPendingCoords(coords);
      setStorePickerVisible(true);
    } else if (storeAssignments.length > 0) {
      await doClockIn(coords, storeAssignments[0]?.storeId);
    } else {
      await doClockIn(coords);
    }
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'End your shift now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock Out', style: 'destructive', onPress: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        try {
          const unpaidMins = Math.floor(currentUnpaidMs / 60000);
          let outCoords: { latitude: number; longitude: number } | undefined;
          try {
            outCoords = await getFastLocation(Location.Accuracy.Balanced);
          } catch { /* ignore */ }
          const res = await api.staff.clockOut(unpaidMins, outCoords);
          setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
          qc.invalidateQueries({ queryKey: ['current-shift'] });
          refetchStats();
          cancelClockOutReminder();
          const fmtWorked = formatDecimalHours(res.data.hoursWorked);
          sendClockOutConfirmation(fmtWorked);
          Alert.alert('Shift ended', `Total paid time: ${fmtWorked}`);
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

  const activeStoreName = isClocked && shift?.storeId
    ? storeAssignments.find(a => a.storeId === shift.storeId)?.name ?? null
    : null;

  const { refreshing, onRefresh } = useRefreshControl(refetchShift, refetchStats, refetchTasks, refetchOrders);

  // Greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const pendingCount = tasks.filter((t) => !t.isCompleted).length;
  const dateLabel = now.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  const taskProgress = tasks.length > 0 ? completedTasks / tasks.length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* Store Picker Modal */}
      <Modal visible={storePickerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setStorePickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <Pressable onPress={() => setStorePickerVisible(false)} style={{ padding: 4 }} hitSlop={8}>
              <Feather name="x" size={20} color={TEXT} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 17, color: TEXT }}>Which store?</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={{ padding: 20, gap: 10 }}>
            <Text style={{ fontWeight: '400', fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 4 }}>
              You're assigned to multiple stores. Select the one you're clocking in at.
            </Text>
            {storeAssignments.map(a => (
              <Pressable
                key={a.id}
                onPress={async () => { setStorePickerVisible(false); await doClockIn(pendingCoords, a.storeId); }}
                style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="map-pin" size={18} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: TEXT }}>{a.name ?? 'Store'}</Text>
                  {a.suburb ? <Text style={{ fontWeight: '400', fontSize: 12, color: MUTED, marginTop: 2 }}>{a.suburb}</Text> : null}
                  {a.address ? <Text style={{ fontWeight: '400', fontSize: 12, color: MUTED }}>{a.address}</Text> : null}
                </View>
                {a.isPrimary && (
                  <View style={{ backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: BLUE }}>Primary</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={16} color={MUTED} />
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        <View style={{ paddingHorizontal: 20, gap: 18 }}>

          {/* ── Greeting Header ── */}
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greetingTitle} numberOfLines={1}>
                {greeting}, {firstName} {greetEmoji}
              </Text>
              <Text style={styles.greetingSubtitle}>
                You've got {pendingCount} task{pendingCount !== 1 ? 's' : ''} today
              </Text>
              <Text style={styles.greetingDate}>{dateLabel}</Text>
            </View>
            <Pressable
              style={styles.menuBtn}
              onPress={() => router.navigate({ pathname: '/(director)/tasks', params: { initialTab: 'tasks' } } as any)}
            >
              <Feather name="menu" size={20} color={TEXT} />
            </Pressable>
          </View>

          {/* ── Gradient Clock Card ── */}
          <LinearGradient
            colors={['#5AB8FF', '#1672D8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1.1 }}
            style={styles.gradCard}
          >
            {/* Header row */}
            <View style={styles.gradCardHeader}>
              <View>
                <Text style={styles.gradCardName}>{user?.name ?? firstName}</Text>
                <Text style={styles.gradCardSub}>
                  {isClocked
                    ? `On shift · Started ${shift ? formatTime12(shift.clockIn) : '—'}${activeStoreName ? ` · ${activeStoreName}` : ''}`
                    : 'Not on shift'}
                </Text>
              </View>
              {isClocked && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            {/* Elapsed time (when clocked in) */}
            {isClocked && (
              <Text style={styles.gradElapsed} key={tick}>
                {formatDuration(liveElapsedMins)}
              </Text>
            )}

            {/* Task progress bar */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '600', letterSpacing: 1.1 }}>TODAY'S TASKS</Text>
              <View style={styles.gradProgressTrack}>
                <View style={[styles.gradProgressFill, { width: `${Math.round(taskProgress * 100)}%` }]} />
              </View>
              <View style={styles.gradStatusRow}>
                <View style={styles.gradStatusItem}>
                  <Text style={styles.gradStatusVal}>{completedTasks}</Text>
                  <Text style={styles.gradStatusLabel}>Done</Text>
                </View>
                <View style={styles.gradStatusDivider} />
                <View style={styles.gradStatusItem}>
                  <Text style={styles.gradStatusVal}>{tasks.length - completedTasks}</Text>
                  <Text style={styles.gradStatusLabel}>Pending</Text>
                </View>
                {isClocked && (
                  <>
                    <View style={styles.gradStatusDivider} />
                    <View style={styles.gradStatusItem}>
                      <Text style={styles.gradStatusVal}>${liveEarned}</Text>
                      <Text style={styles.gradStatusLabel}>Earned</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* Break buttons (when clocked in) */}
            {isClocked && (
              <View style={styles.breakRow}>
                <Pressable
                  onPress={() => handleBreakToggle('paid')}
                  style={[styles.breakBtn, breakActiveType === 'paid' && styles.breakBtnActive]}
                >
                  <Feather name="coffee" size={13} color={breakActiveType === 'paid' ? '#D97706' : 'rgba(255,255,255,0.9)'} />
                  <Text style={[styles.breakBtnText, breakActiveType === 'paid' && { color: '#D97706' }]}>
                    {breakActiveType === 'paid' ? 'End break' : 'Paid break'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleBreakToggle('unpaid')}
                  disabled={breakActiveType === 'paid'}
                  style={[styles.breakBtn, breakActiveType === 'unpaid' && styles.breakBtnUnpaid, breakActiveType === 'paid' && { opacity: 0.4 }]}
                >
                  <Feather name="pause" size={13} color={breakActiveType === 'unpaid' ? '#EF4444' : 'rgba(255,255,255,0.9)'} />
                  <Text style={[styles.breakBtnText, breakActiveType === 'unpaid' && { color: '#EF4444' }]}>
                    {breakActiveType === 'unpaid' ? 'End break' : 'Unpaid break'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Clock In / Clock Out button */}
            {!isClocked ? (
              <Pressable onPress={handleClockIn} style={styles.clockInBtn}>
                <Feather name="log-in" size={18} color={BLUE} />
                <Text style={[styles.clockBtnText, { color: BLUE }]}>Clock In</Text>
              </Pressable>
            ) : (
              <Pressable onPress={handleClockOut} style={styles.clockOutBtn}>
                <Feather name="log-out" size={18} color="rgba(255,255,255,0.95)" />
                <Text style={[styles.clockBtnText, { color: 'rgba(255,255,255,0.95)' }]}>Clock Out</Text>
              </Pressable>
            )}

            {/* Location note */}
            <View style={styles.locationRow}>
              <Feather name="map-pin" size={11} color="rgba(255,255,255,0.55)" />
              <Text style={styles.locationText}>
                {storeAssignments.length > 0
                  ? `Geofence · ${storeAssignments.length} store${storeAssignments.length > 1 ? 's' : ''} assigned`
                  : 'Must be within range of your assigned store'}
              </Text>
            </View>
          </LinearGradient>

          {/* ── Stats mini cards ── */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>TODAY (PAID)</Text>
              <Text style={styles.statDuration}>{formatDuration(todayMins)}</Text>
              <Text style={styles.statEarnings}>${todayEarnings}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>THIS WEEK</Text>
              <Text style={styles.statDuration}>{formatDuration(weekMins)}</Text>
              <Text style={styles.statEarnings}>${weekEarnings}</Text>
            </View>
          </View>

          {/* ── Quick actions ── */}
          <View>
            <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
            <View style={styles.actionsGrid}>
              {([
                [
                  { icon: 'clipboard',      label: 'Tasks',         bg: '#E0F5FE', onPress: () => router.navigate({ pathname: '/(director)/tasks', params: { initialTab: 'tasks' } } as any) },
                  { icon: 'alert-triangle', label: 'Log Wastage',   bg: '#FEF3C7', onPress: () => router.navigate({ pathname: '/(director)/tasks', params: { initialTab: 'wastage' } } as any) },
                ],
                [
                  { icon: 'tool',           label: 'Report Issue',  bg: '#FEE2E2', onPress: () => router.navigate({ pathname: '/(director)/tasks', params: { initialTab: 'issues' } } as any) },
                  { icon: 'calendar',       label: 'Leave Request', bg: '#F3E8FF', onPress: () => router.navigate({ pathname: '/(director)/tasks', params: { initialTab: 'leave' } } as any) },
                ],
              ] as const).map((row, ri) => (
                <View key={ri} style={styles.actionsRow}>
                  {row.map((action) => (
                    <Pressable key={action.label} onPress={() => { Haptics.selectionAsync(); action.onPress(); }}
                      style={styles.actionCard}>
                      <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
                        <Feather name={action.icon as any} size={20} color={BLUE} />
                      </View>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </View>

          {/* ── Today's Schedule (if canViewOrders) ── */}
          {canViewOrders && (
            <View>
              <Text style={styles.sectionTitle}>TODAY'S SCHEDULE</Text>
              {scheduleGroups.length === 0 ? (
                <View style={styles.emptySchedule}>
                  <View style={styles.emptyScheduleIcon}>
                    <Feather name="calendar" size={20} color={MUTED} />
                  </View>
                  <Text style={styles.emptyScheduleText}>No scheduled pickups today</Text>
                </View>
              ) : scheduleGroups.map((group) => (
                <View key={group.time} style={{ gap: 8, marginBottom: 8 }}>
                  <View style={styles.timeRow}>
                    <Feather name="clock" size={12} color={BLUE} />
                    <Text style={styles.timeLabel}>{group.time}</Text>
                  </View>
                  {group.orders.map((order: any) => {
                    const items = Array.isArray(order.items) ? order.items : [];
                    const statusColors: Record<string, string> = {
                      received: '#3B82F6', being_prepared: '#F59E0B', ready_for_pickup: '#22C55E',
                      completed: '#6B7280', cancelled: '#EF4444',
                    };
                    const sc = statusColors[order.status] ?? '#3B82F6';
                    return (
                      <Pressable key={order.id} onPress={() => router.push('/(director)/orders' as any)}
                        style={[styles.scheduleCard, { borderLeftColor: sc }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Text style={styles.scheduleOrderId}>#{order.id.slice(0, 6).toUpperCase()}</Text>
                            <View style={[styles.scheduleStatusPill, { backgroundColor: `${sc}18` }]}>
                              <Text style={[styles.scheduleStatusText, { color: sc }]}>{order.status.replace(/_/g, ' ')}</Text>
                            </View>
                          </View>
                          <Text style={styles.scheduleItemList} numberOfLines={1}>
                            {items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.productName}`).join(', ')}
                            {items.length > 3 ? ` +${items.length - 3} more` : ''}
                          </Text>
                        </View>
                        <Text style={styles.schedulePrice}>${(order.totalCents / 100).toFixed(2)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {/* ── Pending tasks ── */}
          {urgentTasks.length > 0 && (
            <View onLayout={(e) => { pendingTasksY.current = e.nativeEvent.layout.y; }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={styles.sectionTitle}>PENDING TASKS</Text>
                <Pressable onPress={() => { Haptics.selectionAsync(); router.navigate({ pathname: '/(director)/staffhub', params: { tab: 'tasks' } } as any); }} hitSlop={8}>
                  <Text style={styles.viewAllLink}>View all</Text>
                </Pressable>
              </View>
              <View style={styles.taskGroupContainer}>
                {urgentTasks.map((task) => {
                  const status = getTaskStatus(task);
                  const catColor = getCategoryColor(task.category);
                  return (
                    <Pressable
                      key={task.id}
                      onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                      style={({ pressed }) => [styles.taskCard, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <View style={styles.taskCardHeader}>
                        <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                        <View style={[styles.taskStatusPill, { backgroundColor: status.bg }]}>
                          <Text style={[styles.taskStatusText, { color: status.text }]}>{status.label}</Text>
                        </View>
                      </View>
                      <View style={styles.taskCardFooter}>
                        <View style={styles.taskCategoryRow}>
                          <View style={[styles.taskCategoryDot, { backgroundColor: catColor }]} />
                          <Text style={styles.taskCategory}>{task.category}</Text>
                        </View>
                        <Feather
                          name={task.isCompleted ? 'check-circle' : 'circle'}
                          size={20}
                          color={task.isCompleted ? GREEN : BORDER}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Greeting
  greetingRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4 },
  greetingTitle:   { fontSize: 22, fontWeight: '700', color: TEXT, lineHeight: 28, marginBottom: 3 },
  greetingSubtitle:{ fontSize: 14, fontWeight: '500', color: '#4B5563', lineHeight: 20 },
  greetingDate:    { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  menuBtn:         { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, marginLeft: 12, marginTop: 2 },

  // Gradient clock card
  gradCard:        { borderRadius: 24, padding: 20, gap: 16 },
  gradCardHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  gradCardName:    { color: '#fff', fontWeight: '700', fontSize: 18, lineHeight: 22, marginBottom: 4 },
  gradCardSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '400', lineHeight: 18 },
  liveBadge:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(22,197,94,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  liveDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  liveText:        { color: '#4ADE80', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  gradElapsed:     { color: '#fff', fontSize: 42, fontWeight: '700', lineHeight: 48, marginVertical: -4 },
  gradProgressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  gradProgressFill:  { height: '100%', borderRadius: 999, backgroundColor: '#fff' },
  gradStatusRow:   { flexDirection: 'row', alignItems: 'center' },
  gradStatusItem:  { flex: 1, alignItems: 'center' },
  gradStatusVal:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  gradStatusLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  gradStatusDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Break buttons
  breakRow:        { flexDirection: 'row', gap: 10 },
  breakBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.12)' },
  breakBtnText:    { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },
  breakBtnActive:  { backgroundColor: '#FFF8E7', borderColor: '#D97706' },
  breakBtnUnpaid:  { backgroundColor: '#FFF1F0', borderColor: '#F87171' },

  // Clock buttons
  clockInBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 15, marginTop: 2 },
  clockOutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingVertical: 15, marginTop: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  clockBtnText:    { fontSize: 16, fontWeight: '700' },
  locationRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText:    { fontSize: 11, fontWeight: '400', color: 'rgba(255,255,255,0.55)' },

  // Stats
  statsRow:        { flexDirection: 'row', gap: 12 },
  statCard:        { flex: 1, borderRadius: 20, padding: 16, gap: 2, backgroundColor: 'rgba(255,255,255,0.6)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  statLabel:       { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: MUTED, marginBottom: 4 },
  statDuration:    { fontSize: 24, fontWeight: '700', color: TEXT },
  statEarnings:    { fontSize: 13, fontWeight: '400', color: MUTED, marginTop: 1 },

  // Section
  sectionTitle:    { fontSize: 11, letterSpacing: 1.5, color: MUTED, fontWeight: '600', marginBottom: 10 },
  viewAllLink:     { fontSize: 13, fontWeight: '600', color: BLUE },

  // Quick actions
  actionsGrid:     { gap: 12 },
  actionsRow:      { flexDirection: 'row', gap: 12 },
  actionCard:      { flex: 1, backgroundColor: 'rgba(255,255,255,0.6)', padding: 16, gap: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  actionIcon:      { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  actionLabel:     { fontSize: 13, fontWeight: '500', color: TEXT },

  // Schedule
  emptySchedule:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  emptyScheduleIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  emptyScheduleText: { fontSize: 14, fontWeight: '400', color: MUTED },
  timeRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  timeLabel:       { fontSize: 13, fontWeight: '700', color: BLUE },
  scheduleCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', borderLeftWidth: 3 },
  scheduleOrderId: { fontSize: 13, fontWeight: '700', color: TEXT },
  scheduleStatusPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  scheduleStatusText: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  scheduleItemList:{ fontSize: 12, fontWeight: '400', color: MUTED },
  schedulePrice:   { fontSize: 13, fontWeight: '700', color: BLUE },

  // Task cards
  taskGroupContainer: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', padding: 8, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2 },
  taskCard:        { borderRadius: 16, padding: 16, gap: 12 },
  taskCardHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  taskTitle:       { flex: 1, fontSize: 15, fontWeight: '600', color: TEXT, lineHeight: 21 },
  taskStatusPill:  { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  taskStatusText:  { fontSize: 11, fontWeight: '700' },
  taskCardFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  taskCategoryDot: { width: 8, height: 8, borderRadius: 4 },
  taskCategory:    { fontSize: 13, fontWeight: '500', color: MUTED, textTransform: 'capitalize' },
});
