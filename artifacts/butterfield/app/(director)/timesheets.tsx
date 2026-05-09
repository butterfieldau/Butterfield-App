import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
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
const RED    = '#EF4444';
const PURPLE = '#8B5CF6';

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtAUD(cents: number) {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDateGroup(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
}
function toDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// ── Week calculation (Mon–Sun) ─────────────────────────────────────────────────
type WeekOption = { offset: number; label: string; short: string; start: Date; end: Date };

function buildWeekOptions(count = 6): WeekOption[] {
  const now = new Date();
  // Find this Monday (0=Sun → 6 days back, 1=Mon → 0 days, etc.)
  const dow = now.getDay(); // 0=Sun
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(now.getDate() - daysToMon);

  return Array.from({ length: count }, (_, i) => {
    const offset = -i; // 0=this week, -1=last week, etc.
    const start  = new Date(thisMonday);
    start.setDate(thisMonday.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const fmtShort = (d: Date) =>
      d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

    let label: string;
    let short: string;
    if (i === 0) { label = 'This Week'; short = 'This Week'; }
    else if (i === 1) { label = 'Last Week'; short = 'Last Week'; }
    else {
      label = `${fmtShort(start)} – ${fmtShort(end)}`;
      short = fmtShort(start);
    }

    return { offset, label, short, start, end };
  });
}

function filterByWeek(shifts: DirectorShift[], week: WeekOption) {
  return shifts.filter(s => {
    const d = new Date(s.clockIn);
    return d >= week.start && d <= week.end;
  });
}

// ── Payroll summary per staff member for the week ─────────────────────────────
type StaffPaySummary = {
  userId: string;
  name: string;
  position: string;
  approvedShifts: number;
  pendingShifts: number;
  totalHours: number;
  totalPayCents: number;
  hasRate: boolean;
};

function buildPayrollSummary(shifts: DirectorShift[]): StaffPaySummary[] {
  const map = new Map<string, StaffPaySummary>();
  for (const s of shifts) {
    if (!s.clockOut || !s.userId) continue; // skip active shifts
    const key = s.userId;
    if (!map.has(key)) {
      map.set(key, {
        userId: s.userId,
        name: s.name ?? 'Unknown',
        position: s.position ?? 'Staff',
        approvedShifts: 0,
        pendingShifts: 0,
        totalHours: 0,
        totalPayCents: 0,
        hasRate: false,
      });
    }
    const entry = map.get(key)!;
    const hrs = s.hoursWorked ? parseFloat(s.hoursWorked) : 0;
    const pay = calcPay(s);
    entry.totalHours += hrs;
    if (s.hourlyRateCents) entry.hasRate = true;
    if (pay != null) entry.totalPayCents += pay;
    if (s.approvedAt) entry.approvedShifts++;
    else entry.pendingShifts++;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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
  const hrs        = shift.hoursWorked ? parseFloat(shift.hoursWorked).toFixed(2) : null;
  const pay        = calcPay(shift);
  const active     = !shift.clockOut;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[sm.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={sm.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={sm.title}>{shift.name ?? 'Unknown'}</Text>
            <Text style={[sm.subtitle, { color: MUTED }]}>{shift.position ?? 'Staff'}</Text>
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
                  { label: 'Clock In',  value: new Date(shift.clockIn).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                  { label: 'Clock Out', value: shift.clockOut ? new Date(shift.clockOut).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Active' },
                  { label: 'Break',     value: `${shift.unpaidBreakMins ?? 0} min unpaid` },
                  { label: 'Hours',     value: active ? '—' : hrs ? `${hrs} hrs` : '—' },
                  { label: 'Est. Pay',  value: pay ? fmtAUD(pay) : (shift.hourlyRateCents ? fmtAUD(0) : 'No rate set') },
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
                    {isApproved
                      ? 'This shift has been approved. You can revoke approval if a correction is needed.'
                      : 'Review and approve this shift to confirm hours for payroll.'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <Pressable
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(true); }}
                      disabled={approve.isPending}
                      style={[sm.actionBtn, { backgroundColor: isApproved ? '#DCFCE7' : BG, borderColor: isApproved ? GREEN : BORDER, flex: 1 }]}
                    >
                      {approve.isPending && !isApproved
                        ? <ActivityIndicator size="small" color={GREEN} />
                        : <><Feather name="check" size={15} color={GREEN} /><Text style={[sm.actionBtnText, { color: GREEN }]}>Approve</Text></>
                      }
                    </Pressable>
                    <Pressable
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); approve.mutate(false); }}
                      disabled={approve.isPending}
                      style={[sm.actionBtn, { backgroundColor: !isApproved ? '#FFF7ED' : BG, borderColor: !isApproved ? AMBER : BORDER, flex: 1 }]}
                    >
                      {approve.isPending && isApproved
                        ? <ActivityIndicator size="small" color={AMBER} />
                        : <><Feather name="rotate-ccw" size={15} color={AMBER} /><Text style={[sm.actionBtnText, { color: AMBER }]}>Unapprove</Text></>
                      }
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
                      <TextInput
                        style={[sm.input, { color: TEXT }]}
                        value={f.val}
                        onChangeText={f.set}
                        placeholder={f.ph}
                        placeholderTextColor={MUTED}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                ))}
                <Text style={[sm.fieldLabel, { marginTop: 12 }]}>Unpaid Break (minutes)</Text>
                <View style={[sm.inputRow, { borderColor: BORDER }]}>
                  <Feather name="coffee" size={15} color={MUTED} />
                  <TextInput
                    style={[sm.input, { color: TEXT }]}
                    value={brk}
                    onChangeText={setBrk}
                    placeholder="30"
                    placeholderTextColor={MUTED}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Pressable onPress={handleSaveEdit} disabled={saving} style={[sm.saveBtn, { opacity: saving ? 0.8 : 1, backgroundColor: NAVY }]}>
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
              {s.pendingShifts > 0 && (
                <Text style={{ color: AMBER }}> · {s.pendingShifts} pending</Text>
              )}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {s.hasRate ? (
              <Text style={[pay.amt, { color: s.pendingShifts > 0 ? AMBER : GREEN }]}>
                {fmtAUD(s.totalPayCents)}
              </Text>
            ) : (
              <Text style={[pay.noRate, { color: MUTED }]}>No rate</Text>
            )}
            <Text style={[pay.shifts, { color: MUTED }]}>
              {s.approvedShifts + s.pendingShifts} shift{s.approvedShifts + s.pendingShifts !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      ))}

      {pending > 0 && (
        <View style={[pay.warning, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Feather name="alert-circle" size={13} color={AMBER} />
          <Text style={[pay.warningText, { color: '#92400E' }]}>
            Approve all shifts before processing payroll
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
const WEEK_OPTIONS = buildWeekOptions(8);

export default function DirectorTimesheetsScreen() {
  const [weekIdx,      setWeekIdx]      = useState(0); // 0 = this week, 1 = last week, …
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [selected,     setSelected]     = useState<DirectorShift | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const selectedWeek = WEEK_OPTIONS[weekIdx];

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['director-timesheets'],
    queryFn: () => api.director.timesheets(),
    staleTime: 30_000,
  });

  const allShifts: DirectorShift[] = data?.data ?? [];

  // Filter to selected Mon-Sun week
  const weekShifts = useMemo(() => filterByWeek(allShifts, selectedWeek), [allShifts, selectedWeek]);

  // Unique people IN this week
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    weekShifts.forEach(s => { if (s.userId && s.name) seen.set(s.userId, s.name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [weekShifts]);

  // Apply person filter
  const filtered = useMemo(() =>
    personFilter === 'all' ? weekShifts : weekShifts.filter(s => s.userId === personFilter),
    [weekShifts, personFilter]
  );

  // Group by date
  const sections = useMemo(() => {
    const map = new Map<string, { label: string; shifts: DirectorShift[] }>();
    filtered.forEach(s => {
      const key = toDateKey(s.clockIn);
      if (!map.has(key)) map.set(key, { label: fmtDateGroup(s.clockIn), shifts: [] });
      map.get(key)!.shifts.push(s);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [filtered]);

  // Payroll summary (all staff for selected week, not filtered by person)
  const payrollSummary = useMemo(() => buildPayrollSummary(weekShifts), [weekShifts]);

  // Stats for selected week
  const stats = useMemo(() => {
    const done    = filtered.filter(s => s.clockOut);
    const active  = filtered.filter(s => !s.clockOut);
    const pending  = done.filter(s => !s.approvedAt);
    const approved = done.filter(s => !!s.approvedAt);
    const totalHrs = done.reduce((sum, s) => sum + (s.hoursWorked ? parseFloat(s.hoursWorked) : 0), 0);
    return { total: filtered.length, active: active.length, pending: pending.length, approved: approved.length, totalHrs };
  }, [filtered]);

  const openShift = (s: DirectorShift) => {
    setSelected(s); setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} size="large" /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Week selector ─────────────────────────────────────────── */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
          {WEEK_OPTIONS.map((w, i) => {
            const active = weekIdx === i;
            return (
              <Pressable
                key={i}
                onPress={() => { setWeekIdx(i); setPersonFilter('all'); Haptics.selectionAsync(); }}
                style={[styles.chip, { backgroundColor: active ? NAVY : BG, borderColor: active ? NAVY : BORDER }]}
              >
                <Text style={[styles.chipText, { color: active ? '#fff' : MUTED }]}>{w.short}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Person filter */}
        {people.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
            <Pressable
              onPress={() => { setPersonFilter('all'); Haptics.selectionAsync(); }}
              style={[styles.chip, { backgroundColor: personFilter === 'all' ? BLUE : BG, borderColor: personFilter === 'all' ? BLUE : BORDER }]}
            >
              <Text style={[styles.chipText, { color: personFilter === 'all' ? '#fff' : MUTED }]}>All Staff</Text>
            </Pressable>
            {people.map(p => {
              const isActive = personFilter === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => { setPersonFilter(p.id); Haptics.selectionAsync(); }}
                  style={[styles.chip, { backgroundColor: isActive ? BLUE : BG, borderColor: isActive ? BLUE : BORDER }]}
                >
                  <Text style={[styles.chipText, { color: isActive ? '#fff' : MUTED }]}>{p.name.split(' ')[0]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <View style={[styles.statsRow, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        {[
          { label: 'Shifts',   value: String(stats.total),              color: TEXT   },
          { label: 'Active',   value: String(stats.active),             color: BLUE   },
          { label: 'Pending',  value: String(stats.pending),            color: AMBER  },
          { label: 'Approved', value: String(stats.approved),           color: GREEN  },
          { label: 'Hours',    value: `${stats.totalHrs.toFixed(1)}h`,  color: PURPLE },
        ].map((s, i, arr) => (
          <View key={s.label} style={[styles.statCell, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: BORDER }]}>
            <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Content ───────────────────────────────────────────────── */}
      <FlatList
        data={sections}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 0, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        ListHeaderComponent={
          payrollSummary.length > 0 ? (
            <PayrollSummaryCard summaries={payrollSummary} weekLabel={selectedWeek.label} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="clock" size={40} color={MUTED} />
            <Text style={styles.emptyText}>No shifts for {selectedWeek.label.toLowerCase()}</Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View style={{ marginBottom: 20, marginTop: 12 }}>
            <Text style={styles.sectionHeader}>{section.label}</Text>
            <View style={[styles.sectionCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              {section.shifts.map((s, idx) => {
                const isActive   = !s.clockOut;
                const isApproved = !!s.approvedAt;
                const hrs  = s.hoursWorked ? parseFloat(s.hoursWorked).toFixed(1) : null;
                const p    = calcPay(s);
                const brk  = s.unpaidBreakMins && s.unpaidBreakMins > 0 ? s.unpaidBreakMins : null;

                return (
                  <Pressable
                    key={s.id}
                    onPress={() => openShift(s)}
                    style={({ pressed }) => [
                      styles.shiftRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: BORDER },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: isActive ? '#EBF8FF' : isApproved ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Text style={[styles.avatarText, { color: isActive ? BLUE : isApproved ? GREEN : MUTED }]}>
                        {initials(s.name ?? '?')}
                      </Text>
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.shiftName}>{s.name ?? 'Unknown'}</Text>
                        {isActive && (
                          <View style={styles.liveBadge}>
                            <View style={[styles.liveDot, { backgroundColor: BLUE }]} />
                            <Text style={[styles.liveText, { color: BLUE }]}>LIVE</Text>
                          </View>
                        )}
                        {!isActive && isApproved && <Feather name="check-circle" size={13} color={GREEN} />}
                      </View>
                      <Text style={[styles.shiftPos, { color: MUTED }]}>{s.position ?? 'Staff'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Feather name="log-in" size={11} color={MUTED} />
                        <Text style={styles.shiftTime}>{fmtTime(s.clockIn)}</Text>
                        {s.clockOut && (
                          <>
                            <Feather name="arrow-right" size={10} color={MUTED} />
                            <Feather name="log-out" size={11} color={MUTED} />
                            <Text style={styles.shiftTime}>{fmtTime(s.clockOut)}</Text>
                          </>
                        )}
                        {brk ? <Text style={[styles.shiftTime, { color: AMBER }]}>· {brk}m break</Text> : null}
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      {hrs && <Text style={styles.shiftHrs}>{hrs}h</Text>}
                      {p != null && <Text style={[styles.shiftPay, { color: GREEN }]}>{fmtAUD(p)}</Text>}
                      {!isActive && !isApproved && (
                        <View style={[styles.pendingPill, { backgroundColor: '#FFF7ED', borderColor: AMBER }]}>
                          <Text style={[styles.pendingText, { color: AMBER }]}>Review</Text>
                        </View>
                      )}
                      <Feather name="chevron-right" size={14} color={BORDER} style={{ marginTop: 2 }} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

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
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyText:     { color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText:      { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  statsRow:      { flexDirection: 'row', borderBottomWidth: 1 },
  statCell:      { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statVal:       { fontSize: 17, fontFamily: 'Inter_700Bold' },
  statLabel:     { fontSize: 10, fontFamily: 'Inter_500Medium', color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeader: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginLeft: 2 },
  sectionCard:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  shiftRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar:        { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 15, fontFamily: 'Inter_700Bold' },
  shiftName:     { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: TEXT },
  shiftPos:      { fontSize: 12, fontFamily: 'Inter_400Regular' },
  shiftTime:     { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED },
  shiftHrs:      { fontSize: 16, fontFamily: 'Inter_700Bold', color: NAVY },
  shiftPay:      { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  liveBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF8FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  liveDot:       { width: 5, height: 5, borderRadius: 3 },
  liveText:      { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  pendingPill:   { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pendingText:   { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
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
  card:        { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 4, gap: 0 },
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
