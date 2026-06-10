import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinklyCloudSettingsCard from '@/components/LinklyCloudSettingsCard';

const BG = '#EFF6FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BLUE = '#1493FF';

export default function DirectorLinklyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: insets.top }} />
        <Pressable onPress={() => router.back()} style={s.backRow}>
          <Feather name="chevron-left" size={20} color={BLUE} />
          <Text style={s.backText}>Systems</Text>
        </Pressable>

        <View style={s.header}>
          <View style={s.heroIcon}>
            <Feather name="credit-card" size={28} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Linkly Cloud</Text>
            <Text style={s.subtitle}>Pair the PIN pad, refresh the payment token, and manage the device identity for this terminal.</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
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
    </View>
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
