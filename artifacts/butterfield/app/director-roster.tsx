import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
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
const RED    = '#EF4444';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ROLES = ['crew', 'supervisor', 'manager', 'trainer'];
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

type FormState = {
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  notes: string;
};

const EMPTY_FORM: FormState = { userId: '', date: '', startTime: '09:00', endTime: '17:00', role: 'crew', notes: '' };

export default function DirectorRosterScreen() {
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => toYMD(toMonday(new Date())));
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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

  const shifts   = data?.data ?? [];
  const staffList = staffData?.data ?? [];

  const weekDays = useMemo(() => {
    const base = new Date(weekStart + 'T12:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return { ymd: toYMD(d), dayName: DAY_NAMES[d.getDay()]!, dayShort: DAYS_SHORT[d.getDay()]! };
    });
  }, [weekStart]);

  const shiftsByDay = useMemo(() => {
    const map: Record<string, RosterShift[]> = {};
    for (const s of shifts) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date]!.push(s);
    }
    return map;
  }, [shifts]);

  const prevWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), -7)));
  const nextWeek = () => setWeekStart(toYMD(addDays(new Date(weekStart + 'T12:00:00'), 7)));

  const createMut = useMutation({
    mutationFn: (d: FormState) => api.director.rosterCreate({ userId: d.userId, date: d.date, startTime: d.startTime, endTime: d.endTime, role: d.role, notes: d.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); closeModal(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to create shift'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<FormState> }) => api.director.rosterUpdate(id, { ...d }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); closeModal(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to update shift'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.rosterDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['director-roster'] }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Failed to delete shift'),
  });

  function openCreate(dateYmd: string) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: dateYmd });
    setModalVisible(true);
    Haptics.selectionAsync();
  }

  function openEdit(shift: RosterShift) {
    setEditingId(shift.id);
    setForm({
      userId: shift.userId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      role: shift.role,
      notes: shift.notes ?? '',
    });
    setModalVisible(true);
    Haptics.selectionAsync();
  }

  function closeModal() {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSave() {
    if (!form.userId) { Alert.alert('Validation', 'Please select a staff member.'); return; }
    if (!form.date)   { Alert.alert('Validation', 'Please enter a date.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { Alert.alert('Validation', 'Date must be YYYY-MM-DD.'); return; }
    if (!/^\d{2}:\d{2}$/.test(form.startTime))  { Alert.alert('Validation', 'Start time must be HH:MM.'); return; }
    if (!/^\d{2}:\d{2}$/.test(form.endTime))    { Alert.alert('Validation', 'End time must be HH:MM.'); return; }

    if (editingId) {
      updateMut.mutate({ id: editingId, d: form });
    } else {
      createMut.mutate(form);
    }
  }

  function handleDeletePress(shift: RosterShift) {
    Alert.alert(
      'Delete Shift',
      `Remove ${shift.userName ?? 'this shift'} on ${fmtDateShort(shift.date)} (${fmtTime12(shift.startTime)}–${fmtTime12(shift.endTime)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(shift.id) },
      ]
    );
  }

  const isBusy = createMut.isPending || updateMut.isPending;

  const weekLabel = (() => {
    const end = addDays(new Date(weekStart + 'T12:00:00'), 6);
    const s = new Date(weekStart + 'T12:00:00');
    return `${s.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  })();

  const totalShifts = shifts.length;
  const totalHours  = shifts.reduce((acc, s) => acc + calcHours(s.startTime, s.endTime), 0);

  return (
    <DirectorStandaloneScreen title="Rosters" subtitle={`${weekLabel}`}>
      {/* Week nav */}
      <View style={s.weekNav}>
        <Pressable style={s.navBtn} onPress={prevWeek}><Feather name="chevron-left" size={20} color={NAVY} /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.weekLabel}>{weekLabel}</Text>
          <Text style={s.weekSub}>{totalShifts} shift{totalShifts !== 1 ? 's' : ''} · {totalHours.toFixed(1)}h total</Text>
        </View>
        <Pressable style={s.navBtn} onPress={nextWeek}><Feather name="chevron-right" size={20} color={NAVY} /></Pressable>
      </View>

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
              <View key={ymd} style={[s.dayBlock, isToday && { borderColor: BLUE, borderWidth: 1.5 }]}>
                <View style={s.dayHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.dayTag, isToday && { backgroundColor: BLUE }]}>
                      <Text style={[s.dayTagText, isToday && { color: '#fff' }]}>{dayShort}</Text>
                    </View>
                    <View>
                      <Text style={[s.dayName, isToday && { color: BLUE }]}>{dayName}</Text>
                      <Text style={s.dayDate}>{fmtDateShort(ymd)}</Text>
                    </View>
                  </View>
                  <Pressable
                    style={s.addBtn}
                    onPress={() => openCreate(ymd)}
                  >
                    <Feather name="plus" size={14} color={BLUE} />
                    <Text style={s.addBtnText}>Add</Text>
                  </Pressable>
                </View>

                {dayShifts.length === 0 ? (
                  <Text style={s.emptyDay}>No shifts rostered</Text>
                ) : (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {dayShifts.map(shift => {
                      const roleColor = ROLE_COLORS[shift.role] ?? MUTED;
                      const hrs = calcHours(shift.startTime, shift.endTime);
                      return (
                        <Pressable
                          key={shift.id}
                          style={s.shiftCard}
                          onPress={() => openEdit(shift)}
                          onLongPress={() => handleDeletePress(shift)}
                        >
                          <View style={[s.roleBar, { backgroundColor: roleColor }]} />
                          <View style={{ flex: 1, paddingLeft: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={s.shiftName}>{shift.userName ?? 'Unknown'}</Text>
                              {shift.isConfirmed && <Feather name="check-circle" size={12} color={GREEN} />}
                            </View>
                            <Text style={s.shiftTime}>
                              {fmtTime12(shift.startTime)} – {fmtTime12(shift.endTime)}
                              <Text style={s.shiftHrs}> ({hrs.toFixed(1)}h)</Text>
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <View style={[s.roleChip, { backgroundColor: roleColor + '20' }]}>
                                <Text style={[s.roleChipText, { color: roleColor }]}>{shift.role}</Text>
                              </View>
                              {shift.notes ? <Text style={s.shiftNotes} numberOfLines={1}>{shift.notes}</Text> : null}
                            </View>
                          </View>
                          <View style={{ alignItems: 'center', gap: 6 }}>
                            <Pressable onPress={() => openEdit(shift)} style={s.iconBtn}>
                              <Feather name="edit-2" size={14} color={MUTED} />
                            </Pressable>
                            <Pressable onPress={() => handleDeletePress(shift)} style={s.iconBtn}>
                              <Feather name="trash-2" size={14} color={RED} />
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={m.container}>
            <View style={m.header}>
              <View>
                <Text style={m.title}>{editingId ? 'Edit Shift' : 'Add Shift'}</Text>
                <Text style={m.subtitle}>{form.date ? fmtDateShort(form.date) : 'Select date'}</Text>
              </View>
              <Pressable onPress={closeModal} style={m.closeBtn}>
                <Feather name="x" size={22} color={MUTED} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} showsVerticalScrollIndicator={false}>
              {/* Staff picker */}
              <View>
                <Text style={m.label}>STAFF MEMBER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {staffList.map(st => (
                      <Pressable
                        key={st.id}
                        style={[m.chip, form.userId === st.id && m.chipActive]}
                        onPress={() => { setForm(f => ({ ...f, userId: st.id })); Haptics.selectionAsync(); }}
                      >
                        <Text style={[m.chipText, form.userId === st.id && m.chipTextActive]} numberOfLines={1}>
                          {st.name ?? st.email ?? 'Unknown'}
                        </Text>
                        {st.position ? <Text style={[m.chipSub, form.userId === st.id && { color: 'rgba(255,255,255,0.8)' }]}>{st.position}</Text> : null}
                      </Pressable>
                    ))}
                    {staffList.length === 0 && <Text style={{ color: MUTED, fontSize: 13 }}>No staff found.</Text>}
                  </View>
                </ScrollView>
              </View>

              {/* Date */}
              <View>
                <Text style={m.label}>DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={m.input}
                  value={form.date}
                  onChangeText={v => setForm(f => ({ ...f, date: v }))}
                  placeholder="e.g. 2026-06-16"
                  placeholderTextColor={MUTED}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
              </View>

              {/* Times */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={m.label}>START (HH:MM)</Text>
                  <TextInput
                    style={m.input}
                    value={form.startTime}
                    onChangeText={v => setForm(f => ({ ...f, startTime: v }))}
                    placeholder="09:00"
                    placeholderTextColor={MUTED}
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.label}>END (HH:MM)</Text>
                  <TextInput
                    style={m.input}
                    value={form.endTime}
                    onChangeText={v => setForm(f => ({ ...f, endTime: v }))}
                    placeholder="17:00"
                    placeholderTextColor={MUTED}
                    keyboardType="numbers-and-punctuation"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Role */}
              <View>
                <Text style={m.label}>ROLE</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {ROLES.map(r => (
                    <Pressable
                      key={r}
                      style={[m.chip, form.role === r && { backgroundColor: ROLE_COLORS[r] ?? BLUE }]}
                      onPress={() => { setForm(f => ({ ...f, role: r })); Haptics.selectionAsync(); }}
                    >
                      <Text style={[m.chipText, form.role === r && m.chipTextActive]}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text style={m.label}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[m.input, { minHeight: 70, textAlignVertical: 'top' }]}
                  value={form.notes}
                  onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                  placeholder="Any notes about this shift…"
                  placeholderTextColor={MUTED}
                  multiline
                  autoCorrect={false}
                />
              </View>

              {form.startTime && form.endTime && /^\d{2}:\d{2}$/.test(form.startTime) && /^\d{2}:\d{2}$/.test(form.endTime) && (
                <View style={m.summaryRow}>
                  <Feather name="clock" size={14} color={MUTED} />
                  <Text style={m.summaryText}>
                    Duration: {calcHours(form.startTime, form.endTime).toFixed(1)} hours
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={m.footer}>
              <Pressable onPress={closeModal} style={m.cancelBtn} disabled={isBusy}>
                <Text style={m.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={[m.saveBtn, isBusy && { opacity: 0.7 }]} disabled={isBusy}>
                {isBusy
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Feather name="check" size={16} color="#fff" />}
                <Text style={m.saveText}>{editingId ? 'Save Changes' : 'Add Shift'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  weekNav: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER, paddingHorizontal: 12, paddingVertical: 10,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  weekLabel: { fontSize: 15, fontWeight: '700', color: NAVY },
  weekSub:   { fontSize: 12, color: MUTED, marginTop: 1 },
  dayBlock: {
    backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER,
  },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dayTag: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center',
  },
  dayTagText: { fontSize: 11, fontWeight: '700', color: NAVY },
  dayName:    { fontSize: 14, fontWeight: '700', color: TEXT },
  dayDate:    { fontSize: 12, color: MUTED },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#EFF6FF', borderRadius: 20,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: BLUE },
  emptyDay: { fontSize: 13, color: MUTED, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
  shiftCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: BORDER, padding: 10, overflow: 'hidden',
  },
  roleBar: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  shiftName: { fontSize: 14, fontWeight: '600', color: TEXT },
  shiftTime: { fontSize: 12, color: MUTED, marginTop: 2 },
  shiftHrs:  { color: MUTED, fontSize: 11 },
  shiftNotes:{ fontSize: 11, color: MUTED, flex: 1 },
  roleChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  roleChipText: { fontSize: 10, fontWeight: '600' },
  iconBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center',
  },
});

const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD,
  },
  title:    { fontSize: 18, fontWeight: '700', color: NAVY },
  subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
  input: {
    marginTop: 8, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F4FF',
    borderWidth: 1, borderColor: BORDER,
  },
  chipActive: { backgroundColor: BLUE, borderColor: BLUE },
  chipText:   { fontSize: 13, fontWeight: '600', color: NAVY },
  chipTextActive: { color: '#fff' },
  chipSub:    { fontSize: 10, color: MUTED, marginTop: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10 },
  summaryText:{ fontSize: 13, color: NAVY, fontWeight: '600' },
  footer: {
    flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD,
  },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F0F4FF', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: NAVY },
  saveBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: NAVY },
  saveText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});
