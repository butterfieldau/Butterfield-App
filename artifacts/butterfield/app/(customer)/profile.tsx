import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

const MENU_ITEMS = [
  { icon: 'package', label: 'Order History', sub: 'View your past orders' },
  { icon: 'map-pin', label: 'Saved Addresses', sub: 'Manage delivery locations' },
  { icon: 'bell', label: 'Notifications', sub: 'Manage push alerts' },
  { icon: 'shield', label: 'Privacy & Security', sub: 'Account security settings' },
  { icon: 'help-circle', label: 'Help & Support', sub: 'Get help from our team' },
];

export default function CustomerProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <LinearGradient
        colors={['#C8833A', '#8B4513']}
        style={[styles.hero, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
      >
        <View style={styles.avatarCircle}>
          <Text style={[styles.avatarText, { fontFamily: 'Inter_700Bold' }]}>
            {user?.name?.charAt(0) ?? 'A'}
          </Text>
        </View>
        <Text style={[styles.userName, { fontFamily: 'Inter_700Bold' }]}>{user?.name}</Text>
        <Text style={[styles.userEmail, { fontFamily: 'Inter_400Regular' }]}>{user?.email}</Text>
        <View style={styles.pointsRow}>
          <Feather name="star" size={14} color="#C8833A" />
          <Text style={[styles.pointsText, { fontFamily: 'Inter_600SemiBold' }]}>
            {user?.loyaltyPoints?.toLocaleString()} points · Silver Member
          </Text>
        </View>
      </LinearGradient>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Orders', value: '24' },
          { label: 'Reviews', value: '8' },
          { label: 'Saved', value: '6' },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.statValue, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
              {stat.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Menu items */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {MENU_ITEMS.map((item, index) => (
          <Pressable
            key={item.label}
            style={[
              styles.menuItem,
              index < MENU_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.muted, borderRadius: 10 }]}>
              <Feather name={item.icon as any} size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
                {item.label}
              </Text>
              <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>

      {/* Sign out */}
      <Pressable
        onPress={handleLogout}
        style={[styles.signOutBtn, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: '#FEE2E2' }]}
      >
        <Feather name="log-out" size={18} color="#DC2626" />
        <Text style={[styles.signOutText, { fontFamily: 'Inter_600SemiBold' }]}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
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
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    color: '#fff',
  },
  userName: {
    color: '#fff',
    fontSize: 22,
  },
  userEmail: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 6,
  },
  pointsText: {
    color: '#4A2410',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
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
    fontSize: 12,
  },
  menuCard: {
    marginHorizontal: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  menuIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 14,
    marginBottom: 1,
  },
  menuSub: {
    fontSize: 12,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
  },
  signOutText: {
    color: '#DC2626',
    fontSize: 15,
  },
});
