import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import {
  AnalyticsTab, RegisterReportsTab, FeedbackTab, DownloadReportModal,
} from '@/components/director';

const BLUE   = '#1493FF';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const TABS = ['Analytics', 'Register Reports', 'Feedback'] as const;
type TabKey = typeof TABS[number];

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Analytics');
  const [showDownload, setShowDownload] = useState(false);

  return (
    <DirectorStandaloneScreen title="Reports">
      <View style={[s.tabBar, { borderBottomColor: BORDER }]}>
        {TABS.map(t => (
          <Pressable
            key={t}
            style={[s.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}
          >
            <Text style={[s.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'Analytics' && (
        <AnalyticsTab
          onDownloadPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowDownload(true);
          }}
        />
      )}
      {tab === 'Register Reports' && <RegisterReportsTab />}
      {tab === 'Feedback' && <FeedbackTab />}

      <DownloadReportModal visible={showDownload} onClose={() => setShowDownload(false)} />
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '600' },
});
