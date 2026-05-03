import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function StaffProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace('/(auth)/login');
  };

  const stats = [
    { label: 'Orders Today', value: '18' },
    { label: 'Avg. Time', value: '8m' },
    { label: 'Rating', value: '4.9' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#0D0604' }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#1A0A04', '#3D1F0D']}
        style={[styles.hero, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
      >
        <View style={styles.avatarCircle}>
          <Text style={[styles.avatarText, { fontFamily: 'Inter_700Bold' }]}>
            {user?.name?.charAt(0) ?? 'S'}
          </Text>
        </View>
        <Text style={[styles.name, { fontFamily: 'Inter_700Bold' }]}>{user?.name}</Text>
        <Text style={[styles.role, { fontFamily: 'Inter_400Regular' }]}>Staff Member</Text>
        <View style={styles.idChip}>
          <Feather name="shield" size={12} color="#C8833A" />
          <Text style={[styles.idText, { fontFamily: 'Inter_500Medium' }]}>
            ID: {(user as any)?.staffId}
          </Text>
        </View>
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View
            key={s.label}
            style={[styles.statBox, { backgroundColor: '#1A0A04', borderColor: 'rgba(255,255,255,0.06)' }]}
          >
            <Text style={[styles.statValue, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.4)' }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Shift info */}
      <View style={[styles.shiftCard, { backgroundColor: '#1A0A04', borderColor: 'rgba(255,255,255,0.06)', borderRadius: colors.radius }]}>
        <View style={styles.shiftHeader}>
          <Text style={[styles.shiftTitle, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
            Current Shift
          </Text>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text style={[styles.activeText, { fontFamily: 'Inter_500Medium' }]}>Active</Text>
          </View>
        </View>
        {[
          { label: 'Date', value: 'Saturday, 3 May 2025' },
          { label: 'Start', value: '7:00 AM' },
          { label: 'End', value: '3:00 PM' },
          { label: 'Location', value: 'Surry Hills · CBD Store' },
          { label: 'Role', value: 'Barista / Counter' },
        ].map((row) => (
          <View key={row.label} style={styles.shiftRow}>
            <Text style={[styles.shiftLabel, { color: 'rgba(255,255,255,0.4)' }]}>{row.label}</Text>
            <Text style={[styles.shiftValue, { color: 'rgba(255,255,255,0.85)' }]}>{row.value}</Text>
          </View>
        ))}
      </View>

      {/* Settings */}
      {[
        { icon: 'bell', label: 'Order Notifications' },
        { icon: 'printer', label: 'Printer Settings' },
        { icon: 'help-circle', label: 'Help & Support' },
      ].map((item, i) => (
        <Pressable
          key={item.label}
          style={[styles.menuItem, { backgroundColor: '#1A0A04', borderColor: 'rgba(255,255,255,0.06)', borderRadius: i === 0 ? colors.radius : 0 }]}
        >
          <Feather name={item.icon as any} size={18} color="rgba(255,255,255,0.5)" />
          <Text style={[styles.menuLabel, { color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter_400Regular' }]}>
            {item.label}
          </Text>
          <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.25)" style={{ marginLeft: 'auto' }} />
        </Pressable>
      ))}

      <Pressable
        onPress={handleLogout}
        style={[styles.logoutBtn, { backgroundColor: '#2A0A0A', borderColor: '#4A1A1A', borderRadius: colors.radius }]}
      >
        <Feather name="log-out" size={17} color="#F87171" />
        <Text style={[styles.logoutText, { fontFamily: 'Inter_600SemiBold' }]}>End Shift & Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 6,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(200,131,58,0.25)',
    borderWidth: 2,
    borderColor: '#C8833A50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    color: '#C8833A',
  },
  name: {
    color: '#fff',
    fontSize: 22,
  },
  role: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(200,131,58,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  idText: {
    color: '#C8833A',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 3,
  },
  statValue: {
    fontSize: 22,
  },
  statLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  shiftCard: {
    marginHorizontal: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  shiftTitle: {
    fontSize: 15,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  activeText: {
    color: '#4ADE80',
    fontSize: 11,
  },
  shiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shiftLabel: {
    fontSize: 13,
  },
  shiftValue: {
    fontSize: 13,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  menuLabel: {
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: {
    color: '#F87171',
    fontSize: 15,
  },
});
