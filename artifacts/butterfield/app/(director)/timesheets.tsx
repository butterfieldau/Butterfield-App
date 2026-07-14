import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView,
  Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorShift, type RosterShift } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { useAuth } from '@/context/AuthContext';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import TimeWheelPicker from '@/components/TimeWheelPicker';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

// ── Palette ───────────────────────────────────────────────────────────────────
const INDIGO     = '#4F46E5';
const GLASS_BDR  = 'rgba(255,255,255,0.9)';
type FeatherName = ComponentProps<typeof Feather>['name'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_FULL      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtSectionHeader(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateRow(d: Date): string {
  return `${DAY_FULL[d.getDay()]} ${d.getDate()} ${MONTH_FULL[d.getMonth()]}`;
}
function fmtTimeShort(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2,'0');
  const s = d.getSeconds().toString().padStart(2,'0');
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m}:${s} ${ampm}`;
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
function formatHours(hrs: number): string {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function calcPay(s: DirectorShift): number | null {
  if (!s.clockOut || !s.hourlyRateCents) return null;
  return Math.round(parseHoursWorked(s.hoursWorked) * s.hourlyRateCents);
}
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error &&
      typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

// ── Date range helpers ────────────────────────────────────────────────────────
type WeekRangeKey = 'w0' | 'w1' | 'w2' | 'w3' | 'custom';

function getMondayOfWeek(weeksAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day - weeksAgo * 7);
  return d;
}
function getSundayOfWeek(weeksAgo: number): Date {
  const mon = getMondayOfWeek(weeksAgo);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return sun;
}
function fmtShortDate(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function fmtWeekRange(weeksAgo: number): string {
  const mon = getMondayOfWeek(weeksAgo);
  const sun = new Date(getMondayOfWeek(weeksAgo));
  sun.setDate(sun.getDate() + 6);
  return `${fmtShortDate(mon)} – ${fmtShortDate(sun)}`;
}

// ── Payroll summary ───────────────────────────────────────────────────────────
type StaffPaySummary = {
  userId: string; name: string; position: string;
  approvedShifts: number; pendingShifts: number;
  totalHours: number; totalPayCents: number; hasRate: boolean;
};
function buildPayrollSummary(shifts: DirectorShift[]): StaffPaySummary[] {
  const map = new Map<string, StaffPaySummary>();
  for (const s of shifts) {
    if (!s.clockOut || !s.userId) continue;
    if (!map.has(s.userId)) {
      map.set(s.userId, { userId: s.userId, name: s.name ?? 'Unknown',
        position: s.position ?? 'Staff', approvedShifts: 0, pendingShifts: 0,
        totalHours: 0, totalPayCents: 0, hasRate: false });
    }
    const entry = map.get(s.userId)!;
    entry.totalHours += parseHoursWorked(s.hoursWorked);
    const pay = calcPay(s);
    if (s.hourlyRateCents) entry.hasRate = true;
    if (pay != null) entry.totalPayCents += pay;
    if (s.approvedAt) entry.approvedShifts++; else entry.pendingShifts++;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ── PDF export ────────────────────────────────────────────────────────────────
function buildTimesheetHtml(shifts: DirectorShift[], from: Date, to: Date): string {
  const rows = shifts.map(s => {
    const hrs = parseHoursWorked(s.hoursWorked);
    const pay = calcPay(s);
    const dateStr = new Date(s.clockIn).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
    return `<tr>
      <td>${s.name ?? ''}</td><td>${dateStr}</td>
      <td>${fmtTime(s.clockIn)}</td>
      <td>${s.clockOut ? fmtTime(s.clockOut) : '—'}</td>
      <td>${s.unpaidBreakMins ? `${s.unpaidBreakMins}m` : '—'}</td>
      <td>${formatHours(hrs)}</td>
      <td>${pay != null ? fmtAUD(pay) : '—'}</td>
    </tr>`;
  }).join('');
  const totalHrs = shifts.reduce((a, s) => a + parseHoursWorked(s.hoursWorked), 0);
  const totalPay = shifts.reduce((a, s) => { const p = calcPay(s); return a + (p ?? 0); }, 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; margin: 40px; color: #1C1C1E; }
    h1 { color: #1A2B4A; font-size: 24px; margin-bottom: 4px; }
    .sub { color: #8E8E93; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1A2B4A; color: white; padding: 10px 12px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #E5E7EB; }
    tr:nth-child(even) { background: #F9FAFB; }
    .total { background: #1C1C1E; color: white; font-weight: bold; }
    .total td { color: white; }
    .footer { margin-top: 32px; color: #8E8E93; font-size: 12px; }
  </style></head><body>
  <h1>Butterfield Cookies</h1>
  <div class="sub">Timesheet: ${formatDate(from)} – ${formatDate(to)}</div>
  <table><thead><tr>
    <th>STAFF</th><th>DATE</th><th>CLOCK IN</th><th>CLOCK OUT</th>
    <th>BREAK</th><th>HOURS WORKED</th><th>OWING</th>
  </tr></thead><tbody>
    ${rows}
    <tr class="total"><td colspan="5">TOTAL</td><td>${formatHours(totalHrs)}</td><td>${fmtAUD(totalPay)}</td></tr>
  </tbody></table>
  <div class="footer">Generated ${new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })} · Butterfield Cookies Pty Ltd</div>
  </body></html>`;
}

// ── Individual Pay Slip PDF ───────────────────────────────────────────────────
function buildPaySlipHtml(summary: StaffPaySummary, shifts: DirectorShift[], from: Date, to: Date): string {
  const staffShifts = shifts.filter(s => s.userId === summary.userId && s.clockOut);
  const rows = staffShifts.map(s => {
    const hrs = parseHoursWorked(s.hoursWorked);
    const pay = calcPay(s);
    const dateStr = new Date(s.clockIn).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<tr>
      <td>${dateStr}</td>
      <td>${fmtTime(s.clockIn)}</td>
      <td>${s.clockOut ? fmtTime(s.clockOut) : '—'}</td>
      <td>${s.unpaidBreakMins ? `${s.unpaidBreakMins}m` : '—'}</td>
      <td>${formatHours(hrs)}</td>
      <td>${pay != null ? fmtAUD(pay) : '—'}</td>
      <td style="color:${s.approvedAt ? '#16a34a' : '#d97706'}">${s.approvedAt ? 'Approved' : 'Pending'}</td>
    </tr>`;
  }).join('');
  const rateCents = staffShifts[0]?.hourlyRateCents;
  const rateStr = rateCents ? `$${(rateCents / 100).toFixed(2)}/hr` : 'Rate not set';
  const taxEst = Math.round(summary.totalPayCents * 0.2);
  const net = summary.totalPayCents - taxEst;
  const superAmt = Math.round(summary.totalPayCents * 0.11);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    *{box-sizing:border-box}body{font-family:-apple-system,Helvetica,sans-serif;margin:0;padding:40px;color:#1C1C1E;background:#fff}
    .hdr{background:#1A2B4A;color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:24px}
    .hdr h1{font-size:22px;margin:0 0 4px}.hdr .sub{font-size:14px;opacity:.7}.hdr .period{font-size:13px;opacity:.6;margin-top:10px}
    .emp{display:flex;gap:28px;background:#F9FAFB;border-radius:10px;padding:16px 20px;margin-bottom:20px;border:1px solid #E5E7EB}
    .emp-field label{font-size:10px;font-weight:700;color:#8E8E93;letter-spacing:.6px;text-transform:uppercase}
    .emp-field .val{font-size:15px;font-weight:600;margin-top:2px}
    h3{font-size:12px;font-weight:700;letter-spacing:.6px;color:#8E8E93;text-transform:uppercase;margin:18px 0 8px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#1A2B4A;color:#fff;padding:9px 12px;text-align:left;font-size:11px;letter-spacing:.5px}
    td{padding:9px 12px;border-bottom:1px solid #F3F4F6}tr:nth-child(even) td{background:#F9FAFB}
    .totals{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
    .tc{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:14px 18px}
    .tc label{font-size:10px;font-weight:700;letter-spacing:.6px;color:#8E8E93;text-transform:uppercase}
    .tc .amt{font-size:20px;font-weight:800;margin-top:4px}
    .net{background:#1A2B4A;color:#fff}.net label{opacity:.6}
    .note{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 14px;margin-top:16px;font-size:12px;color:#1e40af}
    .footer{margin-top:28px;padding-top:16px;border-top:1px solid #E5E7EB;color:#8E8E93;font-size:11px;line-height:1.6}
  </style></head><body>
  <div class="hdr">
    <h1>Pay Slip — ${summary.name}</h1>
    <div class="sub">Butterfield Cookies Pty Ltd · ABN 24 680 761 166</div>
    <div class="period">Pay Period: ${formatDate(from)} – ${formatDate(to)}</div>
  </div>
  <div class="emp">
    <div class="emp-field"><label>Position</label><div class="val">${capitalize(summary.position)}</div></div>
    <div class="emp-field"><label>Pay Rate</label><div class="val">${rateStr}</div></div>
    <div class="emp-field"><label>Total Shifts</label><div class="val">${summary.approvedShifts + summary.pendingShifts}</div></div>
    <div class="emp-field"><label>Total Hours</label><div class="val">${summary.totalHours.toFixed(1)}h</div></div>
  </div>
  <h3>Shift Breakdown</h3>
  <table><thead><tr>
    <th>DATE</th><th>CLOCK IN</th><th>CLOCK OUT</th><th>BREAK</th><th>HOURS</th><th>AMOUNT</th><th>STATUS</th>
  </tr></thead><tbody>${rows.length ? rows : '<tr><td colspan="7" style="color:#8E8E93;text-align:center;padding:20px">No completed shifts in this period</td></tr>'}</tbody></table>
  <div class="totals">
    <div class="tc"><label>Gross Pay</label><div class="amt" style="color:#1C1C1E">${summary.hasRate ? fmtAUD(summary.totalPayCents) : '—'}</div></div>
    <div class="tc"><label>Est. Tax (20%)</label><div class="amt" style="color:#ef4444">${summary.hasRate ? fmtAUD(taxEst) : '—'}</div></div>
    <div class="tc"><label>Superannuation (11%)</label><div class="amt" style="color:#3b82f6">${summary.hasRate ? fmtAUD(superAmt) : '—'}</div></div>
    <div class="tc net"><label>Net Pay (Est.)</label><div class="amt" style="color:#34c759">${summary.hasRate ? fmtAUD(net) : '—'}</div></div>
  </div>
  <div class="note">Tax deductions are estimates only. Actual withholding depends on individual tax declarations and ATO rates. Verify against your payroll system before payment.</div>
  <div class="footer">
    <strong>Butterfield Cookies Pty Ltd</strong><br>
    BSB: 067 873 · Account: 1465 8181 · ABN: 24 680 761 166<br>
    Generated ${new Date().toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })} — Computer-generated document.
  </div>
  </body></html>`;
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────
type TimesheetTab = 'roster' | 'timesheets' | 'payrun';

function TimesheetTabBar({ active, onChange }: { active: TimesheetTab; onChange: (t: TimesheetTab) => void }) {
  const tabs: Array<{ key: TimesheetTab; label: string; icon: string }> = [
    { key: 'roster',     label: 'Roster',     icon: 'calendar' },
    { key: 'timesheets', label: 'Timesheets', icon: 'check-square' },
    { key: 'payrun',     label: 'Pay Run',    icon: 'dollar-sign' },
  ];
  return (
    <View style={tb.bar}>
      {tabs.map(t => {
        const isActive = active === t.key;
        return (
          <Pressable key={t.key} onPress={() => { onChange(t.key); Haptics.selectionAsync(); }}
            style={[tb.tab, isActive && tb.tabActive]}>
            <Feather name={t.icon as ComponentProps<typeof Feather>['name']} size={14}
              color={isActive ? '#fff' : MUTED} />
            <Text style={[tb.tabText, { color: isActive ? '#fff' : MUTED }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const tb = StyleSheet.create({
  bar:      { flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  tab:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  tabActive:{ backgroundColor: TEXT, borderColor: TEXT },
  tabText:  { fontSize: 11, fontWeight: '600' },
});

// ── Roster Tab ────────────────────────────────────────────────────────────────
function RosterTab({ onAddShift }: { onAddShift: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
    const day = new Date().getDay(); // 0=Sun
    return (day + 6) % 7; // Mon=0 … Sun=6
  });

  const weekStart = useMemo(() => {
    const d = getMondayOfWeek(0);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekStartStr = useMemo(() =>
    `${weekStart.getFullYear()}-${String(weekStart.getMonth()+1).padStart(2,'0')}-${String(weekStart.getDate()).padStart(2,'0')}`,
    [weekStart],
  );

  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d; }, [weekStart]);

  const { data: rosterData, isLoading: rosterLoading, refetch: refetchRoster } = useQuery({
    queryKey: ['director-roster', weekStartStr],
    queryFn: () => api.director.roster(weekStartStr),
    staleTime: 30_000,
  });
  const { data: staffData } = useQuery({
    queryKey: ['director-roster-staff'],
    queryFn: () => api.director.rosterStaff(),
    staleTime: 60_000,
  });
  const { data: liveData } = useQuery({
    queryKey: ['director-clock-events'],
    queryFn: () => api.director.clockEvents(),
    staleTime: 30_000,
  });
  const { data: usersData } = useQuery({
    queryKey: ['director-users-rates'],
    queryFn: () => api.director.users(),
    staleTime: 120_000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetchRoster);

  const rosterShifts: RosterShift[] = rosterData?.data ?? [];
  const allStaff = staffData?.data ?? [];
  const liveShifts = (liveData?.data ?? []).filter(s => !s.clockOut);

  // Build hourly-rate map from users list (rate lives in staffProfile)
  const userRates = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of (usersData?.data ?? [])) {
      const rate = u.staffProfile?.hourlyRateCents;
      if (rate) m.set(u.id, rate);
    }
    return m;
  }, [usersData]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const todayDayIdx = useMemo(() =>
    days.findIndex(d => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) === todayStr),
    [days, todayStr],
  );

  // Selected day's date string
  const selectedDayDateStr = useMemo(() => {
    const d = days[selectedDayIdx];
    return d ? d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) : '';
  }, [days, selectedDayIdx]);

  // Shifts for selected day, sorted by start time
  const selectedDayShifts = useMemo(() =>
    rosterShifts
      .filter(s => s.date === selectedDayDateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [rosterShifts, selectedDayDateStr],
  );

  // Which day indices have at least one shift (for dot indicator)
  const daysWithShifts = useMemo(() => {
    const set = new Set<number>();
    for (const shift of rosterShifts) {
      const idx = days.findIndex(d =>
        d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) === shift.date,
      );
      if (idx >= 0) set.add(idx);
    }
    return set;
  }, [rosterShifts, days]);

  const staffRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ id: string; name: string; position: string | null }> = [];
    for (const s of rosterShifts) {
      if (!seen.has(s.userId)) {
        seen.add(s.userId);
        const found = allStaff.find(x => x.id === s.userId);
        rows.push({ id: s.userId, name: s.userName ?? found?.name ?? 'Unknown', position: found?.position ?? null });
      }
    }
    for (const s of allStaff) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        rows.push({ id: s.id, name: s.name ?? 'Unknown', position: s.position ?? null });
      }
    }
    return rows;
  }, [rosterShifts, allStaff]);

  const weekSummary = useMemo(() => staffRows.map(staff => {
    const shifts = rosterShifts.filter(s => s.userId === staff.id);
    const totalMins = shifts.reduce((acc, s) => {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      return acc + ((eh! * 60 + em!) - (sh! * 60 + sm!));
    }, 0);
    const hours = totalMins / 60;
    const rateCents = userRates.get(staff.id) ?? 0;
    const payCents = rateCents > 0 ? Math.round(hours * rateCents) : null;
    return { ...staff, shiftCount: shifts.length, hours, payCents };
  }).filter(s => s.shiftCount > 0), [staffRows, rosterShifts, userRates]);

  const STAFF_COLORS = [BLUE, PURPLE, '#EC4899', AMBER, '#06B6D4', GREEN, '#F97316', '#8B5CF6', RED, '#0EA5E9'];
  const staffColor = (idx: number) => STAFF_COLORS[idx % STAFF_COLORS.length]!;
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const anyPay = weekSummary.some(s => s.payCents != null);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
    >
      {/* ── Week navigator */}
      <View style={rs.weekNav}>
        <Pressable onPress={() => { setWeekOffset(o => o - 1); Haptics.selectionAsync(); }} style={rs.navBtn}>
          <Feather name="chevron-left" size={18} color={TEXT} />
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{weekLabel}</Text>
          <Text style={{ fontSize: 11, color: weekOffset === 0 ? BLUE : MUTED, marginTop: 1 }}>
            {weekOffset === 0 ? 'Current week' : weekOffset > 0 ? `${weekOffset}w ahead` : `${Math.abs(weekOffset)}w ago`}
          </Text>
        </View>
        <Pressable onPress={() => { setWeekOffset(o => o + 1); Haptics.selectionAsync(); }} style={rs.navBtn}>
          <Feather name="chevron-right" size={18} color={TEXT} />
        </Pressable>
      </View>

      {/* ── Day strip */}
      <View style={rs.dayStrip}>
        {DAY_NAMES.map((dayName, i) => {
          const isToday    = i === todayDayIdx;
          const isSelected = i === selectedDayIdx;
          const hasShifts  = daysWithShifts.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => { setSelectedDayIdx(i); Haptics.selectionAsync(); }}
              style={[rs.dayPill, isSelected && rs.dayPillSelected, !isSelected && isToday && rs.dayPillToday]}
            >
              <Text style={[rs.dayPillLabel, {
                color: isSelected ? 'rgba(255,255,255,0.7)' : isToday ? BLUE : MUTED,
              }]}>{dayName}</Text>
              <Text style={[rs.dayPillNum, {
                color: isSelected ? '#fff' : isToday ? BLUE : TEXT,
              }]}>{days[i]?.getDate()}</Text>
              <View style={[rs.dayPillDot, {
                backgroundColor: hasShifts
                  ? (isSelected ? 'rgba(255,255,255,0.6)' : isToday ? BLUE : `${TEXT}40`)
                  : 'transparent',
              }]} />
            </Pressable>
          );
        })}
      </View>

      {/* ── Live banner (only when viewing today) */}
      {liveShifts.length > 0 && selectedDayIdx === todayDayIdx && (
        <View style={[rs.liveBanner, { margin: 12, marginBottom: 4 }]}>
          <View style={rs.liveDot} />
          <Text style={rs.liveText}>{liveShifts.length} staff clocked in now</Text>
          <Text style={{ fontSize: 12, color: MUTED, marginLeft: 'auto', flexShrink: 1 }} numberOfLines={1}>
            {liveShifts.map(s => s.name?.split(' ')[0] ?? '').join(' · ')}
          </Text>
        </View>
      )}

      {/* ── Day label */}
      <View style={rs.dayLabel}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={rs.dayLabelText}>
            {DAY_NAMES[selectedDayIdx]}, {days[selectedDayIdx]?.getDate()} {MONTH_NAMES[days[selectedDayIdx]?.getMonth() ?? 0]}
          </Text>
          {selectedDayIdx === todayDayIdx && (
            <View style={rs.todayBadge}>
              <Text style={rs.todayBadgeText}>Today</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: MUTED }}>
          {selectedDayShifts.length} {selectedDayShifts.length === 1 ? 'shift' : 'shifts'}
        </Text>
      </View>

      {/* ── Shift cards */}
      {rosterLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : selectedDayShifts.length === 0 ? (
        <View style={rs.emptyDay}>
          <Feather name="calendar" size={28} color={BORDER} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT, marginTop: 8 }}>No shifts rostered</Text>
          <Text style={{ fontSize: 13, color: MUTED }}>Tap + Shift to add shifts</Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {selectedDayShifts.map((shift) => {
            const staffIdx = staffRows.findIndex(s => s.id === shift.userId);
            const staff    = staffRows[staffIdx];
            const color    = staffColor(staffIdx < 0 ? 0 : staffIdx);
            const isLive   = selectedDayIdx === todayDayIdx && liveShifts.some(ls => ls.userId === shift.userId);
            const name     = shift.userName ?? staff?.name ?? 'Unknown';
            const position = staff?.position ?? shift.role ?? null;
            return (
              <View key={shift.id} style={rs.shiftCard}>
                {/* Avatar */}
                <View style={{ position: 'relative', flexShrink: 0 }}>
                  <View style={[rs.shiftAvatar, { backgroundColor: color }]}>
                    <Text style={rs.shiftAvatarText}>{initials(name)}</Text>
                  </View>
                  {isLive && <View style={rs.shiftLiveDot} />}
                </View>
                {/* Name + position */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: TEXT }} numberOfLines={1}>{name}</Text>
                    {isLive && (
                      <View style={rs.liveBadge}>
                        <Text style={rs.liveBadgeText}>LIVE</Text>
                      </View>
                    )}
                  </View>
                  {position && <Text style={{ fontSize: 12, color: MUTED }}>{capitalize(position)}</Text>}
                </View>
                {/* Time + status */}
                <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>
                    {formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 11, color: MUTED }}>{rosterShiftHours(shift.startTime, shift.endTime)}</Text>
                    <View style={[rs.statusPill, { backgroundColor: shift.isConfirmed ? GREEN + '18' : BLUE + '18' }]}>
                      <Text style={[rs.statusPillText, { color: shift.isConfirmed ? GREEN : BLUE }]}>
                        {shift.isConfirmed ? 'Confirmed' : 'Rostered'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Week Summary */}
      {weekSummary.length > 0 && (
        <View style={[rs.summaryCard, { margin: 16 }]}>
          <View style={rs.summaryHeader}>
            <Text style={rs.summaryTitle}>Week Summary</Text>
            <Text style={{ fontSize: 11, color: MUTED }}>{weekLabel}</Text>
          </View>
          {/* Stats grid */}
          <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
            {[
              { label: 'Shifts', value: String(weekSummary.reduce((a, s) => a + s.shiftCount, 0)) },
              { label: 'Hours',  value: `${Math.round(weekSummary.reduce((a, s) => a + s.hours, 0))}h` },
              { label: 'Staff',  value: String(weekSummary.length) },
            ].map(({ label, value }, i) => (
              <View key={label} style={[rs.statCell, i < 2 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: BORDER }]}>
                <Text style={rs.statValue}>{value}</Text>
                <Text style={rs.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {/* Per-staff rows */}
          {weekSummary.map((s, i) => {
            const color = staffColor(staffRows.findIndex(r => r.id === s.id));
            return (
              <View key={s.id} style={[rs.summaryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
                <View style={[rs.summaryAvatar, { backgroundColor: color }]}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{initials(s.name)}</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: TEXT, flex: 1 }} numberOfLines={1}>{s.name}</Text>
                <Text style={{ fontSize: 12, color: MUTED }}>{s.shiftCount} shift{s.shiftCount !== 1 ? 's' : ''}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: NAVY, minWidth: 30, textAlign: 'right' }}>
                  {Math.round(s.hours)}h
                </Text>
                {s.payCents != null && (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: GREEN, minWidth: 62, textAlign: 'right' }}>
                    ${(s.payCents / 100).toFixed(2)}
                  </Text>
                )}
              </View>
            );
          })}
          {/* Total row */}
          <View style={[rs.summaryRow, { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: NAVY + '08' }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: NAVY, flex: 1 }}>TOTAL</Text>
            <Text style={{ fontSize: 11, color: MUTED }}>{weekSummary.reduce((a, s) => a + s.shiftCount, 0)} shifts</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: NAVY, minWidth: 30, textAlign: 'right' }}>
              {Math.round(weekSummary.reduce((a, s) => a + s.hours, 0))}h
            </Text>
            {anyPay && (
              <Text style={{ fontSize: 13, fontWeight: '800', color: GREEN, minWidth: 62, textAlign: 'right' }}>
                {fmtAUD(weekSummary.reduce((a, s) => a + (s.payCents ?? 0), 0))}
              </Text>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

function rosterShiftHours(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const mins = (eh! * 60 + em!) - (sh! * 60 + sm!);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const rs = StyleSheet.create({
  // Navigation
  navBtn:          { width: 34, height: 34, borderRadius: 9, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  weekNav:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  // Day strip
  dayStrip:        { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  dayPill:         { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 7, borderRadius: 10 },
  dayPillSelected: { backgroundColor: TEXT },
  dayPillToday:    { backgroundColor: BLUE + '12' },
  dayPillLabel:    { fontSize: 9, fontWeight: '600', letterSpacing: 0.2, marginBottom: 2 },
  dayPillNum:      { fontSize: 16, fontWeight: '700', lineHeight: 18 },
  dayPillDot:      { marginTop: 4, width: 4, height: 4, borderRadius: 2 },
  // Live
  liveBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GREEN + '12', borderRadius: 10, padding: 9, borderWidth: 1, borderColor: GREEN + '30' },
  liveDot:         { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  liveText:        { fontSize: 12, color: GREEN, fontWeight: '600' },
  liveBadge:       { backgroundColor: GREEN + '18', borderRadius: 99, paddingHorizontal: 5, paddingVertical: 1 },
  liveBadgeText:   { fontSize: 9, fontWeight: '700', color: GREEN },
  // Day label
  dayLabel:        { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  dayLabelText:    { fontSize: 17, fontWeight: '700', color: TEXT },
  todayBadge:      { backgroundColor: BLUE + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText:  { fontSize: 11, fontWeight: '600', color: BLUE },
  // Shift cards
  shiftCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER },
  shiftAvatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  shiftAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  shiftLiveDot:    { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: GREEN, borderWidth: 2, borderColor: CARD },
  statusPill:      { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  statusPillText:  { fontSize: 10, fontWeight: '600' },
  // Empty
  emptyDay:        { marginHorizontal: 16, padding: 32, alignItems: 'center', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER },
  // Summary
  summaryCard:     { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  summaryHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  summaryTitle:    { fontSize: 13, fontWeight: '700', color: TEXT },
  summaryRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14 },
  summaryAvatar:   { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statCell:        { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statValue:       { fontSize: 18, fontWeight: '700', color: TEXT },
  statLabel:       { fontSize: 11, color: MUTED, marginTop: 1 },
});

// ── Pay Run Tab ───────────────────────────────────────────────────────────────
function PayRunTab({
  payrollSummary, rangeShifts, rangeStart, rangeEnd, isManager, appliedRange, onApplyRange,
}: {
  payrollSummary: StaffPaySummary[];
  rangeShifts: DirectorShift[];
  rangeStart: Date;
  rangeEnd: Date;
  isManager: boolean;
  appliedRange: WeekRangeKey;
  onApplyRange: (k: Exclude<WeekRangeKey, 'custom'>) => void;
}) {
  const [exporting,   setExporting]   = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const totalGross = payrollSummary.reduce((a, s) => a + s.totalPayCents, 0);
  const totalHours = payrollSummary.reduce((a, s) => a + s.totalHours, 0);
  const pending    = payrollSummary.reduce((a, s) => a + s.pendingShifts, 0);
  const taxEst     = Math.round(totalGross * 0.2);
  const netPay     = totalGross - taxEst;
  const superAmt   = Math.round(totalGross * 0.11);

  const sharePaySlip = async (html: string, name: string) => {
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
      document.body.appendChild(iframe);
      iframe.contentDocument!.open(); iframe.contentDocument!.write(html); iframe.contentDocument!.close();
      setTimeout(() => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1500); }, 400);
      return;
    }
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${name} Pay Slip`, UTI: 'com.adobe.pdf' });
    } else {
      Alert.alert('Saved', `Pay slip saved to: ${uri}`);
    }
  };

  const downloadPaySlip = async (summary: StaffPaySummary) => {
    setExportingId(summary.userId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sharePaySlip(buildPaySlipHtml(summary, rangeShifts, rangeStart, rangeEnd), summary.name);
    } catch (e: unknown) {
      Alert.alert('Export Error', getErrorMessage(e, 'Could not generate pay slip.'));
    } finally { setExportingId(null); }
  };

  const downloadAllPaySlips = async () => {
    if (payrollSummary.length === 0) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const combined = payrollSummary
        .map(s => buildPaySlipHtml(s, rangeShifts, rangeStart, rangeEnd))
        .join('<div style="page-break-after:always"></div>');
      await sharePaySlip(combined, 'All Staff');
    } catch (e: unknown) {
      Alert.alert('Export Error', getErrorMessage(e, 'Could not generate pay slips.'));
    } finally { setExporting(false); }
  };

  const PERIOD_OPTS: Array<{ key: Exclude<WeekRangeKey, 'custom'>; label: string }> = [
    { key: 'w0', label: 'This Week' },
    { key: 'w1', label: 'Last Week' },
    { key: 'w2', label: '2 Weeks Ago' },
    { key: 'w3', label: '3 Weeks Ago' },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        {PERIOD_OPTS.map(({ key, label }) => (
          <Pressable key={key} onPress={() => { onApplyRange(key); Haptics.selectionAsync(); }}
            style={[pr.periodChip, appliedRange === key && { backgroundColor: TEXT, borderColor: TEXT }]}>
            <Text style={[pr.periodChipText, { color: appliedRange === key ? '#fff' : MUTED }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Hero wages card */}
      <View style={[pr.heroCard, { marginHorizontal: 16, marginBottom: 12 }]}>
        <View style={pr.heroCircle1} /><View style={pr.heroCircle2} />
        <Text style={pr.heroLabel}>TOTAL GROSS WAGES</Text>
        <Text style={pr.heroAmount}>{fmtAUD(totalGross)}</Text>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 10 }}>
          {([
            [formatHours(totalHours), 'Total Hours'],
            [`${payrollSummary.length} staff`, 'Employees'],
            [pending > 0 ? `${pending} Pending` : 'All Clear', pending > 0 ? 'Need Review' : 'Status'],
          ] as const).map(([val, lbl]) => (
            <View key={lbl}>
              <Text style={pr.heroStatVal}>{val}</Text>
              <Text style={pr.heroStatLbl}>{lbl}</Text>
            </View>
          ))}
        </View>
        {!isManager && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Pressable onPress={downloadAllPaySlips} disabled={exporting || payrollSummary.length === 0}
              style={[pr.heroBtn, { backgroundColor: BLUE, opacity: (exporting || payrollSummary.length === 0) ? 0.5 : 1 }]}>
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={13} color="#fff" /><Text style={pr.heroBtnText}>All Pay Slips</Text></>}
            </Pressable>
            <Pressable style={[pr.heroBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Feather name="upload" size={13} color="#fff" />
              <Text style={pr.heroBtnText}>Export MYOB</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Staff pay cards */}
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 2 }}>STAFF PAY SUMMARY</Text>

        {payrollSummary.length === 0 && (
          <View style={sc.empty}>
            <Feather name="dollar-sign" size={36} color={BORDER} />
            <Text style={sc.emptyTitle}>No completed shifts</Text>
            <Text style={sc.emptySub}>Clock-out times are needed to calculate pay.</Text>
          </View>
        )}

        {payrollSummary.map((s) => {
          const hasAllApproved = s.pendingShifts === 0;
          const staffShifts    = rangeShifts.filter(sh => sh.userId === s.userId && sh.clockOut);
          const rateCents      = staffShifts[0]?.hourlyRateCents ?? 0;
          const taxEstPerson   = Math.round(s.totalPayCents * 0.2);
          const netPerson      = s.totalPayCents - taxEstPerson;
          const isExporting    = exportingId === s.userId;

          return (
            <View key={s.userId} style={pr.staffCard}>
              {/* Header */}
              <View style={pr.staffHeader}>
                <View style={[py.avatar, { backgroundColor: hasAllApproved ? GREEN + '20' : AMBER + '20' }]}>
                  <Text style={[py.avatarText, { color: hasAllApproved ? GREEN : AMBER }]}>{initials(s.name)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={pr.staffName} numberOfLines={1}>{s.name}</Text>
                  <Text style={pr.staffSub}>{capitalize(s.position)} · {rateCents ? `$${(rateCents/100).toFixed(2)}/hr` : 'No rate'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                  <Text style={pr.staffGross}>{s.hasRate ? fmtAUD(s.totalPayCents) : '—'}</Text>
                  <View style={[pr.statusBadge, {
                    backgroundColor: hasAllApproved ? GREEN + '15' : AMBER + '15',
                    borderColor:     hasAllApproved ? GREEN + '40' : AMBER + '40',
                  }]}>
                    <Text style={[pr.statusBadgeText, { color: hasAllApproved ? GREEN : AMBER }]}>
                      {hasAllApproved ? 'Approved' : `${s.pendingShifts} pending`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Breakdown */}
              <View style={pr.breakdownRow}>
                {([
                  { label: 'Hours',   val: `${s.totalHours.toFixed(1)}h`, color: TEXT },
                  { label: 'Tax Est.',val: s.hasRate ? fmtAUD(taxEstPerson) : '—', color: RED },
                  { label: 'Net Pay', val: s.hasRate ? fmtAUD(netPerson)    : '—', color: GREEN },
                  { label: 'Shifts',  val: `${s.approvedShifts + s.pendingShifts}`, color: TEXT },
                ] as const).map((item, j) => (
                  <View key={item.label} style={[pr.breakdownItem, j < 3 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: BORDER }]}>
                    <Text style={pr.breakdownLabel}>{item.label}</Text>
                    <Text style={[pr.breakdownValue, { color: item.color }]}>{item.val}</Text>
                  </View>
                ))}
              </View>

              {/* Actions */}
              {!isManager && (
                <View style={pr.actionsRow}>
                  <Pressable onPress={() => downloadPaySlip(s)} disabled={isExporting}
                    style={[pr.actionBtn, { flex: 1, borderColor: BLUE, backgroundColor: BLUE + '10', opacity: isExporting ? 0.5 : 1 }]}>
                    {isExporting
                      ? <ActivityIndicator size="small" color={BLUE} />
                      : <><Feather name="download" size={13} color={BLUE} /><Text style={[pr.actionBtnText, { color: BLUE }]}>Pay Slip PDF</Text></>}
                  </Pressable>
                  {s.pendingShifts > 0 && (
                    <View style={[pr.actionBtn, { borderColor: AMBER + '60', backgroundColor: AMBER + '10' }]}>
                      <Feather name="alert-circle" size={13} color={AMBER} />
                      <Text style={[pr.actionBtnText, { color: AMBER }]}>{s.pendingShifts} to approve</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {/* Totals */}
        {payrollSummary.length > 0 && (
          <View style={pr.totalsCard}>
            {([
              { label: 'Total Hours Worked',   val: formatHours(totalHours), color: TEXT },
              { label: 'Estimated Tax (20%)',   val: fmtAUD(taxEst),         color: RED },
              { label: 'Superannuation (11%)',  val: fmtAUD(superAmt),       color: BLUE },
              { label: 'Net Payroll (Est.)',     val: fmtAUD(netPay),         color: GREEN },
            ] as const).map((item, i) => (
              <View key={item.label} style={[pr.totalsRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
                <Text style={pr.totalsLabel}>{item.label}</Text>
                <Text style={[pr.totalsValue, { color: item.color }]}>{item.val}</Text>
              </View>
            ))}
            <View style={[pr.totalsRow, { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: NAVY + '07' }]}>
              <Text style={[pr.totalsLabel, { fontSize: 14, fontWeight: '700', color: NAVY }]}>GROSS TOTAL</Text>
              <Text style={[pr.totalsValue, { fontSize: 17, color: NAVY }]}>{fmtAUD(totalGross)}</Text>
            </View>
          </View>
        )}

        {/* Compliance notice */}
        <View style={pr.complianceCard}>
          <Feather name="info" size={14} color={BLUE} />
          <View style={{ flex: 1 }}>
            <Text style={pr.complianceTitle}>Super & Entitlements</Text>
            <Text style={pr.complianceSub}>SGC super at 11%. Verify award rates and leave accrual before exporting to payroll. Tax estimates are indicative only.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const pr = StyleSheet.create({
  periodChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  periodChipText:  { fontSize: 12, fontWeight: '600' },
  heroCard:        { backgroundColor: NAVY, borderRadius: 18, padding: 20, position: 'relative', overflow: 'hidden' },
  heroCircle1:     { position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroCircle2:     { position: 'absolute', right: 20, bottom: -30, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroLabel:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  heroAmount:      { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  heroStatVal:     { fontSize: 14, fontWeight: '700', color: '#fff' },
  heroStatLbl:     { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  heroBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  heroBtnText:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  staffCard:       { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  staffHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  staffName:       { fontSize: 14, fontWeight: '700', color: TEXT },
  staffSub:        { fontSize: 11, color: MUTED, marginTop: 1 },
  staffGross:      { fontSize: 15, fontWeight: '800', color: NAVY },
  statusBadge:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginTop: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  breakdownRow:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  breakdownItem:   { flex: 1, padding: 10, alignItems: 'center' },
  breakdownLabel:  { fontSize: 8, fontWeight: '700', color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  breakdownValue:  { fontSize: 12, fontWeight: '700' },
  actionsRow:      { flexDirection: 'row', gap: 8, padding: 10 },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1 },
  actionBtnText:   { fontSize: 12, fontWeight: '600' },
  totalsCard:      { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  totalsRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  totalsLabel:     { fontSize: 12, fontWeight: '600', color: MUTED },
  totalsValue:     { fontSize: 14, fontWeight: '700' },
  complianceCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: BLUE + '08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BLUE + '25' },
  complianceTitle: { fontSize: 12, fontWeight: '700', color: BLUE, marginBottom: 2 },
  complianceSub:   { fontSize: 11, color: MUTED, lineHeight: 16 },
});

// ── Staff Picker Modal ────────────────────────────────────────────────────────
function StaffPickerModal({ visible, staff, onSelect, onClose }: {
  visible: boolean;
  staff: Array<{ id: string; name: string; role: string; position?: string | null }>;
  onSelect: (s: { id: string; name: string; role: string; position?: string | null }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[sp.header, { paddingTop: insets.top + 12 }]}>
          <Text style={sp.title}>Select Team Member</Text>
          <Pressable onPress={onClose} style={sp.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
        </View>
        <FlatList
          data={staff}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onSelect(item); onClose(); }}
              style={({ pressed }) => [sp.row, pressed && { opacity: 0.7 }]}>
              <View style={sp.avatar}>
                <Text style={sp.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sp.name}>{item.name}</Text>
                <Text style={sp.role}>{capitalize(item.position ?? item.role)}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
const sp = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  title:      { fontSize: 18, fontWeight: '700', color: TEXT },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER },
  avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: INDIGO + '18', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: INDIGO },
  name:       { fontSize: 15, fontWeight: '600', color: TEXT },
  role:       { fontSize: 12, color: MUTED, marginTop: 1 },
});

// ── Add / Edit Timesheet Modal ─────────────────────────────────────────────────
function TimesheetModal({ mode, shift, staffList, isManager, visible, onClose, onSaved }: {
  mode: 'add' | 'edit';
  shift?: DirectorShift | null;
  staffList: Array<{ id: string; name: string; role: string; position?: string | null }>;
  isManager: boolean;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  // Form state
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; role: string; position?: string | null } | null>(null);
  const [selectedDate,  setSelectedDate]  = useState<Date | null>(null);
  const [startHHMM,     setStartHHMM]     = useState('09:00');
  const [endHHMM,       setEndHHMM]       = useState('17:00');
  const [breakMins,     setBreakMins]      = useState(0);
  const [calOpen,       setCalOpen]        = useState(false);
  const [showStaffPick, setShowStaffPick]  = useState(false);
  const [showStartPick, setShowStartPick]  = useState(false);
  const [showEndPick,   setShowEndPick]    = useState(false);
  const [saving,        setSaving]         = useState(false);
  const [deleting,      setDeleting]       = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && shift) {
      const s = staffList.find(x => x.id === shift.userId);
      setSelectedStaff(s ?? { id: shift.userId, name: shift.name ?? 'Unknown', role: 'staff', position: shift.position ?? undefined });
      setSelectedDate(new Date(shift.clockIn));
      setStartHHMM(isoToHHMM(shift.clockIn));
      setEndHHMM(shift.clockOut ? isoToHHMM(shift.clockOut) : '17:00');
      setBreakMins(shift.unpaidBreakMins ?? 0);
    } else {
      setSelectedStaff(null);
      setSelectedDate(null);
      setStartHHMM('09:00');
      setEndHHMM('17:00');
      setBreakMins(0);
    }
    setCalOpen(false);
    setShowStaffPick(false);
  }, [visible, mode, shift]);

  // Compute total hours badge
  const totalHoursDisplay = useMemo(() => {
    if (!selectedDate) return null;
    const base = new Date(selectedDate);
    const [sh, sm] = startHHMM.split(':').map(Number);
    const [eh, em] = endHHMM.split(':').map(Number);
    base.setHours(sh, sm, 0, 0);
    const end = new Date(base);
    end.setHours(eh, em, 0, 0);
    const diffMs = end.getTime() - base.getTime();
    if (diffMs <= 0) return null;
    const totalMins = Math.max(0, diffMs / 60000 - breakMins);
    return formatHours(totalMins / 60);
  }, [selectedDate, startHHMM, endHHMM, breakMins]);

  const canSave = !!selectedStaff && !!selectedDate && !!startHHMM && !!endHHMM;

  const approve = useMutation({
    mutationFn: (a: boolean) => api.director.updateShift(shift!.id, { approve: a }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-timesheets'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    },
    onError: (e: unknown) => Alert.alert('Error', getErrorMessage(e, 'Could not update approval.')),
  });

  const handleSave = async () => {
    if (!canSave || !selectedDate) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const base = new Date(selectedDate);
      const [sh, sm] = startHHMM.split(':').map(Number);
      const [eh, em] = endHHMM.split(':').map(Number);
      base.setHours(sh, sm, 0, 0);
      const endDate = new Date(base);
      endDate.setHours(eh, em, 0, 0);
      if (endDate <= base) { Alert.alert('Invalid times', 'End time must be after start time.'); return; }
      if (mode === 'add') {
        await api.director.createTimesheet({
          userId: selectedStaff!.id,
          clockIn: base.toISOString(),
          clockOut: endDate.toISOString(),
          unpaidBreakMins: breakMins,
        });
      } else {
        await api.director.updateShift(shift!.id, {
          clockIn: base.toISOString(),
          clockOut: endDate.toISOString(),
          unpaidBreakMins: breakMins,
        });
      }
      await qc.invalidateQueries({ queryKey: ['director-timesheets'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: unknown) {
      Alert.alert('Error', getErrorMessage(e, 'Could not save timesheet.'));
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!shift) return;
    Alert.alert(
      'Delete Timesheet',
      `Remove this shift for ${shift.name ?? 'this staff member'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.director.deleteTimesheet(shift.id);
              await qc.invalidateQueries({ queryKey: ['director-timesheets'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onSaved();
            } catch (e: unknown) {
              Alert.alert('Error', getErrorMessage(e, 'Could not delete timesheet.'));
            } finally { setDeleting(false); }
          },
        },
      ],
    );
  };

  const isApproved = mode === 'edit' && !!shift?.approvedAt;
  const isActive   = mode === 'edit' && !shift?.clockOut;
  const staffPosition = selectedStaff
    ? (selectedStaff.position ?? capitalize(selectedStaff.role))
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[tm.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} style={tm.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={tm.title}>{mode === 'add' ? 'Add Timesheet' : 'Edit Timesheet'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Status banner (edit mode) */}
          {mode === 'edit' && (
            <View style={[tm.statusBanner, {
              backgroundColor: isActive ? '#EBF8FF' : isApproved ? '#DCFCE7' : '#FFF7ED',
              borderColor:     isActive ? BLUE     : isApproved ? GREEN     : AMBER,
            }]}>
              <Feather name={isActive ? 'zap' : isApproved ? 'check-circle' : 'clock'}
                size={15} color={isActive ? BLUE : isApproved ? GREEN : AMBER} />
              <Text style={[tm.statusBannerText, { color: isActive ? BLUE : isApproved ? GREEN : AMBER }]}>
                {isActive ? 'Currently clocked in' : isApproved ? 'Approved' : 'Pending approval'}
              </Text>
            </View>
          )}

          {/* Rows card */}
          <View style={tm.card}>
            {/* Team Member */}
            <Pressable onPress={() => setShowStaffPick(true)}
              style={[tm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={tm.rowLeft}>
                <Feather name="user" size={16} color={MUTED} />
                <Text style={[tm.rowLabel, !selectedStaff && { color: MUTED }]}>
                  {selectedStaff ? selectedStaff.name : 'Select Team Member'}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>

            {/* Date */}
            <Pressable
              onPress={() => { setCalOpen(o => !o); Haptics.selectionAsync(); }}
              style={[tm.row, { borderBottomWidth: calOpen ? 0 : StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}
            >
              <View style={tm.rowLeft}>
                <Feather name="calendar" size={16} color={MUTED} />
                <Text style={[tm.rowLabel, !selectedDate && { color: MUTED }]}>
                  {selectedDate ? fmtDateRow(selectedDate) : 'Select Date'}
                </Text>
              </View>
              <Feather name={calOpen ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
            </Pressable>
            {calOpen && (
              <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
                <InlineCalendarPicker
                  selectedDate={selectedDate}
                  onSelectDate={d => { setSelectedDate(d); setCalOpen(false); Haptics.selectionAsync(); }}
                  accentColor={INDIGO}
                />
              </View>
            )}

            {/* Time range */}
            <View style={[tm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={tm.rowLeft}>
                <Feather name="clock" size={16} color={MUTED} />
                <Pressable onPress={() => setShowStartPick(true)} style={tm.timePill}>
                  <Text style={tm.timePillText}>{fmtTimePill(startHHMM)}</Text>
                </Pressable>
                <Text style={{ color: MUTED, fontSize: 13 }}>→</Text>
                <Pressable onPress={() => setShowEndPick(true)} style={tm.timePill}>
                  <Text style={tm.timePillText}>{fmtTimePill(endHHMM)}</Text>
                </Pressable>
              </View>
              {totalHoursDisplay && (
                <View style={tm.hoursBadge}>
                  <Text style={tm.hoursBadgeText}>{totalHoursDisplay}</Text>
                </View>
              )}
            </View>

            {/* Role (auto-filled, read-only) */}
            <View style={[tm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={tm.rowLeft}>
                <Feather name="briefcase" size={16} color={MUTED} />
                <Text style={[tm.rowLabel, !staffPosition && { color: MUTED }]}>
                  {staffPosition ? `${capitalize(staffPosition)}, Butterfield` : 'Role · auto-filled'}
                </Text>
              </View>
            </View>

            {/* Break */}
            <View style={tm.row}>
              <View style={tm.rowLeft}>
                <Feather name="coffee" size={16} color={MUTED} />
                <Text style={tm.rowLabel}>Meal Break</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => setBreakMins(b => Math.max(0, b - 5))} hitSlop={8}
                  style={tm.breakAdj}>
                  <Feather name="minus" size={14} color={INDIGO} />
                </Pressable>
                <Text style={tm.breakLabel}>{breakMins}m</Text>
                <Pressable onPress={() => setBreakMins(b => b + 5)} hitSlop={8}
                  style={tm.breakAdj}>
                  <Feather name="plus" size={14} color={INDIGO} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Approve / Unapprove (edit only, completed shifts) */}
          {mode === 'edit' && !isActive && (
            <View style={[tm.card, { padding: 16 }]}>
              <Text style={tm.sectionLabel}>APPROVAL</Text>
              <Text style={[tm.approvalHint, { color: MUTED }]}>
                {isApproved
                  ? 'This shift is approved. Unapprove if corrections are needed.'
                  : 'Review and approve this shift to confirm hours for payroll.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(true); }}
                  disabled={approve.isPending}
                  style={[tm.approveBtn, { backgroundColor: isApproved ? '#DCFCE7' : BG, borderColor: isApproved ? GREEN : BORDER }]}>
                  {approve.isPending && !isApproved
                    ? <ActivityIndicator size="small" color={GREEN} />
                    : <><Feather name="check" size={15} color={GREEN} /><Text style={[tm.approveBtnText, { color: GREEN }]}>Approve</Text></>}
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(false); }}
                  disabled={approve.isPending}
                  style={[tm.approveBtn, { backgroundColor: !isApproved ? '#FFF7ED' : BG, borderColor: !isApproved ? AMBER : BORDER }]}>
                  {approve.isPending && isApproved
                    ? <ActivityIndicator size="small" color={AMBER} />
                    : <><Feather name="rotate-ccw" size={15} color={AMBER} /><Text style={[tm.approveBtnText, { color: AMBER }]}>Unapprove</Text></>}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer: Delete (edit + director only) + Save */}
        <View style={[tm.footer, { paddingBottom: insets.bottom + 16, gap: 10 }]}>
          {mode === 'edit' && !isManager && (
            <Pressable onPress={handleDelete} disabled={deleting}
              style={[tm.saveBtn, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', opacity: deleting ? 0.5 : 1 }]}>
              {deleting
                ? <ActivityIndicator color="#DC2626" size="small" />
                : <Text style={[tm.saveBtnText, { color: '#DC2626' }]}>Delete Entry</Text>}
            </Pressable>
          )}
          <Pressable onPress={handleSave} disabled={!canSave || saving}
            style={[tm.saveBtn, { opacity: (!canSave || saving) ? 0.5 : 1, backgroundColor: INDIGO }]}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={tm.saveBtnText}>{mode === 'add' ? 'Add' : 'Save Changes'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <StaffPickerModal
        visible={showStaffPick}
        staff={staffList}
        onSelect={s => setSelectedStaff(s)}
        onClose={() => setShowStaffPick(false)}
      />
      <TimeWheelPicker
        visible={showStartPick}
        initialHHMM={startHHMM}
        onConfirm={setStartHHMM}
        onClose={() => setShowStartPick(false)}
        accentColor={INDIGO}
      />
      <TimeWheelPicker
        visible={showEndPick}
        initialHHMM={endHHMM}
        onConfirm={setEndHHMM}
        onClose={() => setShowEndPick(false)}
        accentColor={INDIGO}
      />
    </Modal>
  );
}

function fmtTimePill(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr) || 0;
  const m = parseInt(mStr) || 0;
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}

const tm = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  closeBtn:        { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 18, fontWeight: '700', color: TEXT },
  statusBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, borderWidth: 1 },
  statusBannerText:{ fontSize: 14, fontWeight: '600' },
  card:            { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  rowLeft:         { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowLabel:        { fontSize: 15, fontWeight: '500', color: TEXT, flex: 1 },
  timePill:        { backgroundColor: INDIGO + '14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  timePillText:    { fontSize: 13, fontWeight: '600', color: INDIGO },
  hoursBadge:      { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  hoursBadgeText:  { fontSize: 12, fontWeight: '700', color: '#fff' },
  breakAdj:        { width: 28, height: 28, borderRadius: 14, backgroundColor: INDIGO + '14', alignItems: 'center', justifyContent: 'center' },
  breakLabel:      { fontSize: 14, fontWeight: '600', color: TEXT, minWidth: 32, textAlign: 'center' },
  sectionLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: MUTED, marginBottom: 8 },
  approvalHint:    { fontSize: 13, lineHeight: 19 },
  approveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  approveBtnText:  { fontSize: 14, fontWeight: '600' },
  footer:          { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  saveBtn:         { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Date-Range Dropdown ───────────────────────────────────────────────────────
const WEEK_OPTIONS: { key: WeekRangeKey; staticLabel?: string }[] = [
  { key: 'w0', staticLabel: 'This week' },
  { key: 'w1', staticLabel: 'Last week' },
  { key: 'w2' },
  { key: 'w3' },
  { key: 'custom', staticLabel: 'Custom…' },
];

function getWeekOptionLabel(key: WeekRangeKey): string {
  if (key === 'w0') return 'This week';
  if (key === 'w1') return 'Last week';
  if (key === 'w2') return fmtWeekRange(2);
  if (key === 'w3') return fmtWeekRange(3);
  return 'Custom…';
}

function DateRangeDropdown({ value, customFrom, customTo, panelOpen, onSelectPreset, onOpenCustom }: {
  value: WeekRangeKey;
  customFrom: Date | null;
  customTo: Date | null;
  panelOpen: boolean;
  onSelectPreset: (k: Exclude<WeekRangeKey, 'custom'>) => void;
  onOpenCustom: () => void;
}) {
  const [open, setOpen] = useState(false);

  function triggerLabel(): string {
    if (value === 'custom') {
      if (customFrom && customTo) return `${fmtShortDate(customFrom)} – ${fmtShortDate(customTo)}`;
      return 'From – To';
    }
    return getWeekOptionLabel(value);
  }

  return (
    <View style={{ position: 'relative', zIndex: 20 }}>
      <Pressable onPress={() => setOpen(o => !o)} style={dd.trigger}>
        <Text style={dd.triggerText} numberOfLines={1}>{triggerLabel()}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={14} color={BLUE} />
      </Pressable>
      {open && (
        <View style={dd.menu}>
          {WEEK_OPTIONS.map(r => (
              <Pressable key={r.key}
                onPress={() => {
                  if (r.key === 'custom') {
                    setOpen(false);
                    onOpenCustom();
                  } else {
                    setOpen(false);
                    onSelectPreset(r.key as Exclude<WeekRangeKey, 'custom'>);
                  }
                }}
                style={[dd.item, r.key === value && { backgroundColor: BLUE + '12' }]}>
                <Text style={[dd.itemText, r.key === value && { color: BLUE, fontWeight: '600' }]}>
                  {getWeekOptionLabel(r.key)}
                </Text>
                {r.key === value && <Feather name="check" size={14} color={BLUE} />}
              </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
const dd = StyleSheet.create({
  trigger:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE + '12', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, maxWidth: 180 },
  triggerText: { fontSize: 13, fontWeight: '600', color: BLUE, flexShrink: 1 },
  menu:        { position: 'absolute', top: 38, right: 0, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', minWidth: 170, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  item:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, gap: 8 },
  itemText:    { fontSize: 14, fontWeight: '500', color: TEXT },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
type StatusFilter = 'all' | 'pending' | 'approved';

export default function DirectorTimesheetsScreen() {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<TimesheetTab>('roster');

  // appliedRange = what's actually filtering the list; panelOpen = custom picker visible
  const [appliedRange, setAppliedRange] = useState<WeekRangeKey>('w0');
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [customFrom,   setCustomFrom]   = useState<Date | null>(null);
  const [customTo,     setCustomTo]     = useState<Date | null>(null);
  const [draftFrom,    setDraftFrom]    = useState<Date | null>(null);
  const [draftTo,      setDraftTo]      = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [modalMode,    setModalMode]    = useState<'add' | 'edit'>('add');
  const [selected,     setSelected]     = useState<DirectorShift | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [exporting,    setExporting]    = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-timesheets'],
    queryFn: () => api.director.timesheets(),
    staleTime: 30_000,
  });
  const { data: staffData } = useQuery({
    queryKey: ['director-staff-list'],
    queryFn: () => api.director.staffList(),
    staleTime: 60_000,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const allShifts: DirectorShift[] = data?.data ?? [];
  const staffList = staffData?.data ?? [];

  // staffList already includes position from server (LEFT JOIN on staff_profiles)

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (appliedRange === 'custom') {
      const start = customFrom ? new Date(customFrom) : getMondayOfWeek(0);
      start.setHours(0, 0, 0, 0);
      const end = customTo ? new Date(customTo) : getSundayOfWeek(0);
      end.setHours(23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    const weeksAgo = parseInt(appliedRange[1]);
    return { rangeStart: getMondayOfWeek(weeksAgo), rangeEnd: getSundayOfWeek(weeksAgo) };
  }, [appliedRange, customFrom, customTo]);

  const rangeShifts = useMemo(() =>
    allShifts.filter(s => new Date(s.clockIn) >= rangeStart && new Date(s.clockIn) <= rangeEnd),
    [allShifts, rangeStart, rangeEnd],
  );

  // Person filter pills (derived from range shifts)
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    rangeShifts.forEach(s => { if (s.userId && s.name) seen.set(s.userId, s.name); });
    return Array.from(seen.entries()).map(e => ({ id: e[0], name: e[1] })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rangeShifts]);

  const filtered = useMemo(() => {
    let result = personFilter === 'all' ? rangeShifts : rangeShifts.filter(s => s.userId === personFilter);
    if (statusFilter === 'pending')  result = result.filter(s => s.clockOut && !s.approvedAt);
    if (statusFilter === 'approved') result = result.filter(s => !!s.approvedAt);
    return result;
  }, [rangeShifts, personFilter, statusFilter]);

  // Group by date
  const sections = useMemo(() => {
    const map = new Map<string, { key: string; label: string; totalHrs: number; shifts: DirectorShift[] }>();
    filtered.forEach(s => {
      const key = toDateKey(s.clockIn);
      if (!map.has(key)) map.set(key, { key, label: fmtSectionHeader(s.clockIn), totalHrs: 0, shifts: [] });
      const g = map.get(key)!;
      g.shifts.push(s);
      g.totalHrs += parseHoursWorked(s.hoursWorked);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(e => e[1]);
  }, [filtered]);

  const payrollSummary = useMemo(() => buildPayrollSummary(rangeShifts), [rangeShifts]);

  const stats = useMemo(() => {
    const done = filtered.filter(s => s.clockOut);
    return {
      totalHrs: done.reduce((sum, s) => sum + parseHoursWorked(s.hoursWorked), 0),
      totalOwing: done.reduce((sum, s) => { const p = calcPay(s); return sum + (p ?? 0); }, 0),
      completed: done.length,
    };
  }, [filtered]);

  const openAdd = () => {
    setModalMode('add');
    setSelected(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const openEdit = (s: DirectorShift) => {
    setModalMode('edit');
    setSelected(s);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildTimesheetHtml(filtered.filter(s => s.clockOut), rangeStart, rangeEnd);
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:99999;background:#fff;';
        document.body.appendChild(iframe);
        iframe.contentDocument!.open(); iframe.contentDocument!.write(html); iframe.contentDocument!.close();
        setTimeout(() => { iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1500); }, 400);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Timesheets', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('File Saved', `Saved to: ${uri}`);
      }
    } catch (e: unknown) {
      Alert.alert('Export Error', getErrorMessage(e, 'Could not generate timesheet.'));
    } finally { setExporting(false); }
  };

  return (
    <DirectorStandaloneScreen
      title="Timesheets"
      headerRight={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {activeTab === 'timesheets' && !isManager && filtered.filter(s => s.clockOut).length > 0 && (
            <Pressable onPress={handleExport} disabled={exporting}
              style={[sc.exportBtn, { opacity: exporting ? 0.6 : 1 }]}>
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={13} color="#fff" /><Text style={sc.exportBtnText}>Export</Text></>}
            </Pressable>
          )}
          {(activeTab === 'roster' || activeTab === 'timesheets') && (
            <Pressable onPress={openAdd} style={sc.addBtn}>
              <Feather name="plus" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      }
    >
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <TimesheetTabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Roster tab ──────────────────────────────────────────────────── */}
      {activeTab === 'roster' && (
        <RosterTab onAddShift={openAdd} />
      )}

      {/* ── Pay Run tab ─────────────────────────────────────────────────── */}
      {activeTab === 'payrun' && (
        <PayRunTab
          payrollSummary={payrollSummary}
          rangeShifts={rangeShifts}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          isManager={isManager}
          appliedRange={appliedRange}
          onApplyRange={k => { setAppliedRange(k); setPersonFilter('all'); setCustomFrom(null); setCustomTo(null); }}
        />
      )}

      {/* ── Timesheets tab ───────────────────────────────────────────────── */}
      {activeTab === 'timesheets' && (
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <View style={[sc.topBar, { paddingTop: 8 }]}>
          <View style={sc.locationPill}>
            <Feather name="map-pin" size={12} color={MUTED} />
            <Text style={sc.locationText}>Butterfield</Text>
          </View>
          <DateRangeDropdown
            value={appliedRange}
            customFrom={customFrom}
            customTo={customTo}
            panelOpen={panelOpen}
            onSelectPreset={k => {
              setAppliedRange(k);
              setPersonFilter('all');
              setCustomFrom(null);
              setCustomTo(null);
              setPanelOpen(false);
              Haptics.selectionAsync();
            }}
            onOpenCustom={() => {
              setDraftFrom(customFrom);
              setDraftTo(customTo);
              setPanelOpen(true);
              Haptics.selectionAsync();
            }}
          />
        </View>

        {/* ── Custom date-range panel ──────────────────────────────────────── */}
        {panelOpen && (
          <View style={sc.customPanel}>
            <View style={sc.customPanelRow}>
              {/* From calendar */}
              <View style={sc.customCalCol}>
                <Text style={sc.customCalLabel}>FROM</Text>
                <InlineCalendarPicker
                  selectedDate={draftFrom}
                  onSelectDate={d => {
                    setDraftFrom(d);
                    if (draftTo && d > draftTo) setDraftTo(null);
                    Haptics.selectionAsync();
                  }}
                  accentColor={BLUE}
                  maxDate={draftTo ?? undefined}
                />
              </View>
              <View style={sc.customPanelDivider} />
              {/* To calendar */}
              <View style={sc.customCalCol}>
                <Text style={sc.customCalLabel}>TO</Text>
                <InlineCalendarPicker
                  selectedDate={draftTo}
                  onSelectDate={d => { setDraftTo(d); Haptics.selectionAsync(); }}
                  accentColor={BLUE}
                  minDate={draftFrom ?? undefined}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setPanelOpen(false)}
                style={[sc.customApplyBtn, { flex: 1, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: BORDER }]}>
                <Text style={[sc.customApplyBtnText, { color: TEXT }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!draftFrom || !draftTo) return;
                  setAppliedRange('custom');
                  setCustomFrom(draftFrom);
                  setCustomTo(draftTo);
                  setPersonFilter('all');
                  setPanelOpen(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
                disabled={!draftFrom || !draftTo}
                style={[sc.customApplyBtn, { flex: 2 }, (!draftFrom || !draftTo) && { opacity: 0.4 }]}>
              <Text style={sc.customApplyBtnText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Status filter chips ──────────────────────────────────────────── */}
        <View style={sc.chipRow}>
          {(['all', 'pending', 'approved'] as const).map(s => (
            <Pressable key={s} onPress={() => { setStatusFilter(s); Haptics.selectionAsync(); }}
              style={[sc.chip,
                s === 'all'      && statusFilter === s && { backgroundColor: TEXT,  borderColor: TEXT },
                s === 'pending'  && statusFilter === s && { backgroundColor: AMBER, borderColor: AMBER },
                s === 'approved' && statusFilter === s && { backgroundColor: GREEN, borderColor: GREEN },
                statusFilter !== s && { backgroundColor: CARD },
              ]}>
              <Text style={[sc.chipText, statusFilter === s && { color: '#fff' }]}>
                {s === 'all' ? 'All' : s === 'pending' ? 'Pending' : 'Approved'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          {/* ── Summary strip ────────────────────────────────────────────────── */}
          <View style={sc.summaryRow}>
            <View style={sc.summaryCard}>
              <Text style={sc.summaryLabel}>HOURS</Text>
              <Text style={sc.summaryValue}>{formatHours(stats.totalHrs)}</Text>
            </View>
            {!isManager && (
              <View style={sc.summaryCard}>
                <Text style={sc.summaryLabel}>OWING</Text>
                <Text style={[sc.summaryValue, { color: BLUE }]}>{fmtAUD(stats.totalOwing)}</Text>
              </View>
            )}
            <View style={sc.summaryCard}>
              <Text style={sc.summaryLabel}>SHIFTS</Text>
              <Text style={sc.summaryValue}>{stats.completed}</Text>
            </View>
          </View>

          {/* ── Person filter pills ──────────────────────────────────────────── */}
          {people.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              <Pressable onPress={() => { setPersonFilter('all'); Haptics.selectionAsync(); }}
                style={[sc.personPill, personFilter === 'all' && { backgroundColor: '#000', borderColor: '#000' }]}>
                <Text style={[sc.personPillText, { color: personFilter === 'all' ? '#fff' : TEXT }]}>All</Text>
              </Pressable>
              {people.map(p => {
                const active = personFilter === p.id;
                return (
                  <Pressable key={p.id} onPress={() => { setPersonFilter(p.id); Haptics.selectionAsync(); }}
                    style={[sc.personPill, active && { backgroundColor: '#000', borderColor: '#000' }]}>
                    <Text style={[sc.personPillText, { color: active ? '#fff' : TEXT }]}>{p.name.split(' ')[0]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* ── Payroll summary (director only, all-people view) ─────────────── */}
          {!isManager && personFilter === 'all' && statusFilter === 'all' && payrollSummary.length > 0 && (
            <PayrollCard summaries={payrollSummary} />
          )}

          {/* ── Loading / empty ──────────────────────────────────────────────── */}
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : sections.length === 0 ? (
            <View style={sc.empty}>
              <Feather name="clock" size={36} color={BORDER} />
              <Text style={sc.emptyTitle}>No shifts found</Text>
              <Text style={sc.emptySub}>Try a different date range or filter.</Text>
            </View>
          ) : (
            sections.map((section, si) => (
              <View key={section.key} style={{ gap: 8 }}>
                {/* Section header */}
                <View style={sc.sectionHeader}>
                  <Text style={sc.sectionDate}>{section.label}</Text>
                  {section.totalHrs > 0 && (
                    <View style={sc.sectionHrsBadge}>
                      <Text style={sc.sectionHrsText}>{formatHours(section.totalHrs)}</Text>
                    </View>
                  )}
                </View>
                {/* Shift cards */}
                {section.shifts.map(shift => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    isManager={isManager}
                    onPress={() => openEdit(shift)}
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>
      )}

      <TimesheetModal
        mode={modalMode}
        shift={selected}
        staffList={staffList}
        isManager={isManager}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setSelected(null); }}
        onSaved={() => { setModalVisible(false); setSelected(null); }}
      />
    </DirectorStandaloneScreen>
  );
}

// ── Shift Card ─────────────────────────────────────────────────────────────────
function ShiftCard({ shift, isManager, onPress }: {
  shift: DirectorShift; isManager: boolean; onPress: () => void;
}) {
  const isApproved = !!shift.approvedAt;
  const isActive   = !shift.clockOut;
  const hrs        = parseHoursWorked(shift.hoursWorked);
  const brk        = shift.unpaidBreakMins ?? 0;

  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [sc.shiftCard, pressed && { opacity: 0.75 }]}>
      {/* Left accent line */}
      <View style={[sc.shiftAccent, {
        backgroundColor: isActive ? GREEN : isApproved ? GREEN : AMBER,
      }]} />

      <View style={{ flex: 1, padding: 12, gap: 8 }}>
        {/* Row 1: Avatar + Name + status badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[sc.avatar, {
            backgroundColor: isActive ? '#EBF8FF' : isApproved ? '#DCFCE7' : '#F9FAFB',
          }]}>
            <Text style={[sc.avatarText, {
              color: isActive ? BLUE : isApproved ? GREEN : MUTED,
            }]}>{initials(shift.name ?? '?')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={sc.shiftName}>{shift.name ?? 'Unknown'}</Text>
            {shift.position && (
              <Text style={[sc.shiftRole, { color: MUTED }]}>{capitalize(shift.position)}, Butterfield</Text>
            )}
          </View>
          {isActive ? (
            <View style={[sc.badge, { backgroundColor: '#E0F2FE', borderColor: BLUE }]}>
              <View style={sc.liveDot} />
              <Text style={[sc.badgeText, { color: BLUE }]}>Live</Text>
            </View>
          ) : isApproved ? (
            <View style={[sc.badge, { backgroundColor: '#DCFCE7', borderColor: GREEN }]}>
              <Feather name="check" size={10} color={GREEN} />
              <Text style={[sc.badgeText, { color: GREEN }]}>Approved</Text>
            </View>
          ) : (
            <View style={[sc.badge, { backgroundColor: '#FFF7ED', borderColor: AMBER }]}>
              <Text style={[sc.badgeText, { color: AMBER }]}>Pending</Text>
            </View>
          )}
        </View>

        {/* Row 2: Time range + hours */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={sc.timeText}>{fmtTimeShort(shift.clockIn)}</Text>
            <Text style={{ color: MUTED, fontSize: 13 }}>→</Text>
            <Text style={[sc.timeText, { color: isActive ? GREEN : TEXT }]}>
              {isActive ? 'Active' : shift.clockOut ? fmtTimeShort(shift.clockOut) : '—'}
            </Text>
            {brk > 0 && (
              <Text style={[sc.breakNote, { color: MUTED }]}> · {brk}m break</Text>
            )}
          </View>
          {!isActive && hrs > 0 && (
            <Text style={sc.durationText}>{formatHours(hrs)}</Text>
          )}
        </View>

        {/* Row 3: Pay (director only) */}
        {!isManager && !isActive && shift.hourlyRateCents != null && (
          <View style={sc.payRow}>
            <Feather name="dollar-sign" size={11} color={MUTED} />
            <Text style={[sc.payText, { color: MUTED }]}>
              ${(shift.hourlyRateCents / 100).toFixed(2)}/hr · {fmtAUD(Math.round(hrs * shift.hourlyRateCents))} owing
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Payroll Card ───────────────────────────────────────────────────────────────
function PayrollCard({ summaries }: { summaries: StaffPaySummary[] }) {
  if (summaries.length === 0) return null;
  const totalPay   = summaries.reduce((a, s) => a + s.totalPayCents, 0);
  const totalHours = summaries.reduce((a, s) => a + s.totalHours, 0);
  const pending    = summaries.reduce((a, s) => a + s.pendingShifts, 0);
  return (
    <View style={py.card}>
      <View style={py.header}>
        <View style={{ flex: 1 }}>
          <Text style={py.title}>Payroll Summary</Text>
          <Text style={[py.sub, { color: MUTED }]}>
            {totalHours.toFixed(1)}h · {summaries.length} staff
            {pending > 0 ? ` · ${pending} pending` : ''}
          </Text>
        </View>
        <Text style={[py.total, { color: TEXT }]}>{fmtAUD(totalPay)}</Text>
      </View>
      {summaries.map((s, i) => (
        <View key={s.userId} style={[py.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
          <View style={[py.avatar, { backgroundColor: s.pendingShifts > 0 ? '#FFF7ED' : '#DCFCE7' }]}>
            <Text style={[py.avatarText, { color: s.pendingShifts > 0 ? AMBER : GREEN }]}>{initials(s.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={py.name}>{s.name}</Text>
            <Text style={[py.pos, { color: MUTED }]}>
              {capitalize(s.position)} · {s.totalHours.toFixed(1)}h
              {s.pendingShifts > 0 && <Text style={{ color: AMBER }}> · {s.pendingShifts} pending</Text>}
            </Text>
          </View>
          {s.hasRate
            ? <Text style={[py.amt, { color: s.pendingShifts > 0 ? AMBER : GREEN }]}>{fmtAUD(s.totalPayCents)}</Text>
            : <Text style={[py.noRate, { color: MUTED }]}>No rate</Text>}
        </View>
      ))}
      {pending > 0 && (
        <View style={[py.warn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Feather name="alert-circle" size={13} color={AMBER} />
          <Text style={[py.warnText, { color: '#92400E' }]}>Approve all shifts before processing payroll</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  locationPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: BORDER },
  locationText:  { fontSize: 13, fontWeight: '600', color: TEXT },
  chipRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  chipText:      { fontSize: 13, fontWeight: '600', color: TEXT },
  summaryRow:    { flexDirection: 'row', gap: 10 },
  summaryCard:   { flex: 1, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 4, backgroundColor: CARD, borderColor: BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  summaryLabel:  { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, color: MUTED },
  summaryValue:  { fontSize: 18, fontWeight: '700', color: TEXT },
  personPill:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  personPillText:{ fontSize: 13, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, marginTop: 4 },
  sectionDate:   { fontSize: 14, fontWeight: '700', color: TEXT, flex: 1 },
  sectionHrsBadge:{ backgroundColor: BG, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sectionHrsText:{ fontSize: 12, fontWeight: '600', color: MUTED },
  empty:         { alignItems: 'center', gap: 10, padding: 40, borderRadius: 16, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: TEXT },
  emptySub:      { fontSize: 13, color: MUTED, textAlign: 'center' },
  // Shift card
  shiftCard:     { flexDirection: 'row', backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  shiftAccent:   { width: 4, flexShrink: 0 },
  avatar:        { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 13, fontWeight: '700' },
  shiftName:     { fontSize: 15, fontWeight: '600', color: TEXT },
  shiftRole:     { fontSize: 12, marginTop: 1 },
  badge:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText:     { fontSize: 11, fontWeight: '600' },
  liveDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE },
  timeText:      { fontSize: 14, fontWeight: '600', color: TEXT },
  breakNote:     { fontSize: 12 },
  durationText:  { fontSize: 14, fontWeight: '700', color: TEXT },
  payRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  payText:       { fontSize: 11 },
  // Header buttons
  exportBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  exportBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  addBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  // Custom date-range panel
  customPanel:      { marginHorizontal: 16, marginBottom: 12, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 12, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  customPanelRow:   { flexDirection: 'row', gap: 0 },
  customCalCol:     { flex: 1 },
  customCalLabel:   { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: MUTED, paddingHorizontal: 4, marginBottom: 6 },
  customPanelDivider: { width: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginHorizontal: 8 },
  customApplyBtn:   { backgroundColor: BLUE, borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  customApplyBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});

const py = StyleSheet.create({
  card:      { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 0 },
  header:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title:     { fontSize: 15, fontWeight: '700', color: TEXT },
  sub:       { fontSize: 12, marginTop: 2 },
  total:     { fontSize: 18, fontWeight: '700' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:{ fontSize: 13, fontWeight: '700' },
  name:      { fontSize: 14, fontWeight: '600', color: TEXT },
  pos:       { fontSize: 12, marginTop: 1 },
  amt:       { fontSize: 15, fontWeight: '700' },
  noRate:    { fontSize: 13, fontWeight: '500' },
  warn:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  warnText:  { flex: 1, fontSize: 12, fontWeight: '500' },
});
