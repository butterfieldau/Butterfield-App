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

const BG   = '#EFF6FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BLUE  = '#1493FF';

function SectionRow({ item }: { item: RowItem }) {
  return (
    <Pressable
      onPress={() => {
        if (item.soon) return;
        Haptics.selectionAsync();
        item.onPress?.();
      }}
      style={({ pressed }) => [s.row, pressed && !item.soon && { opacity: 0.7 }]}
    >
      <View style={[s.iconBox, { backgroundColor: (item.soon ? MUTED : item.color) + '18' }]}>
        <Feather name={item.icon as any} size={17} color={item.soon ? MUTED : item.color} />
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
        <Feather name="chevron-right" size={16} color={MUTED} />
      )}
    </Pressable>
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
        onPress={() => { Haptics.selectionAsync(); router.back(); }}
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
        <View style={{ gap: 4 }}>
          <Text style={s.title}>{category.label}</Text>
          <Text style={s.desc}>{category.description}</Text>
        </View>
      </View>

      {/* Items */}
      <View style={{ paddingHorizontal: 16 }}>
        <InternalGlassCard style={s.card}>
          {category.items.map((item, i) => (
            <View key={item.label}>
              <SectionRow item={item} />
              {i < category.items.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </InternalGlassCard>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  backRow:    { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingBottom: 4 },
  backLabel:  { fontSize: 15, fontWeight: '600' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 20 },
  headerIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 24, fontWeight: '700', color: TEXT },
  desc:       { fontSize: 13, color: MUTED, maxWidth: 220 },

  card:       { borderRadius: 20, padding: 4 },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 16 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  iconBox:    { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 15, fontWeight: '500', color: TEXT },
  rowSub:     { fontSize: 12, color: MUTED, marginTop: 1 },
  soonBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.07)' },
  soonText:   { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },
});
