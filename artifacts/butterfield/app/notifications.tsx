import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
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
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const DEFAULT_PREFS = {
  orderUpdates:  true,
  rewardsStamps: true,
  newCookies:    true,
  offersPromos:  false,
};
const PREF_CONFIG = [
  { key: 'orderUpdates',  icon: 'package'   as const, title: 'Order updates',       desc: 'When your order is ready or status changes.' },
  { key: 'rewardsStamps', icon: 'star'      as const, title: 'Rewards & stamps',    desc: 'Free coffee unlocked? We\'ll let you know.' },
  { key: 'newCookies',    icon: 'coffee'    as const, title: 'New cookies',         desc: 'Be first to try our latest bakes.' },
  { key: 'offersPromos',  icon: 'tag'       as const, title: 'Offers & promotions', desc: 'Occasional deals and discounts.' },
];
export default function NotificationsScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/notifications" compact />;
  return <NotificationsContent />;
}

function NotificationsContent() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<string | null>(null);
  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn:  () => api.auth.me(),
    retry: 1,
  });
  const { data, isLoading: annLoading, refetch } = useQuery({
    queryKey: ['announcements'],
    queryFn:  () => api.misc.announcements(),
    refetchInterval: 30000,
  });
  const announcements = data?.data ?? [];
  // Sync prefs from backend when me loads
  useEffect(() => {
    const backendPrefs = (meData?.user as any)?.notificationPreferences;
    if (backendPrefs && typeof backendPrefs === 'object') {
      setPrefs(p => ({ ...DEFAULT_PREFS, ...backendPrefs }));
    }
  }, [meData]);

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const togglePref = async (key: string) => {
    Haptics.selectionAsync();
    const newVal   = !prefs[key];
    const newPrefs = { ...prefs, [key]: newVal };
    setPrefs(newPrefs);
    setSaving(key);
    setSaved(null);
    try {
      await api.auth.updateMe({ notificationPreferences: newPrefs });
      qc.invalidateQueries({ queryKey: ['me'] });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      // Revert on failure
      setPrefs(p => ({ ...p, [key]: !newVal }));
    } finally {
      setSaving(null);
    }
  };
  const isLoading = meLoading || annLoading;
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={[s.badge, { backgroundColor: announcements.length > 0 ? BLUE : BG }]}>
          <Text style={[s.badgeText, { color: announcements.length > 0 ? '#fff' : MUTED }]}>
            {announcements.length}
          </Text>
        </View>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
      >
        {/* Push notification preferences */}
        <View style={[s.sectionCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.sectionHead}>
            <View style={[s.iconCircle, { backgroundColor: '#E0F5FE' }]}>
              <Feather name="bell" size={16} color={BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionTitle}>Notification preferences</Text>
              <Text style={s.sectionSub}>Choose what you want to hear about</Text>
            </View>
          </View>
          {meLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 12 }} />
          ) : (
            PREF_CONFIG.map((item, i) => (
              <View
                key={item.key}
                style={[s.prefRow, i > 0 && { borderTopWidth: 1, borderTopColor: BORDER }]}
              >
                <View style={[s.prefIcon, { backgroundColor: prefs[item.key] ? '#E0F5FE' : BG }]}>
                  <Feather name={item.icon} size={14} color={prefs[item.key] ? BLUE : MUTED} />
                </View>
                <View style={s.prefBody}>
                  <Text style={s.prefTitle}>{item.title}</Text>
                  <Text style={s.prefDesc}>{item.desc}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Switch
                    value={!!prefs[item.key]}
                    onValueChange={() => togglePref(item.key)}
                    trackColor={{ false: '#D1D5DB', true: BLUE }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#D1D5DB"
                    disabled={saving === item.key}
                  />
                  {saved === item.key && (
                    <Text style={{ fontSize: 10, color: GREEN, fontWeight: '500' }}>Saved</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
        {/* Latest announcements */}
        <View style={[s.sectionCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.sectionHead}>
            <View style={[s.iconCircle, { backgroundColor: '#DCFCE7' }]}>
              <Feather name="activity" size={16} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.sectionTitle}>Latest announcements</Text>
              <Text style={s.sectionSub}>Updates from Butterfield</Text>
            </View>
          </View>
          {annLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 12 }} />
          ) : announcements.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
              <Feather name="inbox" size={28} color={MUTED} />
              <Text style={s.empty}>No announcements right now.</Text>
              <Text style={{ fontSize: 12, color: MUTED, fontWeight: '400' }}>Check back soon for updates!</Text>
            </View>
          ) : (
            announcements.map((a: any) => (
              <View key={a.id} style={[s.annRow, { borderTopWidth: 1, borderTopColor: BORDER }]}>
                <View style={[s.dot, { backgroundColor: a.isPinned ? '#F59E0B' : BLUE }]} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.annTitle}>{a.title ?? 'Update'}</Text>
                    {a.isPinned && (
                      <View style={[s.pinnedBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '600' }}>Pinned</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.annDesc}>{a.body ?? a.message ?? ''}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        <Text style={[s.footer, { color: MUTED }]}>
          You'll only receive notifications you've enabled above.{'\n'}Preferences are saved automatically.
        </Text>
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
  badge:       { minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText:   { fontSize: 13, fontWeight: '700' },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: TEXT },
  sectionSub:  { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 1 },
  prefRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  prefIcon:    { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefBody:    { flex: 1, gap: 2 },
  prefTitle:   { fontSize: 14, fontWeight: '600', color: TEXT },
  prefDesc:    { fontSize: 12, fontWeight: '400', color: MUTED, lineHeight: 17 },
  annRow:      { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12 },
  dot:         { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  pinnedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  annTitle:    { fontSize: 14, fontWeight: '700', color: TEXT },
  annDesc:     { fontSize: 13, fontWeight: '400', color: MUTED, lineHeight: 18 },
  empty:       { fontSize: 13, color: MUTED, fontWeight: '400' },
  footer:      { textAlign: 'center', fontSize: 12, fontWeight: '400', lineHeight: 18 },
});
