import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorReward, type DirectorAnnouncement } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const BASE_TABS   = ['Store', 'Rewards', 'Notify', 'Managers'] as const;
const MASTER_TABS = ['Store', 'Rewards', 'Notify', 'Managers', 'Directors'] as const;
type TabKey = 'Store' | 'Rewards' | 'Notify' | 'Managers' | 'Directors';

const REWARD_CATEGORIES = ['food', 'drink', 'discount', 'experience', 'merchandise'];
const TARGET_ROLES      = ['customer', 'staff', 'wholesale'];

// ─── Store Settings ──────────────────────────────────────────────────────────
function StoreTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });
  const settings = data?.data ?? {};
  const [geoRadius,    setGeoRadius]    = useState('');
  const [storeOpen,    setStoreOpen]    = useState(true);
  const [dailySpecial, setDailySpecial] = useState('');
  const [shopLat,      setShopLat]      = useState('');
  const [shopLng,      setShopLng]      = useState('');
  const [orderCutoff,  setOrderCutoff]  = useState('');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (settings) {
      setGeoRadius(settings.geo_radius_meters ?? '20');
      setStoreOpen(settings.store_open !== 'false');
      setDailySpecial(settings.daily_special ?? '');
      setShopLat(settings.shop_lat ?? '-33.8349');
      setShopLng(settings.shop_lng ?? '150.9942');
      setOrderCutoff(settings.order_cutoff_time ?? '');
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({
        geo_radius_meters:  geoRadius,
        store_open:         String(storeOpen),
        daily_special:      dailySpecial,
        shop_lat:           shopLat,
        shop_lng:           shopLng,
        order_cutoff_time:  orderCutoff.trim(),
      });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>STORE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Store open</Text>
            <Text style={styles.rowSub}>Controls the "Open now" status shown to customers</Text>
          </View>
          <Switch value={storeOpen} onValueChange={v => { setStoreOpen(v); Haptics.selectionAsync(); }}
            trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Daily special</Text>
          <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={dailySpecial}
            onChangeText={setDailySpecial} placeholder="e.g. Cookie & Cream Sandwich" placeholderTextColor={MUTED} />
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Order cutoff time (24h, Sydney)</Text>
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={orderCutoff}
            onChangeText={setOrderCutoff}
            placeholder="e.g. 15:00 — leave blank for no cutoff"
            placeholderTextColor={MUTED}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
          {orderCutoff.trim() ? (
            <Text style={{ color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
              Orders will be blocked after {(() => {
                const [h, m] = orderCutoff.split(':').map(Number);
                if (isNaN(h)) return orderCutoff;
                const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                const suf = h < 12 ? 'am' : 'pm';
                const mn  = m > 0 ? `:${String(m).padStart(2,'0')}` : '';
                return `${h12}${mn}${suf}`;
              })()} Sydney time
            </Text>
          ) : (
            <Text style={{ color: MUTED, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
              No cutoff — orders accepted at any hour
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.section}>STAFF GEO-FENCE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
          <Feather name="map-pin" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: BLUE }]}>
            Staff must be within this radius of the store coordinates to clock in.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Check-in radius (metres)</Text>
          <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={geoRadius}
            onChangeText={setGeoRadius} keyboardType="number-pad" placeholder="20" placeholderTextColor={MUTED} />
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={styles.coordRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop latitude</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={shopLat}
              onChangeText={setShopLat} keyboardType="decimal-pad" placeholder="-33.8349" placeholderTextColor={MUTED} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop longitude</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={shopLng}
              onChangeText={setShopLng} keyboardType="decimal-pad" placeholder="150.9942" placeholderTextColor={MUTED} />
          </View>
        </View>
        <Text style={[styles.hint, { color: MUTED }]}>Butterfield Merrylands: –33.8349, 150.9942</Text>
      </View>

      <Text style={styles.section}>DEMO ACCOUNTS</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER, gap: 10 }]}>
        {[
          { role: 'Customer',  email: 'customer@demo.com',  color: '#0369A1', bg: '#EBF8FF' },
          { role: 'Staff',     email: 'staff@demo.com',     color: '#5B21B6', bg: '#EDE9FE' },
          { role: 'Wholesale', email: 'wholesale@demo.com', color: '#166534', bg: '#DCFCE7' },
          { role: 'Director',  email: 'director@demo.com',  color: '#854D0E', bg: '#FEF9C3' },
        ].map(d => (
          <View key={d.role} style={[styles.demoRow, { borderColor: BORDER }]}>
            <View style={[styles.demoPill, { backgroundColor: d.bg }]}>
              <Text style={[styles.demoPillText, { color: d.color }]}>{d.role}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoEmail}>{d.email}</Text>
              <Text style={[styles.demoPw, { color: MUTED }]}>Demo1234!</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={save} disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ─── Reward Form Modal ────────────────────────────────────────────────────────
function RewardModal({ visible, reward, onClose, onSuccess }: {
  visible: boolean; reward: DirectorReward | null; onClose: () => void; onSuccess: () => void;
}) {
  const [name,       setName]       = useState('');
  const [desc,       setDesc]       = useState('');
  const [pts,        setPts]        = useState('');
  const [category,   setCategory]   = useState('food');
  const [stock,      setStock]      = useState('');
  const [isAppOnly,  setIsAppOnly]  = useState(false);
  const [isActive,   setIsActive]   = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (reward) {
      setName(reward.name); setDesc(reward.description); setPts(String(reward.pointsCost));
      setCategory(reward.category); setStock(reward.stock != null ? String(reward.stock) : '');
      setIsAppOnly(reward.isAppOnly); setIsActive(reward.isActive);
    } else {
      setName(''); setDesc(''); setPts(''); setCategory('food'); setStock('');
      setIsAppOnly(false); setIsActive(true);
    }
    setError('');
  }, [reward, visible]);

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    const pointsCost = parseInt(pts, 10);
    if (isNaN(pointsCost) || pointsCost < 1) { setError('Points cost must be a positive number.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = {
        name: name.trim(), description: desc.trim(), pointsCost, category,
        stock: stock ? parseInt(stock, 10) : null, isAppOnly, isActive,
      };
      if (reward?.id) await api.director.updateReward(reward.id, payload);
      else            await api.director.createReward(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{reward ? 'Edit Reward' : 'New Reward'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={name}
              onChangeText={setName} placeholder="e.g. Free Flat White" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 72 }]}
              value={desc} onChangeText={setDesc} multiline placeholder="What does the customer get?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Points cost *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={pts}
              onChangeText={setPts} keyboardType="number-pad" placeholder="e.g. 500" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REWARD_CATEGORIES.map(c => (
                <Pressable key={c} onPress={() => setCategory(c)}
                  style={[styles.chip, { backgroundColor: category === c ? BLUE : '#F3F4F6', borderColor: category === c ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: category === c ? '#fff' : TEXT }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Stock limit (leave blank for unlimited)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={stock}
              onChangeText={setStock} keyboardType="number-pad" placeholder="Unlimited" placeholderTextColor={MUTED} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>App-only reward</Text>
            <Switch value={isAppOnly} onValueChange={v => { setIsAppOnly(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Rewards Tab ──────────────────────────────────────────────────────────────
const REWARD_TABS = ['Active', 'Deactivated', 'Deleted'] as const;
type RewardTabKey = typeof REWARD_TABS[number];

function daysUntilPurge(deletedAt: string): number {
  const deletedMs = new Date(deletedAt).getTime();
  const purgeMs   = deletedMs + 14 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeMs - Date.now()) / (24 * 60 * 60 * 1000)));
}

function RewardsTab() {
  const qc = useQueryClient();
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState<DirectorReward | null>(null);
  const [rTab,    setRTab]    = useState<RewardTabKey>('Active');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-rewards'],
    queryFn:  () => api.director.rewards(),
  });
  const allRewards = data?.data ?? [];

  const activeRewards      = allRewards.filter(r => !r.deletedAt && r.isActive);
  const deactivatedRewards = allRewards.filter(r => !r.deletedAt && !r.isActive);
  const deletedRewards     = allRewards.filter(r => !!r.deletedAt);

  const visibleRewards =
    rTab === 'Active'      ? activeRewards :
    rTab === 'Deactivated' ? deactivatedRewards :
                             deletedRewards;

  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.director.updateReward(id, { isActive: false }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['director-rewards'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.director.deleteReward(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Deleted'); },
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => api.director.restoreReward(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Active'); },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.director.updateReward(id, { isActive: true }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['director-rewards'] }); setRTab('Active'); },
  });

  const confirmDeactivate = (r: DirectorReward) =>
    Alert.alert('Deactivate Reward', `"${r.name}" will be hidden from customers but kept in your system.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deactivateMut.mutate(r.id);
      }},
    ]);

  const confirmDelete = (r: DirectorReward) =>
    Alert.alert('Delete Reward', `"${r.name}" will be moved to the Deleted tab and permanently removed after 14 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        deleteMut.mutate(r.id);
      }},
    ]);

  const confirmRestore = (r: DirectorReward) =>
    Alert.alert('Restore Reward', `"${r.name}" will be restored and made active again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        restoreMut.mutate(r.id);
      }},
    ]);

  const openEdit = (r: DirectorReward) => { setEditing(r); setModal(true); };
  const openNew  = ()                   => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  const tabCounts: Record<RewardTabKey, number> = {
    Active:      activeRewards.length,
    Deactivated: deactivatedRewards.length,
    Deleted:     deletedRewards.length,
  };

  return (
    <>
      {/* Sub-tabs */}
      <View style={[rwStyles.subTabBar, { borderBottomColor: BORDER }]}>
        {REWARD_TABS.map(t => (
          <Pressable key={t} onPress={() => { setRTab(t); Haptics.selectionAsync(); }}
            style={[rwStyles.subTab, rTab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}>
            <Text style={[rwStyles.subTabText, { color: rTab === t ? BLUE : MUTED }]}>{t}</Text>
            <View style={[rwStyles.subTabBadge, {
              backgroundColor: t === 'Deleted' ? (tabCounts[t] > 0 ? '#FEE2E2' : '#F3F4F6')
                             : t === 'Deactivated' ? (tabCounts[t] > 0 ? '#FEF9C3' : '#F3F4F6')
                             : (tabCounts[t] > 0 ? '#DCFCE7' : '#F3F4F6'),
            }]}>
              <Text style={[rwStyles.subTabBadgeText, {
                color: t === 'Deleted'      ? (tabCounts[t] > 0 ? '#991B1B' : MUTED)
                     : t === 'Deactivated'  ? (tabCounts[t] > 0 ? '#854D0E' : MUTED)
                     : (tabCounts[t] > 0 ? '#166534' : MUTED),
              }]}>{tabCounts[t]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visibleRewards}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        ListHeaderComponent={rTab === 'Active' ? (
          <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>New Reward</Text>
          </Pressable>
        ) : rTab === 'Deleted' && deletedRewards.length > 0 ? (
          <View style={[rwStyles.purgeNote, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Feather name="clock" size={14} color={RED} />
            <Text style={[rwStyles.purgeNoteText, { color: '#991B1B' }]}>
              Deleted rewards are permanently removed after 14 days.
            </Text>
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name={rTab === 'Deleted' ? 'trash-2' : rTab === 'Deactivated' ? 'eye-off' : 'star'} size={32} color={MUTED} />
            <Text style={styles.emptyText}>
              {rTab === 'Deleted' ? 'No deleted rewards' : rTab === 'Deactivated' ? 'No deactivated rewards' : 'No active rewards'}
            </Text>
          </View>
        }
        renderItem={({ item: r }: { item: DirectorReward }) => {
          const isDeleted = !!r.deletedAt;
          const days      = isDeleted ? daysUntilPurge(r.deletedAt!) : null;
          return (
            <View style={[styles.card, {
              backgroundColor: isDeleted ? '#FFF5F5' : CARD,
              borderColor: isDeleted ? '#FCA5A5' : !r.isActive ? '#FDE68A' : BORDER,
              opacity: isDeleted ? 0.9 : 1,
            }]}>
              {isDeleted && (
                <View style={[rwStyles.deletedBanner, { backgroundColor: '#FEE2E2' }]}>
                  <Feather name="clock" size={12} color={RED} />
                  <Text style={[rwStyles.deletedBannerText, { color: '#991B1B' }]}>
                    Permanently deleted in {days} day{days !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              <View style={styles.rewardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rewardName, isDeleted && { color: MUTED, textDecorationLine: 'line-through' }]}>{r.name}</Text>
                  <Text style={styles.rewardDesc} numberOfLines={1}>{r.description}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.rewardPts, { color: isDeleted ? MUTED : BLUE }]}>{r.pointsCost.toLocaleString()} pts</Text>
                  <View style={[styles.chip, { backgroundColor: isDeleted ? '#FEE2E2' : r.isActive ? '#DCFCE7' : '#FEF9C3', borderColor: 'transparent' }]}>
                    <Text style={[styles.chipText, { color: isDeleted ? '#991B1B' : r.isActive ? '#166534' : '#854D0E', fontSize: 10 }]}>
                      {isDeleted ? 'DELETED' : r.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.rewardMeta}>
                <Text style={styles.rewardMetaText}>#{r.category}</Text>
                {r.isAppOnly     && <Text style={styles.rewardMetaText}>· App only</Text>}
                {r.stock != null && <Text style={styles.rewardMetaText}>· Stock: {r.stock}</Text>}
              </View>
              <View style={styles.rewardActions}>
                {isDeleted ? (
                  <Pressable onPress={() => confirmRestore(r)}
                    style={[styles.actionBtn, { borderColor: GREEN + '60', backgroundColor: '#F0FDF4', flex: 1 }]}>
                    <Feather name="rotate-ccw" size={13} color={GREEN} />
                    <Text style={[styles.actionBtnText, { color: GREEN }]}>Restore</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable onPress={() => openEdit(r)}
                      style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                      <Feather name="edit-2" size={13} color={BLUE} />
                      <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
                    </Pressable>
                    {r.isActive ? (
                      <Pressable onPress={() => confirmDeactivate(r)}
                        style={[styles.actionBtn, { borderColor: AMBER + '60', backgroundColor: '#FFFBEB' }]}>
                        <Feather name="eye-off" size={13} color={AMBER} />
                        <Text style={[styles.actionBtnText, { color: AMBER }]}>Deactivate</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => { Haptics.selectionAsync(); activateMut.mutate(r.id); }}
                        style={[styles.actionBtn, { borderColor: GREEN + '60', backgroundColor: '#F0FDF4' }]}>
                        <Feather name="eye" size={13} color={GREEN} />
                        <Text style={[styles.actionBtnText, { color: GREEN }]}>Activate</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => confirmDelete(r)}
                      style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                      <Feather name="trash-2" size={13} color={RED} />
                      <Text style={[styles.actionBtnText, { color: RED }]}>Delete</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        }}
      />
      <RewardModal
        visible={modal} reward={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-rewards'] }); }}
      />
    </>
  );
}

const rwStyles = StyleSheet.create({
  subTabBar:       { flexDirection: 'row', borderBottomWidth: 1 },
  subTab:          { flex: 1, alignItems: 'center', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  subTabText:      { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  subTabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  subTabBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  purgeNote:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  purgeNoteText:   { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  deletedBanner:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#FCA5A520' },
  deletedBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});

// ─── Notification Form Modal ──────────────────────────────────────────────────
function AnnouncementModal({ visible, announcement, onClose, onSuccess }: {
  visible: boolean; announcement: DirectorAnnouncement | null; onClose: () => void; onSuccess: () => void;
}) {
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [isPinned,    setIsPinned]    = useState(false);
  const [isActive,    setIsActive]    = useState(true);
  const [targetRoles, setTargetRoles] = useState<string[]>(['customer']);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title); setBody(announcement.body);
      setIsPinned(announcement.isPinned); setIsActive(announcement.isActive);
      setTargetRoles(announcement.targetRoles);
    } else {
      setTitle(''); setBody(''); setIsPinned(false); setIsActive(true); setTargetRoles(['customer']);
    }
    setError('');
  }, [announcement, visible]);

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    Haptics.selectionAsync();
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim())  { setError('Body is required.'); return; }
    if (targetRoles.length === 0) { setError('Select at least one audience.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = { title: title.trim(), body: body.trim(), isPinned, isActive, targetRoles };
      if (announcement?.id) await api.director.updateAnnouncement(announcement.id, payload);
      else                   await api.director.createAnnouncement(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{announcement ? 'Edit Announcement' : 'New Announcement'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Publish</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={title}
              onChangeText={setTitle} placeholder="e.g. New Summer Menu!" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 100 }]}
              value={body} onChangeText={setBody} multiline
              placeholder="What do you want to tell your customers?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Audience</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TARGET_ROLES.map(role => (
                <Pressable key={role} onPress={() => toggleRole(role)}
                  style={[styles.chip, { backgroundColor: targetRoles.includes(role) ? BLUE : '#F3F4F6', borderColor: targetRoles.includes(role) ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: targetRoles.includes(role) ? '#fff' : TEXT }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Pin to top of feed</Text>
            <Switch value={isPinned} onValueChange={v => { setIsPinned(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: AMBER }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active (visible to users)</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotifyTab() {
  const qc = useQueryClient();
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState<DirectorAnnouncement | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-announcements'],
    queryFn: () => api.director.allAnnouncements(),
  });
  const announcements = data?.data ?? [];

  const deleteAnn = useMutation({
    mutationFn: (id: string) => api.director.deleteAnnouncement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-announcements'] }),
  });

  const confirmDelete = (a: DirectorAnnouncement) => {
    Alert.alert('Delete Announcement', `"${a.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deleteAnn.mutate(a.id);
      }},
    ]);
  };

  const openEdit = (a: DirectorAnnouncement) => { setEditing(a); setModal(true); };
  const openNew  = ()                          => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <>
      <FlatList
        data={announcements}
        keyExtractor={a => a.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        ListHeaderComponent={
          <>
            <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40', marginBottom: 10 }]}>
              <Feather name="bell" size={13} color={BLUE} />
              <Text style={[styles.infoBannerText, { color: BLUE }]}>
                Announcements appear in the home feed for the selected audience. Pinned items appear at the top.
              </Text>
            </View>
            <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>New Announcement</Text>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="bell-off" size={32} color={MUTED} />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        }
        renderItem={({ item: a }: { item: DirectorAnnouncement }) => (
          <View style={[styles.card, { backgroundColor: CARD, borderColor: a.isActive ? BORDER : '#FEE2E2' }]}>
            <View style={styles.annHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {a.isPinned && <Feather name="bookmark" size={12} color={AMBER} />}
                  <Text style={styles.annTitle}>{a.title}</Text>
                </View>
                <Text style={styles.annBody} numberOfLines={2}>{a.body}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: a.isActive ? '#DCFCE7' : '#FEE2E2', borderColor: 'transparent', marginLeft: 8 }]}>
                <Text style={[styles.chipText, { color: a.isActive ? '#166534' : '#991B1B', fontSize: 10 }]}>
                  {a.isActive ? 'LIVE' : 'OFF'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {a.targetRoles.map(r => (
                <View key={r} style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: BORDER, paddingVertical: 2 }]}>
                  <Text style={[styles.chipText, { color: MUTED, fontSize: 10 }]}>{r}</Text>
                </View>
              ))}
              <Text style={styles.annDate}>{new Date(a.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </View>
            <View style={styles.rewardActions}>
              <Pressable onPress={() => openEdit(a)} style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                <Feather name="edit-2" size={13} color={BLUE} />
                <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(a)} style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                <Feather name="trash-2" size={13} color={RED} />
                <Text style={[styles.actionBtnText, { color: RED }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <AnnouncementModal
        visible={modal} announcement={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-announcements'] }); }}
      />
    </>
  );
}

// ─── Managers Tab ─────────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: 'grid'        },
  { key: 'orders',        label: 'Orders',        icon: 'shopping-bag'},
  { key: 'users',         label: 'Users',         icon: 'users'       },
  { key: 'products',      label: 'Products',      icon: 'package'     },
  { key: 'reports',       label: 'Reports',       icon: 'bar-chart-2' },
  { key: 'rewards',       label: 'Rewards',       icon: 'gift'        },
  { key: 'announcements', label: 'Announcements', icon: 'bell'        },
  { key: 'settings',      label: 'Settings',      icon: 'settings'    },
  { key: 'pricing',       label: 'Pricing',       icon: 'dollar-sign' },
] as const;

const INDIGO = '#3730A3';

interface ManagerFormData { name: string; email: string; password: string; notes: string }

function ManagersTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });

  const managers = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<ManagerFormData>({ name: '', email: '', password: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  function togglePerm(set: string[], key: string, setter: (v: string[]) => void) {
    Haptics.selectionAsync();
    setter(set.includes(key) ? set.filter(p => p !== key) : [...set, key]);
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    setCreating(true);
    try {
      await api.director.managers.create({ ...form, permissions: formPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '', notes: '' });
      setFormPerms([]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreating(false); }
  };

  const handleSavePerms = async (id: string) => {
    setSavingPerms(true);
    try {
      await api.director.managers.updatePermissions(id, { permissions: editPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSavingPerms(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Manager', `Remove ${name}'s manager access? Their account will become a staff account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.managers.delete(id);
          await qc.invalidateQueries({ queryKey: ['director-managers'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: INDIGO }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Manager</Text>
        </Pressable>

        {managers.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No managers yet. Add one above.</Text>
          </View>
        ) : (
          managers.map((m: any) => (
            <View key={m.id} style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 2 }}>{m.email}</Text>
                </View>
                <Pressable onPress={() => handleDelete(m.id, m.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color={RED} />
                </Pressable>
              </View>

              {m.notes ? <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED }}>{m.notes}</Text> : null}

              <View style={{ height: 1, backgroundColor: BORDER }} />

              {/* Permission toggles */}
              {editingId === m.id ? (
                <>
                  {ALL_PERMISSIONS.map(p => (
                    <View key={p.key} style={styles.switchRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name={p.icon as any} size={14} color={INDIGO} />
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: TEXT }}>{p.label}</Text>
                      </View>
                      <Switch
                        value={editPerms.includes(p.key)}
                        onValueChange={() => togglePerm(editPerms, p.key, setEditPerms)}
                        trackColor={{ false: BORDER, true: INDIGO }}
                        thumbColor="#fff"
                        ios_backgroundColor={BORDER}
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => setEditingId(null)}
                      style={[styles.actionBtn, { flex: 1, borderColor: BORDER, justifyContent: 'center' }]}>
                      <Text style={[styles.actionBtnText, { color: MUTED }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSavePerms(m.id)} disabled={savingPerms}
                      style={[styles.actionBtn, { flex: 1, backgroundColor: INDIGO, borderColor: INDIGO, justifyContent: 'center' }]}>
                      {savingPerms ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save permissions</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(m.permissions as string[]).length === 0 ? (
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: AMBER }}>No permissions — manager cannot see any tabs</Text>
                    ) : (m.permissions as string[]).map((p: string) => (
                      <View key={p} style={[styles.chip, { backgroundColor: INDIGO + '18', borderColor: INDIGO + '40' }]}>
                        <Text style={[styles.chipText, { color: INDIGO }]}>{p}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => { setEditingId(m.id); setEditPerms([...(m.permissions as string[])]); }}
                    style={[styles.actionBtn, { borderColor: INDIGO, alignSelf: 'flex-start' }]}>
                    <Feather name="edit-2" size={12} color={INDIGO} />
                    <Text style={[styles.actionBtnText, { color: INDIGO }]}>Edit permissions</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Manager Modal */}
      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Manager</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'e.g. Sydney store manager' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={(form as any)[field.key]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}

              <Text style={[styles.section, { marginTop: 8 }]}>INITIAL PERMISSIONS</Text>
              {ALL_PERMISSIONS.map(p => (
                <View key={p.key} style={styles.switchRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={p.icon as any} size={14} color={INDIGO} />
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: TEXT }}>{p.label}</Text>
                  </View>
                  <Switch
                    value={formPerms.includes(p.key)}
                    onValueChange={() => togglePerm(formPerms, p.key, setFormPerms)}
                    trackColor={{ false: BORDER, true: INDIGO }}
                    thumbColor="#fff"
                    ios_backgroundColor={BORDER}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Directors Tab (master only) ──────────────────────────────────────────────
const PURPLE = '#7C3AED';

function DirectorsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['master-directors'],
    queryFn: () => api.director.directors.list(),
  });
  const directors = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    if (form.password.length < 8) {
      Alert.alert('Password too short', 'Password must be at least 8 characters.'); return;
    }
    setCreating(true);
    try {
      await api.director.directors.create(form);
      await qc.invalidateQueries({ queryKey: ['master-directors'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '' });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreating(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Director', `Remove ${name}'s director access? This will permanently delete their account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.directors.delete(id);
          await qc.invalidateQueries({ queryKey: ['master-directors'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="shield" size={16} color={PURPLE} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: PURPLE }}>Master Account Controls</Text>
          </View>
          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6D28D9', lineHeight: 18 }}>
            Directors have full access to all store management features, but cannot add or remove other directors. Only the master account can manage directors.
          </Text>
        </View>

        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: PURPLE }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Director</Text>
        </Pressable>

        {directors.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No directors yet. Add one above.</Text>
          </View>
        ) : (
          directors.map((d: any) => (
            <View key={d.id} style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT }}>{d.name}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 2 }}>{d.email}</Text>
                  <View style={[styles.chip, { backgroundColor: PURPLE + '18', borderColor: PURPLE + '40', alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={[styles.chipText, { color: PURPLE }]}>DIRECTOR</Text>
                  </View>
                </View>
                <Pressable onPress={() => handleDelete(d.id, d.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Director</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              <View style={[styles.card, { backgroundColor: '#F5F3FF', borderColor: PURPLE + '30' }]}>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#6D28D9', lineHeight: 18 }}>
                  Directors have the same access as this master account, except they cannot manage other directors.
                </Text>
              </View>
              {[
                { label: 'Full Name', key: 'name',     placeholder: 'Jane Smith' },
                { label: 'Email',     key: 'email',    placeholder: 'jane@butterfield.com.au' },
                { label: 'Password',  key: 'password', placeholder: 'Min 8 characters' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={(form as any)[field.key]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorSettingsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const isMaster = user?.role === 'master';
  const TABS = isMaster ? MASTER_TABS : BASE_TABS;
  const [tab, setTab] = useState<TabKey>('Store');

  // Jump to the requested tab when navigated from More screen
  useEffect(() => {
    if (tabParam && (TABS as readonly string[]).includes(tabParam)) {
      setTab(tabParam as TabKey);
    }
  }, [tabParam]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={[styles.tabBar, { borderBottomColor: BORDER }]}>
          {(TABS as readonly string[]).map(t => (
            <Pressable key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
              onPress={() => { setTab(t as TabKey); Haptics.selectionAsync(); }}>
              <Text style={[styles.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {tab === 'Store'     && <StoreTab />}
      {tab === 'Rewards'   && <RewardsTab />}
      {tab === 'Notify'    && <NotifyTab />}
      {tab === 'Managers'  && <ManagersTab />}
      {tab === 'Directors' && <DirectorsTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:     { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:        { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:       { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  section:       { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#8E8E93', letterSpacing: 1.5, marginTop: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle:      { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  rowSub:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2, lineHeight: 17 },
  divider:       { height: 1 },
  fieldLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: '#FAFAFA' },
  coordRow:      { flexDirection: 'row', gap: 10 },
  hint:          { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -6 },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoBannerText:{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  demoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1 },
  demoPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  demoPillText:  { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  demoEmail:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  demoPw:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
  saveBtn:       { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:    { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText:      { fontSize: 12, fontFamily: 'Inter_500Medium' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  modalCancel:   { fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalSave:     { fontSize: 15, fontFamily: 'Inter_700Bold' },
  errorText:     { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  rewardHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
  rewardName:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  rewardDesc:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  rewardPts:     { fontSize: 14, fontFamily: 'Inter_700Bold' },
  rewardMeta:    { flexDirection: 'row', gap: 6 },
  rewardMetaText:{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  rewardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  annHeader:     { flexDirection: 'row', alignItems: 'flex-start' },
  annTitle:      { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  annBody:       { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280', lineHeight: 18 },
  annDate:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginLeft: 'auto' },
});
