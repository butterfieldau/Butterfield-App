import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useFocusStatusBar } from '@/hooks/useScrollStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';
import { api } from '@/lib/api';
import { BG, CARD, TEXT, MUTED, RED, GOLD } from '@/components/director/directorColors';
import { buildCategories } from './_moreCategories';

const OBSIDIAN = '#0A0A0A';

// ─── Types ────────────────────────────────────────────────────────────────────
type NavRow = {
  icon: string;
  label: string;
  iconColor: string;
  badge?: number;
  onPress: () => void;
};

type NavSection = {
  header?: string;
  items: NavRow[];
  vault?: boolean;
};

// ─── Section data ─────────────────────────────────────────────────────────────
function buildSections(
  canSee: (p: string) => boolean,
  isDirector: boolean,
): NavSection[] {
  // Top quick-access strip — hardcoded UI affordance, not a nav registry entry
  const quickAccess: NavSection = {
    items: [
      { icon: 'bar-chart-2', label: 'Reports',    iconColor: '#007AFF', onPress: () => router.push('/director-reports' as any) },
      { icon: 'clock',       label: 'Timesheets', iconColor: '#FF9500', onPress: () => router.push('/director-staff-hours' as any) },
      { icon: 'users',       label: 'Staff Hub',  iconColor: '#34C759', onPress: () => router.push('/director-staffhub' as any) },
    ],
  };

  const cats = buildCategories(canSee, isDirector);

  const catSections: NavSection[] = cats.map(cat => {
    if (cat.key === 'vault') {
      const vaultItem = cat.groups[0]?.items[0];
      return {
        vault: true,
        items: [{
          icon: 'lock',
          label: 'Director Vault',
          iconColor: GOLD,
          onPress: vaultItem?.onPress ?? (() => {}),
        }],
      };
    }
    const items: NavRow[] = cat.groups
      .flatMap(g => g.items)
      .filter(i => !i.soon)
      .map(i => ({
        icon: i.icon,
        label: i.label,
        iconColor: i.color,
        onPress: i.onPress ?? (() => {}),
      }));
    return { header: cat.label.toUpperCase(), items };
  }).filter(s => s.items.length > 0);

  return [quickAccess, ...catSections];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function NavRowItem({ row, isLast }: { row: NavRow; isLast: boolean }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); row.onPress(); }}
      style={({ pressed }) => [s.row, isLast && s.rowLast, pressed && { backgroundColor: '#F5F5F7' }]}
    >
      <View style={[s.iconWrap, { backgroundColor: row.iconColor + '18' }]}>
        <Feather name={row.icon as any} size={18} color={row.iconColor} />
      </View>
      <Text style={s.rowLabel} numberOfLines={1}>{row.label}</Text>
      {row.badge != null && row.badge > 0 ? (
        <View style={s.badgeBubble}>
          <Text style={s.badgeText}>{row.badge}</Text>
        </View>
      ) : null}
      <Feather name="chevron-right" size={18} color="#C7C7CC" />
    </Pressable>
  );
}

function SectionCard({ section }: { section: NavSection }) {
  if (section.vault) {
    const item = section.items[0];
    return (
      <Pressable
        onPress={() => { Haptics.selectionAsync(); item.onPress(); }}
        style={({ pressed }) => [s.vaultCard, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={s.vaultIconWrap}>
          <Feather name="lock" size={20} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.vaultLabel}>Director Vault</Text>
            <View style={s.vaultBadge}>
              <Text style={s.vaultBadgeText}>DIRECTOR ONLY</Text>
            </View>
          </View>
          <Text style={s.vaultDesc}>Secure recipe & cost repository</Text>
        </View>
        <Feather name="chevron-right" size={18} color={GOLD + 'AA'} />
      </Pressable>
    );
  }

  return (
    <View>
      {section.header ? (
        <Text style={s.sectionHeader}>{section.header}</Text>
      ) : null}
      <View style={s.sectionCard}>
        {section.items.map((item, idx) => (
          <NavRowItem
            key={item.label}
            row={item}
            isLast={idx === section.items.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const layoutHandledSA = useLayoutHandledSafeArea();
  const { user, logout } = useAuth();
  useFocusStatusBar('dark-content');

  const isManager  = user?.role === 'manager';
  const isDirector = !isManager;

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

  const sections = useMemo(
    () => buildSections(canSee, isDirector),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isManager, managerPerms.join(','), isDirector],
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.header, { paddingTop: layoutHandledSA ? 12 : insets.top + 12 }]}>
          <Text style={s.title}>More</Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 24 }}>
          {sections.map((sec, i) => (
            <SectionCard key={i} section={sec} />
          ))}

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
            <View style={[s.iconWrap, { backgroundColor: RED + '15' }]}>
              <Feather name="log-out" size={18} color={RED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: RED }]}>Sign Out</Text>
              <Text style={s.signOutEmail}>{user?.email ?? ''}</Text>
            </View>
          </Pressable>
        </View>

        <Text style={s.footer}>
          Butterfield {isManager ? 'Manager' : 'Director'} Portal
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title:  { fontSize: 34, fontWeight: '700', color: TEXT, letterSpacing: -0.5 },

  sectionHeader: {
    fontSize: 13, fontWeight: '600', color: MUTED,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
    backgroundColor: CARD,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: TEXT },

  iconWrap: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  badgeBubble: {
    backgroundColor: '#FF3B30', width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  vaultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: OBSIDIAN, borderRadius: 20,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: GOLD + '55',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 3,
  },
  vaultIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: GOLD + '20', borderWidth: 1.5, borderColor: GOLD + '55',
  },
  vaultLabel:    { fontSize: 16, fontWeight: '700', color: GOLD },
  vaultDesc:     { fontSize: 12, color: GOLD + 'AA', marginTop: 2 },
  vaultBadge:    { backgroundColor: GOLD + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  vaultBadgeText:{ fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.5 },

  signOutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: RED + '08', borderRadius: 20,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: RED + '25',
  },
  signOutEmail: { fontSize: 12, color: MUTED, marginTop: 1 },

  footer: { textAlign: 'center', fontSize: 12, color: '#C7C7CC', marginTop: 16, marginBottom: 8 },
});
