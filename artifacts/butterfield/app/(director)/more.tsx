import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Alert, PanResponder, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InternalGlassCard } from '@/components/InternalGlass';
import { buildCategories, type Category, type RowItem } from './_moreCategories';

const BG    = '#EFF6FF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORD  = '#E5E7EB';
const RED   = '#EF4444';

// ── Category card ─────────────────────────────────────────────────────────────
function CategoryCard({ cat, onPress }: { cat: Category; onPress: () => void }) {
  const allItems  = cat.groups.flatMap(g => g.items);
  const soonCount = allItems.filter(i => i.soon).length;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.catCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[s.catIcon, { backgroundColor: cat.color + '18' }]}>
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

// ── Section row ───────────────────────────────────────────────────────────────
function SectionRow({ item, isLast }: { item: RowItem; isLast: boolean }) {
  return (
    <>
      <Pressable
        onPress={() => {
          if (item.soon) return;
          Haptics.selectionAsync();
          item.onPress?.();
        }}
        style={({ pressed }) => [s.row, pressed && !item.soon && { opacity: 0.68 }]}
      >
        <View style={[s.rowIcon, { backgroundColor: (item.soon ? MUTED : item.color) + '18' }]}>
          <Feather name={item.icon as any} size={16} color={item.soon ? MUTED : item.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowLabel, item.soon && { color: MUTED }]}>{item.label}</Text>
          <Text style={s.rowSub}>{item.sub}</Text>
        </View>
        {item.soon ? (
          <View style={s.soonBadge}><Text style={s.soonText}>SOON</Text></View>
        ) : (
          <Feather name="chevron-right" size={15} color={MUTED} />
        )}
      </Pressable>
      {!isLast && <View style={s.divider} />}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const isManager  = user?.role === 'manager';
  const isDirector = !isManager;

  const [openKey, setOpenKey] = useState<string | null>(null);

  // Left-edge swipe to go back (only when detail view is open)
  // Captures only when the touch starts within 30 px of the left edge
  // and drags rightward — vertical scrolling is unaffected.
  const edgePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, gs) =>
        openKey !== null &&
        gs.moveX < 35 &&
        gs.dx > 8 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 60) {
          Haptics.selectionAsync();
          setOpenKey(null);
        }
      },
    }),
  ).current;

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

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (openCategory) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }} {...edgePan.panHandlers}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        >
          {/* Back row */}
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setOpenKey(null); }}
            style={s.backRow}
          >
            <Feather name="chevron-left" size={20} color={openCategory.color} />
            <Text style={[s.backLabel, { color: openCategory.color }]}>More</Text>
          </Pressable>

          {/* Category header */}
          <View style={s.detailHeader}>
            <View style={[s.detailIcon, { backgroundColor: openCategory.color + '18' }]}>
              <Feather name={openCategory.icon as any} size={28} color={openCategory.color} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.detailTitle}>{openCategory.label}</Text>
              <Text style={s.detailDesc}>{openCategory.description}</Text>
            </View>
          </View>

          {/* Groups */}
          <View style={{ paddingHorizontal: 16, gap: 22 }}>
            {openCategory.groups.map(group => (
              <View key={group.label}>
                <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>
                <InternalGlassCard style={s.groupCard}>
                  {group.items.map((item, i) => (
                    <SectionRow
                      key={item.label}
                      item={item}
                      isLast={i === group.items.length - 1}
                    />
                  ))}
                </InternalGlassCard>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Home view (category cards) ──────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.homeHeader}>
        <Text style={s.homeTitle}>More</Text>
        <Text style={s.homeSub}>Tools, settings & configuration</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {categories.map(cat => (
          <CategoryCard
            key={cat.key}
            cat={cat}
            onPress={() => setOpenKey(cat.key)}
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
  );
}

const s = StyleSheet.create({
  // Home
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
  catIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 16, fontWeight: '700', color: TEXT },
  catDesc:  { fontSize: 12, color: MUTED },
  badge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgeText:{ fontSize: 11, fontWeight: '600' },

  signOut: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: RED + '0A', borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: RED + '30',
    marginTop: 4,
  },

  // Detail — back
  backRow:   { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  backLabel: { fontSize: 15, fontWeight: '600' },

  // Detail — header
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  detailIcon:   { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  detailTitle:  { fontSize: 22, fontWeight: '700', color: TEXT },
  detailDesc:   { fontSize: 13, color: MUTED },

  // Detail — groups
  groupLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  groupCard:  { borderRadius: 18, padding: 4 },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 14 },

  // Detail — rows
  row:      { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '500', color: TEXT },
  rowSub:   { fontSize: 12, color: MUTED, marginTop: 1 },

  soonBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  soonText:  { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
});
