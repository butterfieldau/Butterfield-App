import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InternalGlassCard } from '@/components/InternalGlass';

const BG     = '#EFF6FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const PURPLE = '#8B5CF6';
const RED    = '#EF4444';
const NAVY   = '#1A2B4A';

// ── Types ─────────────────────────────────────────────────────────────────────
type RowItem = {
  icon: string;
  label: string;
  sub: string;
  color: string;
  perm?: string;          // required manager permission; undefined = always visible
  directorOnly?: boolean; // hidden for managers entirely
  soon?: boolean;         // coming soon – no navigation, dimmed
  onPress?: () => void;
};

type Category = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;        // card background tint
  description: string;
  items: RowItem[];
};

// ── Category data ──────────────────────────────────────────────────────────────
function buildCategories(
  canSee: (perm: string) => boolean,
  isDirector: boolean,
): Category[] {
  return [
    {
      key: 'sales',
      label: 'Sales & Marketing',
      icon: 'trending-up',
      color: BLUE,
      bgColor: '#EFF6FF',
      description: 'Reports, discounts, rewards & promotions',
      items: [
        {
          icon: 'bar-chart-2', label: 'Reports', sub: 'Revenue, sales trends & analytics',
          color: NAVY, perm: 'reports',
          onPress: () => router.push('/(director)/reports' as any),
        },
        {
          icon: 'percent', label: 'Discount Codes', sub: 'Coupons, promotions & campaigns',
          color: RED, perm: 'pricing',
          onPress: () => router.push('/(director)/discounts' as any),
        },
        {
          icon: 'gift', label: 'Rewards & Loyalty', sub: 'Loyalty tiers, rewards & coffee stamps',
          color: GREEN, perm: 'rewards',
          onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Rewards' } } as any),
        },
        {
          icon: 'image', label: 'Banners & Promotions', sub: 'Homepage banners & featured products',
          color: AMBER, perm: 'banners',
          onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Banner' } } as any),
        },
        {
          icon: 'bell', label: 'Announcements', sub: 'Push notifications & in-app messages',
          color: '#06B6D4', perm: 'announcements',
          onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Notify' } } as any),
        },
      ],
    },
    {
      key: 'operations',
      label: 'Operations',
      icon: 'tool',
      color: GREEN,
      bgColor: '#F0FDF4',
      description: 'Store settings, stock, locations & timesheets',
      items: [
        {
          icon: 'settings', label: 'Store Settings', sub: 'Open/close, daily special & pickup',
          color: GREEN, perm: 'settings',
          onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Store' } } as any),
        },
        {
          icon: 'map-pin', label: 'Store Locations', sub: 'Locations, trading hours & geofence',
          color: '#059669', perm: 'settings',
          onPress: () => router.push('/(director)/stores' as any),
        },
        {
          icon: 'archive', label: 'Stock & Inventory', sub: 'Stock levels, movements & low-stock alerts',
          color: AMBER, perm: 'stock',
          onPress: () => router.push('/(director)/stock' as any),
        },
        {
          icon: 'clock', label: 'Timesheets', sub: 'Staff hours, payroll export & attendance',
          color: PURPLE, perm: 'timesheets',
          onPress: () => router.push('/(director)/timesheets' as any),
        },
      ],
    },
    {
      key: 'people',
      label: 'People',
      icon: 'users',
      color: PURPLE,
      bgColor: '#FAF5FF',
      description: 'Customers, staff accounts & manager access',
      items: [
        {
          icon: 'user-check', label: 'Customers', sub: 'CRM, loyalty history & customer notes',
          color: BLUE, perm: 'users',
          onPress: () => router.push('/(director)/customers' as any),
        },
        {
          icon: 'users', label: 'People & Accounts', sub: 'Staff, managers & wholesale accounts',
          color: PURPLE, perm: 'users',
          onPress: () => router.push('/(director)/users' as any),
        },
        {
          icon: 'shield', label: 'Manager Access', sub: 'Roles, permissions & portal access',
          color: NAVY, directorOnly: true,
          onPress: () => router.push({ pathname: '/(director)/settings', params: { tab: 'Managers' } } as any),
        },
      ],
    },
    {
      key: 'wholesale',
      label: 'Wholesale',
      icon: 'briefcase',
      color: AMBER,
      bgColor: '#FFFBEB',
      description: 'Pricing tiers, quantity breaks & credit limits',
      items: [
        {
          icon: 'tag', label: 'Wholesale Tiers', sub: 'Tier discounts & minimum order rules',
          color: AMBER, perm: 'pricing',
          onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'Tiers' } } as any),
        },
        {
          icon: 'layers', label: 'Quantity Breaks', sub: 'Volume pricing per product',
          color: '#D97706', perm: 'pricing',
          onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'QtyBreaks' } } as any),
        },
        {
          icon: 'dollar-sign', label: 'Customer Pricing', sub: 'Per-customer overrides & credit limits',
          color: '#B45309', perm: 'pricing',
          onPress: () => router.push({ pathname: '/(director)/pricing', params: { tab: 'Custom' } } as any),
        },
        {
          icon: 'user', label: 'Account Managers', sub: 'Assign account managers to wholesale clients',
          color: '#92400E', perm: 'users',
          onPress: () => router.push('/(director)/users' as any),
        },
      ],
    },
    {
      key: 'system',
      label: 'System',
      icon: 'cpu',
      color: NAVY,
      bgColor: '#F0F4FA',
      description: 'Notifications, integrations & app settings',
      items: [
        {
          icon: 'bell-off', label: 'Notification Settings', sub: 'Control what you get notified about',
          color: PURPLE, directorOnly: false,
          onPress: () => router.push('/notification-prefs' as any),
        },
        {
          icon: 'link', label: 'Integrations', sub: 'Square, Shopify, Xero & Google',
          color: BLUE, soon: true,
        },
        {
          icon: 'sliders', label: 'App Settings', sub: 'Configure app-wide preferences',
          color: GREEN, soon: true,
        },
        {
          icon: 'lock', label: 'Security', sub: 'Access control & authentication',
          color: AMBER, directorOnly: true, soon: true,
        },
        {
          icon: 'file-text', label: 'Audit Logs', sub: 'Track admin actions & changes',
          color: NAVY, directorOnly: true, soon: true,
        },
      ],
    },
  ].map(cat => ({
    ...cat,
    items: (cat.items as RowItem[]).filter(item => {
      if (item.directorOnly && !isDirector) return false;
      if (item.perm && !canSee(item.perm)) return false;
      return true;
    }),
  })).filter(cat => cat.items.length > 0) as Category[];
}

// ── Category card (home view) ─────────────────────────────────────────────────
function CategoryCard({ cat, onPress }: { cat: Category; onPress: () => void }) {
  const realCount = cat.items.filter(i => !i.soon).length;
  const soonCount = cat.items.filter(i => i.soon).length;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.catCard, { opacity: pressed ? 0.82 : 1 }]}
    >
      {/* Left color bar */}
      <View style={[s.catBar, { backgroundColor: cat.color }]} />

      <View style={[s.catIconWrap, { backgroundColor: cat.color + '18' }]}>
        <Feather name={cat.icon as any} size={22} color={cat.color} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.catLabel}>{cat.label}</Text>
        <Text style={s.catDesc} numberOfLines={1}>{cat.description}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          {realCount > 0 && (
            <View style={[s.countBadge, { backgroundColor: cat.color + '18' }]}>
              <Text style={[s.countText, { color: cat.color }]}>{realCount} {realCount === 1 ? 'tool' : 'tools'}</Text>
            </View>
          )}
          {soonCount > 0 && (
            <View style={[s.countBadge, { backgroundColor: MUTED + '18' }]}>
              <Text style={[s.countText, { color: MUTED }]}>{soonCount} coming soon</Text>
            </View>
          )}
        </View>
      </View>

      <Feather name="chevron-right" size={18} color={MUTED} />
    </Pressable>
  );
}

// ── Section row (detail view) ─────────────────────────────────────────────────
function SectionRow({ item }: { item: RowItem }) {
  return (
    <Pressable
      onPress={() => {
        if (item.soon) return;
        Haptics.selectionAsync();
        item.onPress?.();
      }}
      style={({ pressed }) => [s.row, pressed && !item.soon && { opacity: 0.72 }]}
    >
      <View style={[s.iconBox, { backgroundColor: (item.soon ? MUTED : item.color) + '18' }]}>
        <Feather name={item.icon as any} size={17} color={item.soon ? MUTED : item.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: item.soon ? MUTED : TEXT }]}>{item.label}</Text>
        <Text style={s.rowSub}>{item.sub}</Text>
      </View>
      {item.soon ? (
        <View style={s.soonBadge}>
          <Text style={s.soonText}>SOON</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={16} color={MUTED} />
      )}
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const isManager  = user?.role === 'manager';
  const isDirector = !isManager; // director or master

  const [openKey, setOpenKey] = useState<string | null>(null);

  const { data: managerProfileData } = useQuery({
    queryKey: ['manager-profile'],
    queryFn: () => api.manager.profile(),
    enabled: isManager,
    staleTime: 60_000,
  });
  const managerPerms: string[] = useMemo(
    () => managerProfileData?.data?.permissions ?? [],
    [managerProfileData],
  );
  const canSee = (perm: string) => !isManager || managerPerms.includes(perm);

  const categories = useMemo(
    () => buildCategories(canSee, isDirector),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isManager, managerPerms.join(','), isDirector],
  );

  const openCategory = openKey ? categories.find(c => c.key === openKey) ?? null : null;

  // ── Detail view (category drill-down) ──────────────────────────────────────
  if (openCategory) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back header */}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setOpenKey(null); }}
          style={[s.backRow, { paddingTop: 20 }]}
        >
          <Feather name="chevron-left" size={20} color={openCategory.color} />
          <Text style={[s.backLabel, { color: openCategory.color }]}>More</Text>
        </Pressable>

        {/* Section header */}
        <View style={s.detailHeader}>
          <View style={[s.detailIconWrap, { backgroundColor: openCategory.color + '18' }]}>
            <Feather name={openCategory.icon as any} size={26} color={openCategory.color} />
          </View>
          <View style={{ gap: 3 }}>
            <Text style={s.detailTitle}>{openCategory.label}</Text>
            <Text style={s.detailDesc}>{openCategory.description}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <InternalGlassCard style={s.card}>
            {openCategory.items.map((item) => (
              <SectionRow key={item.label} item={item} />
            ))}
          </InternalGlassCard>
        </View>
      </ScrollView>
    );
  }

  // ── Home view (category cards) ──────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: insets.bottom + (isManager ? 100 : 24) }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.header, { paddingTop: 20 }]}>
        <Text style={s.headerTitle}>More</Text>
        <Text style={s.headerSub}>Tools, settings & configuration</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {categories.map(cat => (
          <CategoryCard key={cat.key} cat={cat} onPress={() => setOpenKey(cat.key)} />
        ))}

        {/* Sign out */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            Alert.alert('Sign Out', 'Sign out of your account?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
            ]);
          }}
          style={({ pressed }) => [s.signOutRow, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="log-out" size={16} color={RED} />
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, { color: RED }]}>Sign Out</Text>
            <Text style={s.rowSub}>{user?.email ?? ''}</Text>
          </View>
        </Pressable>
      </View>

      <Text style={s.footer}>Butterfield {isManager ? 'Manager' : 'Director'} Portal</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle:  { fontSize: 30, fontWeight: '700', color: TEXT, marginBottom: 4 },
  headerSub:    { fontSize: 14, fontWeight: '400', color: MUTED },
  footer:       { textAlign: 'center', fontSize: 12, fontWeight: '400', color: BORDER, marginTop: 12, marginBottom: 8 },

  // Category card (home)
  catCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingVertical: 16, paddingRight: 16, paddingLeft: 0,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER,
    overflow: 'hidden',
  },
  catBar:     { width: 4, alignSelf: 'stretch', borderRadius: 0 },
  catIconWrap:{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  catLabel:   { fontSize: 16, fontWeight: '700', color: TEXT },
  catDesc:    { fontSize: 12, fontWeight: '400', color: MUTED },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  countText:  { fontSize: 11, fontWeight: '600' },

  // Back header (detail view)
  backRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 8 },
  backLabel:  { fontSize: 15, fontWeight: '600' },
  detailHeader: { paddingHorizontal: 20, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  detailIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  detailTitle:{ fontSize: 24, fontWeight: '700', color: TEXT },
  detailDesc: { fontSize: 13, fontWeight: '400', color: MUTED },

  // Section row (detail view)
  card:    { borderRadius: 24, padding: 8, gap: 8 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 13 },
  iconBox: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ fontSize: 15, fontWeight: '500', color: TEXT },
  rowSub:  { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 1 },
  soonBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: MUTED + '20' },
  soonText: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },

  // Sign out
  signOutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: RED + '0A', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: RED + '30',
    marginTop: 4,
  },
});
