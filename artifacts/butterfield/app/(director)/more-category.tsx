import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { buildCategories, getSoonItemNames, type RowItem } from './_moreCategories';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { CARD, TEXT, MUTED, BORD, BLUE } from '@/components/director/directorColors';

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
        <View style={s.rowIcon}>
          <Feather name={item.icon as any} size={16} color={BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{item.label}</Text>
          <Text style={s.rowSub}>{item.sub}</Text>
        </View>
        <Feather name="chevron-right" size={15} color={MUTED} />
      </Pressable>
      {!isLast && <View style={s.divider} />}
    </>
  );
}

export default function MoreCategoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isManager  = user?.role === 'manager';
  const isDirector = !isManager;
  const { category: categoryKey } = useLocalSearchParams<{ category?: string }>();

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

  const openCategory = categoryKey
    ? categories.find(c => c.key === categoryKey) ?? null
    : null;

  if (!openCategory) {
    return (
      <View style={{ flex: 1, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
        <Feather name="alert-circle" size={32} color={MUTED} />
        <Text style={{ color: MUTED, marginTop: 12 }}>Category not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: BLUE, fontWeight: '600' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const soonNames = getSoonItemNames(openCategory);

  const liveGroups = openCategory.groups.map(g => ({
    ...g,
    items: g.items.filter(i => !i.soon),
  })).filter(g => g.items.length > 0);

  return (
    <DirectorStandaloneScreen title={openCategory.label} subtitle={openCategory.description}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 8 }}
      >
        <View style={{ paddingHorizontal: 16, gap: 22 }}>
          {liveGroups.map(group => (
            <View key={group.label}>
              <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>
              <View style={s.groupCard}>
                {group.items.map((item, i) => (
                  <SectionRow
                    key={item.label}
                    item={item}
                    isLast={i === group.items.length - 1}
                  />
                ))}
              </View>
            </View>
          ))}

          {soonNames.length > 0 && (
            <View style={s.soonBlock}>
              <Text style={s.soonTitle}>MORE COMING SOON</Text>
              <Text style={s.soonText}>{soonNames.join(' · ')}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  groupLabel: {
    fontSize: 11, fontWeight: '600', color: MUTED,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },
  groupCard: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORD, marginHorizontal: 14 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 14 },
  rowIcon:  {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: BLUE + '12',
  },
  rowLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  rowSub:   { fontSize: 12, color: MUTED, marginTop: 1 },

  soonBlock: {
    marginTop: 8, paddingHorizontal: 4,
  },
  soonTitle: {
    fontSize: 11, fontWeight: '600', color: MUTED,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 6,
  },
  soonText: {
    fontSize: 13, color: MUTED, fontStyle: 'italic', lineHeight: 18,
  },
});
