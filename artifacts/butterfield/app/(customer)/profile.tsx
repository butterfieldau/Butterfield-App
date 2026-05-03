import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
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

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty-profile'], queryFn: () => api.loyalty.profile(), retry: 1,
  });
  const { data: meData } = useQuery({
    queryKey: ['me'], queryFn: () => api.auth.me(), retry: 1,
  });

  const profile = loyaltyData?.data;
  const customerProfile = meData?.profile as any;
  const deliveryAddress = customerProfile?.deliveryAddress as string | undefined;
  const hasAddress = !!(deliveryAddress && deliveryAddress.trim());

  const initial = (user?.name?.charAt(0) ?? 'B').toUpperCase();

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.auth.updateMe({ name: editName.trim() || undefined });
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

  const menuItems = [
    {
      icon: 'clipboard' as const,
      label: 'My orders',
      onPress: () => router.push('/(customer)/orders'),
    },
    {
      icon: 'bell' as const,
      label: 'Notifications',
      onPress: () => Alert.alert('Notifications', "You're all caught up!\n\nWe'll notify you when your order is ready for pickup."),
    },
    {
      icon: 'map-pin' as const,
      label: 'Saved addresses',
      onPress: () => router.push('/(customer)/addresses' as any),
    },
    {
      icon: 'help-circle' as const,
      label: 'Help & support',
      onPress: () => Alert.alert('Help & Support', 'Email: hello@butterfield.com.au\nPhone: (02) 9000 0000\n\nHours: Mon–Fri 7am–5pm\n\nVisit us at:\n7/2 Merrylands Rd\nMerrylands NSW 2160'),
    },
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
            <Text style={styles.userCardName}>{user?.name ?? 'Guest'}</Text>
            <Text style={styles.userCardEmail}>{user?.email}</Text>
          </View>
          <Pressable
            onPress={() => { setEditName(user?.name ?? ''); setEditModal(true); }}
            style={styles.editBtn}
          >
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
              {hasAddress ? '1 address' : '0 addresses'}
            </Text>
            <Text style={[styles.quickSub, { color: MUTED }]}>Manage saved addresses</Text>
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Points', value: String(profile?.loyaltyPoints ?? 0) },
            { label: 'Tier', value: (profile?.loyaltyTier ?? 'Bronze').charAt(0).toUpperCase() + (profile?.loyaltyTier ?? 'bronze').slice(1) },
            { label: 'Stamps', value: `${profile?.stampCount ?? 0}/6` },
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
              style={[
                styles.menuRow,
                i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER },
              ]}
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
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={[styles.signOutText, { color: '#DC2626' }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.version, { color: MUTED }]}>Butterfield Cookies · Version 1.0.0</Text>
      </View>

      {/* Edit profile modal */}
      <Modal visible={editModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditModal(false)}>
        <View style={[styles.modalRoot, { backgroundColor: BG }]}>
          <View style={[styles.modalHeader, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setEditModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: TEXT }]}>Edit Profile</Text>
            <Pressable onPress={handleSaveProfile} disabled={saving}>
              <Text style={[styles.modalSave, { color: BLUE, opacity: saving ? 0.5 : 1 }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 16 }}>
            <View style={[styles.inputGroup, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.inputLabel, { color: MUTED }]}>Full Name</Text>
              <TextInput
                style={[styles.inputField, { color: TEXT }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor={MUTED}
                autoCapitalize="words"
              />
            </View>
            <Text style={[styles.inputHint, { color: MUTED }]}>
              Email cannot be changed. Contact support if needed.
            </Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  userCard: { borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  userCardAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  userCardInitial: { color: '#fff', fontSize: 24, fontFamily: 'Inter_700Bold' },
  userCardName: { color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' },
  userCardEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Inter_400Regular' },
  editBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', gap: 12 },
  quickCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  quickIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  quickSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  statsRow: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 3 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  menuCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  signOutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalCancel: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  modalSave: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  inputGroup: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  inputLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  inputField: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  inputHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
});
