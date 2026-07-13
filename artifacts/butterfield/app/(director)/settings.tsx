import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
        <View style={s.filterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          >
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}
                  style={[s.pill, active ? s.pillActive : s.pillInactive]}
                >
                  <Text style={[s.pillText, active ? s.pillTextActive : s.pillTextInactive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
    >
      {content}
    </DirectorTabScreen>
  );
}

const s = StyleSheet.create({
  filterRow: {
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORD,
  },
  pill: {
    height: 34, borderRadius: 17, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  pillActive:       { backgroundColor: '#000' },
  pillInactive:     { backgroundColor: '#fff', borderWidth: 1, borderColor: '#3C3C4340' },
  pillText:         { fontSize: 13, fontWeight: '600' },
  pillTextActive:   { color: '#fff' },
  pillTextInactive: { color: TEXT },
});
