import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { api } from '@/lib/api';
import { BG, CARD, TEXT, MUTED, BLUE, GREEN, BORDER } from '@/components/director/directorColors';

// ─── Row components ───────────────────────────────────────────────────────────
function ToggleRow({
  label, value, onToggle, loading, isLast = false,
}: {
  label: string; value: boolean; onToggle: (v: boolean) => void;
  loading?: boolean; isLast?: boolean;
}) {
  return (
    <View style={[s.row, isLast && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={GREEN} />
        : (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: '#E5E5EA', true: GREEN }}
            thumbColor="#fff"
            ios_backgroundColor="#E5E5EA"
          />
        )}
    </View>
  );
}

function ValueRow({
  label, value, onPress, isLast = false,
}: {
  label: string; value?: string | null;
  onPress?: () => void; isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined}
      style={({ pressed }) => [s.row, isLast && s.rowLast, pressed && onPress && { backgroundColor: '#F5F5F7' }]}
    >
      <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value ?? '—'}</Text>
      {onPress && <Feather name="chevron-right" size={18} color="#C7C7CC" style={{ marginLeft: 6 }} />}
    </Pressable>
  );
}

function LinkRow({
  label, value, onPress, isLast = false, destructive = false,
}: {
  label: string; value?: string | null;
  onPress: () => void; isLast?: boolean; destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.row, isLast && s.rowLast, pressed && { backgroundColor: '#F5F5F7' }]}
    >
      <Text style={[s.rowLabel, destructive && { color: '#FF3B30' }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value != null && <Text style={s.rowValue}>{value}</Text>}
        <Feather name="chevron-right" size={18} color={destructive ? '#FF3B30' : '#C7C7CC'} />
      </View>
    </Pressable>
  );
}

function Section({
  header, footer, children,
}: {
  header?: string; footer?: string; children: React.ReactNode;
}) {
  return (
    <View>
      {header && <Text style={s.sectionHeader}>{header}</Text>}
      <View style={s.card}>{children}</View>
      {footer && <Text style={s.sectionFooter}>{footer}</Text>}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DirectorSettingsScreen() {
  const { tab: _tabParam } = useLocalSearchParams<{ tab?: string }>();
  const qc = useQueryClient();

  // ── Data ──
  const { data: settingsData, isLoading: loadingSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });
  const { data: deliveryData, isLoading: loadingDelivery, refetch: refetchDelivery } = useQuery({
    queryKey: ['director-delivery-settings'],
    queryFn: () => api.director.deliverySettings(),
  });
  const { data: managersData, refetch: refetchManagers } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });
  const { data: announcementsData, refetch: refetchAnn } = useQuery({
    queryKey: ['director-announcements'],
    queryFn: () => api.director.allAnnouncements(),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [togglingStore, setTogglingStore] = useState(false);
  const [togglingDelivery, setTogglingDelivery] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState(false);
  const [specialDraft, setSpecialDraft] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchSettings(), refetchDelivery(), refetchManagers(), refetchAnn()]);
    setRefreshing(false);
  }, [refetchSettings, refetchDelivery, refetchManagers, refetchAnn]);

  const settings = settingsData?.data ?? {};
  const delivery = deliveryData?.data;
  const managerCount = managersData?.data?.length ?? 0;
  const announcements = announcementsData?.data ?? [];
  const activeAnn = announcements.filter(a => a.isActive).length;

  const storeOpen = settings.store_open === 'true';
  const dailySpecial = settings.daily_special ?? '';

  // ── Toggles ──
  const toggleStoreOpen = async (val: boolean) => {
    setTogglingStore(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.director.updateSettings({ store_open: val ? 'true' : 'false' });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
    } catch {
      Alert.alert('Error', 'Could not update store status.');
    } finally {
      setTogglingStore(false);
    }
  };

  const toggleDelivery = async (val: boolean) => {
    if (!delivery) return;
    setTogglingDelivery(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.director.updateDeliverySettings({ enabled: val } as any);
      await qc.invalidateQueries({ queryKey: ['director-delivery-settings'] });
    } catch {
      Alert.alert('Error', 'Could not update delivery status.');
    } finally {
      setTogglingDelivery(false);
    }
  };

  // ── Daily special inline edit ──
  const promptEditSpecial = () => {
    setSpecialDraft(dailySpecial);
    setEditingSpecial(true);
  };

  const saveSpecial = async () => {
    setEditingSpecial(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({ daily_special: specialDraft.trim() });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
    } catch {
      Alert.alert('Error', 'Could not save daily special.');
    }
  };

  const isLoading = loadingSettings && loadingDelivery;

  const canGoBack = router.canGoBack();
  const backBtn = canGoBack ? (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); router.back(); }}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
      hitSlop={12}
    >
      <Feather name="arrow-left" size={20} color="#1A2B4A" />
    </Pressable>
  ) : undefined;

  if (isLoading) {
    return (
      <DirectorTabScreen title="Settings" headerLeft={backBtn} backgroundColor="#EFF6FF" headerBackgroundColor="#EFF6FF">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      </DirectorTabScreen>
    );
  }

  const feeFmt = delivery
    ? `$${(delivery.feeCents / 100).toFixed(2)}`
    : '—';

  return (
    <DirectorTabScreen title="Settings" headerLeft={backBtn} backgroundColor="#EFF6FF" headerBackgroundColor="#EFF6FF">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />
        }
      >
        {/* ── STORE ─────────────────────────────────────────── */}
        <Section
          header="STORE"
          footer="Controls whether the store is accepting online orders."
        >
          <ToggleRow
            label="Store Open"
            value={storeOpen}
            onToggle={toggleStoreOpen}
            loading={togglingStore}
          />
          {editingSpecial ? (
            <View style={[s.row, { gap: 10, alignItems: 'center' }]}>
              <TextInput
                style={s.inlineInput}
                value={specialDraft}
                onChangeText={setSpecialDraft}
                placeholder="Today's special…"
                placeholderTextColor={MUTED}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveSpecial}
              />
              <Pressable onPress={saveSpecial}>
                <Text style={{ color: BLUE, fontWeight: '600', fontSize: 15 }}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditingSpecial(false)}>
                <Text style={{ color: MUTED, fontSize: 15 }}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <ValueRow
              label="Daily Special"
              value={dailySpecial || 'Not set'}
              onPress={promptEditSpecial}
            />
          )}
          <LinkRow
            label="Store Locations"
            value={undefined}
            onPress={() => router.push('/director-store-locations' as any)}
            isLast
          />
        </Section>

        {/* ── DELIVERY ──────────────────────────────────────── */}
        <Section header="DELIVERY">
          <ToggleRow
            label="Delivery enabled"
            value={delivery?.enabled ?? false}
            onToggle={toggleDelivery}
            loading={togglingDelivery}
          />
          <ValueRow
            label="Delivery fee"
            value={feeFmt}
            onPress={() => router.push('/director-settings-delivery' as any)}
          />
          <LinkRow
            label="Delivery Schedule"
            onPress={() => router.push('/director-settings-delivery' as any)}
            isLast
          />
        </Section>

        {/* ── LOYALTY ───────────────────────────────────────── */}
        <Section header="LOYALTY">
          <LinkRow
            label="Loyalty Tiers"
            value={undefined}
            onPress={() => router.push('/director-settings-loyalty-tiers' as any)}
          />
          <LinkRow
            label="Reward Catalogue"
            onPress={() => router.push('/director-settings-rewards' as any)}
          />
          <LinkRow
            label="Banners & Promotions"
            onPress={() => router.push('/director-settings-banner' as any)}
            isLast
          />
        </Section>

        {/* ── NOTIFICATIONS ─────────────────────────────────── */}
        <Section header="NOTIFICATIONS">
          <LinkRow
            label="Push Notifications"
            onPress={() => router.push('/director-settings-notify' as any)}
          />
          <LinkRow
            label="Scheduled Sends"
            onPress={() => router.push('/director-settings-scheduled-notifications' as any)}
          />
          <LinkRow
            label="Customer Segments"
            onPress={() => router.push('/director-customer-segments' as any)}
            isLast
          />
        </Section>

        {/* ── BANNERS ───────────────────────────────────────── */}
        <Section header="BANNERS">
          <LinkRow
            label="Active Announcements"
            value={activeAnn > 0 ? `${activeAnn} active` : undefined}
            onPress={() => router.push('/director-settings-notify' as any)}
          />
          <LinkRow
            label="Scheduled"
            onPress={() => router.push('/director-settings-scheduled-notifications' as any)}
            isLast
          />
        </Section>

        {/* ── MANAGERS ──────────────────────────────────────── */}
        <Section header="MANAGERS">
          <LinkRow
            label="Manage Team"
            value={managerCount > 0 ? `${managerCount} manager${managerCount !== 1 ? 's' : ''}` : undefined}
            onPress={() => router.push({ pathname: '/(director)/users', params: { tab: 'Staff' } } as any)}
            isLast
          />
        </Section>

        {/* ── DEMO ACCOUNTS ─────────────────────────────────── */}
        <Section header="DEMO ACCOUNTS">
          <LinkRow
            label="Seed / reset demo accounts"
            value="4 accounts"
            onPress={() => {
              Alert.alert(
                'Seed Demo Accounts',
                'This will create or reset all 4 demo accounts (customer, staff, wholesale, director).',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Seed',
                    onPress: async () => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      try {
                        const base = process.env.EXPO_PUBLIC_DOMAIN ?? '';
                        await fetch(`${base}/api/auth/seed-demo`, { method: 'POST' });
                        Alert.alert('Done', 'Demo accounts are ready.\nPassword: Demo1234!');
                      } catch {
                        Alert.alert('Error', 'Could not seed demo accounts.');
                      }
                    },
                  },
                ],
              );
            }}
            isLast
          />
        </Section>
      </ScrollView>
    </DirectorTabScreen>
  );
}

const s = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 24,
  },

  sectionHeader: {
    fontSize: 13, fontWeight: '600', color: MUTED,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 4,
  },
  sectionFooter: {
    fontSize: 13, color: MUTED,
    marginTop: 6, marginHorizontal: 4, lineHeight: 18,
  },

  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16, gap: 12,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 16, color: TEXT, flexShrink: 1 },
  rowValue: { fontSize: 16, color: MUTED, flexShrink: 1, textAlign: 'right' },

  inlineInput: {
    flex: 1, fontSize: 15, color: TEXT,
    borderBottomWidth: 1, borderBottomColor: BLUE,
    paddingVertical: 2,
  },
});
