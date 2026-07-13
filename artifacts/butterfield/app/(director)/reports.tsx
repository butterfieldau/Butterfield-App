import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import {
  AnalyticsTab, RegisterReportsTab, FeedbackTab, DownloadReportModal,
} from '@/components/director';
import { TEXT, CARD, BORD } from '@/components/director/directorColors';

const TABS = ['Analytics', 'Register Reports', 'Feedback'] as const;
type TabKey = typeof TABS[number];

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Analytics');
  const [showDownload, setShowDownload] = useState(false);

  return (
    <DirectorStandaloneScreen title="Reports">
      <View style={s.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
        >
          {TABS.map(t => {
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => { setTab(t); Haptics.selectionAsync(); }}
                style={[s.pill, active ? s.pillActive : s.pillInactive]}
              >
                <Text style={[s.pillText, active ? s.pillTextActive : s.pillTextInactive]}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
