import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import {
  StoreTab, BannerTab, RewardsTab, NotifyTab, ManagersTab, DirectorsTab,
} from '@/components/director';
import { BLUE, TEXT, CARD, BORD } from '@/components/director/directorColors';

// ─── Tab config ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'Store',     label: 'Store'    },
  { key: 'Banner',    label: 'Banner'   },
  { key: 'Rewards',   label: 'Rewards'  },
  { key: 'Notify',    label: 'Notify'   },
  { key: 'Managers',  label: 'Managers' },
  { key: 'Directors', label: 'Directors'},
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DirectorSettingsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.find(t => t.key === tabParam)?.key ?? 'Store';
  const [activeTab, setActiveTab] = useState<TabKey>(initial);

  const content = (() => {
    switch (activeTab) {
      case 'Store':     return <StoreTab />;
      case 'Banner':    return <BannerTab />;
      case 'Rewards':   return <RewardsTab />;
      case 'Notify':    return <NotifyTab />;
      case 'Managers':  return <ManagersTab />;
      case 'Directors': return <DirectorsTab />;
    }
  })();

  return (
    <DirectorTabScreen
      title="Settings"
      headerBottom={
        <View style={s.chipRow}>
          <FlatList
            horizontal
            data={TABS}
            keyExtractor={t => t.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
            renderItem={({ item }) => {
              const active = activeTab === item.key;
              return (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setActiveTab(item.key); }}
                  style={[s.chip, active ? s.chipActive : s.chipInactive]}
                >
                  <Text style={[s.chipText, active ? s.chipTextActive : s.chipTextInactive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      }
    >
      {content}
    </DirectorTabScreen>
  );
}

const s = StyleSheet.create({
  chipRow: {
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORD,
  },
  chip:             { height: 34, borderRadius: 17, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipActive:       { backgroundColor: BLUE },
  chipInactive:     { backgroundColor: '#F1F5F9' },
  chipText:         { fontSize: 13, fontWeight: '600' },
  chipTextActive:   { color: '#FFFFFF' },
  chipTextInactive: { color: TEXT },
});
