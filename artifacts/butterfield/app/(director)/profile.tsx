import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  Alert, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';

import { AvatarPicker } from '@/components/AvatarPicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const RED    = '#F40009';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';

function capitalize(s: string): string {
  if (!s) return 'Staff';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function StaffProfileScreen() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'], queryFn: () => api.staff.profile(), retry: 1,
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
    { icon: 'calendar',       label: 'Request Leave',         sub: 'Annual, sick & personal leave',   onPress: () => router.push({ pathname: '/(director)/tasks', params: { initialTab: 'leave' } } as any) },
    { icon: 'message-circle', label: 'Team Announcements',    sub: 'Messages from management',        onPress: () => Alert.alert('Team Announcements', 'No new announcements.\n\nCheck back before your next shift.') },
    { icon: 'bell',           label: 'Notification Settings', sub: 'Control what you get notified about', onPress: () => { Haptics.selectionAsync(); router.push('/notification-prefs' as any); } },
    { icon: 'alert-circle',   label: 'Report an Issue',       sub: 'Equipment, safety, maintenance',  onPress: () => router.push({ pathname: '/(director)/tasks', params: { initialTab: 'issues' } } as any) },
    { icon: 'help-circle',    label: 'Help & Support',        sub: 'Call or email head office', onPress: () => Alert.alert('Help & Support', 'Phone: 0480 769 995\nEmail: hello@butterfieldcookies.com.au\n\nMon–Fri, 8am – 4pm AEST') },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.topSection, { paddingTop: 16 }]}>
        <Text style={[styles.screenTitle, { color: TEXT }]}>Profile</Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 8 }}>

        {/* Identity card */}
        <View style={[styles.idCard, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.85)' }]}>
          <AvatarPicker
            initial={user?.name?.charAt(0).toUpperCase() ?? 'S'}
            size={60}
            bgColor={`${BLUE}18`}
            textColor={BLUE}
          />
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
          <View style={[styles.detailsCard, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.85)' }]}>
            {([
              { label: 'Employee ID',  value: profile.employeeId },
              { label: 'Department',   value: capitalize(profile.department ?? '') },
              { label: 'Position',     value: capitalize(profile.position ?? '') },
              { label: 'Status',       value: profile.employmentStatus ? capitalize(profile.employmentStatus.replace('-', ' ')) : '—' },
              { label: 'Hourly Rate',  value: profile.hourlyRateCents ? `$${(profile.hourlyRateCents / 100).toFixed(2)}/hr` : '—' },
              { label: 'Address',      value: profile.address ?? '—' },
              { label: 'TFN',          value: profile.taxFileNumber ? '••• ••• •••' : 'Not set' },
              { label: 'Access Level', value: profile.isManager ? 'Manager' : 'Staff' },
            ] as { label: string; value: string }[]).map((row, i, arr) => (
              <View key={row.label} style={[
                styles.detailRow,
                i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.07)' },
              ]}>
                <Text style={[styles.detailLabel, { color: MUTED }]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: TEXT }]} numberOfLines={2}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Menu items */}
        <View style={[styles.menuCard, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.85)' }]}>
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              style={styles.menuRow}
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

        <Pressable onPress={handleLogout} style={[styles.signOutBtn, { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: '#FECACA' }]}>
          <Feather name="log-out" size={16} color="#EF4444" />
          <Text style={[styles.signOutText, { color: '#EF4444' }]}>Sign Out</Text>
        </Pressable>

        <Text style={[styles.version, { color: MUTED }]}>Butterfield Staff · Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topSection:      { paddingHorizontal: 20, paddingBottom: 12 },
  screenTitle:     { fontSize: 28, fontWeight: '700' },
  idCard:          { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  idName:          { fontSize: 17, fontWeight: '700' },
  idEmail:         { fontSize: 13, fontWeight: '400' },
  roleBadge:       { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  roleBadgeText:   { color: '#fff', fontSize: 11, fontWeight: '600' },
  rateText:        { fontSize: 13, fontWeight: '500' },
  detailsCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  detailRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  detailLabel:     { fontSize: 13, fontWeight: '400' },
  detailValue:     { fontSize: 13, fontWeight: '600' },
  menuCard:        { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel:       { fontSize: 14, fontWeight: '500' },
  menuSub:         { fontSize: 12, fontWeight: '400', marginTop: 1 },
  signOutBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  signOutText:     { fontSize: 15, fontWeight: '600' },
  version:         { textAlign: 'center', fontSize: 12, fontWeight: '400', paddingBottom: 8 },
});
