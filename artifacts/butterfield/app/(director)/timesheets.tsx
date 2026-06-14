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
import { api, type DirectorShift } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { useAuth } from '@/context/AuthContext';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import TimeWheelPicker from '@/components/TimeWheelPicker';

// ── Palette ───────────────────────────────────────────────────────────────────
const BG         = '#EFF6FF';
const CARD       = '#FFFFFF';
const BLUE       = '#1493FF';
const INDIGO     = '#4F46E5';
const NAVY       = '#1A2B4A';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const GREEN      = '#22C55E';
const AMBER      = '#F59E0B';
const GLASS_BG   = 'rgba(255,255,255,0.8)';
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
            <View style={tm.card}>
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

function DateRangeDropdown({ value, customFrom, customTo, onChange }: {
  value: WeekRangeKey;
  customFrom: Date | null;
  customTo: Date | null;
  onChange: (k: WeekRangeKey) => void;
}) {
  const [open, setOpen] = useState(false);

  function triggerLabel(): string {
    if (value === 'custom' && customFrom && customTo) {
      return `${fmtShortDate(customFrom)} – ${fmtShortDate(customTo)}`;
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
              onPress={() => { onChange(r.key); setOpen(false); Haptics.selectionAsync(); }}
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

  const [dateRange,    setDateRange]    = useState<WeekRangeKey>('w0');
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
    if (dateRange === 'custom') {
      const start = customFrom ? new Date(customFrom) : getMondayOfWeek(0);
      start.setHours(0, 0, 0, 0);
      const end = customTo ? new Date(customTo) : getSundayOfWeek(0);
      end.setHours(23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end };
    }
    const weeksAgo = parseInt(dateRange[1]);
    return { rangeStart: getMondayOfWeek(weeksAgo), rangeEnd: getSundayOfWeek(weeksAgo) };
  }, [dateRange, customFrom, customTo]);

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
          {!isManager && filtered.filter(s => s.clockOut).length > 0 && (
            <Pressable onPress={handleExport} disabled={exporting}
              style={[sc.exportBtn, { opacity: exporting ? 0.6 : 1 }]}>
              {exporting
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={13} color="#fff" /><Text style={sc.exportBtnText}>Export</Text></>}
            </Pressable>
          )}
          <Pressable onPress={openAdd} style={sc.addBtn}>
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        </View>
      }
    >
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
            value={dateRange}
            customFrom={customFrom}
            customTo={customTo}
            onChange={k => {
              setDateRange(k);
              setPersonFilter('all');
              if (k !== 'custom') { setCustomFrom(null); setCustomTo(null); }
              if (k === 'custom') { setDraftFrom(customFrom); setDraftTo(customTo); }
            }}
          />
        </View>

        {/* ── Custom date-range panel ──────────────────────────────────────── */}
        {dateRange === 'custom' && (
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
            <Pressable
              onPress={() => {
                if (!draftFrom || !draftTo) return;
                setCustomFrom(draftFrom);
                setCustomTo(draftTo);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              disabled={!draftFrom || !draftTo}
              style={[sc.customApplyBtn, (!draftFrom || !draftTo) && { opacity: 0.4 }]}>
              <Text style={sc.customApplyBtnText}>Apply</Text>
            </Pressable>
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
                style={[sc.personPill, personFilter === 'all' && { backgroundColor: NAVY, borderColor: NAVY }]}>
                <Text style={[sc.personPillText, { color: personFilter === 'all' ? '#fff' : TEXT }]}>All</Text>
              </Pressable>
              {people.map(p => {
                const active = personFilter === p.id;
                return (
                  <Pressable key={p.id} onPress={() => { setPersonFilter(p.id); Haptics.selectionAsync(); }}
                    style={[sc.personPill, active && { backgroundColor: NAVY, borderColor: NAVY }]}>
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
        <Text style={[py.total, { color: NAVY }]}>{fmtAUD(totalPay)}</Text>
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
  locationPill:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GLASS_BG, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: GLASS_BDR },
  locationText:  { fontSize: 13, fontWeight: '600', color: TEXT },
  chipRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  chipText:      { fontSize: 13, fontWeight: '600', color: TEXT },
  summaryRow:    { flexDirection: 'row', gap: 10 },
  summaryCard:   { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4, backgroundColor: GLASS_BG, borderColor: GLASS_BDR, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  summaryLabel:  { fontSize: 9, fontWeight: '600', letterSpacing: 0.8, color: MUTED },
  summaryValue:  { fontSize: 18, fontWeight: '700', color: TEXT },
  personPill:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  personPillText:{ fontSize: 13, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2, marginTop: 4 },
  sectionDate:   { fontSize: 14, fontWeight: '700', color: TEXT, flex: 1 },
  sectionHrsBadge:{ backgroundColor: NAVY + '12', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sectionHrsText:{ fontSize: 12, fontWeight: '600', color: NAVY },
  empty:         { alignItems: 'center', gap: 10, padding: 40, borderRadius: 16, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BDR },
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
