import type { ReactNode } from 'react';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import {
  StoreTab, BannerTab, RewardsTab, NotifyTab, ManagersTab, DirectorsTab,
} from '@/components/director';

// ─── Re-exports (backward-compat for settings-*.tsx standalone routes) ─────────
export { BannerTab }         from '@/components/director';
export { StoreHoursSection } from '@/components/director';
export { RewardsTab }        from '@/components/director';
export { NotifyTab }         from '@/components/director';
export { DirectorsTab }      from '@/components/director';
export { ManagersTab }       from '@/components/director';

// ─── Standalone wrapper (used by settings-banner.tsx, settings-notify.tsx…) ───
export function SettingsStandaloneScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DirectorStandaloneScreen title={title}>
      {children}
    </DirectorStandaloneScreen>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────
const BLUE  = '#1493FF';
const MUTED = '#8E8E93';
const BG    = '#EFF6FF';
const BORD  = '#E5E7EB';
const CARD  = '#FFFFFF';

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
        <View style={styles.tabBar}>
          <FlatList
            horizontal
            data={TABS}
            keyExtractor={t => t.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabList}
            renderItem={({ item }) => {
              const active = activeTab === item.key;
              return (
                <Pressable
                  onPress={() => { Haptics.selectionAsync(); setActiveTab(item.key); }}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
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

const styles = StyleSheet.create({
  tabBar:        { backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORD },
  tabList:       { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab:           { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORD, backgroundColor: BG },
  tabActive:     { backgroundColor: BLUE, borderColor: BLUE },
  tabText:       { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: '#FFFFFF' },
});
