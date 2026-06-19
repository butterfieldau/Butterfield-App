import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';
import { api } from '@/lib/api';
import { buildCategories, type Category } from './_moreCategories';

const BG      = '#EFF6FF';
const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORD    = '#E5E7EB';
const RED     = '#EF4444';
const OBSIDIAN = '#0A0A0A';
const GOLD    = '#C9A84C';

function PremiumVaultCard({ cat, onPress }: { cat: Category; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.vaultCard, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={s.vaultIconWrap}>
        <Feather name="lock" size={22} color={GOLD} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.vaultLabel}>{cat.label}</Text>
          <View style={s.vaultBadge}>
            <Text style={s.vaultBadgeText}>DIRECTOR ONLY</Text>
          </View>
        </View>
        <Text style={s.vaultDesc} numberOfLines={1}>{cat.description}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          <View style={[s.badge, { backgroundColor: GOLD + '25' }]}>
            <Text style={[s.badgeText, { color: GOLD }]}>PIN + Biometric</Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={GOLD + 'AA'} />
    </Pressable>
  );
}

function CategoryCard({ cat, onPress }: { cat: Category; onPress: () => void }) {
  if (cat.premium) return <PremiumVaultCard cat={cat} onPress={onPress} />;

  const allItems  = cat.groups.flatMap(g => g.items);
  const soonCount = allItems.filter(i => i.soon).length;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.catCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[s.catIcon, { backgroundColor: cat.color + '33', borderColor: cat.color + '55' }]}>
        <Feather name={cat.icon as any} size={22} color={cat.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.catLabel}>{cat.label}</Text>
        <Text style={s.catDesc} numberOfLines={1}>{cat.description}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
          <View style={[s.badge, { backgroundColor: cat.color + '18' }]}>
            <Text style={[s.badgeText, { color: cat.color }]}>
              {cat.groups.length} {cat.groups.length === 1 ? 'section' : 'sections'}
            </Text>
          </View>
          {soonCount > 0 && (
            <View style={[s.badge, { backgroundColor: MUTED + '18' }]}>
              <Text style={[s.badgeText, { color: MUTED }]}>{soonCount} coming soon</Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={MUTED} />
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const layoutHandledSA = useLayoutHandledSafeArea();
  const { user, logout } = useAuth();
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

  const categories = useMemo(
    () => buildCategories(canSee, isDirector),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isManager, managerPerms.join(','), isDirector],
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={[s.homeHeader, { paddingTop: layoutHandledSA ? 16 : insets.top + 16 }]}>
        <Text style={s.homeTitle}>More</Text>
        <Text style={s.homeSub}>Tools, settings & configuration</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {categories.map(cat => (
          <CategoryCard
            key={cat.key}
            cat={cat}
            onPress={() => {
              if (cat.key === 'vault') {
                router.push('/director-vault' as any);
              } else {
                router.push({ pathname: '/director-more-category', params: { category: cat.key } } as any);
              }
            }}
          />
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
          style={({ pressed }) => [s.signOut, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Feather name="log-out" size={16} color={RED} />
          <View style={{ flex: 1 }}>
            <Text style={[s.catLabel, { color: RED }]}>Sign Out</Text>
            <Text style={s.catDesc}>{user?.email ?? ''}</Text>
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
  homeHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  homeTitle:  { fontSize: 30, fontWeight: '700', color: TEXT, marginBottom: 4 },
  homeSub:    { fontSize: 14, color: MUTED },
  footer:     { textAlign: 'center', fontSize: 12, color: BORD, marginTop: 16, marginBottom: 8 },

  catCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingVertical: 16, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
  },
  catIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  catLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
  catDesc:  { fontSize: 12, color: MUTED },
  badge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText:{ fontSize: 11, fontWeight: '600' },

  vaultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: OBSIDIAN, borderRadius: 18,
    paddingVertical: 18, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: GOLD + '55',
  },
  vaultIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: GOLD + '20', borderWidth: 1.5, borderColor: GOLD + '55',
  },
  vaultLabel:    { fontSize: 16, fontWeight: '700', color: GOLD },
  vaultDesc:     { fontSize: 12, color: GOLD + 'AA' },
  vaultBadge:    { backgroundColor: GOLD + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  vaultBadgeText:{ fontSize: 10, fontWeight: '700', color: GOLD, letterSpacing: 0.5 },

  signOut: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: RED + '0A', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: RED + '30',
    marginTop: 4,
  },
});
