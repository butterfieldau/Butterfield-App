import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const TABS = ['All', 'Staff', 'Wholesale', 'Customers'];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  customer:  { bg: '#EBF8FF', text: '#0369A1' },
  staff:     { bg: '#EDE9FE', text: '#5B21B6' },
  wholesale: { bg: '#DCFCE7', text: '#166534' },
  director:  { bg: '#FEF9C3', text: '#854D0E' },
};

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
  const [tab, setTab] = useState('All');
  const [createType, setCreateType] = useState<CreateType>('staff');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
  });

  const allUsers: any[] = data?.data ?? [];

  const filtered = allUsers.filter((u) => {
    if (tab === 'All')        return true;
    if (tab === 'Staff')      return u.role === 'staff';
    if (tab === 'Wholesale')  return u.role === 'wholesale';
    if (tab === 'Customers')  return u.role === 'customer';
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

  const setWholesaleStatus = async (accountId: string, status: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.setWholesaleStatus(accountId, status);
      await qc.invalidateQueries({ queryKey: ['director-users'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const wholesalePrompt = (u: any) => {
    const wa = u.wholesaleAccount;
    if (!wa) return;
    Alert.alert(wa.companyName, `Current status: ${wa.status}`, [
      { text: 'Approve', onPress: () => setWholesaleStatus(wa.id, 'approved') },
      { text: 'Pending', onPress: () => setWholesaleStatus(wa.id, 'pending') },
      { text: 'Reject',  style: 'destructive', onPress: () => setWholesaleStatus(wa.id, 'rejected') },
      { text: 'Cancel',  style: 'cancel' },
    ]);
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

        {/* Quick-add strip */}
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
      </View>

      {isLoading ? (
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
                <View style={styles.userTop}>
                  <View style={[styles.avatar, { backgroundColor: roleColors.bg }]}>
                    <Text style={[styles.avatarText, { color: roleColors.text }]}>{initials(u.name)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <View style={[styles.rolePill, { backgroundColor: roleColors.bg }]}>
                        <Text style={[styles.rolePillText, { color: roleColors.text }]}>{u.role}</Text>
                      </View>
                    </View>
                    <Text style={styles.userEmail}>{u.email}</Text>
                    <Text style={styles.userDate}>Joined {new Date(u.createdAt).toLocaleDateString('en-AU')}</Text>
                  </View>
                </View>

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
                  <Pressable onPress={() => wholesalePrompt(u)} style={[styles.subRow, { borderTopColor: BORDER }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.subTitle}>{wa.companyName}</Text>
                      <Text style={[styles.subSub, {
                        color: wa.status === 'approved' ? GREEN : wa.status === 'rejected' ? RED : AMBER,
                      }]}>
                        {wa.status === 'approved' ? '✓ Approved' : wa.status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                      </Text>
                    </View>
                    <Text style={{ color: BLUE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Change →</Text>
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
