import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import {
  AnalyticsTab, RegisterReportsTab, FeedbackTab, DownloadReportModal,
} from '@/components/director';
import { BLUE, TEXT, CARD, BORD } from '@/components/director/directorColors';

const TABS = ['Analytics', 'Register Reports', 'Feedback'] as const;
type TabKey = typeof TABS[number];

export default function DirectorReportsScreen() {
  const [tab, setTab] = useState<TabKey>('Analytics');
  const [showDownload, setShowDownload] = useState(false);

  return (
    <DirectorStandaloneScreen title="Reports">
      <View style={s.chipRow}>
        <FlatList
          horizontal
          data={TABS}
          keyExtractor={t => t}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item }) => {
            const active = tab === item;
            return (
              <Pressable
                onPress={() => { setTab(item); Haptics.selectionAsync(); }}
                style={[s.chip, active ? s.chipActive : s.chipInactive]}
              >
                <Text style={[s.chipText, active ? s.chipTextActive : s.chipTextInactive]}>
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
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
