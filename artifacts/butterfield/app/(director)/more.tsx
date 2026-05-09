import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#40C0F2';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const RED    = '#EF4444';
const NAVY   = '#1A2B4A';

type Row = {
  icon: string;
  label: string;
  sub?: string;
  color: string;
  onPress: () => void;
  danger?: boolean;
};

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={[s.card, { borderColor: BORDER }]}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            onPress={() => { Haptics.selectionAsync(); row.onPress(); }}
            style={({ pressed }) => [
              s.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
              pressed && { backgroundColor: '#F5F6FA' },
            ]}
          >
            <View style={[s.iconBox, { backgroundColor: (row.danger ? RED : row.color) + '18' }]}>
              <Feather name={row.icon as any} size={17} color={row.danger ? RED : row.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: row.danger ? RED : TEXT }]}>{row.label}</Text>
              {row.sub && <Text style={s.rowSub}>{row.sub}</Text>}
            </View>
            {!row.danger && <Feather name="chevron-right" size={16} color={MUTED} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  const operations: Row[] = [
    {
      icon: 'bar-chart-2',
      label: 'Reports',
      sub: 'Revenue, feedback & analytics',
      color: NAVY,
      onPress: () => router.push('/(director)/reports' as any),
    },
    {
      icon: 'clock',
      label: 'Timesheets',
      sub: 'Staff shifts & payroll export',
      color: PURPLE,
      onPress: () => router.push('/(director)/timesheets' as any),
    },
    {
      icon: 'tag',
      label: 'Pricing & Tiers',
      sub: 'Wholesale pricing rules',
      color: AMBER,
      onPress: () => router.push('/(director)/pricing' as any),
    },
  ];

  const store: Row[] = [
    {
      icon: 'settings',
      label: 'Store Settings',
      sub: 'Open/close, geo-fence, daily special',
      color: BLUE,
      onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Store' } } as any),
    },
    {
      icon: 'gift',
      label: 'Rewards & Loyalty',
      sub: 'Reward catalog & tiers',
      color: GREEN,
      onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Rewards' } } as any),
    },
    {
      icon: 'bell',
      label: 'Announcements',
      sub: 'Push notifications & banners',
      color: '#06B6D4',
      onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Notify' } } as any),
    },
    {
      icon: 'shield',
      label: 'Manager Access',
      sub: 'Permissions & portal access',
      color: NAVY,
      onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Managers' } } as any),
    },
  ];

  const account: Row[] = [
    {
      icon: 'log-out',
      label: 'Sign Out',
      color: RED,
      danger: true,
      onPress: () => logout().then(() => router.replace('/(auth)/login')),
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.header, { paddingTop: insets.top > 0 ? insets.top + 8 : 20 }]}>
        <Text style={s.headerTitle}>More</Text>
        <Text style={s.headerSub}>Tools, settings & configuration</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 0 }}>
        <Section title="OPERATIONS" rows={operations} />
        <Section title="STORE"      rows={store} />
        <Section title="ACCOUNT"    rows={account} />
      </View>

      <Text style={s.footer}>Butterfield Director Portal</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingBottom: 20, backgroundColor: BG },
  headerTitle: { fontSize: 30, fontFamily: 'Inter_700Bold', color: TEXT, marginBottom: 4 },
  headerSub:   { fontSize: 14, fontFamily: 'Inter_400Regular', color: MUTED },
  section:     { marginBottom: 28 },
  sectionTitle:{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: MUTED, letterSpacing: 1.4, marginBottom: 8, paddingHorizontal: 4 },
  card:        { backgroundColor: CARD, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { fontSize: 15, fontFamily: 'Inter_500Medium', color: TEXT },
  rowSub:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 1 },
  footer:      { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', color: BORDER, marginTop: 8, marginBottom: 16 },
});
