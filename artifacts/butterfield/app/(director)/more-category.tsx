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
import { InternalGlassCard } from '@/components/InternalGlass';
import { buildCategories, type RowItem } from './_moreCategories';

const BG    = '#EFF6FF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORD  = '#E5E7EB';

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
        <View style={[s.rowIcon, { backgroundColor: (item.soon ? MUTED : item.color) + '33', borderColor: (item.soon ? MUTED : item.color) + '55' }]}>
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
      <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
        <Feather name="alert-circle" size={32} color={MUTED} />
        <Text style={{ color: MUTED, marginTop: 12 }}>Category not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: '#1493FF', fontWeight: '600' }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Back row */}
        <View style={{ height: insets.top }} />
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={s.backRow}
        >
          <Feather name="chevron-left" size={20} color={openCategory.color} />
          <Text style={[s.backLabel, { color: openCategory.color }]}>More</Text>
        </Pressable>

        {/* Category header */}
        <View style={s.detailHeader}>
          <View style={[s.detailIcon, { backgroundColor: openCategory.color + '33', borderColor: openCategory.color + '55' }]}>
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

const s = StyleSheet.create({
  backRow:   { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backLabel: { fontSize: 15, fontWeight: '600' },

  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  detailIcon:   { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1.5 },
  detailTitle:  { fontSize: 22, fontWeight: '700', color: TEXT },
  detailDesc:   { fontSize: 13, color: MUTED },

  groupLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  groupCard:  { borderRadius: 18, padding: 4 },
  divider:    { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.07)', marginHorizontal: 14 },

  row:      { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  rowLabel: { fontSize: 14, fontWeight: '500', color: TEXT },
  rowSub:   { fontSize: 12, color: MUTED, marginTop: 1 },

  soonBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  soonText:  { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.4 },
});
