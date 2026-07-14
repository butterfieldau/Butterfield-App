import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import {
  AnalyticsTab, RegisterReportsTab, FeedbackTab, DownloadReportModal,
} from '@/components/director';
import ExportCentreTab from '@/components/director/ExportCentreTab';
import { BG, CARD, TEXT, MUTED, BORDER } from '@/components/director/directorColors';

const TABS = [
  { id: 'Analytics'        as const, icon: 'bar-chart-2'    as const, label: 'Analytics' },
  { id: 'Register Reports' as const, icon: 'monitor'         as const, label: 'Register'  },
  { id: 'Feedback'         as const, icon: 'message-square'  as const, label: 'Feedback'  },
  { id: 'Export Centre'    as const, icon: 'download'        as const, label: 'Export'    },
] as const;

type TabId = typeof TABS[number]['id'];

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabId>('Analytics');
  const [showDownload, setShowDownload] = useState(false);

  const openDownload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDownload(true);
  };

  return (
    <DirectorStandaloneScreen title="Reports">
      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => { setTab(t.id); Haptics.selectionAsync(); }}
              style={[s.tabBtn, active ? s.tabBtnActive : s.tabBtnInactive]}
            >
              <Feather name={t.icon} size={18} color={active ? '#fff' : MUTED} />
              <Text style={[s.tabLabel, active ? s.tabLabelActive : s.tabLabelInactive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {tab === 'Analytics'        && <AnalyticsTab onDownloadPress={openDownload} />}
      {tab === 'Register Reports' && <RegisterReportsTab />}
      {tab === 'Feedback'         && <FeedbackTab />}
      {tab === 'Export Centre'    && <ExportCentreTab onDownloadPress={openDownload} />}

      <DownloadReportModal visible={showDownload} onClose={() => setShowDownload(false)} />
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    gap: 4,
    borderWidth: 1,
  },
  tabBtnActive: {
    backgroundColor: TEXT,
    borderColor: TEXT,
  },
  tabBtnInactive: {
    backgroundColor: CARD,
    borderColor: BORDER,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
  },
  tabLabelInactive: {
    color: MUTED,
  },
});
