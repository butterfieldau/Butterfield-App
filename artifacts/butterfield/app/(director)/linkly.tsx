import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinklyCloudSettingsCard from '@/components/LinklyCloudSettingsCard';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { BG, TEXT, MUTED, BLUE } from '@/constants/directorColors';

export default function DirectorLinklyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <DirectorStandaloneScreen title="Linkly Cloud" subtitle="PIN pad, payment token & device identity">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <LinklyCloudSettingsCard
            title="Linkly Cloud Integration"
            subtitle="Server-side Linkly settings for this POS device"
            printerContext="director"
          />
        </View>

        <View style={s.noteCard}>
          <Text style={s.noteTitle}>What this controls</Text>
          <Text style={s.noteText}>Credentials, pairing secret, and tokens stay on the server. The iPad only asks the server to start and recover transactions.</Text>
        </View>
      </ScrollView>
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backText: { fontSize: 15, fontWeight: '600', color: BLUE },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: TEXT },
  subtitle: { fontSize: 13, color: MUTED, marginTop: 4 },
  noteCard: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FBFF',
    padding: 16,
    gap: 6,
  },
  noteTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  noteText: { fontSize: 13, color: MUTED, lineHeight: 18 },
});
