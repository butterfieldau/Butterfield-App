import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RosterShift } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import TimeWheelPicker from '@/components/TimeWheelPicker';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const INDIGO = '#4F46E5';
const RED    = '#EF4444';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const GLASS_BG  = 'rgba(255,255,255,0.8)';
const GLASS_BDR = 'rgba(255,255,255,0.9)';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const ALL_ROLES: Array<'all' | 'crew' | 'supervisor' | 'manager' | 'trainer'> = [
  'all', 'crew', 'supervisor', 'manager', 'trainer',
];
const SHIFT_ROLES = ['crew', 'supervisor', 'manager', 'trainer'];
const ROLE_COLORS: Record<string, string> = {
  crew: BLUE, supervisor: AMBER, manager: NAVY, trainer: PURPLE,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
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
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
function fmtTimePill(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr) || 0;
  const m = parseInt(mStr) || 0;
  const ampm = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}
function fmtDateRow(d: Date): string {
  return `${DAY_FULL[d.getDay()]} ${d.getDate()} ${MONTH_FULL[d.getMonth()]}`;
}
function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, ((eh! * 60 + em!) - (sh! * 60 + sm!)) / 60);
}

// ── Staff Picker Modal ─────────────────────────────────────────────────────────
function StaffPickerModal({ visible, staff, onSelect, onClose }: {
  visible: boolean;
  staff: Array<{ id: string; name?: string | null; email?: string | null; position?: string | null }>;
  onSelect: (s: { id: string; name: string; position?: string | null }) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const filtered = staff.filter(s =>
    (s.name ?? s.email ?? '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[sp.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} style={sp.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={sp.title}>Select Staff Member</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={sp.searchRow}>
          <Feather name="search" size={15} color={MUTED} />
          <TextInput
            style={sp.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search staff…"
            placeholderTextColor={MUTED}
            autoCorrect={false}
          />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {filtered.length === 0
            ? <Text style={{ color: MUTED, textAlign: 'center', marginTop: 20 }}>No staff found.</Text>
            : filtered.map(s => {
                const name = s.name ?? s.email ?? 'Unknown';
                return (
                  <Pressable key={s.id} style={sp.row}
                    onPress={() => { Haptics.selectionAsync(); onSelect({ id: s.id, name, position: s.position }); onClose(); }}>
                    <View style={sp.avatar}>
                      <Text style={sp.avatarText}>{name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={sp.name}>{name}</Text>
                      {s.position ? <Text style={sp.pos}>{s.position}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={MUTED} />
                  </Pressable>
                );
              })
          }
        </ScrollView>
      </View>
    </Modal>
  );
}
const sp = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  closeBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: 18, fontWeight: '700', color: TEXT },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: TEXT },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14 },
  avatar:    { width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' },
  avatarText:{ fontSize: 13, fontWeight: '700', color: BLUE },
  name:      { fontSize: 15, fontWeight: '600', color: TEXT },
  pos:       { fontSize: 12, color: MUTED, marginTop: 1 },
});

// ── Roster Modal ───────────────────────────────────────────────────────────────
type FormState = {
  staffId: string;
  staffName: string;
  staffPosition: string | null;
  date: Date | null;
  startTime: string;
  endTime: string;
  breakMins: number;
  role: string;
  notes: string;
};
const EMPTY_FORM: FormState = {
  staffId: '', staffName: '', staffPosition: null,
  date: null, startTime: '09:00', endTime: '17:00', breakMins: 0, role: 'crew', notes: '',
};

function RosterModal({ mode, shift, staffList, visible, onClose, onSaved }: {
  mode: 'add' | 'edit';
  shift?: RosterShift | null;
  staffList: Array<{ id: string; name?: string | null; email?: string | null; position?: string | null }>;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [calOpen, setCalOpen] = useState(false);
  const [showStaffPick, setShowStaffPick] = useState(false);
  const [showStartPick, setShowStartPick] = useState(false);
  const [showEndPick, setShowEndPick] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && shift) {
      const st = staffList.find(x => x.id === shift.userId);
      setForm({
        staffId: shift.userId,
        staffName: st?.name ?? shift.userName ?? 'Unknown',
        staffPosition: st?.position ?? null,
        date: new Date(shift.date + 'T12:00:00'),
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakMins: 0,
        role: shift.role,
        notes: shift.notes ?? '',
      });
    } else {
      const today = new Date();
      today.setHours(12,0,0,0);
      setForm({ ...EMPTY_FORM, date: today });
    }
    setCalOpen(false);
    setShowStaffPick(false);
  }, [visible, mode, shift]);

  const durationDisplay = useMemo(() => {
    const totalMins = Math.max(0, calcHours(form.startTime, form.endTime) * 60 - form.breakMins);
    if (totalMins <= 0) return null;
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }, [form.startTime, form.endTime, form.breakMins]);

  const canSave = !!form.staffId && !!form.date && !!form.startTime && !!form.endTime;

  const createMut = useMutation({
    mutationFn: (f: FormState) => api.director.rosterCreate({
      userId: f.staffId,
      date: toLocalYMD(f.date!),
      startTime: f.startTime,
      endTime: f.endTime,
      role: f.role,
      notes: f.notes || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSaved(); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to create shift'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) => api.director.rosterUpdate(id, {
      userId: f.staffId,
      date: toLocalYMD(f.date!),
      startTime: f.startTime,
      endTime: f.endTime,
      role: f.role,
      notes: f.notes || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSaved(); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to update shift'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.rosterDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onSaved(); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to delete shift'),
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => api.director.rosterUpdate(id, { isConfirmed: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onSaved(); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to confirm shift'),
  });

  const handleSave = async () => {
    if (!canSave || !form.date) return;
    const hrs = calcHours(form.startTime, form.endTime);
    if (hrs <= 0) { Alert.alert('Invalid times', 'End time must be after start time.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === 'add') {
      createMut.mutate(form);
    } else {
      updateMut.mutate({ id: shift!.id, f: form });
    }
  };

  const handleDelete = () => {
    if (!shift) return;
    Alert.alert(
      'Delete Shift',
      `Remove ${form.staffName}'s shift on ${form.date ? fmtDateRow(form.date) : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => deleteMut.mutate(shift.id),
        },
      ],
    );
  };

  const isBusy = saving || deleting || createMut.isPending || updateMut.isPending || deleteMut.isPending || confirmMut.isPending;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[rm.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onClose} style={rm.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={rm.title}>{mode === 'add' ? 'Add Shift' : 'Edit Shift'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          {/* Main rows card */}
          <View style={rm.card}>
            {/* Staff */}
            <Pressable onPress={() => setShowStaffPick(true)}
              style={[rm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={rm.rowLeft}>
                <Feather name="user" size={16} color={MUTED} />
                <Text style={[rm.rowLabel, !form.staffId && { color: MUTED }]}>
                  {form.staffId ? form.staffName : 'Select Staff Member'}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>

            {/* Date */}
            <Pressable
              onPress={() => { setCalOpen(o => !o); Haptics.selectionAsync(); }}
              style={[rm.row, { borderBottomWidth: calOpen ? 0 : StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}
            >
              <View style={rm.rowLeft}>
                <Feather name="calendar" size={16} color={MUTED} />
                <Text style={[rm.rowLabel, !form.date && { color: MUTED }]}>
                  {form.date ? fmtDateRow(form.date) : 'Select Date'}
                </Text>
              </View>
              <Feather name={calOpen ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
            </Pressable>
            {calOpen && (
              <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }}>
                <InlineCalendarPicker
                  selectedDate={form.date}
                  onSelectDate={d => {
                    const noon = new Date(d);
                    noon.setHours(12, 0, 0, 0);
                    setForm(f => ({ ...f, date: noon }));
                    setCalOpen(false);
                    Haptics.selectionAsync();
                  }}
                  accentColor={BLUE}
                />
              </View>
            )}

            {/* Time range */}
            <View style={[rm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={rm.rowLeft}>
                <Feather name="clock" size={16} color={MUTED} />
                <Pressable onPress={() => setShowStartPick(true)} style={rm.timePill}>
                  <Text style={rm.timePillText}>{fmtTimePill(form.startTime)}</Text>
                </Pressable>
                <Text style={{ color: MUTED, fontSize: 13 }}>→</Text>
                <Pressable onPress={() => setShowEndPick(true)} style={rm.timePill}>
                  <Text style={rm.timePillText}>{fmtTimePill(form.endTime)}</Text>
                </Pressable>
              </View>
              {durationDisplay && (
                <View style={rm.durationBadge}>
                  <Text style={rm.durationBadgeText}>{durationDisplay}</Text>
                </View>
              )}
            </View>

            {/* Break adjuster */}
            <View style={[rm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER }]}>
              <View style={rm.rowLeft}>
                <Feather name="coffee" size={16} color={MUTED} />
                <Text style={rm.rowLabel}>Meal Break</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => setForm(f => ({ ...f, breakMins: Math.max(0, f.breakMins - 5) }))} hitSlop={8}
                  style={rm.breakAdj}>
                  <Feather name="minus" size={14} color={BLUE} />
                </Pressable>
                <Text style={rm.breakLabel}>{form.breakMins}m</Text>
                <Pressable onPress={() => setForm(f => ({ ...f, breakMins: f.breakMins + 5 }))} hitSlop={8}
                  style={rm.breakAdj}>
                  <Feather name="plus" size={14} color={BLUE} />
                </Pressable>
              </View>
            </View>

            {/* Role chip selector */}
            <View style={[rm.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, flexWrap: 'wrap', gap: 8 }]}>
              <View style={rm.rowLeft}>
                <Feather name="briefcase" size={16} color={MUTED} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, flex: 1 }}>
                  {SHIFT_ROLES.map(r => {
                    const active = form.role === r;
                    const col = ROLE_COLORS[r] ?? BLUE;
                    return (
                      <Pressable key={r}
                        style={[rm.roleChip, active && { backgroundColor: col, borderColor: col }]}
                        onPress={() => { setForm(f => ({ ...f, role: r })); Haptics.selectionAsync(); }}>
                        <Text style={[rm.roleChipText, active && { color: '#fff' }]}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Notes */}
            <View style={rm.row}>
              <View style={[rm.rowLeft, { alignItems: 'flex-start' }]}>
                <Feather name="file-text" size={16} color={MUTED} style={{ marginTop: 2 }} />
                <TextInput
                  style={rm.notesInput}
                  value={form.notes}
                  onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="Notes (optional)…"
                  placeholderTextColor={MUTED}
                  multiline
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[rm.footer, { paddingBottom: insets.bottom + 16, gap: 10 }]}>
          {mode === 'edit' && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={handleDelete} disabled={isBusy}
                style={[rm.footerBtn, { flex: 1, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', opacity: isBusy ? 0.5 : 1 }]}>
                {deleteMut.isPending
                  ? <ActivityIndicator color="#DC2626" size="small" />
                  : <Text style={[rm.footerBtnText, { color: '#DC2626' }]}>Delete</Text>}
              </Pressable>
              {!shift?.isConfirmed && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); confirmMut.mutate(shift!.id); }}
                  disabled={isBusy}
                  style={[rm.footerBtn, { flex: 1, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7', opacity: isBusy ? 0.5 : 1 }]}>
                  {confirmMut.isPending
                    ? <ActivityIndicator color="#059669" size="small" />
                    : <Text style={[rm.footerBtnText, { color: '#059669' }]}>Confirm</Text>}
                </Pressable>
              )}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} disabled={isBusy}
              style={[rm.footerBtn, { flex: 1, backgroundColor: '#F3F4F6' }]}>
              <Text style={[rm.footerBtnText, { color: TEXT }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={!canSave || isBusy}
              style={[rm.footerBtn, { flex: 2, backgroundColor: BLUE, opacity: (!canSave || isBusy) ? 0.5 : 1 }]}>
              {(createMut.isPending || updateMut.isPending)
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={rm.footerBtnText}>{mode === 'add' ? 'Add Shift' : 'Save Changes'}</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <StaffPickerModal
        visible={showStaffPick}
        staff={staffList}
        onSelect={s => setForm(f => ({ ...f, staffId: s.id, staffName: s.name, staffPosition: s.position ?? null }))}
        onClose={() => setShowStaffPick(false)}
      />
      <TimeWheelPicker
        visible={showStartPick}
        initialHHMM={form.startTime}
        onConfirm={v => setForm(f => ({ ...f, startTime: v }))}
        onClose={() => setShowStartPick(false)}
        accentColor={INDIGO}
      />
      <TimeWheelPicker
        visible={showEndPick}
        initialHHMM={form.endTime}
        onConfirm={v => setForm(f => ({ ...f, endTime: v }))}
        onClose={() => setShowEndPick(false)}
        accentColor={INDIGO}
      />
    </Modal>
  );
}
const rm = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  closeBtn:        { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 18, fontWeight: '700', color: TEXT },
  card:            { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  row:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  rowLeft:         { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowLabel:        { fontSize: 15, fontWeight: '500', color: TEXT, flex: 1 },
  timePill:        { backgroundColor: BLUE + '14', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  timePillText:    { fontSize: 13, fontWeight: '600', color: BLUE },
  durationBadge:   { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  durationBadgeText:{ fontSize: 12, fontWeight: '700', color: '#fff' },
  roleChip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F0F4FF' },
  roleChipText:    { fontSize: 12, fontWeight: '600', color: TEXT },
  breakAdj:        { width: 28, height: 28, borderRadius: 14, backgroundColor: BLUE + '14', alignItems: 'center', justifyContent: 'center' },
  breakLabel:      { fontSize: 14, fontWeight: '600', color: TEXT, minWidth: 32, textAlign: 'center' },
  notesInput:      { flex: 1, fontSize: 14, color: TEXT, minHeight: 44, textAlignVertical: 'top' },
  footer:          { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  footerBtn:       { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  footerBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function DirectorRosterScreen() {
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => toYMD(toMonday(new Date())));
  const [modalVisible, setModalVisible] = useState(false);
  const [editingShift, setEditingShift] = useState<RosterShift | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'crew' | 'supervisor' | 'manager' | 'trainer'>('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-roster', weekStart],
    queryFn: () => api.director.roster(weekStart),
    staleTime: 30_000,
  });
  const { data: staffData } = useQuery({
    queryKey: ['director-roster-staff'],
    queryFn: () => api.director.rosterStaff(),
    staleTime: 5 * 60_000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const shifts = data?.data ?? [];
  const staffList = staffData?.data ?? [];

  const weekDays = useMemo(() => {
    const base = new Date(weekStart + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return { ymd: toYMD(d), dayName: DAY_NAMES[d.getDay()]!, dayShort: DAYS_SHORT[d.getDay()]! };
    });
  }, [weekStart]);

  const filteredShifts = useMemo(() =>
    roleFilter === 'all' ? shifts : shifts.filter(s => s.role === roleFilter),
    [shifts, roleFilter],
  );

  const shiftsByDay = useMemo(() => {
    const map: Record<string, RosterShift[]> = {};
    for (const s of filteredShifts) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date]!.push(s);
    }
    return map;
  }, [filteredShifts]);

  const prevWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), -7)));
  const nextWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), 7)));

  const deleteMutMain = useMutation({
    mutationFn: (id: string) => api.director.rosterDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to delete shift'),
  });

  function openCreate() {
    setEditingShift(null);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  function openEdit(shift: RosterShift) {
    setEditingShift(shift);
    setModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  function closeModal() {
    setModalVisible(false);
    setEditingShift(null);
  }
  function handleDeleteShift(shift: RosterShift) {
    Alert.alert(
      'Delete Shift',
      `Remove ${shift.userName ?? 'this shift'} on ${fmtDateShort(shift.date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutMain.mutate(shift.id) },
      ],
    );
  }

  const weekLabel = (() => {
    const end = addDays(new Date(weekStart + 'T12:00:00'), 6);
    const s = new Date(weekStart + 'T12:00:00');
    return `${s.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  const totalShifts    = shifts.length;
  const totalHours     = shifts.reduce((acc, s) => acc + calcHours(s.startTime, s.endTime), 0);
  const confirmedCount = shifts.filter(s => s.isConfirmed).length;

  return (
    <DirectorStandaloneScreen
      title="Rosters"
      headerRight={
        <Pressable onPress={openCreate} style={sc.addBtn}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      }
    >
      {/* Week nav */}
      <View style={sc.weekNav}>
        <Pressable style={sc.navBtn} onPress={prevWeek}><Feather name="chevron-left" size={20} color={NAVY} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={sc.weekLabel}>{weekLabel}</Text>
        </View>
        <Pressable style={sc.navBtn} onPress={nextWeek}><Feather name="chevron-right" size={20} color={NAVY} /></Pressable>
      </View>

      {/* Summary strip */}
      <View style={sc.summaryRow}>
        <View style={sc.summaryCard}>
          <Text style={sc.summaryLabel}>SHIFTS</Text>
          <Text style={sc.summaryValue}>{totalShifts}</Text>
        </View>
        <View style={sc.summaryCard}>
          <Text style={sc.summaryLabel}>HOURS</Text>
          <Text style={sc.summaryValue}>{totalHours.toFixed(1)}h</Text>
        </View>
        <View style={sc.summaryCard}>
          <Text style={sc.summaryLabel}>CONFIRMED</Text>
          <Text style={[sc.summaryValue, { color: GREEN }]}>{confirmedCount}</Text>
        </View>
      </View>

      {/* Role filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={sc.chipRow}>
        {ALL_ROLES.map(r => {
          const active = roleFilter === r;
          const col = r === 'all' ? TEXT : (ROLE_COLORS[r] ?? TEXT);
          return (
            <Pressable key={r}
              onPress={() => { setRoleFilter(r); Haptics.selectionAsync(); }}
              style={[sc.chip,
                active && { backgroundColor: col, borderColor: col },
                !active && { backgroundColor: CARD },
              ]}>
              <Text style={[sc.chipText, active && { color: '#fff' }]}>
                {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={NAVY} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NAVY} />}
        >
          {weekDays.map(({ ymd, dayName, dayShort }) => {
            const dayShifts = shiftsByDay[ymd] ?? [];
            const isToday = ymd === toYMD(new Date());
            return (
              <View key={ymd} style={[sc.dayBlock, isToday && { borderColor: BLUE, borderWidth: 1.5 }]}>
                {/* Day header */}
                <View style={sc.dayHeader}>
                  <View style={[sc.dayTag, isToday && { backgroundColor: BLUE }]}>
                    <Text style={[sc.dayTagText, isToday && { color: '#fff' }]}>{dayShort}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[sc.dayName, isToday && { color: BLUE }]}>{dayName}</Text>
                    <Text style={sc.dayDate}>{fmtDateShort(ymd)}</Text>
                  </View>
                  <Text style={sc.dayHours}>
                    {dayShifts.length > 0
                      ? `${dayShifts.length} shift${dayShifts.length !== 1 ? 's' : ''} · ${dayShifts.reduce((a, s) => a + calcHours(s.startTime, s.endTime), 0).toFixed(1)}h`
                      : ''}
                  </Text>
                </View>

                {dayShifts.length === 0 ? (
                  <Text style={sc.emptyDay}>No shifts rostered</Text>
                ) : (
                  <View style={{ gap: 8, marginTop: 10 }}>
                    {dayShifts.map(shift => {
                      const roleColor = ROLE_COLORS[shift.role] ?? MUTED;
                      const hrs = calcHours(shift.startTime, shift.endTime);
                      return (
                        <View key={shift.id} style={sc.shiftCard}>
                          {/* Left accent bar */}
                          <View style={[sc.shiftAccent, { backgroundColor: roleColor }]} />
                          {/* Body */}
                          <View style={{ flex: 1, padding: 12, gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={sc.shiftName}>{shift.userName ?? 'Unknown'}</Text>
                              {shift.isConfirmed && <Feather name="check-circle" size={12} color={GREEN} />}
                            </View>
                            <Text style={sc.shiftTime}>
                              {fmtTime12(shift.startTime)} – {fmtTime12(shift.endTime)}
                              <Text style={sc.shiftHrs}> · {hrs.toFixed(1)}h</Text>
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <View style={[sc.roleChip, { backgroundColor: roleColor + '20', borderColor: roleColor + '30' }]}>
                                <Text style={[sc.roleChipText, { color: roleColor }]}>{shift.role}</Text>
                              </View>
                              {shift.notes ? <Text style={sc.shiftNotes} numberOfLines={1}>{shift.notes}</Text> : null}
                            </View>
                          </View>
                          {/* Icon buttons */}
                          <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6, paddingRight: 10 }}>
                            <Pressable onPress={() => openEdit(shift)} style={sc.iconBtn}>
                              <Feather name="edit-2" size={14} color={MUTED} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteShift(shift)} style={sc.iconBtn}>
                              <Feather name="trash-2" size={14} color={RED} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <RosterModal
        mode={editingShift ? 'edit' : 'add'}
        shift={editingShift}
        staffList={staffList}
        visible={modalVisible}
        onClose={closeModal}
        onSaved={closeModal}
      />
    </DirectorStandaloneScreen>
  );
}

const sc = StyleSheet.create({
  addBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  weekNav:     { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 12, paddingVertical: 10 },
  navBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  weekLabel:   { fontSize: 15, fontWeight: '700', color: NAVY },
  summaryRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: BG },
  summaryCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, gap: 4, backgroundColor: GLASS_BG, borderColor: GLASS_BDR, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  summaryLabel:{ fontSize: 9, fontWeight: '600', letterSpacing: 0.8, color: MUTED },
  summaryValue:{ fontSize: 18, fontWeight: '700', color: TEXT },
  chipRow:     { gap: 8, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2 },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  chipText:    { fontSize: 13, fontWeight: '600', color: TEXT },
  dayBlock:    { backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  dayHeader:   { flexDirection: 'row', alignItems: 'center' },
  dayTag:      { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  dayTagText:  { fontSize: 11, fontWeight: '700', color: NAVY },
  dayName:     { fontSize: 14, fontWeight: '700', color: TEXT },
  dayDate:     { fontSize: 12, color: MUTED },
  dayHours:    { fontSize: 12, color: MUTED, fontWeight: '500' },
  emptyDay:    { fontSize: 13, color: MUTED, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  shiftCard:   { flexDirection: 'row', alignItems: 'stretch', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  shiftAccent: { width: 4, flexShrink: 0 },
  shiftName:   { fontSize: 14, fontWeight: '600', color: TEXT },
  shiftTime:   { fontSize: 12, color: MUTED },
  shiftHrs:    { color: MUTED, fontSize: 11 },
  shiftNotes:  { fontSize: 11, color: MUTED, flex: 1 },
  roleChip:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  roleChipText:{ fontSize: 10, fontWeight: '600' },
  iconBtn:     { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
});
