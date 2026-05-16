import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function StaffDashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Schedule the daily clock-in reminder once on mount
  useEffect(() => {
    scheduleClockInReminder();
  }, []);

  const [tick, setTick] = useState(0);
  const [breakActiveType, setBreakActiveType] = useState<'paid' | 'unpaid' | null>(null);
  const [breakStartMs, setBreakStartMs] = useState<number>(0);
  const [accUnpaidBreakMs, setAccUnpaidBreakMs] = useState<number>(0);
  const intervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef         = useRef<ScrollView>(null);
  const pendingTasksY     = useRef<number>(0);

  const scrollToPendingTasks = useCallback(() => {
    Haptics.selectionAsync();
    scrollRef.current?.scrollTo({ y: pendingTasksY.current, animated: true });
  }, []);
  const [storePickerVisible, setStorePickerVisible] = useState(false);
  const [pendingCoords, setPendingCoords]           = useState<{ latitude: number; longitude: number } | undefined>();

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

    // Request location first
    let coords: { latitude: number; longitude: number } | undefined;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch { /* use undefined — server will decide */ }
    } else {
      if (storeAssignments.length > 0) {
        Alert.alert(
          'Location Required',
          'Staff clock-in is tied to your assigned store, so location access is required here. Please enable Location Services and try again.',
          [{ text: 'OK' }],
        );
        return;
      }
      Alert.alert(
        'Location Required',
        'Location access helps verify you\'re at the right store. You can continue for now because no store has been assigned to this account yet.',
        [
          { text: 'Continue Anyway', onPress: async () => {
            await doClockIn(undefined);
          }},
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if (!coords && storeAssignments.length > 0) {
      Alert.alert(
        'Location Needed',
        'We could not get a valid location, and this account is tied to an assigned store. Please try again with Location Services enabled.',
        [{ text: 'OK' }],
      );
      return;
    }

    // If staff assigned to multiple stores, let them pick
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
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            outCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          } catch { /* ignore — not blocking */ }
          const res = await api.staff.clockOut(unpaidMins, outCoords);
          setAccUnpaidBreakMs(0); setBreakActiveType(null); setBreakStartMs(0);
          qc.invalidateQueries({ queryKey: ['current-shift'] });
          refetchStats();
          // Notifications: cancel clock-out reminder, reschedule daily clock-in, confirm
          cancelClockOutReminder();
          scheduleClockInReminder();
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

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

    {/* ── Store picker modal (shown when staff assigned to multiple stores) ── */}
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
              onPress={async () => {
                setStorePickerVisible(false);
                await doClockIn(pendingCoords, a.storeId);
              }}
              style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
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
                {activeStoreName ? `\n📍 ${activeStoreName}` : ''}
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
            <Text style={[styles.locationText, { color: MUTED }]}>
              {storeAssignments.length > 0
                ? `Geofence clock-in · ${storeAssignments.length} store${storeAssignments.length > 1 ? 's' : ''} assigned`
                : 'Must be within range of your assigned store'}
            </Text>
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

        {/* Task progress — tapping scrolls to pending tasks list */}
        <Pressable
          onPress={urgentTasks.length > 0 ? scrollToPendingTasks : undefined}
          style={({ pressed }) => [styles.taskProgress, { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, opacity: pressed ? 0.75 : 1 }]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[{ color: TEXT, fontWeight: '600', fontSize: 15 }]}>Today's Tasks</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 14 }]}>{completedTasks}/{tasks.length}</Text>
              {urgentTasks.length > 0 && <Feather name="chevron-down" size={14} color={BLUE} />}
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: '#F0F0F0' }]}>
            <View style={[styles.progressFill, { width: tasks.length ? `${Math.round(completedTasks / tasks.length * 100)}%` : '0%', backgroundColor: BLUE }]} />
          </View>
        </Pressable>

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, { color: MUTED, fontWeight: '600' }]}>QUICK ACTIONS</Text>
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
              <Text style={[styles.actionLabel, { color: TEXT, fontWeight: '500' }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Today's schedule — only visible to staff with orders permission */}
        {canViewOrders && (
          <>
            <Text style={[styles.sectionTitle, { color: MUTED, fontWeight: '600' }]}>TODAY'S SCHEDULE</Text>
            {scheduleGroups.length === 0 ? (
              <View style={[styles.emptySchedule, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
                <Feather name="calendar" size={22} color={BORDER} />
                <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 13 }]}>No scheduled pickups today</Text>
              </View>
            ) : scheduleGroups.map((group) => (
              <View key={group.time} style={{ gap: 8 }}>
                <View style={styles.timeRow}>
                  <Feather name="clock" size={12} color={BLUE} />
                  <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 13 }]}>{group.time}</Text>
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
                          <Text style={[{ color: TEXT, fontWeight: '700', fontSize: 13 }]}>#{order.id.slice(0, 6).toUpperCase()}</Text>
                          <View style={[{ backgroundColor: `${sc}18`, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }]}>
                            <Text style={[{ color: sc, fontWeight: '600', fontSize: 10, textTransform: 'capitalize' }]}>{order.status.replace(/_/g, ' ')}</Text>
                          </View>
                        </View>
                        <Text style={[{ color: MUTED, fontWeight: '400', fontSize: 12 }]} numberOfLines={1}>
                          {items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.productName}`).join(', ')}
                          {items.length > 3 ? ` +${items.length - 3} more` : ''}
                        </Text>
                      </View>
                      <Text style={[{ color: BLUE, fontWeight: '700', fontSize: 13 }]}>${(order.totalCents / 100).toFixed(2)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        )}

        {/* Pending tasks — grouped in a single card for compact, clean UX */}
        {urgentTasks.length > 0 && (
          <View
            onLayout={(e) => { pendingTasksY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.sectionTitle, { color: MUTED, fontWeight: '600', marginBottom: 8 }]}>PENDING TASKS</Text>
            <View style={[styles.taskListCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              {urgentTasks.map((task, idx) => (
                <Pressable
                  key={task.id}
                  onPress={() => handleCompleteTask(task.id, task.isCompleted)}
                  style={({ pressed }) => [
                    styles.taskRow,
                    idx < urgentTasks.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <View style={[styles.taskCheck, {
                    borderColor: task.isCompleted ? '#22C55E' : BLUE,
                    backgroundColor: task.isCompleted ? '#22C55E' : 'transparent',
                    borderWidth: 1.5,
                    borderRadius: 6,
                  }]}>
                    {task.isCompleted && <Feather name="check" size={11} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: task.isCompleted ? MUTED : TEXT,
                      fontWeight: '500',
                      fontSize: 14,
                      textDecorationLine: task.isCompleted ? 'line-through' : 'none',
                    }}>
                      {task.title}
                    </Text>
                    <Text style={{ color: BLUE, fontWeight: '500', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
                      {task.category}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
    </View>
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
  shiftCardLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  liveText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  bigStatus: { fontSize: 38, fontWeight: '700', marginTop: 2 },
  bigElapsed: { fontSize: 38, fontWeight: '700', marginTop: 2 },
  shiftSub: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  mainBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 2 },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  breakRow: { flexDirection: 'row', gap: 10 },
  breakBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 30, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  breakBtnText: { fontSize: 13, fontWeight: '500' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  locationText: { fontSize: 11, fontWeight: '400' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, gap: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, borderWidth: 1, borderColor: BORDER },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 2 },
  statDuration: { fontSize: 22, fontWeight: '700' },
  statEarnings: { fontSize: 13, fontWeight: '400', marginTop: 1 },
  taskProgress: { padding: 16, gap: 10 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.5, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', padding: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  actionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13 },
  taskListCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  taskCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  emptySchedule: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
});
