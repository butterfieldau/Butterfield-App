import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const RED    = '#EF4444';

export default function AccountScreen() {
  const insets  = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc      = useQueryClient();

  const [editModal, setEditModal] = useState(false);
  const [editName,  setEditName]  = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving]       = useState(false);

  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['me'],
    queryFn:  () => api.auth.me(),
    retry: 1,
  });
  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn:  () => api.loyalty.profile(),
    retry: 1,
  });
  const { data: addressesData } = useQuery({
    queryKey: ['addresses'],
    queryFn:  () => api.addresses.list(),
    retry: 1,
  });

  const profile       = loyaltyData?.data;
  const currentUser   = meData?.user as any;
  const addressCount  = addressesData?.data?.length ?? 0;

  // Sync edit fields when user data loads
  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.name ?? '');
      setEditPhone(currentUser.phone ?? '');
    }
  }, [currentUser?.name, currentUser?.phone]);

  const openEdit = () => {
    setEditName(currentUser?.name ?? user?.name ?? '');
    setEditPhone(currentUser?.phone ?? '');
    setEditModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await api.auth.updateMe({
        name:  editName.trim(),
        phone: editPhone.trim() || undefined,
      });
      await refetchMe();
      qc.invalidateQueries({ queryKey: ['me'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await logout();
        qc.clear();
        router.replace('/(auth)/login');
      }},
    ]);
  };

  const displayName = currentUser?.name ?? user?.name ?? 'Guest';
  const displayEmail = currentUser?.email ?? user?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const menuItems = [
    { icon: 'clipboard'   as const, label: 'My orders',       onPress: () => router.push('/(customer)/orders') },
    { icon: 'bell'        as const, label: 'Notifications',   onPress: () => router.push('/(customer)/notifications' as any) },
    { icon: 'map-pin'     as const, label: 'Saved addresses',  onPress: () => router.push('/(customer)/addresses' as any) },
    { icon: 'help-circle' as const, label: 'Help & support',  onPress: () => Alert.alert('Help & Support', 'Email: hello@butterfield.com.au\nPhone: (02) 9000 0000\n\nHours: Mon–Fri 7am–5pm\n\nVisit us at:\n7/2 Merrylands Rd, Merrylands NSW 2160') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, gap: 16 }}>

        {/* User card */}
        <LinearGradient
          colors={['#40C0F2', '#2490D0']}
          style={styles.userCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.userCardAvatar}>
            <Text style={styles.userCardInitial}>{initial}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.userCardName}>{displayName}</Text>
            <Text style={styles.userCardEmail}>{displayEmail}</Text>
            {currentUser?.phone ? (
              <Text style={styles.userCardPhone}>{currentUser.phone}</Text>
            ) : null}
          </View>
          <Pressable onPress={openEdit} style={styles.editBtn}>
            <Feather name="edit-2" size={15} color={BLUE} />
          </Pressable>
        </LinearGradient>

        {/* Quick actions row */}
        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickCard, { backgroundColor: CARD, borderColor: BORDER }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/loyalty'); }}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#E0F5FE' }]}>
              <Feather name="coffee" size={20} color={BLUE} />
            </View>
            <Text style={[styles.quickTitle, { color: TEXT }]}>Coffee Club</Text>
            <Text style={[styles.quickSub, { color: MUTED }]}>View stamps & rewards</Text>
          </Pressable>

          <Pressable
            style={[styles.quickCard, { backgroundColor: CARD, borderColor: BORDER }]}
            onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/addresses' as any); }}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#E0F5FE' }]}>
              <Feather name="map-pin" size={20} color={BLUE} />
            </View>
            <Text style={[styles.quickTitle, { color: TEXT }]}>
              {addressCount === 0 ? 'No addresses' : `${addressCount} address${addressCount > 1 ? 'es' : ''}`}
            </Text>
            <Text style={[styles.quickSub, { color: MUTED }]}>Manage saved addresses</Text>
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Points', value: String(profile?.loyaltyPoints ?? 0) },
            { label: 'Tier',   value: (profile?.loyaltyTier ?? 'Bronze').charAt(0).toUpperCase() + (profile?.loyaltyTier ?? 'bronze').slice(1) },
            { label: 'Stamps', value: `${profile?.stampCount ?? 0}/10` },
          ].map((stat, i, arr) => (
            <View key={stat.label} style={[styles.statItem, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: BORDER }]}>
              <Text style={[styles.statValue, { color: BLUE }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: MUTED }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Menu list */}
        <View style={[styles.menuCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          {menuItems.map((item, i) => (
            <Pressable
              key={item.label}
              onPress={() => { Haptics.selectionAsync(); item.onPress(); }}
              style={[styles.menuRow, i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#F0FAFF' }]}>
                <Feather name={item.icon} size={16} color={BLUE} />
              </View>
              <Text style={[styles.menuLabel, { color: TEXT }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          style={[styles.signOutBtn, { backgroundColor: CARD, borderColor: '#FECACA' }]}
        >
          <Feather name="log-out" size={16} color={RED} />
          <Text style={[styles.signOutText, { color: RED }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.version, { color: MUTED }]}>Butterfield Cookies · Version 1.0.0</Text>
      </View>

      {/* ── Edit Profile Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={editModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalHeader, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setEditModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: TEXT }]}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={BLUE} />
                : <Text style={[styles.modalSave, { color: BLUE }]}>Save</Text>
              }
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">

            {/* Avatar preview */}
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <LinearGradient colors={['#40C0F2', '#2490D0']} style={styles.editAvatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={{ color: '#fff', fontSize: 32, fontFamily: 'Inter_700Bold' }}>
                  {(editName || displayName).charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            </View>

            {/* Full name */}
            <View style={[styles.inputGroup, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.inputLabel, { color: MUTED }]}>FULL NAME</Text>
              <View style={styles.inputRow}>
                <Feather name="user" size={16} color={MUTED} />
                <TextInput
                  style={[styles.inputField, { color: TEXT }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your full name"
                  placeholderTextColor={MUTED}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Phone number */}
            <View style={[styles.inputGroup, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.inputLabel, { color: MUTED }]}>PHONE NUMBER</Text>
              <View style={styles.inputRow}>
                <Feather name="phone" size={16} color={MUTED} />
                <TextInput
                  style={[styles.inputField, { color: TEXT }]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="04XX XXX XXX"
                  placeholderTextColor={MUTED}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Email — read only */}
            <View style={[styles.inputGroup, { backgroundColor: '#F9FAFB', borderColor: BORDER }]}>
              <Text style={[styles.inputLabel, { color: MUTED }]}>EMAIL ADDRESS</Text>
              <View style={styles.inputRow}>
                <Feather name="mail" size={16} color={MUTED} />
                <Text style={[styles.inputField, { color: MUTED }]}>{displayEmail}</Text>
                <View style={[styles.lockedBadge, { backgroundColor: '#F3F4F6' }]}>
                  <Feather name="lock" size={11} color={MUTED} />
                  <Text style={[styles.lockedText, { color: MUTED }]}>Locked</Text>
                </View>
              </View>
            </View>

            <Text style={[styles.inputHint, { color: MUTED }]}>
              To change your email address, please contact support at hello@butterfield.com.au
            </Text>

            {/* Delivery addresses shortcut */}
            <Pressable
              onPress={() => { setEditModal(false); setTimeout(() => router.push('/(customer)/addresses' as any), 300); }}
              style={[styles.addressShortcut, { backgroundColor: '#EBF8FF', borderColor: '#BAE6FD' }]}
            >
              <Feather name="map-pin" size={16} color={BLUE} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: BLUE }}>Delivery Addresses</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 1 }}>
                  {addressCount > 0 ? `You have ${addressCount} saved address${addressCount > 1 ? 'es' : ''}` : 'Add a delivery address'}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={BLUE} />
            </Pressable>

            {/* Save button */}
            <Pressable
              onPress={handleSaveProfile}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.7 : 1 }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  userCard:       { borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  userCardAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  userCardInitial:{ color: '#fff', fontSize: 24, fontFamily: 'Inter_700Bold' },
  userCardName:   { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
  userCardEmail:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_400Regular' },
  userCardPhone:  { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_400Regular' },
  editBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  quickRow:       { flexDirection: 'row', gap: 12 },
  quickCard:      { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  quickIcon:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickTitle:     { fontSize: 15, fontFamily: 'Inter_700Bold' },
  quickSub:       { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statsRow:       { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  statItem:       { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 3 },
  statValue:      { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel:      { fontSize: 11, fontFamily: 'Inter_400Regular' },
  menuCard:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel:      { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  signOutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  signOutText:    { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  version:        { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Modal
  editAvatar:       { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, paddingTop: 54, borderBottomWidth: 1 },
  modalCancel:      { fontSize: 15, fontFamily: 'Inter_400Regular', minWidth: 60 },
  modalTitle:       { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  modalSave:        { fontSize: 15, fontFamily: 'Inter_600SemiBold', minWidth: 60, textAlign: 'right' },
  inputGroup:       { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 },
  inputLabel:       { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  inputRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputField:       { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular' },
  lockedBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  lockedText:       { fontSize: 11, fontFamily: 'Inter_500Medium' },
  inputHint:        { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  addressShortcut:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  saveBtn:          { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  saveBtnText:      { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});
