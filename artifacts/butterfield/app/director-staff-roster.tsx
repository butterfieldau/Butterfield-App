import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RosterShift } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { useRefreshControl } from '@/hooks/useRefreshControl';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ROLE_COLORS: Record<string, string> = {
  crew: BLUE, supervisor: AMBER, manager: NAVY, trainer: PURPLE,
};

function toMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDateLong(ymd: string) {
  const d = new Date(ymd + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(ymd: string) {
  const d = new Date(ymd + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

function fmtTime12(hhmm: string) {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr ?? '0', 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m}${ampm}`;
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60;
}

function ShiftCard({ shift, onConfirm, confirming }: { shift: RosterShift; onConfirm?: () => void; confirming?: boolean }) {
  const roleColor = ROLE_COLORS[shift.role] ?? MUTED;
  const hrs = calcHours(shift.startTime, shift.endTime);
  const today = toYMD(new Date());
  const isToday = shift.date === today;
  const isPast  = shift.date < today;
  const canConfirm = !isPast && !shift.isConfirmed;

  return (
    <View style={[sc.card, isPast && { opacity: 0.6 }]}>
      <View style={[sc.roleBar, { backgroundColor: roleColor }]} />
      <View style={{ flex: 1, paddingLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={[sc.dateText, isToday && { color: BLUE, fontWeight: '700' }]}>
            {isToday ? 'Today' : fmtDateLong(shift.date)}
          </Text>
          {isToday && (
            <View style={sc.todayBadge}><Text style={sc.todayBadgeText}>TODAY</Text></View>
          )}
        </View>
        <Text style={sc.timeText}>
          {fmtTime12(shift.startTime)} – {fmtTime12(shift.endTime)}
          <Text style={sc.hrsText}> · {hrs.toFixed(1)}h</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={[sc.roleChip, { backgroundColor: roleColor + '20' }]}>
            <Text style={[sc.roleChipText, { color: roleColor }]}>{shift.role}</Text>
          </View>
          {shift.isConfirmed && (
            <View style={sc.confirmedChip}>
              <Feather name="check-circle" size={11} color={GREEN} />
              <Text style={sc.confirmedText}>Confirmed</Text>
            </View>
          )}
          {!shift.isConfirmed && !isPast && (
            <Text style={sc.pendingText}>Pending confirmation</Text>
          )}
        </View>
        {shift.notes ? (
          <Text style={sc.notesText} numberOfLines={2}>{shift.notes}</Text>
        ) : null}
        {canConfirm && onConfirm && (
          <Pressable
            style={[sc.confirmBtn, confirming && { opacity: 0.6 }]}
            onPress={onConfirm}
            disabled={confirming}
          >
            {confirming
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="check" size={13} color="#fff" />}
            <Text style={sc.confirmBtnText}>{confirming ? 'Confirming…' : 'Confirm shift'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function DirectorStaffRosterScreen() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => toYMD(toMonday(new Date())));
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['staff-roster-mine', weekStart],
    queryFn: () => api.staff.rosterMine({ weekStart }),
    staleTime: 30_000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const confirmMut = useMutation({
    mutationFn: (id: string) => api.staff.rosterConfirm(id),
    onMutate: (id) => setConfirmingId(id),
    onSettled: () => setConfirmingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-roster-mine'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Could not confirm shift'),
  });

  const shifts = data?.data ?? [];

  const prevWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), -7)));
  const nextWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), 7)));

  const weekLabel = (() => {
    const end = addDays(new Date(weekStart + 'T12:00:00'), 6);
    const s = new Date(weekStart + 'T12:00:00');
    return `${s.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  const totalHours = shifts.reduce((acc, s) => acc + calcHours(s.startTime, s.endTime), 0);

  const today = toYMD(new Date());
  const upcomingShifts = shifts.filter(s => s.date >= today);
  const nextShift = upcomingShifts[0];

  return (
    <DirectorStandaloneScreen title="My Roster" subtitle={`${shifts.length} shift${shifts.length !== 1 ? 's' : ''} this week`}>

      {/* Next shift banner */}
      {nextShift && (
        <View style={s.nextShiftBanner}>
          <View style={[s.nextShiftIcon, { backgroundColor: (ROLE_COLORS[nextShift.role] ?? BLUE) + '20' }]}>
            <Feather name="calendar" size={18} color={ROLE_COLORS[nextShift.role] ?? BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nextShiftLabel}>NEXT SHIFT</Text>
            <Text style={s.nextShiftDate}>
              {nextShift.date === today ? 'Today' : fmtDateLong(nextShift.date)}
            </Text>
            <Text style={s.nextShiftTime}>
              {fmtTime12(nextShift.startTime)} – {fmtTime12(nextShift.endTime)}
              {' '}({calcHours(nextShift.startTime, nextShift.endTime).toFixed(1)}h)
            </Text>
          </View>
          {nextShift.isConfirmed
            ? <Feather name="check-circle" size={20} color={GREEN} />
            : <Feather name="clock" size={20} color={AMBER} />}
        </View>
      )}

      {/* Week nav */}
      <View style={s.weekNav}>
        <Pressable style={s.navBtn} onPress={prevWeek}><Feather name="chevron-left" size={20} color={NAVY} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.weekLabel}>{weekLabel}</Text>
          <Text style={s.weekSub}>
            {shifts.length} shift{shifts.length !== 1 ? 's' : ''} · {totalHours.toFixed(1)}h
          </Text>
        </View>
        <Pressable style={s.navBtn} onPress={nextWeek}><Feather name="chevron-right" size={20} color={NAVY} /></Pressable>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={NAVY} size="large" />
        </View>
      ) : shifts.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}><Feather name="calendar" size={32} color={MUTED} /></View>
          <Text style={s.emptyTitle}>No shifts this week</Text>
          <Text style={s.emptySubtitle}>Your roster for this week hasn't been published yet.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
        >
          {/* Summary card */}
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{shifts.length}</Text>
              <Text style={s.summaryLabel}>Shifts</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{totalHours.toFixed(1)}h</Text>
              <Text style={s.summaryLabel}>Total Hours</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{upcomingShifts.length}</Text>
              <Text style={s.summaryLabel}>Upcoming</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, { color: GREEN }]}>{shifts.filter(s => s.isConfirmed).length}</Text>
              <Text style={s.summaryLabel}>Confirmed</Text>
            </View>
          </View>

          {shifts.map(shift => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              onConfirm={() => confirmMut.mutate(shift.id)}
              confirming={confirmingId === shift.id}
            />
          ))}
        </ScrollView>
      )}
    </DirectorStandaloneScreen>
  );
}

const sc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 14, overflow: 'hidden',
  },
  roleBar:    { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  dateText:   { fontSize: 14, fontWeight: '600', color: TEXT },
  timeText:   { fontSize: 13, color: MUTED, marginTop: 3 },
  hrsText:    { fontSize: 12, color: MUTED },
  roleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleChipText: { fontSize: 11, fontWeight: '600' },
  confirmedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  confirmedText: { fontSize: 11, fontWeight: '600', color: GREEN },
  pendingText: { fontSize: 11, color: AMBER },
  notesText: { fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 4 },
  todayBadge: { backgroundColor: BLUE, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  todayBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, backgroundColor: GREEN, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

const s = StyleSheet.create({
  nextShiftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, marginBottom: 0,
    backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER,
  },
  nextShiftIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nextShiftLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  nextShiftDate:  { fontSize: 15, fontWeight: '700', color: NAVY, marginTop: 2 },
  nextShiftTime:  { fontSize: 13, color: MUTED, marginTop: 1 },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 12,
  },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontSize: 15, fontWeight: '700', color: NAVY },
  weekSub:   { fontSize: 12, color: MUTED, marginTop: 1 },
  summaryCard: {
    flexDirection: 'row', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 16,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue:{ fontSize: 20, fontWeight: '700', color: NAVY },
  summaryLabel:{ fontSize: 11, color: MUTED, marginTop: 2 },
  divider: { width: 1, backgroundColor: BORDER, marginVertical: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: NAVY, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: MUTED, textAlign: 'center' },
});
