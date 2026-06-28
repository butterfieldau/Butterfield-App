import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorReward, type DirectorProduct } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const REWARD_CATEGORIES = ['food', 'drink', 'discount', 'experience', 'merchandise'];

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

function daysUntilPurge(deletedAt: string): number {
  const deletedMs = new Date(deletedAt).getTime();
  const purgeMs   = deletedMs + 14 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeMs - Date.now()) / (24 * 60 * 60 * 1000)));
}

const rwStyles = StyleSheet.create({
  subTabBar:       { flexDirection: 'row', borderBottomWidth: 1 },
  subTab:          { flex: 1, alignItems: 'center', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  subTabText:      { fontSize: 13, fontWeight: '600' },
  subTabBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  subTabBadgeText: { fontSize: 11, fontWeight: '700' },
  purgeNote:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  purgeNoteText:   { fontSize: 12, fontWeight: '500', flex: 1 },
  deletedBanner:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#FCA5A520' },
  deletedBannerText: { fontSize: 12, fontWeight: '500' },
});

function ProductPicker({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['director-products-picker'],
    queryFn:  () => api.director.products(),
    staleTime: 60_000,
  });
  const products: DirectorProduct[] = (data?.data ?? []).filter((p: DirectorProduct) => p.isActive);
  const hasQuery       = search.trim().length > 0;
  const filtered       = hasQuery ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim())) : [];
  const selectedProduct = products.find(p => p.id === selectedId);

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>Linked product (optional)</Text>
      {isLoading ? (
        <ActivityIndicator color={BLUE} size="small" style={{ alignSelf: 'flex-start' }} />
      ) : (
        <>
          {selectedProduct ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#F0F7FF', borderRadius: 10, borderWidth: 1, borderColor: '#BAD8F7' }}>
              <Feather name="check-circle" size={16} color={BLUE} />
              <Text style={{ flex: 1, fontSize: 14, color: TEXT, fontWeight: '500' }} numberOfLines={1}>{selectedProduct.name}</Text>
              <Pressable onPress={() => { onSelect(''); setSearch(''); Haptics.selectionAsync(); }}>
                <Feather name="x" size={16} color={MUTED} />
              </Pressable>
            </View>
          ) : null}
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={search}
            onChangeText={setSearch}
            placeholder={selectedProduct ? 'Search to change product…' : 'Search products…'}
            placeholderTextColor={MUTED}
          />
          {hasQuery && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {filtered.map((p: DirectorProduct) => (
                <Pressable
                  key={p.id}
                  onPress={() => { onSelect(p.id); setSearch(''); Haptics.selectionAsync(); }}
                  style={[styles.chip, {
                    backgroundColor: selectedId === p.id ? BLUE : '#F3F4F6',
                    borderColor: selectedId === p.id ? BLUE : BORDER,
                  }]}>
                  <Text style={[styles.chipText, { color: selectedId === p.id ? '#fff' : TEXT }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              ))}
              {filtered.length === 0 && (
                <Text style={{ fontSize: 12, color: MUTED, paddingVertical: 4 }}>No products match "{search}"</Text>
              )}
            </View>
          )}
          {!hasQuery && !selectedProduct && (
            <Text style={{ fontSize: 12, color: MUTED }}>Type above to search all products.</Text>
          )}
        </>
      )}
    </View>
  );
}

function RewardModal({ visible, reward, onClose, onSuccess }: {
  visible: boolean; reward: DirectorReward | null; onClose: () => void; onSuccess: () => void;
}) {
  const [name,               setName]               = useState('');
  const [desc,               setDesc]               = useState('');
  const [pts,                setPts]                = useState('');
  const [category,           setCategory]           = useState('food');
  const [stock,              setStock]              = useState('');
  const [isAppOnly,          setIsAppOnly]          = useState(false);
  const [isActive,           setIsActive]           = useState(true);
  const [rewardType,         setRewardType]         = useState<'item_reward' | 'money_voucher' | 'cookie_any'>('item_reward');
  const [voucherDollars,     setVoucherDollars]     = useState('');
  const [linkedProductId,    setLinkedProductId]    = useState('');
  const [customerRedeemable, setCustomerRedeemable] = useState(true);
  const [claimExpiryDays,    setClaimExpiryDays]    = useState('');
  const [tierRestriction,    setTierRestriction]    = useState<string[]>([]);
  const [minOrderDollars,    setMinOrderDollars]    = useState('');
  const [autoGrantThreshold, setAutoGrantThreshold] = useState('');
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState('');

  useEffect(() => {
    if (reward) {
      setName(reward.name); setDesc(reward.description); setPts(String(reward.pointsCost));
      setCategory(reward.category); setStock(reward.stock != null ? String(reward.stock) : '');
      setIsAppOnly(reward.isAppOnly); setIsActive(reward.isActive);
      const rt = reward.rewardType;
      setRewardType(rt === 'money_voucher' ? 'money_voucher' : rt === 'cookie_any' ? 'cookie_any' : 'item_reward');
      setVoucherDollars(reward.voucherValueCents ? String(reward.voucherValueCents / 100) : '');
      setLinkedProductId(reward.linkedProductId ?? '');
      setCustomerRedeemable(reward.customerRedeemable !== false);
      setClaimExpiryDays(reward.claimExpiryDays != null ? String(reward.claimExpiryDays) : '');
      try {
        const tiers = reward.tierRestriction ? JSON.parse(reward.tierRestriction) : [];
        setTierRestriction(Array.isArray(tiers) ? tiers : []);
      } catch { setTierRestriction([]); }
      setMinOrderDollars(reward.minOrderValueCents ? String(reward.minOrderValueCents / 100) : '');
      setAutoGrantThreshold(reward.autoGrantPointsThreshold ? String(reward.autoGrantPointsThreshold) : '');
    } else {
      setName(''); setDesc(''); setPts(''); setCategory('food'); setStock('');
      setIsAppOnly(false); setIsActive(true); setRewardType('item_reward');
      setVoucherDollars(''); setLinkedProductId(''); setCustomerRedeemable(true);
      setClaimExpiryDays(''); setTierRestriction([]); setMinOrderDollars(''); setAutoGrantThreshold('');
    }
    setError('');
  }, [reward, visible]);

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    const pointsCost = parseInt(pts, 10);
    if (isNaN(pointsCost) || pointsCost < 0) { setError('Points cost must be 0 or a positive number.'); return; }
    if (rewardType === 'money_voucher') {
      const dollars = parseFloat(voucherDollars);
      if (isNaN(dollars) || dollars < 0.01) { setError('Voucher value must be at least $0.01.'); return; }
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const voucherValueCents         = rewardType === 'money_voucher' ? Math.round(parseFloat(voucherDollars) * 100) : null;
      const parsedExpiryDays          = claimExpiryDays.trim() ? parseInt(claimExpiryDays.trim(), 10) : null;
      const minOrderValueCents        = minOrderDollars.trim() ? Math.round(parseFloat(minOrderDollars) * 100) : null;
      const autoGrantPointsThreshold  = autoGrantThreshold.trim() ? parseInt(autoGrantThreshold.trim(), 10) : null;
      const tierRestrictionJson       = tierRestriction.length > 0 ? JSON.stringify(tierRestriction) : null;
      const payload = {
        name: name.trim(), description: desc.trim(), pointsCost, category,
        stock: stock ? parseInt(stock, 10) : null, isAppOnly, isActive,
        rewardType, voucherValueCents,
        linkedProductId: linkedProductId.trim() || null,
        customerRedeemable,
        claimExpiryDays: parsedExpiryDays && parsedExpiryDays > 0 ? parsedExpiryDays : null,
        tierRestriction: tierRestrictionJson,
        minOrderValueCents: minOrderValueCents && minOrderValueCents > 0 ? minOrderValueCents : null,
        autoGrantPointsThreshold: autoGrantPointsThreshold && autoGrantPointsThreshold > 0 ? autoGrantPointsThreshold : null,
      };
      if (reward?.id) await api.director.updateReward(reward.id, payload);
      else            await api.director.createReward(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e) {
      setError(getErrorMessage(e));
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
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 56, gap: 16 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Reward type *</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { value: 'item_reward',   label: 'Free item' },
                { value: 'money_voucher', label: 'Money off' },
                { value: 'cookie_any',    label: 'Free cookie' },
              ] as const).map(({ value: rt, label }) => (
                <Pressable key={rt} onPress={() => { setRewardType(rt); Haptics.selectionAsync(); }}
                  style={[styles.chip, { flex: 1, justifyContent: 'center', backgroundColor: rewardType === rt ? BLUE : '#F3F4F6', borderColor: rewardType === rt ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: rewardType === rt ? '#fff' : TEXT }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              {rewardType === 'money_voucher'
                ? 'Deducts a fixed dollar amount from the cart total at checkout.'
                : rewardType === 'cookie_any'
                  ? 'Makes the cheapest cookie in the cart free. No linked product needed.'
                  : 'Adds one free linked product to the customer\'s cart at checkout.'}
            </Text>
          </View>

          {rewardType === 'money_voucher' && (
            <View style={{ gap: 6 }}>
              <Text style={styles.fieldLabel}>Voucher value (AUD) *</Text>
              <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={voucherDollars}
                onChangeText={setVoucherDollars} keyboardType="decimal-pad" placeholder="e.g. 5.00"
                placeholderTextColor={MUTED} />
              <Text style={{ fontSize: 11, color: MUTED }}>Customer gets this amount off their cart total.</Text>
            </View>
          )}

          {rewardType === 'item_reward' && (
            <ProductPicker selectedId={linkedProductId} onSelect={setLinkedProductId} />
          )}

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
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Claim expiry (days, leave blank for default 30)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={claimExpiryDays}
              onChangeText={setClaimExpiryDays} keyboardType="number-pad" placeholder="30" placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              How many days after claiming before the reward expires and points are restored. Default is 30 days.
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Tier restriction (leave empty = all tiers)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(['blue', 'silver', 'gold', 'black'] as const).map(tier => {
                const labels: Record<string, string> = { blue: 'Blue', silver: 'Silver', gold: 'Gold', black: 'Black' };
                const selected = tierRestriction.includes(tier);
                return (
                  <Pressable key={tier} onPress={() => {
                    Haptics.selectionAsync();
                    setTierRestriction(prev => selected ? prev.filter(t => t !== tier) : [...prev, tier]);
                  }} style={[styles.chip, { backgroundColor: selected ? BLUE : '#F3F4F6', borderColor: selected ? BLUE : BORDER }]}>
                    <Text style={[styles.chipText, { color: selected ? '#fff' : TEXT }]}>{labels[tier]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Only selected tier members can claim this reward. Leave empty to allow all tiers.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Minimum order value (AUD, optional)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={minOrderDollars}
              onChangeText={setMinOrderDollars} keyboardType="decimal-pad" placeholder="e.g. 20.00"
              placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Cart subtotal must reach this amount before the reward can be applied at checkout.
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Auto-grant points threshold (optional)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={autoGrantThreshold}
              onChangeText={setAutoGrantThreshold} keyboardType="number-pad" placeholder="e.g. 1000"
              placeholderTextColor={MUTED} />
            <Text style={{ fontSize: 11, color: MUTED, lineHeight: 15 }}>
              Reward is automatically added to the customer's wallet once they reach this points total.
            </Text>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Claimable by customers in app</Text>
            <Switch value={customerRedeemable} onValueChange={v => { setCustomerRedeemable(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
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

const REWARD_TABS = ['Active', 'Deactivated', 'Deleted'] as const;
type RewardTabKey = typeof REWARD_TABS[number];

export function RewardsTab() {
  const qc = useQueryClient();
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState<DirectorReward | null>(null);
  const [rTab,    setRTab]    = useState<RewardTabKey>('Active');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-rewards'],
    queryFn:  () => api.director.rewards(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
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
      <View style={[rwStyles.subTabBar, { borderBottomColor: BORDER }]}>
        {REWARD_TABS.map(t => (
          <Pressable key={t} onPress={() => { setRTab(t); Haptics.selectionAsync(); }}
            style={[rwStyles.subTab, rTab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}>
            <Text style={[rwStyles.subTabText, { color: rTab === t ? BLUE : MUTED }]}>{t}</Text>
            <View style={[rwStyles.subTabBadge, {
              backgroundColor: t === 'Deleted'     ? (tabCounts[t] > 0 ? '#FEE2E2' : '#F3F4F6')
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
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
              backgroundColor: isDeleted ? '#FFF5F5' : '#FFFFFF',
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
                <Text style={styles.rewardMetaText}>
                  · {r.rewardType === 'money_voucher' ? `Voucher $${((r.voucherValueCents ?? 0) / 100).toFixed(2)}` : r.rewardType === 'cookie_any' ? 'Free cookie' : r.rewardType === 'birthday_cookie' ? 'Birthday cookie' : 'Free item'}
                </Text>
                {r.isAppOnly     && <Text style={styles.rewardMetaText}>· App only</Text>}
                {r.stock != null && <Text style={styles.rewardMetaText}>· Stock: {r.stock}</Text>}
                {(r.claimCount ?? 0) > 0 && <Text style={styles.rewardMetaText}>· {r.claimCount} redeemed</Text>}
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
