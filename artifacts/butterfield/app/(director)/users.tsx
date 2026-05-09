import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import DirectorCustomersScreen from './customers';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

const TABS = ['Customers', 'Staff', 'Wholesale'];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
};

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Staff Profile Modal ────────────────────────────────────────────────────
function StaffProfileModal({ userId, visible, onClose, onRefresh }: {
  userId: string | null; visible: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [eName,    setEName]    = useState('');
  const [eEmail,   setEEmail]   = useState('');
  const [ePhone,   setEPhone]   = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eTfn,     setETfn]     = useState('');
  const [ePos,     setEPos]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-staff-member', userId],
    queryFn: () => api.director.staffMember(userId!),
    enabled: visible && !!userId,
    staleTime: 0,
  });
  const u  = data?.data;
  const sp = u?.staffProfile;

  useEffect(() => {
    if (u) {
      setEName(u.name ?? '');
      setEEmail(u.email ?? '');
      setEPhone(u.phone ?? '');
      setEAddress(sp?.address ?? '');
      setETfn(sp?.taxFileNumber ?? '');
      setEPos(sp?.position ?? '');
    }
  }, [u, sp]);

  const handleClose = () => { setEditing(false); setSaveErr(''); onClose(); };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true); setSaveErr('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.director.updateStaff(userId, {
        name: eName.trim(), email: eEmail.trim(), phone: ePhone.trim(),
        address: eAddress.trim(), taxFileNumber: eTfn.trim(), position: ePos.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      setEditing(false);
      onRefresh();
    } catch (e: any) { setSaveErr(e.message ?? 'Save failed.'); }
    finally { setSaving(false); }
  };

  const [showLeave, setShowLeave] = useState(false);

  const inits = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // hoursWorked is stored as text in two formats: "1h 30m" or "1.50" — parse both
  const parseHrs = (h: any): number => {
    if (h == null) return 0;
    const s = String(h);
    const hm = s.match(/(\d+)h\s*(\d+)m/);
    if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const recentShifts: any[] = u?.recentShifts ?? [];
  const hasActiveShift = recentShifts.some((s: any) => !s.clockOut);
  const hoursThisWeek = (() => {
    const mon = new Date(); mon.setDate(mon.getDate() - mon.getDay() + 1); mon.setHours(0, 0, 0, 0);
    return recentShifts
      .filter((s: any) => s.clockOut && new Date(s.clockIn) >= mon)
      .reduce((sum: number, s: any) => sum + parseHrs(s.hoursWorked), 0);
  })();

  // Leave data — fetch when showLeave opens
  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ['director-staff-leave', userId],
    queryFn: () => api.director.staffLeave(userId!),
    enabled: showLeave && !!userId,
  });
  const leaveRequests: any[] = leaveData?.data ?? [];

  const clockInMut = useMutation({
    mutationFn: () => api.director.staffClockIn(userId!),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });
  const clockOutMut = useMutation({
    mutationFn: () => api.director.staffClockOut(userId!),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });
  const approveLeave = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api.director.approveLeave(id, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-staff-leave', userId] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleMessage = () => {
    const email = u?.email;
    if (!email) { Alert.alert('No email', 'This staff member has no email on file.'); return; }
    Haptics.selectionAsync();
    Linking.openURL(`mailto:${email}`).catch(() => Alert.alert('Error', 'Could not open mail app.'));
  };

  const handleContact = () => {
    const phone = u?.phone;
    if (!phone) { Alert.alert('No phone', 'This staff member has no phone number on file.'); return; }
    Haptics.selectionAsync();
    Alert.alert(`Call ${u?.name}`, phone, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => Alert.alert('Error', 'Could not open phone app.')) },
    ]);
  };

  const handleShiftToggle = () => {
    if (hasActiveShift) {
      Alert.alert('Clock out', `End ${u?.name ?? 'this staff member'}'s active shift now?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clock Out', style: 'destructive', onPress: () => clockOutMut.mutate() },
      ]);
    } else {
      Alert.alert('Start shift', `Start an unscheduled shift for ${u?.name ?? 'this staff member'} right now?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Shift', onPress: () => clockInMut.mutate() },
      ]);
    }
  };

  const LEAVE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending:  { bg: '#FEF9C3', text: '#854D0E' },
    approved: { bg: '#DCFCE7', text: '#166534' },
    rejected: { bg: '#FEE2E2', text: '#991B1B' },
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* ── Navy header strip ──────────────────────────────────────── */}
        <View style={sp_s.header}>
          <Pressable onPress={handleClose} style={sp_s.backBtn}>
            <Feather name="chevron-left" size={22} color="#fff" />
          </Pressable>
          <Text style={sp_s.headerTitle} numberOfLines={1}>{u?.name ?? '…'}</Text>
          <Pressable
            onPress={() => { setEditing(e => !e); setSaveErr(''); Haptics.selectionAsync(); }}
            style={[sp_s.editBtn, editing && { backgroundColor: 'rgba(255,255,255,0.25)' }]}
          >
            <Text style={sp_s.editBtnText}>{editing ? 'Cancel' : 'Edit Profile'}</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <View style={{ alignItems: 'center', marginTop: 80 }}>
              <ActivityIndicator color={BLUE} size="large" />
            </View>
          ) : (
            <>
              {/* ── Avatar + shift status ────────────────────────────── */}
              <View style={sp_s.avatarSection}>
                <View style={sp_s.avatarCircle}>
                  <Text style={sp_s.avatarText}>{inits(u?.name ?? 'S')}</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  {hasActiveShift ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }} />
                      <Text style={[sp_s.shiftStatus, { color: GREEN }]}>Currently clocked in</Text>
                    </View>
                  ) : (
                    <Text style={sp_s.shiftStatus}>Not clocked in</Text>
                  )}
                  <Text style={sp_s.shiftSub}>
                    {sp?.position ?? 'Staff'} · {hoursThisWeek.toFixed(1)}h this week
                  </Text>
                  {sp?.employeeId ? (
                    <Text style={sp_s.empId}>Employee ID: {sp.employeeId}</Text>
                  ) : null}
                </View>
              </View>

              {/* ── Clock in / out button ────────────────────────────── */}
              <Pressable
                style={[sp_s.startShiftBtn, hasActiveShift && { borderColor: RED }]}
                onPress={handleShiftToggle}
                disabled={clockInMut.isPending || clockOutMut.isPending}
              >
                {(clockInMut.isPending || clockOutMut.isPending)
                  ? <ActivityIndicator color={hasActiveShift ? RED : NAVY} size="small" />
                  : <>
                      <Feather name={hasActiveShift ? 'stop-circle' : 'play-circle'} size={16} color={hasActiveShift ? RED : NAVY} />
                      <Text style={[sp_s.startShiftText, hasActiveShift && { color: RED }]}>
                        {hasActiveShift ? 'End active shift' : 'Start unscheduled shift'}
                      </Text>
                    </>
                }
              </Pressable>

              {/* ── Action buttons ───────────────────────────────────── */}
              <View style={sp_s.actionRow}>
                <Pressable style={sp_s.actionBtn} onPress={handleMessage}>
                  <Feather name="mail" size={20} color={NAVY} />
                  <Text style={sp_s.actionLabel}>Email</Text>
                </Pressable>
                <Pressable style={sp_s.actionBtn} onPress={handleContact}>
                  <Feather name="phone" size={20} color={NAVY} />
                  <Text style={sp_s.actionLabel}>Call</Text>
                </Pressable>
                <Pressable style={sp_s.actionBtn} onPress={() => {
                  Haptics.selectionAsync();
                  const sms = u?.phone?.replace(/\s/g, '');
                  if (!sms) { Alert.alert('No phone', 'No phone number on file.'); return; }
                  Linking.openURL(`sms:${sms}`).catch(() => Alert.alert('Error', 'Could not open messages.'));
                }}>
                  <Feather name="message-circle" size={20} color={NAVY} />
                  <Text style={sp_s.actionLabel}>Message</Text>
                </Pressable>
              </View>

              {/* ── Edit Profile Form ────────────────────────────────── */}
              {editing && (
                <View style={sp_s.editSection}>
                  <Text style={sp_s.sectionLabel}>CONTACT DETAILS</Text>
                  {[
                    { label: 'Full name',     value: eName,    setter: setEName,    icon: 'user',  kbType: 'default',       cap: 'words' as const },
                    { label: 'Email address', value: eEmail,   setter: setEEmail,   icon: 'mail',  kbType: 'email-address', cap: 'none'  as const },
                    { label: 'Phone number',  value: ePhone,   setter: setEPhone,   icon: 'phone', kbType: 'phone-pad',     cap: 'none'  as const },
                  ].map(({ label, value, setter, icon, kbType, cap }) => (
                    <View key={label} style={sp_s.fieldWrap}>
                      <Text style={sp_s.fieldLabel}>{label}</Text>
                      <View style={sp_s.fieldRow}>
                        <Feather name={icon as any} size={14} color={MUTED} />
                        <TextInput style={sp_s.fieldInput} value={value} onChangeText={setter}
                          placeholder={label} placeholderTextColor={MUTED}
                          keyboardType={kbType as any} autoCapitalize={cap} />
                      </View>
                    </View>
                  ))}

                  <Text style={[sp_s.sectionLabel, { marginTop: 16 }]}>ADDRESS</Text>
                  <View style={sp_s.fieldWrap}>
                    <Text style={sp_s.fieldLabel}>Home address</Text>
                    <View style={sp_s.fieldRow}>
                      <Feather name="map-pin" size={14} color={MUTED} />
                      <TextInput style={sp_s.fieldInput} value={eAddress} onChangeText={setEAddress}
                        placeholder="Street, suburb, state, postcode" placeholderTextColor={MUTED}
                        autoCapitalize="words" multiline />
                    </View>
                  </View>

                  <Text style={[sp_s.sectionLabel, { marginTop: 16 }]}>EMPLOYMENT</Text>
                  <View style={sp_s.fieldWrap}>
                    <Text style={sp_s.fieldLabel}>Position</Text>
                    <View style={sp_s.fieldRow}>
                      <Feather name="briefcase" size={14} color={MUTED} />
                      <TextInput style={sp_s.fieldInput} value={ePos} onChangeText={setEPos}
                        placeholder="e.g. Barista, Crew" placeholderTextColor={MUTED} autoCapitalize="words" />
                    </View>
                  </View>
                  <View style={sp_s.fieldWrap}>
                    <Text style={sp_s.fieldLabel}>Tax File Number (optional)</Text>
                    <View style={sp_s.fieldRow}>
                      <Feather name="hash" size={14} color={MUTED} />
                      <TextInput style={sp_s.fieldInput} value={eTfn} onChangeText={setETfn}
                        placeholder="xxx xxx xxx" placeholderTextColor={MUTED} keyboardType="numeric" secureTextEntry />
                    </View>
                    <Text style={sp_s.fieldHint}>Stored securely · not shared</Text>
                  </View>

                  {saveErr ? (
                    <View style={sp_s.errBox}>
                      <Feather name="alert-circle" size={13} color={RED} />
                      <Text style={sp_s.errText}>{saveErr}</Text>
                    </View>
                  ) : null}

                  <Pressable style={[sp_s.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={sp_s.saveBtnText}>Save Changes</Text>
                    }
                  </Pressable>
                </View>
              )}

              {/* ── Info summary (read mode) ─────────────────────────── */}
              {!editing && (
                <View style={sp_s.infoCard}>
                  {[
                    { label: 'Email',    value: u?.email },
                    { label: 'Phone',    value: u?.phone  || '—' },
                    { label: 'Address',  value: sp?.address || '—' },
                    { label: 'Position', value: sp?.position },
                    { label: 'Dept',     value: sp?.department },
                    { label: 'Status',   value: sp?.employmentStatus },
                    { label: 'Rate',     value: sp?.hourlyRateCents ? `$${(sp.hourlyRateCents / 100).toFixed(2)}/hr` : '—' },
                    { label: 'TFN',      value: sp?.taxFileNumber ? '••• ••• •••' : 'Not set' },
                  ].map(({ label, value }) => (
                    <View key={label} style={sp_s.infoRow}>
                      <Text style={sp_s.infoLabel}>{label}</Text>
                      <Text style={sp_s.infoValue} numberOfLines={2}>{value ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ── Menu rows ────────────────────────────────────────── */}
              <View style={sp_s.menuSection}>
                {/* Timesheets — scrolls to recent shifts below */}
                <Pressable style={[sp_s.menuRow, { borderBottomWidth: 1, borderBottomColor: BORDER }]}
                  onPress={() => { Haptics.selectionAsync(); }}>
                  <Feather name="clock" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Timesheets</Text>
                    <Text style={sp_s.menuSub}>{recentShifts.length} recent shifts · {hoursThisWeek.toFixed(1)}h this week</Text>
                  </View>
                  <Feather name="chevron-down" size={16} color={MUTED} />
                </Pressable>

                {/* Leave — opens leave sheet */}
                <Pressable style={[sp_s.menuRow, { borderBottomWidth: 1, borderBottomColor: BORDER }]}
                  onPress={() => { Haptics.selectionAsync(); setShowLeave(v => !v); }}>
                  <Feather name="umbrella" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Leave requests</Text>
                    <Text style={sp_s.menuSub}>Tap to review and approve</Text>
                  </View>
                  <Feather name={showLeave ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>

                {/* Upcoming shifts placeholder */}
                <Pressable style={[sp_s.menuRow, { borderBottomWidth: 1, borderBottomColor: BORDER }]}
                  onPress={() => Alert.alert('Upcoming Shifts', 'Shift scheduling will be available in a future update.')}>
                  <Feather name="calendar" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Upcoming shifts</Text>
                    <Text style={sp_s.menuSub}>Scheduling coming soon</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>

                {/* Availability placeholder */}
                <Pressable style={[sp_s.menuRow, { borderBottomWidth: 1, borderBottomColor: BORDER }]}
                  onPress={() => Alert.alert('Availability', 'Staff availability management coming soon.')}>
                  <Feather name="check-circle" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Availability</Text>
                    <Text style={sp_s.menuSub}>Preferred days & hours</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>

                {/* Journals placeholder */}
                <Pressable style={sp_s.menuRow}
                  onPress={() => Alert.alert('Journals', 'Staff journals and notes coming soon.')}>
                  <Feather name="book-open" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Journals</Text>
                    <Text style={sp_s.menuSub}>Performance notes & reviews</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>
              </View>

              {/* ── Leave requests (expandable) ───────────────────────── */}
              {showLeave && (
                <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                  <Text style={[sp_s.sectionLabel, { marginBottom: 10 }]}>LEAVE REQUESTS</Text>
                  {leaveLoading ? (
                    <ActivityIndicator color={BLUE} />
                  ) : leaveRequests.length === 0 ? (
                    <View style={[sp_s.infoCard, { padding: 20, alignItems: 'center' }]}>
                      <Feather name="umbrella" size={24} color={MUTED} />
                      <Text style={[sp_s.menuSub, { marginTop: 8 }]}>No leave requests on file</Text>
                    </View>
                  ) : (
                    <View style={sp_s.infoCard}>
                      {leaveRequests.map((lr: any, idx: number) => {
                        const sc = LEAVE_STATUS_COLORS[lr.status] ?? { bg: '#F3F4F6', text: MUTED };
                        const isPending = lr.status === 'pending';
                        return (
                          <View key={lr.id} style={[sp_s.leaveRow, idx < leaveRequests.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={sp_s.leaveType}>{lr.type.replace('_', ' ')}</Text>
                                <View style={[sp_s.statusPill, { backgroundColor: sc.bg }]}>
                                  <Text style={[sp_s.statusPillText, { color: sc.text }]}>{lr.status.toUpperCase()}</Text>
                                </View>
                              </View>
                              <Text style={sp_s.leaveDates}>{lr.startDate} → {lr.endDate}</Text>
                              {lr.reason ? <Text style={sp_s.leaveReason} numberOfLines={2}>{lr.reason}</Text> : null}
                            </View>
                            {isPending && (
                              <View style={{ gap: 6, marginLeft: 10 }}>
                                <Pressable style={[sp_s.leaveBtn, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}
                                  onPress={() => approveLeave.mutate({ id: lr.id, approved: true })}>
                                  <Text style={[sp_s.leaveBtnText, { color: '#166534' }]}>Approve</Text>
                                </Pressable>
                                <Pressable style={[sp_s.leaveBtn, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                                  onPress={() => approveLeave.mutate({ id: lr.id, approved: false })}>
                                  <Text style={[sp_s.leaveBtnText, { color: '#991B1B' }]}>Reject</Text>
                                </Pressable>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* ── Recent shifts ─────────────────────────────────────── */}
              {recentShifts.length > 0 && (
                <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 16 }}>
                  <Text style={[sp_s.sectionLabel, { marginBottom: 10 }]}>RECENT SHIFTS</Text>
                  <View style={sp_s.infoCard}>
                    {recentShifts.slice(0, 10).map((shift: any, idx: number) => (
                      <View key={shift.id} style={[sp_s.shiftRow, idx < Math.min(recentShifts.length, 10) - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={sp_s.shiftDate}>
                            {new Date(shift.clockIn).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </Text>
                          <Text style={sp_s.shiftTime}>
                            {new Date(shift.clockIn).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {shift.clockOut ? ` – ${new Date(shift.clockOut).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ' (active)'}
                          </Text>
                        </View>
                        <Text style={[sp_s.shiftHrs, { color: shift.clockOut ? TEXT : GREEN }]}>
                          {shift.hoursWorked != null ? `${parseHrs(shift.hoursWorked).toFixed(1)}h` : '•'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const sp_s = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 18, gap: 12, backgroundColor: NAVY },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { flex: 1, color: '#fff', fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  editBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  editBtnText:   { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 16, marginVertical: 20 },
  avatarCircle:  { width: 64, height: 64, borderRadius: 32, backgroundColor: NAVY + '18', borderWidth: 2, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: NAVY, fontSize: 22, fontFamily: 'Inter_700Bold' },
  shiftStatus:   { color: MUTED, fontSize: 14, fontFamily: 'Inter_500Medium' },
  shiftSub:      { color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular' },
  empId:         { color: MUTED, fontSize: 11, fontFamily: 'Inter_400Regular' },
  startShiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: NAVY },
  startShiftText:{ color: NAVY, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  actionRow:     { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 20 },
  actionBtn:     { flex: 1, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 16, alignItems: 'center', gap: 8 },
  actionLabel:   { color: TEXT, fontSize: 12, fontFamily: 'Inter_500Medium' },
  sectionLabel:  { color: MUTED, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginBottom: 8 },
  infoCard:      { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:     { color: MUTED, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  infoValue:     { color: TEXT, fontSize: 13, fontFamily: 'Inter_500Medium', flex: 2, textAlign: 'right' },
  menuSection:   { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  menuLabel:     { color: TEXT, fontSize: 15, fontFamily: 'Inter_500Medium' },
  menuSub:       { color: MUTED, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  leaveRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 },
  leaveType:     { color: TEXT, fontSize: 13, fontFamily: 'Inter_600SemiBold', textTransform: 'capitalize' },
  statusPill:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusPillText:{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  leaveDates:    { color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  leaveReason:   { color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' },
  leaveBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  leaveBtnText:  { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  editSection:   { marginHorizontal: 16, marginBottom: 16, gap: 4 },
  fieldWrap:     { marginBottom: 8 },
  fieldLabel:    { color: MUTED, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 6 },
  fieldRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 52, borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: CARD },
  fieldInput:    { flex: 1, color: TEXT, fontSize: 15, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  fieldHint:     { color: MUTED, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, marginLeft: 2 },
  errBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 8 },
  errText:       { flex: 1, color: RED, fontSize: 13, fontFamily: 'Inter_400Regular' },
  saveBtn:       { backgroundColor: NAVY, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveBtnText:   { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  shiftRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  shiftDate:     { color: TEXT, fontSize: 13, fontFamily: 'Inter_500Medium' },
  shiftTime:     { color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  shiftHrs:      { fontSize: 14, fontFamily: 'Inter_700Bold' },
});

// ── Wholesale Detail Modal ──────────────────────────────────────────────────
const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};

function WholesaleDetailModal({ user, wa, visible, onClose, onRefresh }: {
  user: any; wa: any; visible: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [creditAud, setCreditAud]     = useState('');
  const [payTerms, setPayTerms]       = useState('');
  const [deliveryAddr, setDeliveryAddr] = useState('');
  const [suspended, setSuspended]     = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [saving, setSaving]           = useState(false);
  const [togglingCard, setTogglingCard]   = useState<string | null>(null);
  const [revealingCard, setRevealingCard] = useState<string | null>(null);
  const [revealedCards, setRevealedCards] = useState<Record<string, any>>({});

  const { data: cardsData, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ['director-ws-cards', wa?.id],
    queryFn: () => api.director.wholesaleCards(wa!.id),
    enabled: visible && !!wa?.id,
    staleTime: 0,
  });
  const cards = cardsData?.data ?? [];

  useEffect(() => {
    if (wa) {
      setCreditAud(wa.creditLimitCents ? String(wa.creditLimitCents / 100) : '');
      setPayTerms(wa.paymentTerms ?? '30 days');
      setDeliveryAddr(wa.deliveryAddress ?? '');
      setSuspended(wa.isSuspended ?? false);
      setSuspendReason(wa.suspendedReason ?? '');
    }
  }, [wa]);

  if (!wa || !user) return null;

  const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
    approved: { color: GREEN,  bg: '#DCFCE7', label: 'Approved' },
    pending:  { color: AMBER,  bg: '#FEF3C7', label: 'Pending' },
    rejected: { color: RED,    bg: '#FEE2E2', label: 'Rejected' },
  };
  const cfg = STATUS_CFG[wa.status] ?? STATUS_CFG.pending;

  const handleStatus = async (status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setWholesaleStatus(wa.id, status);
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleSuspend = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSuspended(val);
    try {
      await api.director.suspendWholesale(wa.id, { isSuspended: val, suspendedReason: val ? suspendReason : undefined });
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); setSuspended(!val); }
  };

  const handleSave = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const creditCents = creditAud ? Math.round(parseFloat(creditAud) * 100) : undefined;
      await api.director.updateWholesale(wa.id, {
        creditLimitCents: isNaN(creditCents as number) ? undefined : creditCents,
        paymentTerms: payTerms.trim() || undefined,
        deliveryAddress: deliveryAddr.trim() || undefined,
      });
      onRefresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Wholesale account updated.');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleCardVisibility = async (cardId: string, current: boolean) => {
    setTogglingCard(cardId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.director.setCardVisibility(cardId, !current);
      refetchCards();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setTogglingCard(null); }
  };

  const handleReveal = async (cardId: string) => {
    if (revealedCards[cardId]) {
      setRevealedCards(prev => { const n = { ...prev }; delete n[cardId]; return n; });
      return;
    }
    setRevealingCard(cardId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await api.director.revealCard(cardId);
      setRevealedCards(prev => ({ ...prev, [cardId]: res.data }));
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setRevealingCard(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Header */}
        <View style={[wdl.header, { paddingTop: insets.top + 8, backgroundColor: CARD, borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={wdl.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={wdl.title}>{wa.companyName}</Text>
            <View style={[wdl.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <Text style={[wdl.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Company info */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT INFO</Text>
            {[
              { label: 'Company',  value: wa.companyName },
              { label: 'ABN',      value: wa.abn ?? '—' },
              { label: 'Contact',  value: user.name },
              { label: 'Email',    value: user.email },
              { label: 'Tier',     value: wa.tier?.name ?? wa.pricingTier ?? 'Standard' },
              { label: 'Credit Used', value: wa.creditUsedCents ? `$${(wa.creditUsedCents / 100).toFixed(2)}` : '$0.00' },
            ].map((row) => (
              <View key={row.label} style={wdl.infoRow}>
                <Text style={wdl.infoLabel}>{row.label}</Text>
                <Text style={wdl.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Status controls */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT STATUS</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {[
                { key: 'approved', label: 'Approve',  color: GREEN,  bg: '#DCFCE7' },
                { key: 'pending',  label: 'Pending',  color: AMBER,  bg: '#FEF3C7' },
                { key: 'rejected', label: 'Reject',   color: RED,    bg: '#FEE2E2' },
              ].map((s) => {
                const active = wa.status === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => handleStatus(s.key)}
                    style={[wdl.statusBtn, { backgroundColor: active ? s.bg : '#F3F4F6', borderColor: active ? s.color : BORDER, borderWidth: 1 }]}
                  >
                    <Text style={[wdl.statusBtnText, { color: active ? s.color : MUTED }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Edit fields */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT SETTINGS</Text>
            <Text style={wdl.fieldLabel}>Credit Limit (AUD)</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 15 }}>$</Text>
              <TextInput
                style={[wdl.input, { color: TEXT }]}
                placeholder="e.g. 5000"
                placeholderTextColor={MUTED}
                value={creditAud}
                onChangeText={setCreditAud}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Payment Terms</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <TextInput
                style={[wdl.input, { color: TEXT }]}
                placeholder="e.g. 30 days"
                placeholderTextColor={MUTED}
                value={payTerms}
                onChangeText={setPayTerms}
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Delivery Address</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER, height: 72, alignItems: 'flex-start', paddingTop: 12 }]}>
              <TextInput
                style={[wdl.input, { color: TEXT }]}
                placeholder="Street, suburb, postcode"
                placeholderTextColor={MUTED}
                value={deliveryAddr}
                onChangeText={setDeliveryAddr}
                multiline
              />
            </View>
          </View>

          {/* Suspend */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Suspend Account</Text>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }}>Prevents new orders while suspended</Text>
              </View>
              <Switch
                value={suspended}
                onValueChange={handleSuspend}
                trackColor={{ false: '#D1D5DB', true: RED }}
                thumbColor="#fff"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
            {suspended && (
              <View style={[wdl.inputRow, { borderColor: '#FECACA', marginTop: 12 }]}>
                <TextInput
                  style={[wdl.input, { color: TEXT }]}
                  placeholder="Suspension reason (optional)"
                  placeholderTextColor={MUTED}
                  value={suspendReason}
                  onChangeText={setSuspendReason}
                />
              </View>
            )}
          </View>

          {/* Cards on File */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={wdl.sectionLabel}>CARDS ON FILE</Text>
              {cardsLoading && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            {!cardsLoading && cards.length === 0 && (
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>No cards saved by this account yet.</Text>
            )}
            {cards.map((card: any) => {
              const bg         = BRAND_BG[card.cardBrand] ?? '#1A3A8C';
              const isToggling = togglingCard === card.id;
              const isRevealing = revealingCard === card.id;
              const revealed   = revealedCards[card.id];
              const isRevealed = !!revealed;

              // Format full card number for display (groups of 4)
              const formatFull = (num: string | null) => {
                if (!num) return '•••• •••• •••• ••••';
                return num.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
              };

              return (
                <View key={card.id} style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}>
                  {/* Card face */}
                  <View style={{ backgroundColor: bg, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16, letterSpacing: isRevealed ? 2 : 3 }}>
                            {isRevealed ? formatFull(revealed.fullCardNumber) : `•••• •••• •••• ${card.last4}`}
                          </Text>
                        </View>
                        {isRevealed && (
                          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                            <View>
                              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 }}>EXPIRY</Text>
                              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>{revealed.expiry}</Text>
                            </View>
                            <View>
                              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 }}>CVV</Text>
                              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 }}>{revealed.cvv ?? '•••'}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {card.isDefault && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' }}>DEFAULT</Text>
                          </View>
                        )}
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>{card.cardBrand}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>{card.nameOnCard}</Text>
                      {!isRevealed && (
                        <Text style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>Exp {card.expiry}</Text>
                      )}
                    </View>
                  </View>

                  {/* Reveal / Hide button */}
                  <Pressable
                    onPress={() => handleReveal(card.id)}
                    disabled={isRevealing}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10,
                      backgroundColor: isRevealed ? '#FEF3C7' : '#F0F9FF',
                      borderBottomWidth: 1, borderBottomColor: BORDER,
                    }}
                  >
                    {isRevealing
                      ? <ActivityIndicator size="small" color={BLUE} />
                      : <>
                          <Feather name={isRevealed ? 'eye-off' : 'eye'} size={14} color={isRevealed ? AMBER : BLUE} />
                          <Text style={{ color: isRevealed ? AMBER : BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                            {isRevealed ? 'Hide Card Details' : 'Reveal Full Number & CVV'}
                          </Text>
                        </>
                    }
                  </Pressable>

                  {/* Manager visibility toggle */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: CARD }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Visible to Manager</Text>
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>Allow manager portal to view this card</Text>
                    </View>
                    {isToggling
                      ? <ActivityIndicator size="small" color={BLUE} style={{ marginLeft: 8 }} />
                      : <Switch
                          value={card.visibleToManager}
                          onValueChange={() => handleCardVisibility(card.id, card.visibleToManager)}
                          trackColor={{ false: '#D1D5DB', true: BLUE }}
                          thumbColor="#fff"
                          ios_backgroundColor="#D1D5DB"
                        />
                    }
                  </View>
                </View>
              );
            })}
          </View>

          {/* Save button */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={[wdl.saveBtn, { opacity: saving ? 0.8 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={wdl.saveBtnText}>Save Changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

type CreateType = 'staff' | 'wholesale';

function CreateUserModal({ visible, type, onClose, onSuccess }: {
  visible: boolean; type: CreateType; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [abn, setAbn]                 = useState('');
  const [phone, setPhone]             = useState('');
  const [position, setPosition]       = useState('Crew');
  const [isManager, setIsManager]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setCompanyName('');
    setAbn(''); setPhone(''); setPosition('Crew'); setIsManager(false);
    setError(''); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email and password are required.'); return;
    }
    if (type === 'wholesale' && !companyName.trim()) {
      setError('Company name is required.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (type === 'staff') {
        await api.director.createStaff({ name: name.trim(), email: email.trim(), password, position: position.trim(), isManager });
      } else {
        await api.director.createWholesale({ name: name.trim(), email: email.trim(), password, companyName: companyName.trim(), abn: abn.trim() || undefined, phone: phone.trim() || undefined });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create account.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };

  const isStaff = type === 'staff';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={handleClose} style={modal.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[modal.title, { color: TEXT }]}>Add {isStaff ? 'Staff Member' : 'Wholesale Customer'}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">

          {/* Role badge */}
          <View style={[modal.roleBanner, { backgroundColor: isStaff ? '#EDE9FE' : '#DCFCE7' }]}>
            <Feather name={isStaff ? 'users' : 'package'} size={15} color={isStaff ? '#5B21B6' : '#166534'} />
            <Text style={[modal.roleBannerText, { color: isStaff ? '#5B21B6' : '#166534' }]}>
              {isStaff ? 'New staff account will be pre-approved' : 'Wholesale account will be marked approved'}
            </Text>
          </View>

          {/* Common fields */}
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="user" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Full name" placeholderTextColor={MUTED} value={name} onChangeText={setName} autoCapitalize="words" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="mail" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="lock" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT, flex: 1 }]} placeholder="Temporary password (min. 8 chars)" placeholderTextColor={MUTED} value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoComplete="new-password" />
            <Pressable onPress={() => setShowPw(p => !p)}>
              <Feather name={showPw ? 'eye-off' : 'eye'} size={15} color={MUTED} />
            </Pressable>
          </View>

          {/* Staff-specific */}
          {isStaff && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>POSITION DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Position (e.g. Barista, Crew)" placeholderTextColor={MUTED} value={position} onChangeText={setPosition} autoCapitalize="words" />
              </View>
              <View style={[modal.toggleRow, { borderColor: BORDER }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[modal.toggleLabel, { color: TEXT }]}>Manager permissions</Text>
                  <Text style={[modal.toggleSub, { color: MUTED }]}>Can view staff timesheets and update geo radius</Text>
                </View>
                <Switch value={isManager} onValueChange={setIsManager} trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
              </View>
            </>
          )}

          {/* Wholesale-specific */}
          {!isStaff && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>COMPANY DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Company name *" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="hash" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="phone" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Phone (optional)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
            </>
          )}

          {error ? (
            <View style={modal.errorBox}>
              <Feather name="alert-circle" size={14} color={RED} />
              <Text style={[modal.errorText, { color: RED }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable onPress={handleSubmit} disabled={loading} style={[modal.submitBtn, { backgroundColor: isStaff ? NAVY : GREEN, opacity: loading ? 0.8 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={modal.submitBtnText}>Create {isStaff ? 'Staff Account' : 'Wholesale Account'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DirectorUsersScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Customers');
  const [createType, setCreateType] = useState<CreateType>('staff');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWholesaleUser, setSelectedWholesaleUser] = useState<any | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
  });

  const allUsers: any[] = data?.data ?? [];

  const filtered = allUsers.filter((u) => {
    if (tab === 'Customers')  return u.role === 'customer';
    if (tab === 'Staff')      return u.role === 'staff' || u.role === 'manager';
    if (tab === 'Wholesale')  return u.role === 'wholesale';
    return true;
  });

  const openCreate = (type: CreateType) => {
    setCreateType(type); setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const approveStaff = async (userId: string, approved: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.approveStaff(userId, approved);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleRefreshUsers = async () => {
    await qc.invalidateQueries({ queryKey: ['director-users'] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar + Add buttons */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2, gap: 8 }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { setTab(t); Haptics.selectionAsync(); }}
                style={[styles.tabChip, { backgroundColor: active ? BLUE : BG, borderColor: active ? BLUE : BORDER }]}
              >
                <Text style={[styles.tabChipText, { color: active ? '#fff' : MUTED }]}>{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Quick-add strip — only for Staff + Wholesale */}
        {tab !== 'Customers' && (
          <View style={[styles.addStrip, { borderTopColor: BORDER }]}>
            <Text style={[styles.addStripLabel, { color: MUTED }]}>Add new:</Text>
            <Pressable onPress={() => openCreate('staff')} style={[styles.addBtn, { backgroundColor: '#EDE9FE' }]}>
              <Feather name="user-plus" size={13} color="#5B21B6" />
              <Text style={[styles.addBtnText, { color: '#5B21B6' }]}>Staff Member</Text>
            </Pressable>
            <Pressable onPress={() => openCreate('wholesale')} style={[styles.addBtn, { backgroundColor: '#DCFCE7' }]}>
              <Feather name="package" size={13} color="#166534" />
              <Text style={[styles.addBtnText, { color: '#166534' }]}>Wholesale</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Customers → full Shopify-style CRM screen */}
      {tab === 'Customers' ? (
        <DirectorCustomersScreen />
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular' }}>No users in this category</Text>
            </View>
          }
          renderItem={({ item: u }) => {
            const roleColors = ROLE_COLORS[u.role] ?? { bg: BG, text: MUTED };
            const sp = u.staffProfile;
            const wa = u.wholesaleAccount;
            return (
              <View style={[styles.userCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <Pressable
                  style={styles.userTop}
                  onPress={sp ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedStaffId(u.id); } : undefined}
                >
                  <View style={[styles.avatar, { backgroundColor: roleColors.bg }]}>
                    <Text style={[styles.avatarText, { color: roleColors.text }]}>{initials(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
                        <Text style={[styles.rolePillText, { color: roleColors.text }]}>{u.role}</Text>
                      </View>
                      {sp && <Feather name="chevron-right" size={14} color={MUTED} style={{ marginLeft: 'auto' }} />}
                    </View>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <Text style={styles.userDate}>Joined {new Date(u.createdAt).toLocaleDateString('en-AU')}</Text>
                  </View>
                </Pressable>

                {/* Staff approval toggle */}
                {sp && (
                  <View style={[styles.subRow, { borderTopColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{sp.position} · {sp.department}</Text>
                      <Text style={[styles.subSub, { color: sp.approvedByAdmin ? GREEN : AMBER }]}>
                        {sp.approvedByAdmin ? '✓ Approved' : '⏳ Pending approval'}
                      </Text>
                    </View>
                    <Switch
                      value={sp.approvedByAdmin}
                      onValueChange={(v) => approveStaff(u.id, v)}
                      trackColor={{ false: '#D1D5DB', true: GREEN }}
                      thumbColor="#fff"
                      ios_backgroundColor="#D1D5DB"
                    />
                  </View>
                )}

                {/* Wholesale status */}
                {wa && (
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedWholesaleUser(u); }}
                    style={[styles.subRow, { borderTopColor: BORDER }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{wa.companyName}</Text>
                      <Text style={[styles.subSub, {
                        color: wa.status === 'approved' ? GREEN : wa.status === 'rejected' ? RED : AMBER,
                      }]}>
                        {wa.status === 'approved' ? '✓ Approved' : wa.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                        {wa.isSuspended ? ' · Suspended' : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: BLUE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Manage</Text>
                      <Feather name="chevron-right" size={13} color={BLUE} />
                    </View>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <CreateUserModal
        visible={showCreate}
        type={createType}
        onClose={() => setShowCreate(false)}
        onSuccess={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ['director-users'] });
          Alert.alert('Account created', `The new ${createType} account is ready to use.`);
        }}
      />

      <WholesaleDetailModal
        visible={!!selectedWholesaleUser}
        user={selectedWholesaleUser}
        wa={selectedWholesaleUser?.wholesaleAccount ?? null}
        onClose={() => setSelectedWholesaleUser(null)}
        onRefresh={handleRefreshUsers}
      />

      <StaffProfileModal
        visible={!!selectedStaffId}
        userId={selectedStaffId}
        onClose={() => setSelectedStaffId(null)}
        onRefresh={handleRefreshUsers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabChipText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  addStrip:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  addStripLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addBtnText:    { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  userCard:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  userTop:       { flexDirection: 'row', gap: 12, padding: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 16, fontFamily: 'Inter_700Bold' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName:      { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  rolePill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText:  { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  userEmail:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  userDate:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  subRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, padding: 12, paddingHorizontal: 14 },
  subTitle:      { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  subSub:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
});

const modal = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 16, fontFamily: 'Inter_700Bold' },
  roleBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  roleBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel:   { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, marginTop: 2 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  input:          { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  toggleLabel:    { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  toggleSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  errorBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:      { flex: 1, fontSize: 13 },
  submitBtn:      { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText:  { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});

const wdl = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  statusBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  card:            { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 0 },
  sectionLabel:    { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, color: '#8E8E93', marginBottom: 8 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoLabel:       { color: '#8E8E93', fontFamily: 'Inter_400Regular', fontSize: 13 },
  infoValue:       { color: '#1C1C1E', fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  statusBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  statusBtnText:   { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  fieldLabel:      { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#8E8E93', marginBottom: 6 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: '#F5F6FA' },
  input:           { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  saveBtn:         { height: 54, borderRadius: 14, backgroundColor: '#40C0F2', alignItems: 'center', justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});
