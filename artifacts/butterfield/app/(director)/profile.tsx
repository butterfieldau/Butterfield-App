import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { BG, CARD, BLUE, RED, TEXT, MUTED, BORD } from '@/components/director/directorColors';

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function DirectorProfileScreen() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'],
    queryFn: () => api.staff.profile(),
    retry: 1,
  });

  const profile = profileData?.data;
  const isManager  = profile?.isManager ?? (user?.role === 'manager');
  const isDirector = user?.role === 'director' || user?.role === 'master';
  const roleLabel  = isDirector ? (user?.role === 'master' ? 'Master' : 'Director') : isManager ? 'Manager' : 'Staff';
  const roleColor  = isDirector ? RED : isManager ? '#8B5CF6' : BLUE;
  const userInitials = initials(user?.name ?? 'U');

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

  const settingsItems = [
    {
      section: 'Account',
      items: [
        {
          icon: 'bell' as const,
          label: 'Notification Settings',
          sub: 'Control what you get notified about',
          onPress: () => { Haptics.selectionAsync(); router.push('/notification-prefs' as any); },
        },
        {
          icon: 'calendar' as const,
          label: 'Request Leave',
          sub: 'Annual, sick & personal leave',
          onPress: () => router.push({ pathname: '/(director)/tasks', params: { initialTab: 'leave' } } as any),
        },
        {
          icon: 'message-circle' as const,
          label: 'Team Announcements',
          sub: 'Messages from management',
          onPress: () => Alert.alert('Team Announcements', 'No new announcements.\n\nCheck back before your next shift.'),
        },
      ],
    },
    {
      section: 'Support',
      items: [
        {
          icon: 'alert-circle' as const,
          label: 'Report an Issue',
          sub: 'Equipment, safety, maintenance',
          onPress: () => router.push({ pathname: '/(director)/tasks', params: { initialTab: 'issues' } } as any),
        },
        {
          icon: 'help-circle' as const,
          label: 'Help & Support',
          sub: 'Mon–Fri 8am–4pm AEST',
          onPress: () => Alert.alert('Help & Support', 'Phone: 0480 769 995\nEmail: hello@butterfieldcookies.com.au\n\nMon–Fri, 8am – 4pm AEST'),
        },
      ],
    },
  ];

  return (
    <DirectorTabScreen title="Profile">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Identity card ─────────────────────────────────────── */}
        <View style={s.identityCard}>
          <View style={[s.avatar, { backgroundColor: roleColor + '14' }]}>
            <Text style={[s.avatarText, { color: roleColor }]}>{userInitials}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.name}>{user?.name ?? 'Director'}</Text>
            <Text style={s.email}>{user?.email}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[s.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={s.roleBadgeText}>{roleLabel.toUpperCase()}</Text>
              </View>
              {profile?.hourlyRateCents ? (
                <Text style={s.rateText}>${(profile.hourlyRateCents / 100).toFixed(2)}/hr</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Staff details (when available) ────────────────────── */}
        {profile && (
          <>
            <Text style={s.sectionHeader}>DETAILS</Text>
            <View style={s.listCard}>
              {([
                { label: 'Employee ID',  value: profile.employeeId ?? '—' },
                { label: 'Department',   value: capitalize(profile.department ?? '') || '—' },
                { label: 'Position',     value: capitalize(profile.position ?? '') || '—' },
                { label: 'Status',       value: profile.employmentStatus ? capitalize(profile.employmentStatus.replace('-', ' ')) : '—' },
              ] as { label: string; value: string }[]).map((row, i, arr) => (
                <View
                  key={row.label}
                  style={[
                    s.detailRow,
                    i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORD },
                  ]}
                >
                  <Text style={s.detailLabel}>{row.label}</Text>
                  <Text style={s.detailValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Settings sections ─────────────────────────────────── */}
        {settingsItems.map(section => (
          <View key={section.section}>
            <Text style={s.sectionHeader}>{section.section.toUpperCase()}</Text>
            <View style={s.listCard}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    s.menuRow,
                    i < section.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORD },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={s.menuIconWrap}>
                    <Feather name={item.icon} size={16} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuLabel}>{item.label}</Text>
                    <Text style={s.menuSub}>{item.sub}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* ── Sign out ──────────────────────────────────────────── */}
        <Text style={s.sectionHeader}>SESSION</Text>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [s.signOutRow, pressed && { opacity: 0.75 }]}
        >
          <View style={[s.menuIconWrap, { backgroundColor: RED + '12' }]}>
            <Feather name="log-out" size={16} color={RED} />
          </View>
          <Text style={[s.menuLabel, { color: RED }]}>Sign Out</Text>
        </Pressable>

        <Text style={s.version}>
          Butterfield {roleLabel} Portal · v{Constants.expoConfig?.version ?? '—'}
        </Text>
      </ScrollView>
    </DirectorTabScreen>
  );
}

const s = StyleSheet.create({
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD, borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
    marginBottom: 4,
  },
  avatar:       { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 20, fontWeight: '700' },
  name:         { fontSize: 17, fontWeight: '700', color: TEXT },
  email:        { fontSize: 13, color: MUTED },
  roleBadge:    { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  roleBadgeText:{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  rateText:     { fontSize: 13, color: MUTED },

  sectionHeader: {
    fontSize: 11, fontWeight: '600', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 24, marginBottom: 8, marginLeft: 4,
  },
  listCard: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
    overflow: 'hidden',
  },
  detailRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  detailLabel:  { fontSize: 13, color: MUTED },
  detailValue:  { fontSize: 13, fontWeight: '600', color: TEXT },

  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE + '12' },
  menuLabel:    { fontSize: 14, fontWeight: '500', color: TEXT, flex: 1 },
  menuSub:      { fontSize: 12, color: MUTED, marginTop: 1 },

  signOutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
  },

  version: { textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 32 },
});
