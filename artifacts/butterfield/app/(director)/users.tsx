import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import DirectorCustomersScreen from './customers';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';
const TABS = ['Customers', 'Staff', 'Shop Displays', 'Wholesale', 'Deleted'];
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
  shop_display: { bg: '#DBEAFE', text: '#1D4ED8' },
};
function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
    } catch (e: any) { setSaveErr(e.message ?? 'Save failed.'); }
    finally { setSaving(false); }
  };
  const [showLeave,        setShowLeave]        = useState(false);
  const [showAssignments,  setShowAssignments]  = useState(false);
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
  // Store assignments
  const { data: assignData, isLoading: assignLoading, refetch: refetchAssign } = useQuery({
    queryKey: ['director-staff-assignments', userId],
    queryFn: () => api.director.staffAssignments(userId!),
    enabled: showAssignments && !!userId,
  });
  const staffAssignments: any[] = assignData?.data ?? [];
  const { data: allStoresData } = useQuery({
    queryKey: ['director-stores'],
    queryFn: () => api.director.storesList(),
    staleTime: 60000,
  });
  const allStores: any[] = allStoresData?.data ?? [];
  const handleAddAssignment = () => {
    const activeStores = allStores.filter(s => s.status !== 'closed');
    const assigned = staffAssignments.map(a => a.storeId);
    const available = activeStores.filter(s => !assigned.includes(s.storeId ?? s.id));
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
        } catch (e: any) { Alert.alert('Error', e.message); }
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
          await api.director.deleteAssignment(assignId);
      }},
    ]);
  };
  const handleSetPrimary = async (assignId: string) => {
    try {
      await api.director.updateAssignment(assignId, { isPrimary: true });
      refetchAssign();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const clockInMut = useMutation({
    mutationFn: () => api.director.staffClockIn(userId!),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetch(); },
    onError: (e: any) => Alert.alert('Error', e.message),
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
                      } catch (e: any) {
                        setCanViewOrders(!val);
                        Alert.alert('Error', e.message ?? 'Could not update permission.');
                      }
                    }}
                    trackColor={{ false: '#E5E7EB', true: '#BBF7D0' }}
                    thumbColor={canViewOrders ? '#16A34A' : '#9CA3AF'}
                  />
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
              {/* ── Store assignments (expandable) ───────────────────── */}
              {showAssignments && (
                <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={sp_s.sectionLabel}>STORE ASSIGNMENTS</Text>
                    <Pressable
                      onPress={handleAddAssignment}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: NAVY + '12', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
                    >
                      <Feather name="plus" size={13} color={NAVY} />
                      <Text style={{ fontWeight: '600', fontSize: 12, color: NAVY }}>Assign Store</Text>
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
                      {staffAssignments.map((a: any, idx: number) => (
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
              {/* ── Promote to Director — master accounts only ───────── */}
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
                          } catch (e: any) { Alert.alert('Error', e.message); }
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
                      } catch (e: any) { Alert.alert('Error', e.message); }
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
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 18, gap: 12, backgroundColor: NAVY },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  editBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  editBtnText:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 16, marginVertical: 20 },
  avatarCircle:  { width: 64, height: 64, borderRadius: 32, backgroundColor: NAVY + '18', borderWidth: 2, borderColor: NAVY, alignItems: 'center', justifyContent: 'center' },
  avatarText:    { color: NAVY, fontSize: 22, fontWeight: '700' },
  shiftStatus:   { color: MUTED, fontSize: 14, fontWeight: '500' },
  shiftSub:      { color: MUTED, fontSize: 12, fontWeight: '400' },
  empId:         { color: MUTED, fontSize: 11, fontWeight: '400' },
  startShiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: NAVY },
  startShiftText:{ color: NAVY, fontSize: 15, fontWeight: '600' },
  actionRow:     { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 20 },
  actionBtn:     { flex: 1, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingVertical: 16, alignItems: 'center', gap: 8 },
  actionLabel:   { color: TEXT, fontSize: 12, fontWeight: '500' },
  sectionLabel:  { color: MUTED, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginBottom: 8 },
  infoCard:      { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  infoLabel:     { color: MUTED, fontSize: 13, fontWeight: '400', flex: 1 },
  infoValue:     { color: TEXT, fontSize: 13, fontWeight: '500', flex: 2, textAlign: 'right' },
  menuSection:   { backgroundColor: CARD, borderRadius: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
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
  saveBtn:       { backgroundColor: NAVY, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
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
// ── Wholesale Detail Modal ──────────────────────────────────────────────────
const BRAND_BG: Record<string, string> = {
  Visa: '#1A3A8C', Mastercard: '#8C1B1B', Amex: '#1B5C8C',
};
function WholesaleDetailModal({ user, wa, visible, onClose, onRefresh, onDelete }: {
  user: any; wa: any; visible: boolean; onClose: () => void; onRefresh: () => void; onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [creditEnabled, setCreditEnabled]   = useState(false);
  const [creditAud, setCreditAud]           = useState('');
  const [creditNotes, setCreditNotes]       = useState('');
  const [payTerms, setPayTerms]             = useState('');
  const [deliveryAddr, setDeliveryAddr]     = useState('');
  const [deliveryFeeAud, setDeliveryFeeAud] = useState('');
  const [minOrderAud, setMinOrderAud]       = useState('');
  const [accountMgrName, setAccountMgrName] = useState('');
  const [accountMgrPhone, setAccountMgrPhone] = useState('');
  const [accountMgrEmail, setAccountMgrEmail] = useState('');
  const [acctEmail, setAcctEmail]           = useState('');
  const [suspended, setSuspended]           = useState(false);
  const [suspendReason, setSuspendReason]   = useState('');
  const [saving, setSaving]                 = useState(false);
  const { data: cardsData, isLoading: cardsLoading, refetch: refetchCards } = useQuery({
    queryKey: ['director-ws-cards', wa?.id],
    queryFn: () => api.director.wholesaleCards(wa!.id),
    enabled: visible && !!wa?.id,
  });
  const cards = (cardsData as any)?.data ?? [];
  useEffect(() => {
    if (wa) {
      setCreditEnabled(wa.creditEnabled ?? false);
      setCreditAud(wa.creditLimitCents ? String(wa.creditLimitCents / 100) : '');
      setCreditNotes(wa.creditNotes ?? '');
      setPayTerms(wa.paymentTerms ?? '');
      setDeliveryAddr(wa.deliveryAddress ?? '');
      setDeliveryFeeAud(wa.deliveryFeeCents ? String(wa.deliveryFeeCents / 100) : '');
      setMinOrderAud((wa.minimumOrderCents ?? wa.minOrderCents) ? String((wa.minimumOrderCents ?? wa.minOrderCents) / 100) : '');
      setAccountMgrName(wa.accountManager ?? '');
      setAccountMgrPhone(wa.accountManagerPhone ?? '');
      setAccountMgrEmail(wa.accountManagerEmail ?? '');
      setAcctEmail(wa.accountsEmail ?? '');
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
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const handleSuspend = async (val: boolean) => {
    setSuspended(val);
    try {
      await api.director.suspendWholesale(wa.id, { isSuspended: val, suspendedReason: val ? suspendReason : undefined });
    } catch (e: any) { Alert.alert('Error', e.message); setSuspended(!val); }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const creditCents   = creditAud       ? Math.round(parseFloat(creditAud)       * 100) : 0;
      const deliveryCents = deliveryFeeAud  ? Math.round(parseFloat(deliveryFeeAud)  * 100) : 0;
      const minOrderCents = minOrderAud     ? Math.round(parseFloat(minOrderAud)     * 100) : undefined;
      await api.director.updateWholesale(wa.id, {
        creditEnabled,
        creditLimitCents:    isNaN(creditCents) ? 0 : creditCents,
        creditNotes:         creditNotes.trim() || null,
        paymentTerms:        payTerms.trim()    || null,
        deliveryAddress:     deliveryAddr.trim() || undefined,
        deliveryFeeCents:    isNaN(deliveryCents) ? 0 : deliveryCents,
        minimumOrderCents:   isNaN(minOrderCents as number) ? undefined : minOrderCents,
        accountManagerName:  accountMgrName.trim()  || null,
        accountManagerPhone: accountMgrPhone.trim() || null,
        accountManagerEmail: accountMgrEmail.trim() || null,
        accountsEmail:       acctEmail.trim()       || null,
      });
      Alert.alert('Saved', 'Wholesale account updated.');
      onRefresh();
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
          {/* Account Manager */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>ACCOUNT MANAGER</Text>
            <Text style={wdl.fieldNote}>Assigned rep visible to this wholesale customer (read-only for them).</Text>
            <Text style={wdl.fieldLabel}>Manager Name</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                placeholder="e.g. Sarah Thompson"
                value={accountMgrName}
                onChangeText={setAccountMgrName}
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Manager Phone</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                placeholder="e.g. 0400 000 000"
                value={accountMgrPhone}
                onChangeText={setAccountMgrPhone}
                keyboardType="phone-pad"
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Manager Email</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                placeholder="e.g. sarah@butterfield.com.au"
                value={accountMgrEmail}
                onChangeText={setAccountMgrEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
          {/* Credit Management */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>CREDIT MANAGEMENT</Text>
            <Text style={wdl.fieldNote}>No credit is issued by default. Enable manually to grant credit terms.</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Credit Account</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>
                  {creditEnabled ? 'Credit enabled — customer can order on account' : 'Disabled — pay on order'}
                </Text>
              </View>
              <Switch
                value={creditEnabled}
                onValueChange={setCreditEnabled}
                trackColor={{ false: '#D1D5DB', true: GREEN }}
                thumbColor="#fff"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
            {creditEnabled && (
              <>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Credit Limit (AUD)</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER }]}>
                  <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
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
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="e.g. Net 30, Net 14, EOM"
                    value={payTerms}
                    onChangeText={setPayTerms}
                  />
                </View>
                <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Credit Notes (internal)</Text>
                <View style={[wdl.inputRow, { borderColor: BORDER, height: 64, alignItems: 'flex-start', paddingTop: 10 }]}>
                  <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                    placeholder="Internal notes about credit terms..."
                    value={creditNotes}
                    onChangeText={setCreditNotes}
                    multiline
                  />
                </View>
              </>
            )}
          </View>
          {/* Invoice email */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>INVOICE DELIVERY</Text>
            <Text style={wdl.fieldNote}>Invoices are sent to this email. The customer can also set this themselves.</Text>
            <Text style={wdl.fieldLabel}>Accounts Team Email</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                placeholder="e.g. accounts@company.com.au"
                value={acctEmail}
                onChangeText={setAcctEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
          {/* Delivery settings */}
          <View style={wdl.card}>
            <Text style={wdl.sectionLabel}>DELIVERY SETTINGS</Text>
            <Text style={wdl.fieldLabel}>Delivery Address</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER, height: 72, alignItems: 'flex-start', paddingTop: 12 }]}>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED}
                placeholder="Street, suburb, postcode"
                value={deliveryAddr}
                onChangeText={setDeliveryAddr}
                multiline
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Delivery Fee (AUD)</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED} keyboardType="decimal-pad"
                placeholder="0.00 — free delivery"
                value={deliveryFeeAud}
                onChangeText={setDeliveryFeeAud}
              />
            </View>
            <Text style={[wdl.fieldLabel, { marginTop: 12 }]}>Minimum Order (AUD)</Text>
            <View style={[wdl.inputRow, { borderColor: BORDER }]}>
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>$</Text>
              <TextInput style={[wdl.input, { color: TEXT }]} placeholderTextColor={MUTED} keyboardType="decimal-pad"
                placeholder="e.g. 200.00"
                value={minOrderAud}
                onChangeText={setMinOrderAud}
              />
            </View>
          </View>
          {/* Suspend */}
          <View style={wdl.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>Suspend Account</Text>
                <Text style={{ color: MUTED, fontWeight: '400', fontSize: 12 }}>Prevents new orders while suspended</Text>
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
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13 }}>No cards saved by this account yet.</Text>
            )}
            {cards.map((card: any) => {
              const bg = BRAND_BG[card.cardBrand] ?? '#1A3A8C';
              return (
                <View key={card.id} style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }}>
                  <View style={{ backgroundColor: bg, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 3 }}>
                        {`•••• •••• •••• ${card.last4}`}
                      </Text>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        {card.isDefault && (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>DEFAULT</Text>
                          </View>
                        )}
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400', fontSize: 11 }}>{card.cardBrand}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '400', fontSize: 11 }}>{card.nameOnCard}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '400', fontSize: 11 }}>Exp {card.expiry}</Text>
                    </View>
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
          {/* Delete account */}
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, paddingVertical: 16 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              Alert.alert(
                'Delete Account',
                `Permanently delete ${user?.name ?? 'this wholesale customer'} (${wa?.companyName ?? ''})?\n\nAll orders, invoices, and login access will be removed. This cannot be undone.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    try {
                      await api.director.deleteUser(user.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      onClose();
                      onDelete();
                    } catch (e: any) { Alert.alert('Error', e.message); }
                  }},
                ]
              );
            }}
          >
            <Feather name="trash-2" size={15} color={RED} />
            <Text style={{ color: RED, fontSize: 14, fontWeight: '600' }}>Delete Account</Text>
          </Pressable>
        </ScrollView>
      </Modal>
  );
}
type CreateType = 'staff' | 'wholesale' | 'shop_display';
function CreateUserModal({ visible, type, onClose, onSuccess }: {
  visible: boolean; type: CreateType; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName]                     = useState('');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [showPw, setShowPw]                 = useState(false);
  const [companyName, setCompanyName]       = useState('');
  const [abn, setAbn]                       = useState('');
  const [phone, setPhone]                   = useState('');
  const [position, setPosition]             = useState('Crew');
  const [department, setDepartment]         = useState('floor');
  const [employmentStatus, setEmploymentStatus] = useState('casual');
  const [hourlyRate, setHourlyRate]         = useState('');
  const [address, setAddress]               = useState('');
  const [tfn, setTfn]                       = useState('');
  const [isManager, setIsManager]           = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setCompanyName('');
    setAbn(''); setPhone(''); setPosition('Crew'); setDepartment('floor');
    setEmploymentStatus('casual'); setHourlyRate(''); setAddress(''); setTfn('');
    setIsManager(false); setError(''); setLoading(false);
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
    try {
      if (type === 'staff') {
        const rateVal = hourlyRate.trim() ? Math.round(parseFloat(hourlyRate) * 100) : undefined;
        await api.director.createStaff({
          name: name.trim(), email: email.trim(), password,
          position: position.trim(), department: department.trim(),
          isManager, hourlyRateCents: rateVal,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxFileNumber: tfn.trim() || undefined,
          employmentStatus,
        });
      } else if (type === 'wholesale') {
        await api.director.createWholesale({ name: name.trim(), email: email.trim(), password, companyName: companyName.trim(), abn: abn.trim() || undefined, phone: phone.trim() || undefined });
      } else {
        await api.director.createShopDisplay({ name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
      }
      reset();
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Failed to create account.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };
  const isStaff = type === 'staff';
  const isShopDisplay = type === 'shop_display';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={handleClose} style={modal.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={[modal.title, { color: TEXT }]}>Add {isStaff ? 'Staff Member' : isShopDisplay ? 'Shop Display Login' : 'Wholesale Customer'}</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* Role badge */}
          <View style={[modal.roleBanner, { backgroundColor: isStaff ? '#EDE9FE' : isShopDisplay ? '#DBEAFE' : '#DCFCE7' }]}>
            <Feather name={isStaff ? 'users' : isShopDisplay ? 'monitor' : 'package'} size={15} color={isStaff ? '#5B21B6' : isShopDisplay ? '#1D4ED8' : '#166534'} />
            <Text style={[modal.roleBannerText, { color: isStaff ? '#5B21B6' : isShopDisplay ? '#1D4ED8' : '#166534' }]}>
              {isStaff ? 'New staff account will be pre-approved' : isShopDisplay ? 'Limited counter iPad access only' : 'Wholesale account will be marked approved'}
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
              <Text style={[modal.sectionLabel, { color: MUTED }]}>CONTACT</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="phone" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Phone number (optional)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="map-pin" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Home address (optional)" placeholderTextColor={MUTED} value={address} onChangeText={setAddress} autoCapitalize="words" />
              </View>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>EMPLOYMENT</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Position (e.g. Barista, Crew)" placeholderTextColor={MUTED} value={position} onChangeText={setPosition} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="layers" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Department (e.g. floor, kitchen)" placeholderTextColor={MUTED} value={department} onChangeText={setDepartment} autoCapitalize="none" />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[modal.sectionLabel, { color: MUTED, marginBottom: 4 }]}>EMPLOYMENT STATUS</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['casual', 'part-time', 'full-time'].map(s => (
                    <Pressable key={s} onPress={() => { setEmploymentStatus(s); Haptics.selectionAsync(); }}
                      style={[modal.chip, { backgroundColor: employmentStatus === s ? BLUE : BG, borderColor: employmentStatus === s ? BLUE : BORDER }]}>
                      <Text style={[modal.chipText, { color: employmentStatus === s ? '#fff' : TEXT }]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="dollar-sign" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Hourly rate (e.g. 24.50)" placeholderTextColor={MUTED} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="hash" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Tax File Number (optional)" placeholderTextColor={MUTED} value={tfn} onChangeText={setTfn} keyboardType="numeric" secureTextEntry />
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
          {!isStaff && !isShopDisplay && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>COMPANY DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Company name *" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
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
          <Pressable onPress={handleSubmit} disabled={loading} style={[modal.submitBtn, { backgroundColor: isStaff ? NAVY : isShopDisplay ? BLUE : GREEN, opacity: loading ? 0.8 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={modal.submitBtnText}>Create {isStaff ? 'Staff Account' : isShopDisplay ? 'Shop Display Login' : 'Wholesale Account'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ShopDisplayDetailModal({ user, visible, onClose, onRefresh }: {
  user: any | null; visible: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setPhone(user?.phone ?? '');
    setStatus((user?.status as any) ?? 'active');
    setPassword('');
  }, [user]);

  const save = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await api.director.updateShopDisplay(user.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        status,
      });
      if (password.trim()) {
        await api.director.resetShopDisplayPassword(user.id, password);
      }
      await onRefresh();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const remove = () => {
    if (!user) return;
    Alert.alert('Delete shop display', `Delete ${user.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.director.deleteShopDisplay(user.id);
            await onRefresh();
            onClose();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose} style={modal.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={[modal.title, { color: TEXT }]}>Manage Shop Display</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="user" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={MUTED} />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="mail" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={MUTED} autoCapitalize="none" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="phone" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={phone} onChangeText={setPhone} placeholder="Phone (optional)" placeholderTextColor={MUTED} />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="lock" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} value={password} onChangeText={setPassword} placeholder="New password (optional)" placeholderTextColor={MUTED} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['active', 'inactive', 'suspended'] as const).map((option) => (
              <Pressable key={option} onPress={() => { setStatus(option); Haptics.selectionAsync(); }} style={[modal.chip, { backgroundColor: status === option ? BLUE : BG, borderColor: status === option ? BLUE : BORDER }]}>
                <Text style={[modal.chipText, { color: status === option ? '#fff' : TEXT }]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={save} disabled={loading} style={[modal.submitBtn, { backgroundColor: BLUE }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={modal.submitBtnText}>Save Changes</Text>}
          </Pressable>
          <Pressable onPress={remove} style={[modal.submitBtn, { backgroundColor: RED }]}>
            <Text style={modal.submitBtnText}>Delete Login</Text>
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
  const [selectedShopDisplayUser, setSelectedShopDisplayUser] = useState<any | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
  });
  const { data: deletedData, refetch: refetchDeleted } = useQuery({
    queryKey: ['director-deleted-accounts'],
    queryFn: () => api.director.deletedAccounts(),
    refetchInterval: 60000,
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchDeleted);
  const allUsers: any[] = data?.data ?? [];
  const deletedUsers: any[] = deletedData?.data ?? [];
  const filtered = allUsers.filter((u) => {
    if (tab === 'Customers')  return u.role === 'customer';
    if (tab === 'Staff')      return u.role === 'staff' || u.role === 'manager';
    if (tab === 'Shop Displays') return u.role === 'shop_display';
    if (tab === 'Wholesale')  return u.role === 'wholesale';
    return true;
  });
  const openCreate = (type: CreateType) => {
    setCreateType(type); setShowCreate(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const handleRestore = async (id: string, name: string) => {
    Alert.alert('Restore Account', `Restore ${name}'s account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        onPress: async () => {
          try {
            await api.director.restoreAccount(id);
            await qc.invalidateQueries({ queryKey: ['director-deleted-accounts'] });
            await qc.invalidateQueries({ queryKey: ['director-users'] });
            Alert.alert('Restored', `${name}'s account has been restored.`);
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };
  const fmtRelDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const approveStaff = async (userId: string, approved: boolean) => {
    try {
      await api.director.approveStaff(userId, approved);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
    } catch (e: any) { Alert.alert('Error', e.message); }
  };
  const handleRefreshUsers = async () => {
    await qc.invalidateQueries({ queryKey: ['director-users'] });
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab bar + Add buttons */}
      <View style={{ backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2, gap: 8, alignItems: 'flex-start' }}>
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
        {tab !== 'Customers' && tab !== 'Deleted' && (
          <View style={[styles.addStrip, { borderTopColor: BORDER }]}>
            <Text style={[styles.addStripLabel, { color: MUTED }]}>Add new:</Text>
            {tab === 'Staff' && (
              <Pressable onPress={() => openCreate('staff')} style={[styles.addBtn, { backgroundColor: '#EDE9FE' }]}>
                <Feather name="user-plus" size={13} color="#5B21B6" />
                <Text style={[styles.addBtnText, { color: '#5B21B6' }]}>Staff Member</Text>
              </Pressable>
            )}
            {tab === 'Shop Displays' && (
              <Pressable onPress={() => openCreate('shop_display')} style={[styles.addBtn, { backgroundColor: '#DBEAFE' }]}>
                <Feather name="monitor" size={13} color="#1D4ED8" />
                <Text style={[styles.addBtnText, { color: '#1D4ED8' }]}>Shop Display</Text>
              </Pressable>
            )}
            {tab === 'Wholesale' && (
              <Pressable onPress={() => openCreate('wholesale')} style={[styles.addBtn, { backgroundColor: '#DCFCE7' }]}>
                <Feather name="package" size={13} color="#166534" />
                <Text style={[styles.addBtnText, { color: '#166534' }]}>Wholesale</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {/* Customers → full Shopify-style CRM screen */}
      {tab === 'Customers' ? (
        <DirectorCustomersScreen />
      ) : tab === 'Deleted' ? (
        <FlatList
          data={deletedUsers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="trash-2" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontWeight: '400' }}>No recently deleted accounts</Text>
              <Text style={{ color: MUTED, fontSize: 12, textAlign: 'center', fontWeight: '400', paddingHorizontal: 32 }}>
                Deleted accounts are kept here for 30 days before being permanently removed.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const daysLeft = Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000));
            const roleColors = ROLE_COLORS[item.role] ?? { bg: BG, text: MUTED };
            return (
              <View style={[styles.userCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.userTop}>
                  <View style={[styles.avatar, { backgroundColor: roleColors.bg, alignItems: 'center', justifyContent: 'center' }]}>
                    <Feather name="user" size={20} color={roleColors.text} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.userName, { color: TEXT }]}>{item.name}</Text>
                    <Text style={[styles.userEmail, { color: MUTED }]}>{item.email}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: roleColors.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: roleColors.text }}>{item.role}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: daysLeft <= 5 ? '#FEF2F2' : '#F5F6FA' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: daysLeft <= 5 ? RED : MUTED }}>
                          {daysLeft}d left
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>
                    Deleted {fmtRelDate(item.deletedAt)}
                  </Text>
                  <Pressable
                    onPress={() => handleRestore(item.id, item.name)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: '#EBF8FF', borderWidth: 1, borderColor: '#BAE6FD' }}
                  >
                    <Feather name="rotate-ccw" size={12} color={BLUE} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>Restore</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
              <Feather name="users" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontWeight: '400' }}>No users in this category</Text>
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
                  {u.profileImage ? (
                    <Image
                      source={{ uri: u.profileImage }}
                      style={[styles.avatar, { backgroundColor: roleColors.bg }]}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: roleColors.bg }]}>
                      <Text style={[styles.avatarText, { color: roleColors.text }]}>{initials(u.name)}</Text>
                    </View>
                  )}
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
                {u.role === 'shop_display' && (
                  <Pressable
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedShopDisplayUser(u); }}
                    style={[styles.subRow, { borderTopColor: BORDER }]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>Counter iPad access</Text>
                      <Text style={[styles.subSub, {
                        color: u.status === 'active' ? GREEN : u.status === 'suspended' ? RED : AMBER,
                      }]}>
                        {u.status === 'active' ? '✓ Active' : u.status === 'suspended' ? 'Suspended' : 'Inactive'}
                        {u.lastLogin ? ` · Last login ${new Date(u.lastLogin).toLocaleDateString('en-AU')}` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Manage</Text>
                      <Feather name="chevron-right" size={13} color={BLUE} />
                    </View>
                  </Pressable>
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
                      <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>Manage</Text>
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
        onDelete={() => { setSelectedWholesaleUser(null); handleRefreshUsers(); }}
      />
      <StaffProfileModal
        visible={!!selectedStaffId}
        userId={selectedStaffId}
        onClose={() => setSelectedStaffId(null)}
        onRefresh={handleRefreshUsers}
        onDelete={() => { setSelectedStaffId(null); handleRefreshUsers(); }}
      />
      <ShopDisplayDetailModal
        visible={!!selectedShopDisplayUser}
        user={selectedShopDisplayUser}
        onClose={() => setSelectedShopDisplayUser(null)}
        onRefresh={handleRefreshUsers}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  tabChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  tabChipText:   { fontSize: 13, fontWeight: '600' },
  addStrip:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  addStripLabel: { fontSize: 12, fontWeight: '500' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addBtnText:    { fontSize: 12, fontWeight: '600' },
  userCard:      { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  userTop:       { flexDirection: 'row', gap: 12, padding: 14 },
  avatar:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:    { fontSize: 16, fontWeight: '700' },
  nameRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName:      { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  rolePill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  rolePillText:  { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  userEmail:     { fontSize: 13, fontWeight: '400', color: '#8E8E93' },
  userDate:      { fontSize: 11, fontWeight: '400', color: '#8E8E93' },
  subRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, padding: 12, paddingHorizontal: 14 },
  subTitle:      { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  subSub:        { fontSize: 12, fontWeight: '400' },
});
const modal = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  closeBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:          { fontSize: 16, fontWeight: '700' },
  roleBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10 },
  roleBannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  sectionLabel:   { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginTop: 2 },
  inputRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  input:          { flex: 1, fontSize: 15, fontWeight: '400' },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 12, backgroundColor: BG },
  toggleLabel:    { fontSize: 14, fontWeight: '600' },
  toggleSub:      { fontSize: 12, fontWeight: '400', marginTop: 2 },
  errorBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText:      { flex: 1, fontSize: 13 },
  submitBtn:      { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  chip:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  chipText:       { fontSize: 13, fontWeight: '500' },
});
const wdl = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  card:            { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 0 },
  sectionLabel:    { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, color: '#8E8E93', marginBottom: 8 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoLabel:       { color: '#8E8E93', fontWeight: '400', fontSize: 13 },
  infoValue:       { color: '#1C1C1E', fontWeight: '500', fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  statusBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  statusBtnText:   { fontSize: 13, fontWeight: '600' },
  fieldNote:       { fontSize: 12, fontWeight: '400', color: '#8E8E93', marginBottom: 10, lineHeight: 17 },
  fieldLabel:      { fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 6 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: '#F5F6FA' },
  input:           { flex: 1, fontSize: 15, fontWeight: '400' },
  saveBtn:         { height: 54, borderRadius: 14, backgroundColor: '#1493FF', alignItems: 'center', justifyContent: 'center' },
  saveBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
});
