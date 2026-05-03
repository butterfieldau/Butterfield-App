import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function WholesaleProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const u = user as any;

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F2F8F5' }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={['#1A3A2A', '#2A6A4A']}
        style={[styles.hero, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}
      >
        <View style={styles.avatarCircle}>
          <Text style={[styles.avatarText, { fontFamily: 'Inter_700Bold' }]}>
            {u?.companyName?.charAt(0) ?? 'W'}
          </Text>
        </View>
        <Text style={[styles.companyName, { fontFamily: 'Inter_700Bold' }]}>{u?.companyName}</Text>
        <Text style={[styles.contactName, { fontFamily: 'Inter_400Regular' }]}>{user?.name}</Text>
        <View style={styles.acctChip}>
          <Feather name="tag" size={12} color="#4ADE80" />
          <Text style={[styles.acctText, { fontFamily: 'Inter_500Medium' }]}>
            Account: {u?.accountNumber}
          </Text>
        </View>
      </LinearGradient>

      {/* Account details */}
      <View style={[styles.detailsCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}>
        <Text style={[styles.cardTitle, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>Account Details</Text>
        {[
          { label: 'Email', value: user?.email, icon: 'mail' },
          { label: 'Account Number', value: u?.accountNumber, icon: 'hash' },
          { label: 'Credit Limit', value: `$${(u?.creditLimit ?? 0).toLocaleString()}`, icon: 'credit-card' },
          { label: 'Payment Terms', value: 'Net 30 Days', icon: 'calendar' },
          { label: 'GST Registered', value: 'ABN 12 345 678 910', icon: 'shield' },
        ].map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: '#E8F4EE' }]}>
              <Feather name={row.icon as any} size={14} color="#2A6A4A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailLabel, { color: '#6A9A7A' }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: '#1A3A2A' }]}>{row.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Contact info */}
      <View style={[styles.detailsCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}>
        <Text style={[styles.cardTitle, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>Delivery Address</Text>
        {[
          { label: 'Address', value: '42 Bourke Street', icon: 'map-pin' },
          { label: 'Suburb', value: 'Surry Hills NSW 2010', icon: 'navigation' },
          { label: 'Delivery Days', value: 'Tuesday & Friday', icon: 'truck' },
          { label: 'Minimum Order', value: '$250 excl. GST', icon: 'shopping-cart' },
        ].map((row) => (
          <View key={row.label} style={styles.detailRow}>
            <View style={[styles.detailIcon, { backgroundColor: '#E8F4EE' }]}>
              <Feather name={row.icon as any} size={14} color="#2A6A4A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.detailLabel, { color: '#6A9A7A' }]}>{row.label}</Text>
              <Text style={[styles.detailValue, { color: '#1A3A2A' }]}>{row.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Settings */}
      {[
        { icon: 'bell', label: 'Order Notifications' },
        { icon: 'users', label: 'Team Members' },
        { icon: 'help-circle', label: 'Help & Support' },
        { icon: 'file-text', label: 'Terms & Conditions' },
      ].map((item) => (
        <Pressable
          key={item.label}
          style={[styles.menuItem, { backgroundColor: '#fff', borderRadius: colors.radius / 2, borderColor: '#C8DDD4' }]}
        >
          <Feather name={item.icon as any} size={17} color="#2A6A4A" />
          <Text style={[styles.menuLabel, { color: '#1A3A2A', fontFamily: 'Inter_400Regular' }]}>{item.label}</Text>
          <Feather name="chevron-right" size={14} color="#6A9A7A" style={{ marginLeft: 'auto' }} />
        </Pressable>
      ))}

      <Pressable
        onPress={handleLogout}
        style={[styles.logoutBtn, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#FCA5A5' }]}
      >
        <Feather name="log-out" size={17} color="#EF4444" />
        <Text style={[styles.logoutText, { fontFamily: 'Inter_600SemiBold' }]}>Sign Out</Text>
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
    gap: 5,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: {
    fontSize: 28,
    color: '#fff',
  },
  companyName: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
  },
  contactName: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
  },
  acctChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  acctText: {
    color: '#4ADE80',
    fontSize: 12,
  },
  detailsCard: {
    marginHorizontal: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 11,
    marginBottom: 1,
  },
  detailValue: {
    fontSize: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    marginHorizontal: 16,
    borderWidth: 1,
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
    padding: 15,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 15,
  },
});
