import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

function capitalize(s: string): string {
  if (!s) return 'Staff';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function StaffProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: () => api.staff.profile(),
    retry: 1,
  });

  const profile = profileData?.data;
  const isManager = profile?.isManager ?? false;
  const roleColor = isManager ? RED : BLUE;
  const positionLabel = profile?.position ? capitalize(profile.position) : 'Staff';

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await logout();
          qc.clear();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const menuItems = [
    { icon: 'calendar',       label: 'Request Leave',      sub: 'Annual, sick & personal leave',   onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'leave' } }) },
    { icon: 'message-circle', label: 'Team Announcements', sub: 'Messages from management',        onPress: () => Alert.alert('Team Announcements', 'No new announcements.\n\nCheck back before your next shift.') },
    { icon: 'alert-circle',   label: 'Report an Issue',    sub: 'Equipment, safety, maintenance',  onPress: () => router.push({ pathname: '/(staff)/tasks', params: { initialTab: 'issues' } }) },
    { icon: 'help-circle',    label: 'Help & Support',     sub: 'Manager on duty: (02) 9000 0001', onPress: () => Alert.alert('Help & Support', 'Manager on duty: (02) 9000 0001\nEmail: staff@butterfield.com.au\nPayroll: payroll@butterfield.com.au') },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.topSection, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.screenTitle, { color: TEXT }]}>Profile</Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 8 }}>

        {/* Identity card */}
        <View style={[styles.idCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={[styles.avatar, { backgroundColor: `${BLUE}18` }]}>
            <Text style={[styles.avatarText, { color: BLUE }]}>
              {user?.name?.charAt(0).toUpperCase() ?? 'S'}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.idName, { color: TEXT }]}>{user?.name ?? 'Staff Member'}</Text>
            <Text style={[styles.idEmail, { color: MUTED }]}>{user?.email}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={styles.roleBadgeText}>{positionLabel}</Text>
              </View>
              {profile?.hourlyRateCents && (
                <Text style={[styles.rateText, { color: MUTED }]}>
                  ${(profile.hourlyRateCents / 100).toFixed(2)}/hr
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Details card */}
        {profile && (
          <View style={[styles.detailsCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            {[
              { label: 'Employee ID',  value: profile.employeeId },
              { label: 'Department',   value: capitalize(profile.department) },
              { label: 'Position',     value: capitalize(profile.position) },
              { label: 'Access Level', value: profile.isManager ? 'Manager / Director' : 'Staff' },
            ].map((row, i, arr) => (
              <View key={row.label} style={[styles.detailRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
                <Text style={[styles.detailLabel, { color: MUTED }]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: TEXT }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Menu items */}
        <View style={[styles.menuCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          {menuItems.map((item, i, arr) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              style={[styles.menuRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#E0F5FE' }]}>
                <Feather name={item.icon as any} size={16} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, { color: TEXT }]}>{item.label}</Text>
                <Text style={[styles.menuSub, { color: MUTED }]}>{item.sub}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable onPress={handleLogout} style={[styles.signOutBtn, { backgroundColor: CARD, borderColor: '#FECACA' }]}>
          <Feather name="log-out" size={16} color='#DC2626' />
          <Text style={[styles.signOutText, { color: '#DC2626' }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.version, { color: MUTED }]}>Butterfield Staff · Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topSection: { paddingHorizontal: 20, paddingBottom: 12 },
  screenTitle: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  idCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  idName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  idEmail: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  roleBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  rateText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  detailsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  detailLabel: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  detailValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  menuCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  menuSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  signOutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', paddingBottom: 8 },
});
