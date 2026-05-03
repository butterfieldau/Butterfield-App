import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BLUE  = '#40C0F2';
const RED   = '#F40009';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const CARD  = '#FFFFFF';
const GREEN = '#16A34A';

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

function calcLiveElapsed(clockInIso: string, unpaidBreakMs: number): { mins: number; earned: string } {
  const ms = Math.max(0, Date.now() - new Date(clockInIso).getTime() - unpaidBreakMs);
  const mins = Math.floor(ms / 60000);
  return { mins, earned: '' };
}

function getRoleColor(position: string, isManager: boolean): string {
  if (isManager || position === 'director' || position === 'manager') return RED;
  return BLUE;
}

function capitalize(s: string): string {
  if (!s) return 'Staff';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function StaffClockScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const [tick, setTick] = useState(0);
  const [breakActiveType, setBreakActiveType] = useState<'paid' | 'unpaid' | null>(null);
  const [breakStartMs, setBreakStartMs] = useState<number>(0);
  const [accUnpaidBreakMs, setAccUnpaidBreakMs] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: shiftData, refetch: refetchShift } = useQuery({
    queryKey: ['staff-shift-current'],
    queryFn: () => api.staff.currentShift(),
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['staff-shift-stats'],
    queryFn: () => api.staff.shiftStats(),
    refetchInterval: 60000,
    retry: 1,
  });

  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: () => api.staff.profile(),
    retry: 1,
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.staff.clockIn();
      setAccUnpaidBreakMs(0);
      setBreakActiveType(null);
      setBreakStartMs(0);
      await refetchShift();
      await refetchStats();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Clock In Failed', e.message);
    }
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'End your shift now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock Out', style: 'destructive', onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          try {
            const unpaidMins = Math.floor(currentUnpaidMs / 60000);
            await api.staff.clockOut(unpaidMins);
            setAccUnpaidBreakMs(0);
            setBreakActiveType(null);
            setBreakStartMs(0);
            await refetchShift();
            await refetchStats();
          } catch (e: any) {
            Alert.alert('Clock Out Failed', e.message);
          }
        },
      },
    ]);
  };

  const handleBreakToggle = (type: 'paid' | 'unpaid') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (breakActiveType !== null) {
      const elapsed = Date.now() - breakStartMs;
      if (breakActiveType === 'unpaid') {
        setAccUnpaidBreakMs(prev => prev + elapsed);
      }
      setBreakActiveType(null);
      setBreakStartMs(0);
    } else {
      setBreakActiveType(type);
      setBreakStartMs(Date.now());
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await logout();
          qc.clear();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const todayMins = stats?.todayMins ?? 0;
  const todayEarnings = stats ? ((stats.todayEarningsCents ?? 0) / 100).toFixed(2) : '0.00';
  const weekMins = stats?.weekMins ?? 0;
  const weekEarnings = stats ? ((stats.weekEarningsCents ?? 0) / 100).toFixed(2) : '0.00';

  const positionLabel = profile?.position ? capitalize(profile.position) : capitalize(user?.role ?? 'Staff');
  const isManager = profile?.isManager ?? false;
  const roleColor = getRoleColor(profile?.position ?? '', isManager);

  return (
    <LinearGradient
      colors={['#FAFBFF', '#EDF6FF', '#E4F2FF']}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={15} color={TEXT} />
            <Text style={styles.backText}>Home</Text>
          </Pressable>
          <Text style={styles.brandName}>Butterfield</Text>
          <View style={{ width: 72 }} />
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 20 }}>
          {/* Welcome */}
          <View style={{ gap: 2 }}>
            <Text style={styles.welcomeLabel}>WELCOME BACK</Text>
            <Text style={styles.userName}>{user?.name ?? 'Staff'}</Text>
            <View style={styles.roleRow}>
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={styles.roleBadgeText}>{positionLabel}</Text>
              </View>
              <Text style={styles.hourlyRate}>${(hourlyRateCents / 100).toFixed(2)}/hr</Text>
            </View>
          </View>

          {/* Shift Card */}
          <View style={styles.shiftCard}>
            <View style={styles.shiftCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="clock" size={13} color={MUTED} />
                <Text style={styles.shiftCardLabel}>CURRENT SHIFT</Text>
              </View>
              {isClocked && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            {!isClocked ? (
              <>
                <Text style={styles.bigStatus}>Off duty</Text>
                <Text style={styles.shiftSub}>
                  Tap below to start your shift. We'll record your location.
                </Text>
                <Pressable onPress={handleClockIn} style={[styles.mainBtn, { backgroundColor: BLUE }]}>
                  <Text style={styles.mainBtnText}>Clock in</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.bigElapsed} key={tick}>
                  {formatDuration(liveElapsedMins)}
                </Text>
                <Text style={styles.shiftSub}>
                  Started {shift ? formatTime12(shift.clockIn) : '—'} · Earned ${liveEarned}
                </Text>

                <View style={styles.breakRow}>
                  <Pressable
                    onPress={() => handleBreakToggle('paid')}
                    style={[
                      styles.breakBtn,
                      breakActiveType === 'paid' && { backgroundColor: '#FFF8E7', borderColor: '#D97706' },
                    ]}
                  >
                    <Feather name="coffee" size={13} color={breakActiveType === 'paid' ? '#D97706' : TEXT} />
                    <Text style={[styles.breakBtnText, breakActiveType === 'paid' && { color: '#D97706' }]}>
                      {breakActiveType === 'paid' ? 'End break' : 'Paid break'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleBreakToggle('unpaid')}
                    disabled={breakActiveType === 'paid'}
                    style={[
                      styles.breakBtn,
                      breakActiveType === 'unpaid' && { backgroundColor: '#FFF1F0', borderColor: '#F87171' },
                      breakActiveType === 'paid' && { opacity: 0.4 },
                    ]}
                  >
                    <Feather name="pause" size={13} color={breakActiveType === 'unpaid' ? '#EF4444' : TEXT} />
                    <Text style={[styles.breakBtnText, breakActiveType === 'unpaid' && { color: '#EF4444' }]}>
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
              <Text style={styles.locationText}>Must be within 150m of the store</Text>
            </View>
          </View>

          {/* Stats */}
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

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => router.push('/(staff)/tasks' as any)}
              style={styles.actionBtn}
            >
              <Text style={styles.actionBtnText}>My weekly timesheet</Text>
            </Pressable>
            {isManager && (
              <Pressable
                onPress={() => Alert.alert('Manage Staff', 'Set hourly rates and manage your team from the admin portal.')}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Manage staff</Text>
              </Pressable>
            )}
          </View>

          {/* Sign Out */}
          <Pressable onPress={handleLogout} style={styles.signOutRow}>
            <Feather name="log-out" size={15} color={TEXT} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 72,
  },
  backText: {
    fontSize: 14,
    color: TEXT,
    fontFamily: 'Inter_500Medium',
  },
  brandName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    fontStyle: 'italic',
    color: BLUE,
    letterSpacing: 0.5,
  },
  welcomeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: BLUE,
    letterSpacing: 1.2,
  },
  userName: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: TEXT,
    marginTop: 2,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  hourlyRate: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: TEXT,
  },
  shiftCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  shiftCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shiftCardLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: MUTED,
    letterSpacing: 0.8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  liveText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: GREEN,
    letterSpacing: 0.5,
  },
  bigStatus: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    color: TEXT,
    marginTop: 4,
  },
  bigElapsed: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    color: TEXT,
    marginTop: 4,
  },
  shiftSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: MUTED,
    lineHeight: 19,
  },
  mainBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  mainBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  breakRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  breakBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  breakBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: TEXT,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  locationText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: MUTED,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: MUTED,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  statDuration: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: TEXT,
  },
  statEarnings: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: MUTED,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: TEXT,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  signOutText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: TEXT,
  },
});
