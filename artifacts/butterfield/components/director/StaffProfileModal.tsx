import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { modal } from '@/components/director/usersStyles';
import type { AccessRole, DirectorStaffMember, DirectorUserSummary, LoginHistoryEntry, StaffInviteToken, StaffLeaveRequest, StaffShift, StaffStoreAssignment, StoreSummary } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
type FeatherIconName = ComponentProps<typeof Feather>['name'];
type InputKeyboardType = ComponentProps<typeof TextInput>['keyboardType'];
const ACCESS_ROLE_OPTIONS: { key: AccessRole; label: string }[] = [
  { key: 'manager', label: 'Manager' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'store_manager', label: 'Store Manager' },
  { key: 'area_manager', label: 'Area Manager' },
  { key: 'director', label: 'Director' },
  { key: 'master', label: 'Master' },
];

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date} at ${time}`;
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

function getUserRoleLabel(user: DirectorUserSummary): string {
  if (user.role === 'manager') return user.staffProfile?.position?.trim() || 'Manager';
  if (user.role === 'shop_display') return 'POS Screen';
  if (user.role === 'master') return 'Master';
  if (user.role === 'director') return 'Director';
  if (user.role === 'staff') return 'Staff';
  if (user.role === 'wholesale') return 'Wholesale';
  return 'Customer';
}

// ── Login History inline (used inside StaffProfileModal) ─────────────────
function LoginHistoryInline({ userId }: { userId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['director', 'login-history', userId],
    queryFn: () => api.director.loginHistory({ userId: userId!, pageSize: 20 }),
    enabled: !!userId,
    staleTime: 30_000,
  });
  const entries: LoginHistoryEntry[] = data?.data ?? [];
  if (isLoading) return null;
  if (entries.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 12 }}>
      <Text style={[sp_s.sectionLabel, { marginBottom: 10 }]}>RECENT LOGINS</Text>
      <View style={sp_s.infoCard}>
        {entries.map((ev, idx) => (
          <View
            key={ev.id}
            style={[
              { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
              idx < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER },
            ]}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ev.success ? GREEN : RED }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: TEXT }}>
                {ev.success ? 'Login success' : `Failed · ${ev.failReason ?? 'unknown'}`}
              </Text>
              {ev.ip ? <Text style={{ fontSize: 11, color: MUTED }}>IP: {ev.ip}</Text> : null}
            </View>
            <Text style={{ fontSize: 11, color: MUTED }}>
              {new Date(ev.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}
              {' '}
              {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}


// ── Staff Profile Modal ────────────────────────────────────────────────────
function StaffProfileModal({ userId, visible, onClose, onRefresh, onDelete }: {
  userId: string | null; visible: boolean; onClose: () => void; onRefresh: () => void; onDelete: () => void;
}) {
  const qc = useQueryClient();
  const { user: loggedInUser } = useAuth();
  const isMaster = loggedInUser?.role === 'master';
  const [editing, setEditing] = useState(false);
  // Editable fields
  const [eName,         setEName]         = useState('');
  const [eEmail,        setEEmail]        = useState('');
  const [ePhone,        setEPhone]        = useState('');
  const [eAddress,      setEAddress]      = useState('');
  const [eTfn,          setETfn]          = useState('');
  const [ePos,          setEPos]          = useState('');
  const [eRate,         setERate]         = useState('');
  const [canViewOrders, setCanViewOrders] = useState(false);
  const [pinInput, setPinInput]         = useState('');
  const [pinSaving, setPinSaving]       = useState(false);
  const [pinMsg, setPinMsg]             = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState('');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-staff-member', userId],
    queryFn: () => api.director.staffMember(userId!),
    enabled: visible && !!userId,
    staleTime: 0,
  });
  const u: DirectorStaffMember | undefined = data?.data;
  const sp = u?.staffProfile;
  useEffect(() => {
    if (u) {
      setEName(u.name ?? '');
      setEEmail(u.email ?? '');
      setEPhone(u.phone ?? '');
      setEAddress(sp?.address ?? '');
      setETfn(sp?.taxFileNumber ?? '');
      setEPos(sp?.position ?? '');
      setERate(sp?.hourlyRateCents ? String((sp.hourlyRateCents / 100).toFixed(2)) : '');
      setCanViewOrders(sp?.canViewOrders === true);
    }
  }, [u, sp]);
  const handleClose = () => { setEditing(false); setSaveErr(''); onClose(); };
  const handleSave = async () => {
    if (!userId) return;
    setSaving(true); setSaveErr('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const rateVal = parseFloat(eRate);
      await api.director.updateStaff(userId, {
        name: eName.trim(), email: eEmail.trim(), phone: ePhone.trim(),
        address: eAddress.trim(), taxFileNumber: eTfn.trim(), position: ePos.trim(),
        hourlyRateCents: eRate.trim() && !isNaN(rateVal) ? Math.round(rateVal * 100) : undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      setEditing(false);
      onRefresh();
    } catch (error) { setSaveErr(getErrorMessage(error, 'Save failed.')); }
    finally { setSaving(false); }
  };
  const [showLeave,        setShowLeave]        = useState(false);
  const [showAssignments,  setShowAssignments]  = useState(false);
  const inits = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  // hoursWorked is stored as text in two formats: "1h 30m" or "1.50" — parse both
  const parseHrs = (h: string | number | null | undefined): number => {
    if (h == null) return 0;
    const s = String(h);
    const hm = s.match(/(\d+)h\s*(\d+)m/);
    if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const recentShifts: StaffShift[] = u?.recentShifts ?? [];
  const hasActiveShift = recentShifts.some((s) => !s.clockOut);
  const hoursThisWeek = (() => {
    const mon = new Date(); mon.setDate(mon.getDate() - mon.getDay() + 1); mon.setHours(0, 0, 0, 0);
    return recentShifts
      .filter((s) => s.clockOut && new Date(s.clockIn) >= mon)
      .reduce((sum: number, s) => sum + parseHrs(s.hoursWorked), 0);
  })();
  // Leave data — fetch when showLeave opens
  const { data: leaveData, isLoading: leaveLoading } = useQuery({
    queryKey: ['director-staff-leave', userId],
    queryFn: () => api.director.staffLeave(userId!),
    enabled: showLeave && !!userId,
  });
  const leaveRequests: StaffLeaveRequest[] = leaveData?.data ?? [];
  // Store assignments
  const { data: assignData, isLoading: assignLoading, refetch: refetchAssign } = useQuery({
    queryKey: ['director-staff-assignments', userId],
    queryFn: () => api.director.staffAssignments(userId!),
    enabled: showAssignments && !!userId,
  });
  const staffAssignments: StaffStoreAssignment[] = assignData?.data ?? [];
  const { data: allStoresData } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
    staleTime: 60000,
  });
  const allStores: StoreSummary[] = allStoresData?.data ?? [];
  const handleAddAssignment = () => {
    const activeStores = allStores.filter(s => s.status !== 'closed');
    const assigned = staffAssignments.map(a => a.storeId);
    const available = activeStores.filter(s => !assigned.includes(s.id));
    if (available.length === 0) {
      Alert.alert('No stores', 'All active stores are already assigned, or no stores are configured.');
      return;
    }
    const opts = available.map(s => ({
      text: `${s.name}${s.suburb ? ` – ${s.suburb}` : ''}`,
      onPress: async () => {
        try {
          await api.director.createAssignment({ staffId: userId!, storeId: s.id });
          refetchAssign();
        } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
      },
    }));
    Alert.alert('Assign to Store', 'Select a store to assign this staff member to:', [
      ...opts, { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  const handleRemoveAssignment = (assignId: string, storeName: string) => {
    Alert.alert('Remove Assignment', `Remove assignment to ${storeName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.director.deleteAssignment(assignId);
            refetchAssign();
          } catch (error) {
            Alert.alert('Error', getErrorMessage(error, 'Unable to remove this store assignment.'));
          }
      }},
    ]);
  };
  const handleSetPrimary = async (assignId: string) => {
    try {
      await api.director.updateAssignment(assignId, { isPrimary: true });
      refetchAssign();
    } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
  };
  const clockInMut = useMutation({
    mutationFn: () => api.director.staffClockIn(userId!),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); },
    onError: (error) => Alert.alert('Error', getErrorMessage(error)),
  });
  const clockOutMut = useMutation({
    mutationFn: () => api.director.staffClockOut(userId!),
  });
  const approveLeave = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api.director.approveLeave(id, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-staff-leave', userId] }),
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
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
                  {u?.createdAt ? (
                    <Text style={sp_s.empId}>Registered: {fmtDateTime(u.createdAt)}</Text>
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
                  ? <ActivityIndicator color={hasActiveShift ? RED : BLUE} size="small" />
                  : <>
                      <Feather name={hasActiveShift ? 'stop-circle' : 'play-circle'} size={16} color={hasActiveShift ? RED : BLUE} />
                      <Text style={[sp_s.startShiftText, hasActiveShift && { color: RED }]}>
                        {hasActiveShift ? 'End active shift' : 'Start unscheduled shift'}
                      </Text>
                    </>
                }
              </Pressable>
              {/* ── Action buttons ───────────────────────────────────── */}
              <View style={sp_s.actionRow}>
                <Pressable style={sp_s.actionBtn} onPress={handleMessage}>
                  <Feather name="mail" size={20} color={BLUE} />
                  <Text style={sp_s.actionLabel}>Email</Text>
                </Pressable>
                <Pressable style={sp_s.actionBtn} onPress={handleContact}>
                  <Feather name="phone" size={20} color={BLUE} />
                  <Text style={sp_s.actionLabel}>Call</Text>
                </Pressable>
                <Pressable style={sp_s.actionBtn} onPress={() => {
                  Haptics.selectionAsync();
                  const sms = u?.phone?.replace(/\s/g, '');
                  if (!sms) { Alert.alert('No phone', 'No phone number on file.'); return; }
                  Linking.openURL(`sms:${sms}`).catch(() => Alert.alert('Error', 'Could not open messages.'));
                }}>
                  <Feather name="message-circle" size={20} color={BLUE} />
                  <Text style={sp_s.actionLabel}>Message</Text>
                </Pressable>
              </View>
              {/* ── Edit Profile Form ────────────────────────────────── */}
              {editing && (
                <View style={sp_s.editSection}>
                  <Text style={sp_s.sectionLabel}>CONTACT DETAILS</Text>
                    {[
                    { label: 'Full name',     value: eName,    setter: setEName,    icon: 'user' as FeatherIconName,  kbType: 'default' as InputKeyboardType,       cap: 'words' as const },
                    { label: 'Email address', value: eEmail,   setter: setEEmail,   icon: 'mail' as FeatherIconName,  kbType: 'email-address' as InputKeyboardType, cap: 'none'  as const },
                    { label: 'Phone number',  value: ePhone,   setter: setEPhone,   icon: 'phone' as FeatherIconName, kbType: 'phone-pad' as InputKeyboardType,     cap: 'none'  as const },
                  ].map(({ label, value, setter, icon, kbType, cap }) => (
                    <View key={label} style={sp_s.fieldWrap}>
                      <Text style={sp_s.fieldLabel}>{label}</Text>
                      <View style={sp_s.fieldRow}>
                        <Feather name={icon} size={14} color={MUTED} />
                        <TextInput style={sp_s.fieldInput} value={value} onChangeText={setter}
                          placeholder={label} placeholderTextColor={MUTED}
                          keyboardType={kbType} autoCapitalize={cap} />
                      </View>
                    </View>
                  ))}
                  <Text style={[sp_s.sectionLabel, { marginTop: 16 }]}>ADDRESS</Text>
                  <View style={sp_s.fieldWrap}>
                    <Text style={sp_s.fieldLabel}>Home address</Text>
                    <AddressSearchInput
                      currentValue={eAddress || undefined}
                      placeholder="Search home address…"
                      onSelect={(r) => {
                        const parts = [r.street, r.suburb, r.state, r.postcode].filter(Boolean);
                        setEAddress(parts.join(', '));
                      }}
                    />
                    <View style={[sp_s.fieldRow, { marginTop: 8 }]}>
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
                    <Text style={sp_s.fieldLabel}>Hourly Rate (AUD)</Text>
                    <View style={sp_s.fieldRow}>
                      <Feather name="dollar-sign" size={14} color={MUTED} />
                      <TextInput style={sp_s.fieldInput} value={eRate} onChangeText={setERate}
                        placeholder="e.g. 25.00" placeholderTextColor={MUTED} keyboardType="decimal-pad" />
                    </View>
                    <Text style={sp_s.fieldHint}>Director-only · staff cannot edit their own rate</Text>
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
                    { label: 'Date of birth', value: sp?.dateOfBirth || '—' },
                    { label: 'Position', value: sp?.position },
                    { label: 'Dept',     value: sp?.department },
                    { label: 'Status',   value: sp?.employmentStatus },
                    { label: 'Rate',     value: sp?.hourlyRateCents ? `$${(sp.hourlyRateCents / 100).toFixed(2)}/hr` : '—' },
                    { label: 'TFN',      value: sp?.taxFileNumber ? '••• ••• •••' : 'Not set' },
                    {
                      label: 'Emergency contact',
                      value: sp?.emergencyContact?.name
                        ? `${sp.emergencyContact.name}${sp.emergencyContact.relationship ? ` · ${sp.emergencyContact.relationship}` : ''}${sp.emergencyContact.phone ? ` · ${sp.emergencyContact.phone}` : ''}`
                        : '—',
                    },
                  ].map(({ label, value }) => (
                    <View key={label} style={sp_s.infoRow}>
                      <Text style={sp_s.infoLabel}>{label}</Text>
                      <Text style={sp_s.infoValue} numberOfLines={2}>{value ?? '—'}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* ── Portal access permissions ────────────────────────── */}
              <View style={[sp_s.menuSection, { marginBottom: 12 }]}>
                <View style={[sp_s.menuRow, { justifyContent: 'space-between' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                    <Feather name="shopping-bag" size={17} color={BLUE} />
                    <View style={{ flex: 1 }}>
                      <Text style={sp_s.menuLabel}>Can view orders</Text>
                      <Text style={sp_s.menuSub}>Access to orders queue, schedule &amp; customer names</Text>
                    </View>
                  </View>
                  <Switch
                    value={canViewOrders}
                    onValueChange={async (val) => {
                      if (!userId) return;
                      setCanViewOrders(val);
                      Haptics.selectionAsync();
                      try {
                        await api.director.setStaffOrdersPermission(userId, val);
                        await refetch();
                        await qc.invalidateQueries({ queryKey: ['director-users'] });
                      } catch (error) {
                        setCanViewOrders(!val);
                        Alert.alert('Error', getErrorMessage(error, 'Could not update permission.'));
                      }
                    }}
                    trackColor={{ false: '#E5E7EB', true: '#BBF7D0' }}
                    thumbColor={canViewOrders ? '#16A34A' : '#9CA3AF'}
                  />
                </View>
              </View>
              {/* ── POS PIN (unified: clock-in, refunds, register menu, Linkly) ── */}
              <View style={[sp_s.menuSection, { marginBottom: 12 }]}>
                <View style={[sp_s.menuRow, { paddingVertical: 12 }]}>
                  <Feather name="lock" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>POS PIN</Text>
                    <Text style={sp_s.menuSub}>One 4-digit PIN for clock-in, refunds, register menu, EFTPOS &amp; all approvals</Text>
                  </View>
                </View>
                <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: BORDER }}>
                      <TextInput
                        style={{ flex: 1, fontSize: 15, color: TEXT, fontWeight: '600', letterSpacing: 0 }}
                        value={pinInput}
                        onChangeText={(t) => { setPinInput(t.replace(/\D/g, '').slice(0, 4)); setPinMsg(null); }}
                        placeholder="New PIN"
                        placeholderTextColor={MUTED}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={4}
                      />
                      <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700' }}>{pinInput.length}/4</Text>
                    </View>
                    <Pressable
                      disabled={pinInput.length !== 4 || pinSaving}
                      onPress={async () => {
                        if (!userId || pinInput.length !== 4) return;
                        setPinSaving(true);
                        try {
                          // Set both fields atomically — server syncs them together
                          await Promise.all([
                            api.director.setStaffClockPin(userId, pinInput),
                            api.director.setStaffSettingsPin(userId, pinInput),
                          ]);
                          setPinInput(''); setPinMsg('PIN saved ✓');
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (error) { setPinMsg(getErrorMessage(error, 'Failed to save PIN')); }
                        finally { setPinSaving(false); }
                      }}
                      style={[modal.chip, { backgroundColor: pinInput.length === 4 ? BLUE : BG, borderColor: pinInput.length === 4 ? BLUE : BORDER, paddingVertical: 10, paddingHorizontal: 14 }]}
                    >
                      {pinSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[modal.chipText, { color: pinInput.length === 4 ? '#fff' : MUTED }]}>Set PIN</Text>}
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (!userId) return;
                        Alert.alert('Clear PIN', 'Remove the POS PIN for this staff member?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Clear', style: 'destructive', onPress: async () => {
                            try {
                              await Promise.all([
                                api.director.setStaffClockPin(userId, null),
                                api.director.setStaffSettingsPin(userId, null),
                              ]);
                              setPinMsg('PIN cleared');
                            } catch (error) { setPinMsg(getErrorMessage(error, 'Failed to clear PIN')); }
                          }},
                        ]);
                      }}
                      style={[modal.chip, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', paddingVertical: 10, paddingHorizontal: 14 }]}
                    >
                      <Text style={[modal.chipText, { color: RED }]}>Clear</Text>
                    </Pressable>
                  </View>
                  {pinMsg ? <Text style={{ fontSize: 12, fontWeight: '700', color: pinMsg.includes('✓') || pinMsg.includes('cleared') ? '#16A34A' : RED }}>{pinMsg}</Text> : null}
                </View>
              </View>
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
                {/* Store Assignments */}
                <Pressable style={[sp_s.menuRow, { borderTopWidth: 1, borderTopColor: BORDER }]}
                  onPress={() => { Haptics.selectionAsync(); setShowAssignments(v => !v); }}>
                  <Feather name="map-pin" size={17} color={BLUE} style={{ marginRight: 14 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={sp_s.menuLabel}>Store Assignments</Text>
                    <Text style={sp_s.menuSub}>
                      {staffAssignments.length > 0
                        ? `${staffAssignments.length} store${staffAssignments.length !== 1 ? 's' : ''} assigned`
                        : 'No stores assigned — can clock in anywhere'}
                    </Text>
                  </View>
                  <Feather name={showAssignments ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
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
                      {leaveRequests.map((lr, idx) => {
                        const sc = LEAVE_STATUS_COLORS[lr.status] ?? { bg: '#F3F4F6', text: MUTED };
                        const isPending = lr.status === 'pending';
                        const leaveType = lr.type?.replace('_', ' ') ?? 'leave';
                        return (
                          <View key={lr.id} style={[sp_s.leaveRow, idx < leaveRequests.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                            <View style={{ flex: 1, gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={sp_s.leaveType}>{leaveType}</Text>
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
              {/* ── Store assignments (expandable) ───────────────────── */}
              {showAssignments && (
                <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={sp_s.sectionLabel}>STORE ASSIGNMENTS</Text>
                    <Pressable
                      onPress={handleAddAssignment}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BG, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                    >
                      <Feather name="plus" size={13} color={BLUE} />
                      <Text style={{ fontWeight: '600', fontSize: 12, color: BLUE }}>Assign Store</Text>
                    </Pressable>
                  </View>
                  {assignLoading ? (
                    <ActivityIndicator color={BLUE} style={{ margin: 20 }} />
                  ) : staffAssignments.length === 0 ? (
                    <View style={[sp_s.infoCard, { padding: 20, alignItems: 'center', gap: 8 }]}>
                      <Feather name="map-pin" size={24} color={MUTED} />
                      <Text style={sp_s.menuSub}>No stores assigned</Text>
                      <Text style={{ fontWeight: '400', fontSize: 12, color: MUTED, textAlign: 'center' }}>
                        Without assignments, this staff member can clock in at any location.
                      </Text>
                    </View>
                  ) : (
                    <View style={sp_s.infoCard}>
                      {staffAssignments.map((a, idx) => (
                        <View key={a.id} style={[
                          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
                          idx > 0 && { borderTopWidth: 1, borderTopColor: BORDER },
                        ]}>
                          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE + '18', alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name="map-pin" size={16} color={BLUE} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={sp_s.menuLabel} numberOfLines={1}>{a.storeName ?? a.storeId}</Text>
                              {a.isPrimary && (
                                <View style={{ backgroundColor: BLUE + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                                  <Text style={{ fontWeight: '600', fontSize: 9, color: BLUE }}>PRIMARY</Text>
                                </View>
                              )}
                            </View>
                            {a.storeSuburb && <Text style={sp_s.menuSub}>{a.storeSuburb}</Text>}
                          </View>
                          <View style={{ gap: 4 }}>
                            {!a.isPrimary && (
                              <Pressable
                                onPress={() => handleSetPrimary(a.id)}
                                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: BLUE }}
                              >
                                <Text style={{ fontWeight: '500', fontSize: 10, color: BLUE }}>Set Primary</Text>
                              </Pressable>
                            )}
                            <Pressable
                              onPress={() => handleRemoveAssignment(a.id, a.storeName ?? 'this store')}
                              style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: RED + '80' }}
                            >
                              <Text style={{ fontWeight: '500', fontSize: 10, color: RED }}>Remove</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              {/* ── Recent shifts ─────────────────────────────────────── */}
              {recentShifts.length > 0 && (
                <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 16 }}>
                  <Text style={[sp_s.sectionLabel, { marginBottom: 10 }]}>RECENT SHIFTS</Text>
                  <View style={sp_s.infoCard}>
                    {recentShifts.slice(0, 10).map((shift, idx: number) => (
                      <View key={shift.id} style={[sp_s.shiftRow, idx < Math.min(recentShifts.length, 10) - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={sp_s.shiftDate}>
                            {new Date(shift.clockIn).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                          </Text>
                          <Text style={sp_s.shiftTime}>
                            {new Date(shift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                            {shift.clockOut ? ` – ${new Date(shift.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}` : ' (active)'}
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
              {/* ── Login History ─────────────────────────────────────── */}
              <LoginHistoryInline userId={userId} />

              {/* ── Assign leadership role ───────────────────────────── */}
              {u?.role === 'staff' && (
                <Pressable
                  style={[sp_s.promoteBtn, { borderColor: GREEN }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Alert.alert(
                      'Assign Leadership Role',
                      `Choose the access role for ${u?.name ?? 'this staff member'}.`,
                      [
                        ...ACCESS_ROLE_OPTIONS
                          .filter((option) => isMaster || (option.key !== 'director' && option.key !== 'master'))
                          .map((option) => ({
                            text: option.label,
                            onPress: async () => {
                              if (!userId) return;
                              try {
                                const targetRole = option.key === 'director' || option.key === 'master' ? option.key : 'manager';
                                await api.director.customers.promote(userId, targetRole, option.key);
                                await qc.invalidateQueries({ queryKey: ['director-users'] });
                                await qc.invalidateQueries({ queryKey: ['director-managers'] });
                                await qc.invalidateQueries({ queryKey: ['master-directors'] });
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                handleClose();
                                onRefresh();
                                Alert.alert('Role Updated', `${u?.name ?? 'Staff member'} now has ${option.label} access.`);
                              } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
                            },
                          })),
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }}
                >
                  <Feather name="arrow-up-right" size={15} color={GREEN} />
                  <Text style={[sp_s.promoteBtnText, { color: GREEN }]}>Assign Role</Text>
                </Pressable>
              )}

              {isMaster && (
                <Pressable
                  style={sp_s.promoteBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    Alert.alert(
                      'Promote to Director',
                      `Make ${u?.name ?? 'this staff member'} a Director?\n\nThey will gain full access to the Director portal (orders, users, products, settings, pricing) and lose staff portal access. This is a significant role change.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Promote', onPress: async () => {
                          if (!userId) return;
                          try {
                            await api.director.promoteToDirector(userId);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            handleClose();
                            onRefresh();
                            Alert.alert('Promoted', `${u?.name ?? 'Staff member'} is now a Director and can log in via the Director portal.`);
                          } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
                        }},
                      ]
                    );
                  }}
                >
                  <Feather name="shield" size={15} color={AMBER} />
                  <Text style={sp_s.promoteBtnText}>Promote to Director</Text>
                </Pressable>
              )}
              {/* ── Delete account ───────────────────────────────────── */}
              <Pressable
                style={sp_s.deleteBtn}
                onPress={() => Alert.alert(
                  'Delete Account',
                  `Permanently delete ${u?.name ?? 'this staff member'}?\n\nThis will remove all their shifts, leave requests, and login access. This cannot be undone.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => {
                      if (!userId) return;
                      try {
                        await api.director.deleteUser(userId);
                        onDelete();
                      } catch (error) { Alert.alert('Error', getErrorMessage(error)); }
                    }},
                  ]
                )}
              >
                <Feather name="trash-2" size={15} color={RED} />
                <Text style={sp_s.deleteBtnText}>Delete Account</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const sp_s = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 18, gap: 12, backgroundColor: CARD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { flex: 1, color: TEXT, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  editBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  editBtnText:   { color: TEXT, fontSize: 13, fontWeight: '600' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 16, marginVertical: 20 },
  avatarCircle:  { width: 64, height: 64, borderRadius: 32, backgroundColor: BG, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: BLUE, fontSize: 22, fontWeight: '700' },
  shiftStatus:   { color: MUTED, fontSize: 14, fontWeight: '500' },
  shiftSub:      { color: MUTED, fontSize: 12, fontWeight: '400' },
  empId:         { color: MUTED, fontSize: 11, fontWeight: '400' },
  startShiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: BLUE },
  startShiftText:{ color: BLUE, fontSize: 15, fontWeight: '600' },
  actionRow:     { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 20 },
  actionBtn:     { flex: 1, backgroundColor: CARD, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, paddingVertical: 16, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  actionLabel:   { color: TEXT, fontSize: 12, fontWeight: '500' },
  sectionLabel:  { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginBottom: 8 },
  infoCard:      { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:     { color: MUTED, fontSize: 13, fontWeight: '400', flex: 1 },
  infoValue:     { color: TEXT, fontSize: 13, fontWeight: '500', flex: 2, textAlign: 'right' },
  menuSection:   { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  menuRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  menuLabel:     { color: TEXT, fontSize: 15, fontWeight: '500' },
  menuSub:       { color: MUTED, fontSize: 11, fontWeight: '400', marginTop: 1 },
  leaveRow:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14 },
  leaveType:     { color: TEXT, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  statusPill:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusPillText:{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  leaveDates:    { color: MUTED, fontSize: 12, fontWeight: '400', marginTop: 2 },
  leaveReason:   { color: MUTED, fontSize: 12, fontWeight: '400', marginTop: 4, fontStyle: 'italic' },
  leaveBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  leaveBtnText:  { fontSize: 12, fontWeight: '600' },
  editSection:   { marginHorizontal: 16, marginBottom: 16, gap: 4 },
  fieldWrap:     { marginBottom: 8 },
  fieldLabel:    { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6 },
  fieldRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 52, borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: CARD },
  fieldInput:    { flex: 1, color: TEXT, fontSize: 15, fontWeight: '400', paddingVertical: 10 },
  fieldHint:     { color: MUTED, fontSize: 11, fontWeight: '400', marginTop: 4, marginLeft: 2 },
  errBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 8 },
  errText:       { flex: 1, color: RED, fontSize: 13, fontWeight: '400' },
  saveBtn:       { backgroundColor: BLUE, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  shiftRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  shiftDate:     { color: TEXT, fontSize: 13, fontWeight: '500' },
  shiftTime:     { color: MUTED, fontSize: 12, fontWeight: '400', marginTop: 2 },
  shiftHrs:      { fontSize: 14, fontWeight: '700' },
  promoteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingVertical: 16, borderRadius: 12, borderWidth: 1.5, borderColor: AMBER },
  promoteBtnText: { color: AMBER, fontSize: 15, fontWeight: '600' },
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, marginBottom: 32, paddingVertical: 16, borderRadius: 12, borderWidth: 1.5, borderColor: RED },
  deleteBtnText: { color: RED, fontSize: 15, fontWeight: '600' },
});

export { StaffProfileModal };
