import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const BLUE = '#40C0F2';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState({ orderUpdates: true, rewardsStamps: true, newCookies: true, offersPromos: false });

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.misc.announcements(),
    retry: 1,
    refetchInterval: 30000,
  });

  const announcements = data?.data ?? [];
  const unread = useMemo(() => announcements.length, [announcements]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><Feather name="arrow-left" size={22} color={TEXT} /></Pressable>
        <Text style={s.headerTitle}>Notifications</Text>
        <Text style={[s.headerBrand, { color: BLUE }]}>{unread} new</Text>
      </View>

      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 80 }}>
        <View style={[s.sectionCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.sectionHead}>
            <Feather name="bell" size={16} color={BLUE} />
            <Text style={s.sectionTitle}>Notification preferences</Text>
          </View>
          {[
            { key: 'orderUpdates', title: 'Order updates', desc: 'When your order is ready or status changes.' },
            { key: 'rewardsStamps', title: 'Rewards & stamps', desc: 'Free coffee unlocked? We will let you know.' },
            { key: 'newCookies', title: 'New cookies', desc: 'Be first to try our latest bakes.' },
            { key: 'offersPromos', title: 'Offers & promotions', desc: 'Occasional deals and discounts.' },
          ].map((item) => (
            <View key={item.key} style={s.prefRow}>
              <View style={s.prefBody}>
                <Text style={s.prefTitle}>{item.title}</Text>
                <Text style={s.prefDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={prefs[item.key as keyof typeof prefs]}
                onValueChange={() => { Haptics.selectionAsync(); setPrefs((p) => ({ ...p, [item.key]: !p[item.key as keyof typeof prefs] })); }}
                trackColor={{ false: '#D1D5DB', true: BLUE }}
                thumbColor="#ffffff"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
          ))}
        </View>

        <View style={[s.sectionCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.sectionHead}>
            <Feather name="activity" size={16} color={BLUE} />
            <Text style={s.sectionTitle}>Latest announcements</Text>
          </View>
          {isLoading ? (
            <ActivityIndicator color={BLUE} />
          ) : announcements.length === 0 ? (
            <Text style={s.empty}>No announcements yet.</Text>
          ) : (
            announcements.map((a: any) => (
              <View key={a.id} style={s.annRow}>
                <View style={s.dot} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.annTitle}>{a.title ?? 'Update'}</Text>
                  <Text style={s.annDesc}>{a.body ?? a.message ?? 'New update available.'}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={[s.footer, { color: MUTED }]}>You'll only get notifications you enable.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  headerBrand: { fontSize: 18, fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  prefBody: { flex: 1, gap: 3 },
  prefTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  prefDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 18 },
  annRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE, marginTop: 6 },
  annTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  annDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 18 },
  empty: { fontSize: 13, color: '#8E8E93', fontFamily: 'Inter_400Regular' },
  footer: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular' },
});