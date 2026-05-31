import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InternalGlassCard } from '@/components/InternalGlass';
import { buildCategories, type RowItem } from './_moreCategories';

const BG    = '#EFF6FF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';

function SectionRow({ item, isLast }: { item: RowItem; isLast: boolean }) {
  return (
    <>
      <Pressable
        onPress={() => {
          if (item.soon) return;
          Haptics.selectionAsync();
          item.onPress?.();
        }}
        style={({ pressed }) => [s.row, pressed && !item.soon && { opacity: 0.7 }]}
      >
        <View style={[s.iconBox, { backgroundColor: (item.soon ? MUTED : item.color) + '18' }]}>
          <Feather name={item.icon as any} size={16} color={item.soon ? MUTED : item.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowLabel, item.soon && { color: MUTED }]}>{item.label}</Text>
          <Text style={s.rowSub}>{item.sub}</Text>
        </View>
        {item.soon ? (
          <View style={s.soonBadge}>
            <Text style={s.soonText}>SOON</Text>
          </View>
        ) : (
          <Feather name="chevron-right" size={15} color={MUTED} />
        )}
      </Pressable>
      {!isLast && <View style={s.divider} />}
    </>
  );
}

export default function MoreCategoryScreen() {
  const insets = useSafeAreaInsets();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { user } = useAuth();
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

  const category = categories.find(c => c.key === key);

  if (!category) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: MUTED }}>Category not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <Pressable
        onPress={() => { Haptics.selectionAsync(); router.navigate('/(director)/more' as any); }}
        style={[s.backRow, { paddingTop: 20 }]}
      >
        <Feather name="chevron-left" size={20} color={category.color} />
        <Text style={[s.backLabel, { color: category.color }]}>More</Text>
      </Pressable>

      {/* Header */}
      <View style={s.header}>
        <View style={[s.headerIcon, { backgroundColor: category.color + '18' }]}>
          <Feather name={category.icon as any} size={28} color={category.color} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.title}>{category.label}</Text>
          <Text style={s.desc}>{category.description}</Text>
        </View>
      </View>

      {/* Groups */}
      <View style={{ paddingHorizontal: 16, gap: 24 }}>
        {category.groups.map(group => (
          <View key={group.label}>
            {/* Group label */}
            <Text style={s.groupLabel}>{group.label.toUpperCase()}</Text>

            {/* Group card */}
            <InternalGlassCard style={s.card}>
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
  );
}

const s = StyleSheet.create({
  backRow:    { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingBottom: 4 },
  backLabel:  { fontSize: 15, fontWeight: '600' },

  header:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:      { fontSize: 22, fontWeight: '700', color: TEXT },
  desc:       { fontSize: 13, color: MUTED },

  groupLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },

  card:       { borderRadius: 18, padding: 4 },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 14 },

  row:        { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 14, fontWeight: '500', color: TEXT },
  rowSub:     { fontSize: 12, color: MUTED, marginTop: 1 },

  soonBadge:  { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  soonText:   { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
});
