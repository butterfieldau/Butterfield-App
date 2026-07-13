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
import { buildCategories, type Category, type RowItem } from './_moreCategories';
import { BG, CARD, TEXT, MUTED, BLUE, RED, GOLD } from '@/components/director/directorColors';

const OBSIDIAN = '#0A0A0A';
const MAX_VISIBLE_ITEMS = 5;

const ICON_COLORS: Record<string, string> = {
  'bar-chart-2': '#007AFF', 'pie-chart': '#007AFF', 'trending-up': '#007AFF', 'monitor': '#007AFF',
  'smartphone': '#007AFF', 'shopping-bag': '#007AFF', 'globe': '#007AFF', 'briefcase': '#007AFF',
  'credit-card': '#34C759', 'map-pin': '#34C759', 'user': '#34C759', 'users': '#34C759',
  'user-plus': '#34C759', 'star': '#34C759', 'message-square': '#34C759', 'share-2': '#34C759',
  'check-circle': '#34C759',
  'clock': '#FF9500', 'calendar': '#FF9500', 'archive': '#FF9500', 'package': '#FF9500',
  'tag': '#FF9500', 'dollar-sign': '#FF9500', 'download': '#FF9500', 'repeat': '#FF9500',
  'coffee': '#FF9500', 'sun': '#FF9500', 'percent': '#FF9500',
  'bell': '#FF2D55', 'gift': '#FF2D55', 'image': '#FF2D55', 'layout': '#FF2D55',
  'alert-circle': '#FF2D55', 'shield': '#FF2D55', 'truck': '#FF2D55', 'phone': '#FF2D55',
  'clipboard': '#5856D6', 'grid': '#5856D6', 'sliders': '#5856D6', 'layers': '#5856D6',
  'cpu': '#5856D6', 'server': '#5856D6', 'maximize': '#5856D6', 'check-square': '#5856D6',
  'lock': '#C9A84C', 'book-open': '#C9A84C',
  'file-text': '#8E8E93', 'settings': '#8E8E93', 'list': '#8E8E93',
  'zap': '#8E8E93', 'tool': '#8E8E93',
};

function iconColor(icon: string, fallback: string): string {
  return ICON_COLORS[icon] ?? fallback;
}

function PremiumVaultRow({ cat, onPress }: { cat: Category; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.vaultCard, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={s.vaultIconWrap}>
        <Feather name="lock" size={20} color={GOLD} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.vaultLabel}>{cat.label}</Text>
          <View style={s.vaultBadge}>
            <Text style={s.vaultBadgeText}>DIRECTOR ONLY</Text>
          </View>
        </View>
        <Text style={s.vaultDesc} numberOfLines={1}>{cat.description}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={GOLD + 'AA'} />
    </Pressable>
  );
}

function ItemRow({ item, isLast, onPress }: { item: RowItem; isLast: boolean; onPress: () => void }) {
  const col = iconColor(item.icon, item.color);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, isLast && s.rowLast, { backgroundColor: pressed ? '#F5F5F7' : CARD }]}
    >
      <View style={[s.iconWrap, { backgroundColor: col + '18' }]}>
        <Feather name={item.icon as any} size={17} color={col} />
      </View>
      <Text style={[s.rowLabel, item.soon && { color: MUTED }]} numberOfLines={1}>{item.label}</Text>
      {item.soon
        ? <View style={s.soonBadge}><Text style={s.soonText}>SOON</Text></View>
        : <Feather name="chevron-right" size={18} color="#C7C7CC" />
      }
    </Pressable>
  );
}

function SeeAllRow({ label, catKey, onPress }: { label: string; catKey: string; onPress: (k: string) => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(catKey); }}
      style={({ pressed }) => [s.row, s.rowLast, { backgroundColor: pressed ? '#F5F5F7' : CARD }]}
    >
      <View style={[s.iconWrap, { backgroundColor: '#F2F2F7' }]}>
        <Feather name="grid" size={17} color={MUTED} />
      </View>
      <Text style={[s.rowLabel, { color: BLUE }]}>All {label} tools</Text>
      <Feather name="chevron-right" size={18} color="#C7C7CC" />
    </Pressable>
  );
}

function CategorySection({ cat, onItemPress, onAllPress }: {
  cat: Category;
  onItemPress: (item: RowItem) => void;
  onAllPress: (key: string) => void;
}) {
  const allItems = cat.groups.flatMap(g => g.items);
  const liveItems = allItems.filter(i => !i.soon);
  const visibleItems = liveItems.slice(0, MAX_VISIBLE_ITEMS);
  const hiddenCount = allItems.length - visibleItems.length;

  if (visibleItems.length === 0) return null;

  return (
    <View>
      <Text style={s.sectionHeader}>{cat.label.toUpperCase()}</Text>
      <View style={s.sectionCard}>
        {visibleItems.map((item, idx) => {
          const isLast = hiddenCount === 0 && idx === visibleItems.length - 1;
          return (
            <ItemRow
              key={item.label + idx}
              item={item}
              isLast={isLast}
              onPress={() => onItemPress(item)}
            />
          );
        })}
        {hiddenCount > 0 && (
          <SeeAllRow label={cat.label} catKey={cat.key} onPress={onAllPress} />
        )}
      </View>
    </View>
  );
}

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

  const categories = useMemo(
    () => buildCategories(canSee, isDirector),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isManager, managerPerms.join(','), isDirector],
  );

  const handleItemPress = (item: RowItem) => {
    Haptics.selectionAsync();
    item.onPress?.();
  };

  const handleAllPress = (key: string) => {
    if (key === 'vault') {
      router.push('/director-vault' as any);
    } else {
      router.push({ pathname: '/director-more-category', params: { category: key } } as any);
    }
  };

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
          {categories.map(cat =>
            cat.premium ? (
              <PremiumVaultRow
                key={cat.key}
                cat={cat}
                onPress={() => handleAllPress(cat.key)}
              />
            ) : (
              <CategorySection
                key={cat.key}
                cat={cat}
                onItemPress={handleItemPress}
                onAllPress={handleAllPress}
              />
            )
          )}

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
              <Feather name="log-out" size={17} color={RED} />
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
    letterSpacing: 0.4, textTransform: 'uppercase',
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
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
    backgroundColor: CARD,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: TEXT },

  iconWrap: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  soonBadge: {
    backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  soonText: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.5 },

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
