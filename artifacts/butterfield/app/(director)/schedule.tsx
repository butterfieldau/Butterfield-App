import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, type RosterShift } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';

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

const ROLE_COLORS: Record<string, string> = {
  crew: BLUE, supervisor: AMBER, manager: NAVY, trainer: PURPLE,
};

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDateLong(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00');
  return `${DAY_FULL[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

function fmtTime12(hhmm: string): string {
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
  return Math.max(0, ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60);
}

function ShiftCard({ shift, today }: { shift: RosterShift; today: string }) {
  const roleColor = ROLE_COLORS[shift.role] ?? MUTED;
  const hrs       = calcHours(shift.startTime, shift.endTime);
  const isToday   = shift.date === today;
  const isPast    = shift.date < today;

  return (
    <View style={[sc.card, isPast && { opacity: 0.55 }]}>
      <View style={[sc.roleBar, { backgroundColor: roleColor }]} />
      <View style={{ flex: 1, paddingLeft: 12 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={[sc.dateText, isToday && { color: BLUE, fontWeight: '700' }]}>
            {isToday ? 'Today' : fmtDateLong(shift.date)}
          </Text>
          {isToday && (
            <View style={sc.todayBadge}>
              <Text style={sc.todayBadgeText}>TODAY</Text>
            </View>
          )}
        </View>

        <Text style={sc.timeText}>
          {fmtTime12(shift.startTime)} – {fmtTime12(shift.endTime)}
          <Text style={sc.hrsText}> · {hrs.toFixed(1)}h</Text>
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <View style={[sc.roleChip, { backgroundColor: roleColor + '20' }]}>
            <Text style={[sc.roleChipText, { color: roleColor }]}>{shift.role}</Text>
          </View>
          {shift.isConfirmed ? (
            <View style={sc.confirmedChip}>
              <Feather name="check-circle" size={11} color={GREEN} />
              <Text style={sc.confirmedText}>Confirmed</Text>
            </View>
          ) : !isPast ? (
            <Text style={sc.pendingText}>Pending confirmation</Text>
          ) : null}
        </View>

        {shift.notes ? (
          <Text style={sc.notesText} numberOfLines={2}>{shift.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const today    = useMemo(() => localYMD(new Date()), []);
  const fortnight = useMemo(() => localYMD(addDays(new Date(), 13)), []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['staff-roster-mine-14d', today],
    queryFn: () => api.staff.rosterMine({ from: today, to: fortnight }),
    staleTime: 60_000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const shifts = data?.data ?? [];

  const totalHours     = useMemo(() => shifts.reduce((acc, s) => acc + calcHours(s.startTime, s.endTime), 0), [shifts]);
  const upcomingShifts = useMemo(() => shifts.filter(s => s.date >= today), [shifts, today]);
  const confirmedCount = useMemo(() => shifts.filter(s => s.isConfirmed).length, [shifts]);
  const nextShift      = upcomingShifts[0] ?? null;

  const windowLabel = useMemo(() => {
    const from = new Date(today + 'T12:00:00');
    const to   = addDays(from, 13);
    return `${from.getDate()} ${MONTH_SHORT[from.getMonth()]} – ${to.getDate()} ${MONTH_SHORT[to.getMonth()]} ${to.getFullYear()}`;
  }, [today]);

  return (
    <DirectorTabScreen title="Schedule" subtitle={windowLabel}>
      {isLoading ? (
        <View style={s.centred}>
          <ActivityIndicator color={NAVY} size="large" />
        </View>
      ) : shifts.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
        >
          <View style={s.emptyIcon}>
            <Feather name="calendar" size={32} color={MUTED} />
          </View>
          <Text style={s.emptyTitle}>No shifts in the next 2 weeks</Text>
          <Text style={s.emptySubtitle}>
            Your roster for this period hasn't been published yet. Check back soon.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
        >
          {/* Next shift banner */}
          {nextShift && (
            <View style={s.nextShiftBanner}>
              <View style={[s.nextShiftIcon, { backgroundColor: (ROLE_COLORS[nextShift.role] ?? BLUE) + '20' }]}>
                <Feather name="clock" size={18} color={ROLE_COLORS[nextShift.role] ?? BLUE} />
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

          {/* Summary card */}
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{shifts.length}</Text>
              <Text style={s.summaryLabel}>Shifts</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{totalHours.toFixed(1)}h</Text>
              <Text style={s.summaryLabel}>Hours</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryValue}>{upcomingShifts.length}</Text>
              <Text style={s.summaryLabel}>Upcoming</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryValue, confirmedCount > 0 && { color: GREEN }]}>
                {confirmedCount}
              </Text>
              <Text style={s.summaryLabel}>Confirmed</Text>
            </View>
          </View>

          {/* Shift list */}
          {shifts.map(shift => (
            <ShiftCard key={shift.id} shift={shift} today={today} />
          ))}
        </ScrollView>
      )}
    </DirectorTabScreen>
  );
}

const sc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 14, overflow: 'hidden',
  },
  roleBar:       { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  dateText:      { fontSize: 15, fontWeight: '600', color: TEXT },
  timeText:      { fontSize: 13, color: MUTED, marginTop: 3 },
  hrsText:       { fontSize: 12, color: MUTED },
  roleChip:      { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  roleChipText:  { fontSize: 11, fontWeight: '600' },
  confirmedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  confirmedText: { fontSize: 11, fontWeight: '600', color: GREEN },
  pendingText:   { fontSize: 11, color: AMBER },
  notesText:     { fontSize: 12, color: MUTED, fontStyle: 'italic', marginTop: 5 },
  todayBadge:    { backgroundColor: BLUE, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  todayBadgeText:{ fontSize: 10, fontWeight: '700', color: '#fff' },
});

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: NAVY },
  headerSub:   { fontSize: 13, color: MUTED, marginTop: 2 },
  calIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: BLUE + '14', alignItems: 'center', justifyContent: 'center',
  },

  nextShiftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  nextShiftIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nextShiftLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  nextShiftDate:  { fontSize: 15, fontWeight: '700', color: NAVY, marginTop: 2 },
  nextShiftTime:  { fontSize: 13, color: MUTED, marginTop: 1 },

  summaryCard: {
    flexDirection: 'row', backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 16,
  },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700', color: NAVY },
  summaryLabel: { fontSize: 11, color: MUTED, marginTop: 2 },
  divider:      { width: 1, backgroundColor: BORDER, marginVertical: 4 },

  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E0EDFF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: NAVY, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
});
