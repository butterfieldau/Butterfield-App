import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api, type StaffShift, type StaffMember } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekStart(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime12(iso: string | Date): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function calcPaidMins(shift: StaffShift): number {
  if (!shift.clockOut) return 0;
  const ms = new Date(shift.clockOut).getTime() - new Date(shift.clockIn).getTime();
  const total = Math.floor(ms / 60000);
  return Math.max(0, total - (shift.unpaidBreakMins ?? 0));
}

function formatDuration(mins: number): string {
  if (mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildTimesheetHtml(
  shifts: StaffShift[],
  fromDate: Date,
  toDate: Date,
  staffName: string,
  hourlyRateCents: number,
  isManager: boolean,
): string {
  const rows = shifts.map(s => {
    const paidMins = calcPaidMins(s);
    const earned = ((paidMins / 60) * (hourlyRateCents / 100)).toFixed(2);
    const dateStr = new Date(s.clockIn).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    const inStr = formatTime12(s.clockIn);
    const outStr = s.clockOut ? formatTime12(s.clockOut) : '—';
    const name = (s as any).name ?? staffName;
    return `<tr>
      ${isManager ? `<td>${name}</td>` : ''}
      <td>${dateStr}</td>
      <td>${inStr}</td>
      <td>${outStr}</td>
      <td>${s.unpaidBreakMins ? `${s.unpaidBreakMins}m` : '—'}</td>
      <td>${formatDuration(paidMins)}</td>
      <td>$${earned}</td>
    </tr>`;
  }).join('');

  const totalMins = shifts.reduce((s, sh) => s + calcPaidMins(sh), 0);
  const totalEarned = ((totalMins / 60) * (hourlyRateCents / 100)).toFixed(2);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; margin: 40px; color: #1C1C1E; }
    h1 { color: #40C0F2; font-size: 24px; margin-bottom: 4px; }
    .sub { color: #8E8E93; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #40C0F2; color: white; padding: 10px 12px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #E5E7EB; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background: #F9FAFB; }
    .total { background: #1C1C1E; color: white; font-weight: bold; }
    .total td { color: white; }
    .footer { margin-top: 32px; color: #8E8E93; font-size: 12px; }
  </style></head><body>
  <h1>Butterfield Cookies</h1>
  <div class="sub">Timesheet: ${formatDate(fromDate)} – ${formatDate(toDate)}${!isManager ? ` · ${staffName}` : ''}</div>
  <table>
    <thead><tr>
      ${isManager ? '<th>STAFF</th>' : ''}
      <th>DATE</th><th>CLOCK IN</th><th>CLOCK OUT</th>
      <th>UNPAID BREAK</th><th>PAID HOURS</th><th>EARNINGS</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="total">
        ${isManager ? '<td></td>' : ''}
        <td colspan="4">TOTAL</td>
        <td>${formatDuration(totalMins)}</td>
        <td>$${totalEarned}</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} · Butterfield Cookies Pty Ltd</div>
  </body></html>`;
}

export default function TimesheetScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const weekStart = getWeekStart(addWeeks(new Date(), weekOffset));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['timesheet', weekStart.toISOString(), selectedUserId],
    queryFn: () => api.staff.timesheet(weekStart.toISOString(), weekEnd.toISOString(), selectedUserId ?? undefined),
    retry: 1,
  });

  const isManager = data?.isManager ?? false;
  const shifts: StaffShift[] = data?.data ?? [];
  const staffList: StaffMember[] = data?.staff ?? [];
  const profile = data?.profile;

  const displayedShifts = selectedUserId
    ? shifts.filter(s => s.userId === selectedUserId)
    : shifts;

  const selectedStaff = selectedUserId
    ? staffList.find(m => m.userId === selectedUserId)
    : null;

  const hourlyRateCents = selectedStaff?.hourlyRateCents ?? profile?.hourlyRateCents ?? 2200;

  const totalPaidMins = displayedShifts.reduce((s, sh) => s + calcPaidMins(sh), 0);
  const totalEarningsCents = Math.round((totalPaidMins / 60) * hourlyRateCents);
  const completedShifts = displayedShifts.filter(s => s.clockOut).length;
  const activeShift = displayedShifts.find(s => !s.clockOut);

  const handleExport = async () => {
    setExporting(true);
    try {
      const staffName = selectedStaff?.name ?? user?.name ?? 'Staff';
      const html = buildTimesheetHtml(displayedShifts, weekStart, weekEnd, staffName, hourlyRateCents, isManager && !!selectedUserId === false);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 300); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await WebBrowser.openBrowserAsync(uri);
    } catch (e: any) {
      Alert.alert('Export Error', e.message ?? 'Could not generate timesheet.');
    } finally {
      setExporting(false);
    }
  };

  const groupByDay = (s: StaffShift[]) => {
    const groups: Record<string, StaffShift[]> = {};
    s.forEach(sh => {
      const d = new Date(sh.clockIn);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sh);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const grouped = groupByDay(displayedShifts);

  const isCurrentWeek = weekOffset === 0;
  const isFutureWeek = weekOffset > 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: TEXT }]}>Timesheet</Text>
            <Pressable
              onPress={handleExport}
              disabled={exporting || displayedShifts.length === 0}
              style={[styles.exportBtn, { backgroundColor: BLUE, opacity: displayedShifts.length === 0 ? 0.4 : 1 }]}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="download" size={14} color="#fff" />
                  <Text style={styles.exportBtnText}>Export</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Week navigator */}
          <View style={[styles.weekNav, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Pressable onPress={() => setWeekOffset(o => o - 1)} style={styles.weekNavBtn}>
              <Feather name="chevron-left" size={20} color={TEXT} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={[styles.weekLabel, { color: TEXT }]}>
                {isCurrentWeek ? 'This Week' : isFutureWeek ? 'Future' : `${formatDate(weekStart)} – ${formatDate(weekEnd)}`}
              </Text>
              <Text style={[styles.weekSub, { color: MUTED }]}>
                {weekStart.getFullYear()}
              </Text>
            </View>
            <Pressable onPress={() => setWeekOffset(o => Math.min(0, o + 1))} style={[styles.weekNavBtn, { opacity: weekOffset >= 0 ? 0.3 : 1 }]} disabled={weekOffset >= 0}>
              <Feather name="chevron-right" size={20} color={TEXT} />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>

          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>PAID HOURS</Text>
              <Text style={[styles.summaryValue, { color: TEXT }]}>{formatDuration(totalPaidMins)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>EARNINGS</Text>
              <Text style={[styles.summaryValue, { color: BLUE }]}>
                ${(totalEarningsCents / 100).toFixed(2)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>SHIFTS</Text>
              <Text style={[styles.summaryValue, { color: TEXT }]}>{completedShifts}</Text>
            </View>
          </View>

          {/* Manager: staff selector */}
          {isManager && staffList.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: MUTED }]}>STAFF MEMBER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                <Pressable
                  onPress={() => setSelectedUserId(null)}
                  style={[styles.staffPill, !selectedUserId && { backgroundColor: BLUE, borderColor: BLUE }]}
                >
                  <Text style={[styles.staffPillText, { color: !selectedUserId ? '#fff' : TEXT }]}>All Staff</Text>
                </Pressable>
                {staffList.map(m => (
                  <Pressable
                    key={m.userId}
                    onPress={() => setSelectedUserId(m.userId)}
                    style={[styles.staffPill, selectedUserId === m.userId && { backgroundColor: BLUE, borderColor: BLUE }]}
                  >
                    <Text style={[styles.staffPillText, { color: selectedUserId === m.userId ? '#fff' : TEXT }]}>
                      {m.name ?? 'Staff'}
                    </Text>
                    {selectedUserId === m.userId && (
                      <Text style={[styles.staffPillRate, { color: selectedUserId === m.userId ? 'rgba(255,255,255,0.8)' : MUTED }]}>
                        ${(m.hourlyRateCents / 100).toFixed(2)}/hr
                      </Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Hourly rate display */}
          {!isManager && profile && (
            <View style={[styles.rateCard, { backgroundColor: `${BLUE}0F`, borderColor: `${BLUE}30` }]}>
              <Feather name="dollar-sign" size={14} color={BLUE} />
              <Text style={[styles.rateCardText, { color: TEXT }]}>
                Hourly rate: <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold' }}>${(hourlyRateCents / 100).toFixed(2)}/hr</Text>
              </Text>
            </View>
          )}

          {/* Active shift notice */}
          {activeShift && (
            <View style={[styles.activeShiftBanner, { backgroundColor: '#E8FDF0', borderColor: '#86EFAC' }]}>
              <View style={styles.activeDot} />
              <Text style={[styles.activeShiftText, { color: '#15803D' }]}>
                Currently on shift — started {formatTime12(activeShift.clockIn)}
              </Text>
            </View>
          )}

          {/* Shifts list */}
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : grouped.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Feather name="clock" size={32} color={BORDER} />
              <Text style={[styles.emptyTitle, { color: TEXT }]}>No shifts this week</Text>
              <Text style={[styles.emptySub, { color: MUTED }]}>
                {weekOffset === 0 ? 'Clock in from the Dashboard to start tracking.' : 'No shifts were recorded for this period.'}
              </Text>
            </View>
          ) : (
            grouped.map(([key, dayShifts]) => {
              const d = new Date(dayShifts[0].clockIn);
              const dayName = DAY_NAMES[d.getDay()];
              const dateStr = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
              const isToday = new Date().toDateString() === d.toDateString();

              return (
                <View key={key} style={{ gap: 8 }}>
                  {/* Day header */}
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayName, { color: isToday ? BLUE : TEXT }]}>{dayName}</Text>
                    <Text style={[styles.dayDate, { color: isToday ? BLUE : MUTED }]}>{dateStr}</Text>
                    {isToday && <View style={[styles.todayBadge, { backgroundColor: BLUE }]}><Text style={styles.todayBadgeText}>Today</Text></View>}
                  </View>

                  {dayShifts.map(shift => {
                    const paidMins = calcPaidMins(shift);
                    const earned = ((paidMins / 60) * ((shift.hourlyRateCents ?? hourlyRateCents) / 100)).toFixed(2);
                    const isActive = !shift.clockOut;
                    const staffName = (shift as any).name;

                    return (
                      <View key={shift.id} style={[styles.shiftCard, { backgroundColor: CARD, borderColor: isActive ? '#86EFAC' : BORDER, borderLeftColor: isActive ? '#22C55E' : BLUE, borderLeftWidth: 3 }]}>
                        {isManager && staffName && (
                          <View style={styles.shiftStaffRow}>
                            <Feather name="user" size={12} color={MUTED} />
                            <Text style={[styles.shiftStaffName, { color: MUTED }]}>{staffName}</Text>
                            {shift.position && <Text style={[styles.shiftPosition, { color: MUTED }]}>· {capitalize(shift.position)}</Text>}
                          </View>
                        )}

                        <View style={styles.shiftMainRow}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.shiftTimeRow}>
                              <Text style={[styles.shiftTime, { color: TEXT }]}>{formatTime12(shift.clockIn)}</Text>
                              <Text style={[styles.shiftArrow, { color: MUTED }]}>→</Text>
                              <Text style={[styles.shiftTime, { color: isActive ? '#22C55E' : TEXT }]}>
                                {isActive ? 'Active' : shift.clockOut ? formatTime12(shift.clockOut) : '—'}
                              </Text>
                            </View>
                            {(shift.unpaidBreakMins ?? 0) > 0 && (
                              <Text style={[styles.breakNote, { color: MUTED }]}>
                                {shift.unpaidBreakMins}m unpaid break
                              </Text>
                            )}
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={[styles.shiftDuration, { color: TEXT }]}>
                              {isActive ? '—' : formatDuration(paidMins)}
                            </Text>
                            {!isActive && (
                              <Text style={[styles.shiftEarnings, { color: BLUE }]}>${earned}</Text>
                            )}
                            {isActive && (
                              <View style={[styles.activePill, { backgroundColor: '#E8FDF0', borderColor: '#86EFAC' }]}>
                                <View style={styles.activeDot} />
                                <Text style={[styles.activePillText, { color: '#15803D' }]}>Live</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {!isActive && isManager && (shift.hourlyRateCents ?? 0) > 0 && (
                          <View style={[styles.shiftRateRow, { borderTopColor: BORDER }]}>
                            <Text style={[styles.shiftRateText, { color: MUTED }]}>
                              ${((shift.hourlyRateCents ?? hourlyRateCents) / 100).toFixed(2)}/hr · {formatDuration(paidMins)} paid
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })
          )}

          {/* Manager weekly payroll summary */}
          {isManager && !selectedUserId && displayedShifts.length > 0 && (
            <View style={[styles.payrollCard, { backgroundColor: TEXT, borderColor: TEXT }]}>
              <Text style={[styles.payrollTitle, { color: '#fff' }]}>Weekly Payroll Summary</Text>
              <View style={styles.payrollRow}>
                <Text style={[styles.payrollLabel, { color: 'rgba(255,255,255,0.6)' }]}>Total paid hours</Text>
                <Text style={[styles.payrollValue, { color: '#fff' }]}>{formatDuration(totalPaidMins)}</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={[styles.payrollLabel, { color: 'rgba(255,255,255,0.6)' }]}>Estimated payroll</Text>
                <Text style={[styles.payrollValue, { color: BLUE }]}>${(totalEarningsCents / 100).toFixed(2)}</Text>
              </View>
              <View style={styles.payrollRow}>
                <Text style={[styles.payrollLabel, { color: 'rgba(255,255,255,0.6)' }]}>Completed shifts</Text>
                <Text style={[styles.payrollValue, { color: '#fff' }]}>{completedShifts}</Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  exportBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekNav: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  weekNavBtn: { padding: 14 },
  weekLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  weekSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4 },
  summaryLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  summaryValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 },
  staffPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  staffPillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  staffPillRate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  rateCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  rateCardText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  activeShiftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  activeShiftText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  emptyState: { alignItems: 'center', gap: 10, padding: 40, borderRadius: 16, borderWidth: 1 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, marginTop: 6 },
  dayName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  dayDate: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  todayBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  todayBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  shiftCard: { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  shiftStaffRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shiftStaffName: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  shiftPosition: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  shiftMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shiftTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftTime: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  shiftArrow: { fontSize: 14 },
  breakNote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  shiftDuration: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  shiftEarnings: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  activePillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  shiftRateRow: { borderTopWidth: 1, paddingTop: 8 },
  shiftRateText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  payrollCard: { borderRadius: 16, padding: 18, borderWidth: 1, gap: 12 },
  payrollTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payrollLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  payrollValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
