import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const RED    = '#F40009';
const GOLD   = '#F59E0B';
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

  const [geoModal, setGeoModal] = useState(false);
  const [radius, setRadius] = useState(20);
  const [savingGeo, setSavingGeo] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ['staff-profile'], queryFn: () => api.staff.profile(), retry: 1,
  });

  const { data: geoData, refetch: refetchGeo } = useQuery({
    queryKey: ['staff-geo-settings'],
    queryFn: () => api.staff.geoSettings.get(),
    retry: 1,
    enabled: !!(profileData?.data?.isManager),
  });

  const profile = profileData?.data;
  const isManager = profile?.isManager ?? false;
  const roleColor = isManager ? RED : BLUE;
  const positionLabel = profile?.position ? capitalize(profile.position) : 'Staff';

  useEffect(() => {
    if (geoData?.data?.radiusMeters) {
      setRadius(geoData.data.radiusMeters);
    }
  }, [geoData]);

  const handleSaveGeo = async () => {
    setSavingGeo(true);
    try {
      await api.staff.geoSettings.update(radius);
      await refetchGeo();
      qc.invalidateQueries({ queryKey: ['staff-geo-settings'] });
      setGeoModal(false);
      Alert.alert('Saved', `Sign-in radius updated to ${radius}m.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSavingGeo(false); }
  };

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

  const RADIUS_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500];

  const currentGeoRadius = geoData?.data?.radiusMeters ?? 20;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
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

        {/* Director-only: Geo Settings */}
        {isManager && (
          <Pressable
            onPress={() => setGeoModal(true)}
            style={[styles.geoCard, { backgroundColor: CARD, borderColor: GOLD + '60', borderWidth: 1 }]}
          >
            <View style={[styles.geoIconWrap, { backgroundColor: GOLD + '18' }]}>
              <Feather name="map-pin" size={20} color={GOLD} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.geoTitle, { color: TEXT }]}>Sign-In Geo Settings</Text>
                <View style={[styles.directorBadge, { backgroundColor: GOLD + '20' }]}>
                  <Text style={[styles.directorBadgeText, { color: GOLD }]}>DIRECTOR</Text>
                </View>
              </View>
              <Text style={[styles.geoSub, { color: MUTED }]}>
                Staff must be within <Text style={{ fontFamily: 'Inter_700Bold', color: TEXT }}>{currentGeoRadius}m</Text> to sign in · Tap to adjust
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={MUTED} />
          </Pressable>
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

      {/* Geo Settings Modal */}
      <Modal visible={geoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGeoModal(false)}>
        <View style={[styles.modalRoot, { backgroundColor: BG }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setGeoModal(false)}>
              <Text style={[{ fontSize: 15, fontFamily: 'Inter_400Regular', color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={[{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: TEXT }]}>Sign-In Geo Radius</Text>
            <Pressable onPress={handleSaveGeo} disabled={savingGeo}>
              {savingGeo
                ? <ActivityIndicator size="small" color={BLUE} />
                : <Text style={[{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: BLUE }]}>Save</Text>
              }
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>

            {/* Current display */}
            <View style={[styles.radiusDisplay, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={[styles.radiusIconCircle, { backgroundColor: GOLD + '20' }]}>
                <Feather name="map-pin" size={24} color={GOLD} />
              </View>
              <Text style={[styles.radiusValue, { color: TEXT }]}>{radius}m</Text>
              <Text style={[styles.radiusSub, { color: MUTED }]}>Sign-in radius from store</Text>
            </View>

            {/* Info */}
            <View style={[styles.infoCard, { backgroundColor: '#FFFBEB', borderColor: GOLD + '40' }]}>
              <Feather name="info" size={14} color={GOLD} />
              <Text style={[styles.infoText, { color: '#92400E', fontFamily: 'Inter_400Regular' }]}>
                Staff must be physically within this distance of <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Butterfield Merrylands</Text> when signing in. Minimum 5m, maximum 500m.
              </Text>
            </View>

            {/* Radius stepper */}
            <View style={[styles.stepperCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.stepperLabel, { color: TEXT }]}>Select radius</Text>
              <View style={styles.stepperGrid}>
                {RADIUS_STEPS.map((step) => (
                  <Pressable
                    key={step}
                    onPress={() => setRadius(step)}
                    style={[
                      styles.stepperPill,
                      {
                        backgroundColor: radius === step ? BLUE : BG,
                        borderColor: radius === step ? BLUE : BORDER,
                      },
                    ]}
                  >
                    <Text style={[styles.stepperPillText, { color: radius === step ? '#fff' : MUTED, fontFamily: radius === step ? 'Inter_700Bold' : 'Inter_400Regular' }]}>
                      {step}m
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Increment/decrement fine controls */}
            <View style={[styles.fineControl, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Text style={[styles.stepperLabel, { color: TEXT }]}>Fine adjust</Text>
              <View style={styles.fineRow}>
                <Pressable
                  onPress={() => setRadius(r => Math.max(5, r - 1))}
                  style={[styles.fineBtn, { borderColor: BORDER }]}
                >
                  <Feather name="minus" size={20} color={TEXT} />
                </Pressable>
                <View style={[styles.fineValueBox, { backgroundColor: BG }]}>
                  <Text style={[styles.fineValue, { color: TEXT }]}>{radius}m</Text>
                </View>
                <Pressable
                  onPress={() => setRadius(r => Math.min(500, r + 1))}
                  style={[styles.fineBtn, { borderColor: BORDER, backgroundColor: BLUE }]}
                >
                  <Feather name="plus" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* Store location info */}
            <View style={[styles.locationCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <Feather name="navigation" size={14} color={BLUE} />
              <View style={{ flex: 1 }}>
                <Text style={[{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>Store location</Text>
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }]}>
                  Butterfield Cookies — 2 Merrylands Rd, Merrylands NSW 2160
                </Text>
                <Text style={[{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }]}>
                  -33.8349, 150.9942 (fixed by system)
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  geoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16 },
  geoIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  geoTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  geoSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  directorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  directorBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  menuCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  menuSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  signOutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  version: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', paddingBottom: 8 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  radiusDisplay: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  radiusIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  radiusValue: { fontSize: 48, fontFamily: 'Inter_700Bold' },
  radiusSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
  stepperCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  stepperLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  stepperGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepperPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  stepperPillText: { fontSize: 13 },
  fineControl: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  fineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fineBtn: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  fineValueBox: { flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fineValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  locationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
});
