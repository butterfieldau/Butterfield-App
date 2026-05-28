import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';

const BG = 'transparent';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';

type PrefItem = {
  key: string;
  icon: any;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
};

const STAFF_PREFS: PrefItem[] = [
  { key: 'newOrders',    icon: 'shopping-bag', iconBg: '#E0F5FE', iconColor: BLUE,    title: 'New orders',       desc: 'When a new customer order comes in.' },
  { key: 'taskAlerts',   icon: 'clipboard',    iconBg: '#FEF3C7', iconColor: '#D97706', title: 'Task reminders',   desc: 'Opening/closing tasks and checklists.' },
  { key: 'shiftAlerts',  icon: 'clock',        iconBg: '#EDE9FE', iconColor: '#7C3AED', title: 'Shift updates',    desc: 'Clock-in reminders and schedule changes.' },
  { key: 'announcements',icon: 'bell',         iconBg: '#DCFCE7', iconColor: '#16A34A', title: 'Team updates',     desc: 'Messages from management.' },
];

const MANAGER_PREFS: PrefItem[] = [
  { key: 'newOrders',     icon: 'shopping-bag', iconBg: '#E0F5FE', iconColor: BLUE,     title: 'New orders',        desc: 'New customer and wholesale orders.' },
  { key: 'taskAlerts',    icon: 'clipboard',    iconBg: '#FEF3C7', iconColor: '#D97706', title: 'Task alerts',       desc: 'Staff tasks and checklist updates.' },
  { key: 'staffAlerts',   icon: 'users',        iconBg: '#EDE9FE', iconColor: '#7C3AED', title: 'Staff alerts',      desc: 'Leave requests, issues, clock-in/out.' },
  { key: 'wholesaleOrders',icon:'package',      iconBg: '#DCFCE7', iconColor: '#16A34A', title: 'Wholesale orders',  desc: 'New wholesale applications and orders.' },
  { key: 'announcements', icon: 'bell',         iconBg: '#FEE2E2', iconColor: RED,       title: 'Announcements',     desc: 'Store-wide updates and notices.' },
];

const DIRECTOR_PREFS: PrefItem[] = [
  { key: 'newOrders',     icon: 'shopping-bag', iconBg: '#E0F5FE', iconColor: BLUE,     title: 'New orders',        desc: 'All incoming customer orders.' },
  { key: 'wholesaleOrders',icon:'package',      iconBg: '#DCFCE7', iconColor: '#16A34A', title: 'Wholesale orders',  desc: 'New wholesale orders and applications.' },
  { key: 'staffAlerts',   icon: 'users',        iconBg: '#EDE9FE', iconColor: '#7C3AED', title: 'Staff alerts',      desc: 'Approvals, leave requests, issues.' },
  { key: 'announcements', icon: 'bell',         iconBg: '#FEF3C7', iconColor: '#D97706', title: 'Announcements',     desc: 'Store-wide notices and broadcasts.' },
];

const WHOLESALE_PREFS: PrefItem[] = [
  { key: 'orderUpdates',  icon: 'refresh-cw',  iconBg: '#E0F5FE', iconColor: BLUE,     title: 'Order updates',     desc: 'Status changes on your wholesale orders.' },
  { key: 'wholesaleOrders',icon:'package',     iconBg: '#DCFCE7', iconColor: '#16A34A', title: 'Account updates',   desc: 'Account approval and tier changes.' },
  { key: 'announcements', icon: 'bell',        iconBg: '#FEF3C7', iconColor: '#D97706', title: 'Announcements',     desc: 'Butterfield news and updates.' },
];

function getPrefConfig(role: string | undefined): PrefItem[] {
  if (role === 'staff')     return STAFF_PREFS;
  if (role === 'manager')   return MANAGER_PREFS;
  if (role === 'director' || role === 'master') return DIRECTOR_PREFS;
  if (role === 'wholesale') return WHOLESALE_PREFS;
  return [];
}

function buildDefaults(items: PrefItem[]): Record<string, boolean> {
  return Object.fromEntries(items.map(i => [i.key, true]));
}

export default function NotificationPrefsScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/notification-prefs" compact />;
  return <NotificationPrefsContent />;
}

function NotificationPrefsContent() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const prefConfig = getPrefConfig(user?.role);

  const [prefs, setPrefs]   = useState<Record<string, boolean>>(buildDefaults(prefConfig));
  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<string | null>(null);
  const [masterOn, setMasterOn] = useState(true);
  const [masterSaving, setMasterSaving] = useState(false);

  const { data: prefsData, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn:  () => api.notifications.getPreferences(),
    enabled: !!user,
    retry: 1,
  });

  useEffect(() => {
    if (prefsData?.data && typeof prefsData.data === 'object') {
      const loaded = prefsData.data as Record<string, boolean>;
      const merged = { ...buildDefaults(prefConfig), ...loaded };
      setPrefs(merged);
      // Master is off if ALL visible prefs are off
      const allOff = prefConfig.every(p => merged[p.key] === false);
      setMasterOn(!allOff);
    }
  }, [prefsData]);

  const savePrefs = async (newPrefs: Record<string, boolean>) => {
    await api.notifications.updatePreferences(newPrefs);
    qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  const togglePref = async (key: string) => {
    Haptics.selectionAsync();
    const newVal   = !prefs[key];
    const newPrefs = { ...prefs, [key]: newVal };
    setPrefs(newPrefs);
    setSaving(key);
    setSaved(null);
    try {
      await savePrefs(newPrefs);
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch {
      setPrefs(p => ({ ...p, [key]: !newVal }));
    } finally {
      setSaving(null);
    }
    // Keep master switch accurate
    const anyOn = Object.entries(newPrefs).some(([k, v]) => prefConfig.find(p => p.key === k) && v);
    setMasterOn(anyOn);
  };

  const toggleMaster = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newMaster = !masterOn;
    setMasterOn(newMaster);
    setMasterSaving(true);
    const newPrefs: Record<string, boolean> = { ...prefs };
    prefConfig.forEach(p => { newPrefs[p.key] = newMaster; });
    setPrefs(newPrefs);
    try {
      await savePrefs(newPrefs);
    } catch {
      setMasterOn(!newMaster);
      setPrefs(prefs);
    } finally {
      setMasterSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[s.header, { paddingTop: insets.top + 14, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={s.headerTitle}>Notifications</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Master toggle */}
        <View style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={s.masterRow}>
            <View style={[s.iconCircle, { backgroundColor: masterOn ? '#E0F5FE' : BG }]}>
              <Feather name="bell" size={18} color={masterOn ? BLUE : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.masterTitle, { color: TEXT }]}>All notifications</Text>
              <Text style={[s.masterSub, { color: MUTED }]}>
                {masterOn ? 'Notifications are enabled' : 'All notifications are off'}
              </Text>
            </View>
            {masterSaving
              ? <ActivityIndicator color={BLUE} size="small" />
              : <Switch
                  value={masterOn}
                  onValueChange={toggleMaster}
                  trackColor={{ false: '#D1D5DB', true: BLUE }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="#D1D5DB"
                />
            }
          </View>
        </View>

        {/* Per-category prefs */}
        <View style={[s.card, { backgroundColor: CARD, borderColor: BORDER }]}>
          <Text style={[s.sectionLabel, { color: MUTED }]}>WHAT TO NOTIFY ME ABOUT</Text>
          {isLoading ? (
            <ActivityIndicator color={BLUE} style={{ marginVertical: 16 }} />
          ) : (
            prefConfig.map((item, i) => (
              <View
                key={item.key}
                style={[s.prefRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER }]}
              >
                <View style={[s.iconCircle, { backgroundColor: (prefs[item.key] && masterOn) ? item.iconBg : BG }]}>
                  <Feather name={item.icon} size={15} color={(prefs[item.key] && masterOn) ? item.iconColor : MUTED} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.prefTitle, { color: TEXT }]}>{item.title}</Text>
                  <Text style={[s.prefDesc, { color: MUTED }]}>{item.desc}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Switch
                    value={!!prefs[item.key]}
                    onValueChange={() => togglePref(item.key)}
                    trackColor={{ false: '#D1D5DB', true: BLUE }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#D1D5DB"
                    disabled={saving === item.key || !masterOn}
                  />
                  {saved === item.key && (
                    <Text style={{ fontSize: 10, color: GREEN, fontWeight: '500' }}>Saved</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={[s.footer, { color: MUTED }]}>
          Preferences are saved automatically and sync across your devices.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF' },
  backBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  card:        { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  masterRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  masterTitle: { fontSize: 15, fontWeight: '600' },
  masterSub:   { fontSize: 12, fontWeight: '400', marginTop: 1 },
  iconCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  prefRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  prefTitle:   { fontSize: 14, fontWeight: '600' },
  prefDesc:    { fontSize: 12, fontWeight: '400', lineHeight: 17 },
  footer:      { textAlign: 'center', fontSize: 12, fontWeight: '400', lineHeight: 18 },
});
