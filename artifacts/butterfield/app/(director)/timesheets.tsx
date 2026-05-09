import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as WebBrowser from 'expo-web-browser';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorShift } from '@/lib/api';

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
function fmtTime(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
function fmtDateGroup(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}
function toDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatHours(hrs: number): string {
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function calcPay(s: DirectorShift): number | null {
  if (!s.clockOut || !s.hourlyRateCents) return null;
  const hrs = s.hoursWorked ? parseFloat(s.hoursWorked) : 0;
  return Math.round(hrs * s.hourlyRateCents);
}
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function applyHHMM(base: string, hhmm: string): string | null {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const d = new Date(base);
  d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
  return d.toISOString();
}
function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ── Payroll summary per staff member ─────────────────────────────────────────
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
      map.set(s.userId, { userId: s.userId, name: s.name ?? 'Unknown', position: s.position ?? 'Staff',
        approvedShifts: 0, pendingShifts: 0, totalHours: 0, totalPayCents: 0, hasRate: false });
    }
    const entry = map.get(s.userId)!;
    const hrs = s.hoursWorked ? parseFloat(s.hoursWorked) : 0;
    const pay = calcPay(s);
    entry.totalHours += hrs;
    if (s.hourlyRateCents) entry.hasRate = true;
    if (pay != null) entry.totalPayCents += pay;
    if (s.approvedAt) entry.approvedShifts++; else entry.pendingShifts++;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildTimesheetHtml(shifts: DirectorShift[], from: Date, to: Date): string {
  const rows = shifts.map(s => {
    const hrs = s.hoursWorked ? parseFloat(s.hoursWorked) : 0;
    const pay = calcPay(s);
    const dateStr = new Date(s.clockIn).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<tr>
      <td>${s.name ?? ''}</td>
      <td>${dateStr}</td>
      <td>${fmtTime(s.clockIn)}</td>
      <td>${s.clockOut ? fmtTime(s.clockOut) : '—'}</td>
      <td>${s.unpaidBreakMins ? `${s.unpaidBreakMins}m` : '—'}</td>
      <td>${formatHours(hrs)}</td>
      <td>${pay != null ? fmtAUD(pay) : '—'}</td>
    </tr>`;
  }).join('');
  const totalHrs = shifts.reduce((a, s) => a + (s.hoursWorked ? parseFloat(s.hoursWorked) : 0), 0);
  const totalPay = shifts.reduce((a, s) => { const p = calcPay(s); return a + (p ?? 0); }, 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; margin: 40px; color: #1C1C1E; }
    h1 { color: #1A2B4A; font-size: 24px; margin-bottom: 4px; }
    .sub { color: #8E8E93; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1A2B4A; color: white; padding: 10px 12px; text-align: left; font-size: 11px; letter-spacing: 0.5px; }
    td { padding: 10px 12px; border-bottom: 1px solid #E5E7EB; }
    tr:last-child td { border-bottom: none; }
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
  <div class="footer">Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} · Butterfield Cookies Pty Ltd</div>
  </body></html>`;
}

// ── Edit / Approve Modal ───────────────────────────────────────────────────────
function ShiftModal({ shift, visible, onClose, onSaved }: {
  shift: DirectorShift | null; visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [inTime,  setInTime]  = useState('');
  const [outTime, setOutTime] = useState('');
  const [brk,     setBrk]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState<'details' | 'edit'>('details');

  React.useEffect(() => {
    if (shift) {
      setInTime(isoToHHMM(shift.clockIn));
      setOutTime(shift.clockOut ? isoToHHMM(shift.clockOut) : '');
      setBrk(String(shift.unpaidBreakMins ?? 0));
      setTab('details');
    }
  }, [shift]);

  const approve = useMutation({
    mutationFn: (a: boolean) => api.director.updateShift(shift!.id, { approve: a }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['director-timesheets'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleSaveEdit = async () => {
    if (!shift) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const newIn  = applyHHMM(shift.clockIn, inTime);
      const newOut = outTime.trim() ? applyHHMM(shift.clockIn, outTime) : null;
      const brkMin = parseInt(brk) || 0;
      if (!newIn) { Alert.alert('Invalid time', 'Clock-in time must be in HH:MM format.'); return; }
      if (outTime.trim() && !newOut) { Alert.alert('Invalid time', 'Clock-out time must be in HH:MM format.'); return; }
      await api.director.updateShift(shift.id, { clockIn: newIn, clockOut: newOut, unpaidBreakMins: brkMin });
      qc.invalidateQueries({ queryKey: ['director-timesheets'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  if (!shift) return null;
  const isApproved = !!shift.approvedAt;
  const hrs = shift.hoursWorked ? parseFloat(shift.hoursWorked) : null;
  const pay = calcPay(shift);
  const active = !shift.clockOut;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[sm.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={sm.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={sm.title}>{shift.name ?? 'Unknown'}</Text>
            <Text style={[sm.subtitle, { color: MUTED }]}>{capitalize(shift.position ?? 'Staff')}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={[sm.subTabBar, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
          {(['details', 'edit'] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[sm.subTab, tab === t && { borderBottomColor: BLUE }]}>
              <Text style={[sm.subTabText, { color: tab === t ? BLUE : MUTED }]}>
                {t === 'details' ? 'Details' : 'Edit Times'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {tab === 'details' ? (
            <>
              <View style={[sm.statusBanner, { backgroundColor: active ? '#EBF8FF' : isApproved ? '#DCFCE7' : '#FFF7ED', borderColor: active ? BLUE : isApproved ? GREEN : AMBER }]}>
                <Feather name={active ? 'zap' : isApproved ? 'check-circle' : 'clock'} size={16} color={active ? BLUE : isApproved ? GREEN : AMBER} />
                <Text style={[sm.statusBannerText, { color: active ? BLUE : isApproved ? GREEN : AMBER }]}>
                  {active ? 'Currently clocked in' : isApproved ? 'Approved' : 'Pending approval'}
                </Text>
              </View>
              <View style={sm.card}>
                <Text style={sm.sectionLabel}>SHIFT DETAILS</Text>
                {[
                  { label: 'Clock In',      value: new Date(shift.clockIn).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                  { label: 'Clock Out',     value: shift.clockOut ? new Date(shift.clockOut).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Active' },
                  { label: 'Break',         value: `${shift.unpaidBreakMins ?? 0} min unpaid` },
                  { label: 'Hours Worked',  value: active ? '—' : hrs ? `${hrs.toFixed(2)} hrs` : '—' },
                  { label: 'Owing',         value: pay ? fmtAUD(pay) : (shift.hourlyRateCents ? fmtAUD(0) : 'No rate set') },
                  ...(isApproved ? [{ label: 'Approved', value: new Date(shift.approvedAt!).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }] : []),
                ].map(row => (
                  <View key={row.label} style={sm.infoRow}>
                    <Text style={sm.infoLabel}>{row.label}</Text>
                    <Text style={sm.infoValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
              {!active && (
                <View style={sm.card}>
                  <Text style={sm.sectionLabel}>APPROVAL</Text>
                  <Text style={[sm.approvalHint, { color: MUTED }]}>
                    {isApproved ? 'This shift has been approved. You can revoke if a correction is needed.' : 'Review and approve this shift to confirm hours for payroll.'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(true); }}
                      disabled={approve.isPending}
                      style={[sm.actionBtn, { backgroundColor: isApproved ? '#DCFCE7' : BG, borderColor: isApproved ? GREEN : BORDER, flex: 1 }]}>
                      {approve.isPending && !isApproved
                        ? <ActivityIndicator size="small" color={GREEN} />
                        : <><Feather name="check" size={15} color={GREEN} /><Text style={[sm.actionBtnText, { color: GREEN }]}>Approve</Text></>}
                    </Pressable>
                    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(false); }}
                      disabled={approve.isPending}
                      style={[sm.actionBtn, { backgroundColor: !isApproved ? '#FFF7ED' : BG, borderColor: !isApproved ? AMBER : BORDER, flex: 1 }]}>
                      {approve.isPending && isApproved
                        ? <ActivityIndicator size="small" color={AMBER} />
                        : <><Feather name="rotate-ccw" size={15} color={AMBER} /><Text style={[sm.actionBtnText, { color: AMBER }]}>Unapprove</Text></>}
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={sm.card}>
                <Text style={sm.sectionLabel}>CLOCK TIMES</Text>
                <Text style={[sm.approvalHint, { color: MUTED, marginBottom: 14 }]}>
                  Enter times in 24-hour format (HH:MM). Times apply to the same calendar day as the original clock-in.
                </Text>
                {[
                  { label: 'Clock In',  icon: 'log-in',  val: inTime,  set: setInTime,  ph: '09:00' },
                  { label: 'Clock Out', icon: 'log-out', val: outTime, set: setOutTime, ph: '17:00' },
                ].map((f, i) => (
                  <View key={f.label} style={i > 0 ? { marginTop: 12 } : {}}>
                    <Text style={sm.fieldLabel}>{f.label}</Text>
                    <View style={[sm.inputRow, { borderColor: BORDER }]}>
                      <Feather name={f.icon as any} size={15} color={MUTED} />
                      <TextInput style={[sm.input, { color: TEXT }]} value={f.val} onChangeText={f.set}
                        placeholder={f.ph} placeholderTextColor={MUTED} keyboardType="numbers-and-punctuation" />
                    </View>
                  </View>
                ))}
                <Text style={[sm.fieldLabel, { marginTop: 12 }]}>Unpaid Break (minutes)</Text>
                <View style={[sm.inputRow, { borderColor: BORDER }]}>
                  <Feather name="coffee" size={15} color={MUTED} />
                  <TextInput style={[sm.input, { color: TEXT }]} value={brk} onChangeText={setBrk}
                    placeholder="30" placeholderTextColor={MUTED} keyboardType="number-pad" />
                </View>
              </View>
              <Pressable onPress={handleSaveEdit} disabled={saving}
                style={[sm.saveBtn, { opacity: saving ? 0.8 : 1, backgroundColor: NAVY }]}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sm.saveBtnText}>Save Changes</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Payroll Summary Card ───────────────────────────────────────────────────────
function PayrollSummaryCard({ summaries, weekLabel }: { summaries: StaffPaySummary[]; weekLabel: string }) {
  if (summaries.length === 0) return null;
  const totalPay   = summaries.reduce((a, s) => a + s.totalPayCents, 0);
  const totalHours = summaries.reduce((a, s) => a + s.totalHours, 0);
  const pending    = summaries.reduce((a, s) => a + s.pendingShifts, 0);

  return (
    <View style={[pay.card, { backgroundColor: CARD, borderColor: BORDER }]}>
      <View style={pay.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={pay.title}>Payroll — {weekLabel}</Text>
          <Text style={[pay.sub, { color: MUTED }]}>
            {totalHours.toFixed(1)} total hrs · {summaries.length} staff
            {pending > 0 ? ` · ${pending} shift${pending !== 1 ? 's' : ''} pending` : ''}
          </Text>
        </View>
        <View style={[pay.totalBadge, { backgroundColor: NAVY + '12' }]}>
          <Text style={[pay.totalAmt, { color: NAVY }]}>{fmtAUD(totalPay)}</Text>
        </View>
      </View>
      {summaries.map((s, i) => (
        <View key={s.userId} style={[pay.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
          <View style={[pay.avatar, { backgroundColor: s.pendingShifts > 0 ? '#FFF7ED' : '#DCFCE7' }]}>
            <Text style={[pay.avatarText, { color: s.pendingShifts > 0 ? AMBER : GREEN }]}>{initials(s.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pay.name}>{s.name}</Text>
            <Text style={[pay.pos, { color: MUTED }]}>
              {s.position} · {s.totalHours.toFixed(1)}h
              {s.pendingShifts > 0 && <Text style={{ color: AMBER }}> · {s.pendingShifts} pending</Text>}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {s.hasRate
              ? <Text style={[pay.amt, { color: s.pendingShifts > 0 ? AMBER : GREEN }]}>{fmtAUD(s.totalPayCents)}</Text>
              : <Text style={[pay.noRate, { color: MUTED }]}>No rate</Text>}
            <Text style={[pay.shifts, { color: MUTED }]}>
              {s.approvedShifts + s.pendingShifts} shift{s.approvedShifts + s.pendingShifts !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      ))}
      {pending > 0 && (
        <View style={[pay.warning, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Feather name="alert-circle" size={13} color={AMBER} />
          <Text style={[pay.warningText, { color: '#92400E' }]}>Approve all shifts before processing payroll</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function DirectorTimesheetsScreen() {
  const insets = useSafeAreaInsets();
  const [weekOffset,    setWeekOffset]    = useState(0);
  const [personFilter,  setPersonFilter]  = useState<string>('all');
  const [selected,      setSelected]      = useState<DirectorShift | null>(null);
  const [modalVisible,  setModalVisible]  = useState(false);
  const [exporting,     setExporting]     = useState(false);

  const weekStart = getWeekStart(addWeeks(new Date(), weekOffset));
  const weekEnd   = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const isCurrentWeek = weekOffset === 0;
  const weekLabel = isCurrentWeek
    ? 'This Week'
    : weekOffset === -1
    ? 'Last Week'
    : `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['director-timesheets'],
    queryFn: () => api.director.timesheets(),
    staleTime: 30_000,
  });

  const allShifts: DirectorShift[] = data?.data ?? [];

  const weekShifts = useMemo(() => allShifts.filter(s => {
    const d = new Date(s.clockIn);
    return d >= weekStart && d <= weekEnd;
  }), [allShifts, weekStart.toISOString()]);

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    weekShifts.forEach(s => { if (s.userId && s.name) seen.set(s.userId, s.name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [weekShifts]);

  const filtered = useMemo(() =>
    personFilter === 'all' ? weekShifts : weekShifts.filter(s => s.userId === personFilter),
    [weekShifts, personFilter]
  );

  const sections = useMemo(() => {
    const map = new Map<string, { label: string; shifts: DirectorShift[] }>();
    filtered.forEach(s => {
      const key = toDateKey(s.clockIn);
      if (!map.has(key)) map.set(key, { label: fmtDateGroup(s.clockIn), shifts: [] });
      map.get(key)!.shifts.push(s);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([, v]) => v);
  }, [filtered]);

  const payrollSummary = useMemo(() => buildPayrollSummary(weekShifts), [weekShifts]);

  const stats = useMemo(() => {
    const done = filtered.filter(s => s.clockOut);
    const totalHrs = done.reduce((sum, s) => sum + (s.hoursWorked ? parseFloat(s.hoursWorked) : 0), 0);
    const totalOwingCents = done.reduce((sum, s) => { const p = calcPay(s); return sum + (p ?? 0); }, 0);
    return { completed: done.length, totalHrs, totalOwingCents };
  }, [filtered]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html = buildTimesheetHtml(filtered.filter(s => s.clockOut), weekStart, weekEnd);
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 300); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await WebBrowser.openBrowserAsync(uri);
    } catch (e: any) {
      Alert.alert('Export Error', e.message ?? 'Could not generate timesheet.');
    } finally { setExporting(false); }
  };

  const openShift = (s: DirectorShift) => {
    setSelected(s); setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Timesheet</Text>
            <Pressable
              onPress={handleExport}
              disabled={exporting || filtered.filter(s => s.clockOut).length === 0}
              style={[styles.exportBtn, { backgroundColor: BLUE, opacity: filtered.filter(s => s.clockOut).length === 0 ? 0.4 : 1 }]}
            >
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={14} color="#fff" /><Text style={styles.exportBtnText}>Export</Text></>}
            </Pressable>
          </View>

          {/* Week navigator */}
          <View style={[styles.weekNav, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Pressable onPress={() => { setWeekOffset(o => o - 1); setPersonFilter('all'); }} style={styles.weekNavBtn}>
              <Feather name="chevron-left" size={20} color={TEXT} />
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={[styles.weekLabel, { color: TEXT }]}>{weekLabel}</Text>
              <Text style={[styles.weekSub, { color: MUTED }]}>{weekStart.getFullYear()}</Text>
            </View>
            <Pressable
              onPress={() => { setWeekOffset(o => Math.min(0, o + 1)); setPersonFilter('all'); }}
              style={[styles.weekNavBtn, { opacity: weekOffset >= 0 ? 0.3 : 1 }]}
              disabled={weekOffset >= 0}
            >
              <Feather name="chevron-right" size={20} color={TEXT} />
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14 }}>

          {/* ── 3 Summary cards ─────────────────────────────────────────────── */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>HOURS WORKED</Text>
              <Text style={[styles.summaryValue, { color: TEXT }]}>{formatHours(stats.totalHrs)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>OWING</Text>
              <Text style={[styles.summaryValue, { color: BLUE }]}>{fmtAUD(stats.totalOwingCents)}</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.summaryLabel, { color: MUTED }]}>SHIFTS</Text>
              <Text style={[styles.summaryValue, { color: TEXT }]}>{stats.completed}</Text>
            </View>
          </View>

          {/* ── Staff filter pills ───────────────────────────────────────────── */}
          {people.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.sectionTitle, { color: MUTED }]}>STAFF MEMBER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                <Pressable
                  onPress={() => { setPersonFilter('all'); Haptics.selectionAsync(); }}
                  style={[styles.staffPill, personFilter === 'all' && { backgroundColor: BLUE, borderColor: BLUE }]}
                >
                  <Text style={[styles.staffPillText, { color: personFilter === 'all' ? '#fff' : TEXT }]}>All Staff</Text>
                </Pressable>
                {people.map(p => {
                  const isActive = personFilter === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => { setPersonFilter(p.id); Haptics.selectionAsync(); }}
                      style={[styles.staffPill, isActive && { backgroundColor: BLUE, borderColor: BLUE }]}>
                      <Text style={[styles.staffPillText, { color: isActive ? '#fff' : TEXT }]}>{p.name.split(' ')[0]}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Payroll summary card ─────────────────────────────────────────── */}
          {personFilter === 'all' && payrollSummary.length > 0 && (
            <PayrollSummaryCard summaries={payrollSummary} weekLabel={weekLabel} />
          )}

          {/* ── Loading / empty ──────────────────────────────────────────────── */}
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : sections.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Feather name="clock" size={32} color={BORDER} />
              <Text style={[styles.emptyTitle, { color: TEXT }]}>No shifts this week</Text>
              <Text style={[styles.emptySub, { color: MUTED }]}>No shifts were recorded for this period.</Text>
            </View>
          ) : (
            /* ── Shifts grouped by day ──────────────────────────────────────── */
            sections.map((section, si) => {
              const d = new Date(section.shifts[0].clockIn);
              const dayName = DAY_NAMES[d.getDay()];
              const dateStr = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
              const isToday = new Date().toDateString() === d.toDateString();

              return (
                <View key={si} style={{ gap: 8 }}>
                  <View style={styles.dayHeader}>
                    <Text style={[styles.dayName, { color: isToday ? BLUE : TEXT }]}>{dayName}</Text>
                    <Text style={[styles.dayDate, { color: isToday ? BLUE : MUTED }]}>{dateStr}</Text>
                    {isToday && (
                      <View style={[styles.todayBadge, { backgroundColor: BLUE }]}>
                        <Text style={styles.todayBadgeText}>Today</Text>
                      </View>
                    )}
                  </View>

                  {section.shifts.map(shift => {
                    const isActive   = !shift.clockOut;
                    const isApproved = !!shift.approvedAt;
                    const hrs  = shift.hoursWorked ? parseFloat(shift.hoursWorked) : 0;
                    const p    = calcPay(shift);
                    const brk  = shift.unpaidBreakMins && shift.unpaidBreakMins > 0 ? shift.unpaidBreakMins : null;

                    return (
                      <Pressable
                        key={shift.id}
                        onPress={() => openShift(shift)}
                        style={({ pressed }) => [
                          styles.shiftCard,
                          {
                            backgroundColor: CARD,
                            borderColor: isActive ? '#86EFAC' : BORDER,
                            borderLeftColor: isActive ? '#22C55E' : BLUE,
                            borderLeftWidth: 3,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        {/* Staff name + role */}
                        <View style={styles.shiftStaffRow}>
                          <View style={[styles.shiftAvatar, { backgroundColor: isActive ? '#EBF8FF' : isApproved ? '#DCFCE7' : '#F3F4F6' }]}>
                            <Text style={[styles.shiftAvatarText, { color: isActive ? BLUE : isApproved ? GREEN : MUTED }]}>
                              {initials(shift.name ?? '?')}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.shiftName}>{shift.name ?? 'Unknown'}</Text>
                              {isActive && (
                                <View style={[styles.liveBadge]}>
                                  <View style={[styles.liveDot, { backgroundColor: BLUE }]} />
                                  <Text style={[styles.liveText, { color: BLUE }]}>LIVE</Text>
                                </View>
                              )}
                              {!isActive && isApproved && <Feather name="check-circle" size={13} color={GREEN} />}
                            </View>
                            <Text style={[styles.shiftPos, { color: MUTED }]}>{capitalize(shift.position ?? 'Staff')}</Text>
                          </View>
                        </View>

                        {/* Times row */}
                        <View style={styles.shiftMainRow}>
                          <View style={{ flex: 1 }}>
                            <View style={styles.shiftTimeRow}>
                              <Text style={[styles.shiftTime, { color: TEXT }]}>{fmtTime(shift.clockIn)}</Text>
                              <Text style={[styles.shiftArrow, { color: MUTED }]}>→</Text>
                              <Text style={[styles.shiftTime, { color: isActive ? '#22C55E' : TEXT }]}>
                                {isActive ? 'Active' : shift.clockOut ? fmtTime(shift.clockOut) : '—'}
                              </Text>
                            </View>
                            {brk != null && (
                              <Text style={[styles.breakNote, { color: MUTED }]}>{brk}m unpaid break</Text>
                            )}
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            {!isActive && (
                              <>
                                <Text style={[styles.shiftDuration, { color: TEXT }]}>{formatHours(hrs)}</Text>
                                {p != null && <Text style={[styles.shiftEarnings, { color: BLUE }]}>{fmtAUD(p)}</Text>}
                              </>
                            )}
                            {isActive && (
                              <View style={[styles.activePill, { backgroundColor: '#E8FDF0', borderColor: '#86EFAC' }]}>
                                <View style={[styles.activeDot]} />
                                <Text style={[styles.activePillText, { color: '#15803D' }]}>Live</Text>
                              </View>
                            )}
                            {!isActive && !isApproved && (
                              <View style={[styles.pendingPill, { backgroundColor: '#FFF7ED', borderColor: AMBER }]}>
                                <Text style={[styles.pendingText, { color: AMBER }]}>Review</Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Footer rate row */}
                        {!isActive && shift.hourlyRateCents != null && (
                          <View style={[styles.shiftRateRow, { borderTopColor: BORDER }]}>
                            <Text style={[styles.shiftRateText, { color: MUTED }]}>
                              ${(shift.hourlyRateCents / 100).toFixed(2)}/hr · {formatHours(hrs)} worked
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <ShiftModal
        shift={selected}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setSelected(null); }}
        onSaved={() => { setModalVisible(false); setSelected(null); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header:          { paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:           { fontSize: 28, fontFamily: 'Inter_700Bold', color: TEXT },
  exportBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  exportBtnText:   { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekNav:         { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  weekNavBtn:      { padding: 14 },
  weekLabel:       { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  weekSub:         { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  summaryRow:      { flexDirection: 'row', gap: 10 },
  summaryCard:     { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4 },
  summaryLabel:    { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  summaryValue:    { fontSize: 18, fontFamily: 'Inter_700Bold' },
  sectionTitle:    { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2 },
  staffPill:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  staffPillText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  emptyState:      { alignItems: 'center', gap: 10, padding: 40, borderRadius: 16, borderWidth: 1 },
  emptyTitle:      { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptySub:        { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  dayHeader:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, marginTop: 6 },
  dayName:         { fontSize: 14, fontFamily: 'Inter_700Bold' },
  dayDate:         { fontSize: 13, fontFamily: 'Inter_400Regular' },
  todayBadge:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  todayBadgeText:  { color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  shiftCard:       { borderRadius: 14, padding: 14, borderWidth: 1, gap: 8 },
  shiftStaffRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftAvatar:     { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  shiftAvatarText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  shiftName:       { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: TEXT },
  shiftPos:        { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  shiftMainRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  shiftTimeRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftTime:       { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  shiftArrow:      { fontSize: 14 },
  breakNote:       { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  shiftDuration:   { fontSize: 15, fontFamily: 'Inter_700Bold' },
  shiftEarnings:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  activePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  activeDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  activePillText:  { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  pendingPill:     { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pendingText:     { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  shiftRateRow:    { borderTopWidth: 1, paddingTop: 8 },
  shiftRateText:   { fontSize: 11, fontFamily: 'Inter_400Regular' },
  liveBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF8FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  liveDot:         { width: 5, height: 5, borderRadius: 3 },
  liveText:        { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
});

const sm = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:            { fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT },
  subtitle:         { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  subTabBar:        { flexDirection: 'row', borderBottomWidth: 1 },
  subTab:           { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subTabText:       { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  statusBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  statusBannerText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  card:             { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  sectionLabel:     { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, color: MUTED, marginBottom: 10 },
  infoRow:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:        { color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 },
  infoValue:        { color: TEXT,  fontFamily: 'Inter_500Medium',  fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  approvalHint:     { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  fieldLabel:       { fontSize: 13, fontFamily: 'Inter_500Medium', color: TEXT, marginBottom: 6 },
  inputRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FAFAFA' },
  input:            { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  actionBtnText:    { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  saveBtn:          { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:      { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});

const pay = StyleSheet.create({
  card:        { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, padding: 16, gap: 0 },
  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title:       { fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT },
  sub:         { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  totalBadge:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  totalAmt:    { fontSize: 16, fontFamily: 'Inter_700Bold' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:  { fontSize: 13, fontFamily: 'Inter_700Bold' },
  name:        { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: TEXT },
  pos:         { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  amt:         { fontSize: 15, fontFamily: 'Inter_700Bold' },
  noRate:      { fontSize: 13, fontFamily: 'Inter_500Medium' },
  shifts:      { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  warning:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  warningText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
});
