import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const NAVY  = '#1A2B4A';
const BLUE  = '#1493FF';
const RED   = '#EF4444';
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const BG    = '#F5F6FA';
const CARD  = '#FFFFFF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';

type Tab = 'tiers' | 'breaks' | 'custom' | 'assign';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'tiers',  label: 'Tiers',      icon: 'layers' },
  { id: 'breaks', label: 'Qty Breaks', icon: 'trending-down' },
  { id: 'custom', label: 'Custom',     icon: 'user' },
  { id: 'assign', label: 'Assign',     icon: 'tag' },
];

interface TierForm  { id?: string; name: string; description: string; status: 'active' | 'inactive' }
interface BreakForm {
  id?: string; productId: string; scope: 'tier' | 'customer';
  tierId: string; customerId: string; minQty: string; unitPrice: string; isActive: boolean;
}
interface CustomForm { id?: string; customerId: string; productId: string; unitPrice: string; isActive: boolean }

const EMPTY_TIER:   TierForm   = { name: '', description: '', status: 'active' };
const EMPTY_BREAK:  BreakForm  = { productId: '', scope: 'tier', tierId: '', customerId: '', minQty: '', unitPrice: '', isActive: true };
const EMPTY_CUSTOM: CustomForm = { customerId: '', productId: '', unitPrice: '', isActive: true };

export default function DirectorPricing() {
  const qc     = useQueryClient();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('tiers');

  const [tierModal,   setTierModal]   = useState(false);
  const [tierForm,    setTierForm]    = useState<TierForm>(EMPTY_TIER);
  const [breakModal,  setBreakModal]  = useState(false);
  const [breakForm,   setBreakForm]   = useState<BreakForm>(EMPTY_BREAK);
  const [customModal, setCustomModal] = useState(false);
  const [customForm,  setCustomForm]  = useState<CustomForm>(EMPTY_CUSTOM);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['director-tiers'],
    queryFn: () => api.director.tiers(),
  });
  const tiers = tiersData?.data ?? [];

  const { data: breaksData, isLoading: breaksLoading } = useQuery({
    queryKey: ['director-qty-breaks'],
    queryFn: () => api.director.qtyBreaks(),
    enabled: tab === 'breaks',
  });
  const breaks = breaksData?.data ?? [];

  const { data: customData, isLoading: customLoading } = useQuery({
    queryKey: ['director-customer-pricing'],
    queryFn: () => api.director.customerPricing(),
    enabled: tab === 'custom',
  });
  const customPrices = customData?.data ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['director-products'],
    queryFn: () => api.director.products(),
    staleTime: 60_000,
  });
  const products = (productsData?.data ?? []).filter((p: any) => p.isActive !== false);

  const { data: usersData } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
    staleTime: 30_000,
  });
  const wholesaleUsers = (usersData?.data ?? []).filter(
    (u: any) => u.role === 'wholesale' && u.wholesaleAccount,
  );

  // ── Mutations ────────────────────────────────────────────────────────────
  const invalidateTiers  = () => qc.invalidateQueries({ queryKey: ['director-tiers'] });
  const invalidateBreaks = () => qc.invalidateQueries({ queryKey: ['director-qty-breaks'] });
  const invalidateCustom = () => qc.invalidateQueries({ queryKey: ['director-customer-pricing'] });
  const invalidateUsers  = () => qc.invalidateQueries({ queryKey: ['director-users'] });

  const saveTierMut = useMutation({
    mutationFn: (f: TierForm) =>
      f.id
        ? api.director.updateTier(f.id, { name: f.name, description: f.description, status: f.status })
        : api.director.createTier({ name: f.name, description: f.description, status: f.status }),
    onSuccess: () => { invalidateTiers(); setTierModal(false); },
  });

  const deleteTierMut = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) =>
      api.director.deleteTier(id, force),
    onSuccess: () => invalidateTiers(),
  });

  const saveBreakMut = useMutation({
    mutationFn: (f: BreakForm) => {
      const priceCents = Math.round(parseFloat(f.unitPrice) * 100);
      const qty        = parseInt(f.minQty, 10);
      if (!priceCents || priceCents <= 0) throw new Error('Enter a valid price');
      if (!qty || qty < 1)               throw new Error('Enter a valid minimum quantity');
      const data = {
        productId: f.productId,
        scope: f.scope,
        tierId:     f.scope === 'tier'     ? f.tierId     : undefined,
        customerId: f.scope === 'customer' ? f.customerId : undefined,
        minQty: qty,
        unitPriceCents: priceCents,
        isActive: f.isActive,
      };
      return f.id ? api.director.updateQtyBreak(f.id, data) : api.director.createQtyBreak(data);
    },
    onSuccess: () => { invalidateBreaks(); setBreakModal(false); },
  });

  const deleteBreakMut = useMutation({
    mutationFn: (id: string) => api.director.deleteQtyBreak(id),
    onSuccess: () => invalidateBreaks(),
  });

  const saveCustomMut = useMutation({
    mutationFn: (f: CustomForm) => {
      const priceCents = Math.round(parseFloat(f.unitPrice) * 100);
      if (!priceCents || priceCents <= 0) throw new Error('Enter a valid price');
      const data = { customerId: f.customerId, productId: f.productId, unitPriceCents: priceCents, isActive: f.isActive };
      return f.id
        ? api.director.updateCustomerPricing(f.id, data)
        : api.director.createCustomerPricing(data);
    },
    onSuccess: () => { invalidateCustom(); setCustomModal(false); },
  });

  const deleteCustomMut = useMutation({
    mutationFn: (id: string) => api.director.deleteCustomerPricing(id),
    onSuccess: () => invalidateCustom(),
  });

  const assignTierMut = useMutation({
    mutationFn: ({ accountId, tierId }: { accountId: string; tierId: string | null }) =>
      api.director.assignTier(accountId, { tierId }),
    onSuccess: () => invalidateUsers(),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const productName = (id: string) => {
    const p = products.find((p: any) => p.id === id);
    return p?.name ?? id.slice(0, 12) + '…';
  };
  const tierName = (id: string | null) => {
    if (!id) return 'No tier';
    return tiers.find((t: any) => t.id === id)?.name ?? 'Unknown';
  };
  const userLabel = (userId: string) => {
    const u = wholesaleUsers.find((u: any) => u.id === userId);
    return u?.wholesaleAccount?.companyName ?? u?.name ?? userId.slice(0, 10);
  };
  const customersOnTier = (tierId: string) =>
    wholesaleUsers.filter((u: any) => u.wholesaleAccount?.tierId === tierId).length;

  // ── Action handlers ───────────────────────────────────────────────────────
  const openNewTier  = () => { setTierForm(EMPTY_TIER);  setTierModal(true); };
  const openEditTier = (t: any) => {
    setTierForm({ id: t.id, name: t.name, description: t.description ?? '', status: t.status === 'active' ? 'active' : 'inactive' });
    setTierModal(true);
  };
  const confirmDeleteTier = (t: any) => {
    const count = customersOnTier(t.id);
    const msg = count > 0
      ? `${count} customer${count !== 1 ? 's are' : ' is'} assigned to this tier and will be unassigned.`
      : 'This cannot be undone.';
    Alert.alert(`Delete "${t.name}"?`, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTierMut.mutate({ id: t.id, force: true }) },
    ]);
  };

  const openNewBreak  = () => { setBreakForm(EMPTY_BREAK);  setBreakModal(true); };
  const openEditBreak = (b: any) => {
    setBreakForm({
      id: b.id, productId: b.productId, scope: b.scope ?? 'tier',
      tierId: b.tierId ?? '', customerId: b.customerId ?? '',
      minQty: String(b.minQty),
      unitPrice: b.unitPriceCents ? (b.unitPriceCents / 100).toFixed(2) : '',
      isActive: b.isActive !== false,
    });
    setBreakModal(true);
  };
  const confirmDeleteBreak = (b: any) => {
    Alert.alert('Delete Qty Break?',
      `${productName(b.productId)}: ${b.minQty}+ units → $${(b.unitPriceCents / 100).toFixed(2)}/unit`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteBreakMut.mutate(b.id) },
      ],
    );
  };

  const openNewCustom  = () => { setCustomForm(EMPTY_CUSTOM);  setCustomModal(true); };
  const openEditCustom = (cp: any) => {
    setCustomForm({
      id: cp.id, customerId: cp.customerId, productId: cp.productId,
      unitPrice: cp.unitPriceCents ? (cp.unitPriceCents / 100).toFixed(2) : '',
      isActive: cp.isActive !== false,
    });
    setCustomModal(true);
  };
  const confirmDeleteCustom = (cp: any) => {
    Alert.alert('Delete Custom Price?',
      `${userLabel(cp.customerId)} · ${productName(cp.productId)} · $${(cp.unitPriceCents / 100).toFixed(2)}/unit`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCustomMut.mutate(cp.id) },
      ],
    );
  };

  const handleAssignTier = (accountId: string, tierId: string | null) => {
    Haptics.selectionAsync();
    assignTierMut.mutate({ accountId, tierId });
  };

  // ── Tab renderers ─────────────────────────────────────────────────────────
  function renderTiers() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Wholesale Tiers</Text>
          <Pressable onPress={openNewTier} style={styles.newBtn}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.newBtnText}>New Tier</Text>
          </Pressable>
        </View>
        {tiersLoading ? <ActivityIndicator color={BLUE} style={styles.loader} /> :
         tiers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="layers" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No tiers yet</Text>
            <Text style={styles.emptySub}>Create tiers to group customers, then add pricing rules with Qty Breaks or Custom Pricing.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {tiers.map((t: any) => (
              <View key={t.id} style={styles.card}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.cardTitle}>{t.name}</Text>
                    <StatusBadge status={t.status} />
                  </View>
                  {!!t.description && <Text style={styles.cardSub} numberOfLines={2}>{t.description}</Text>}
                  <Text style={styles.cardMeta}>
                    {customersOnTier(t.id)} customer{customersOnTier(t.id) !== 1 ? 's' : ''} assigned
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => openEditTier(t)} />
                  <IconBtn icon="trash-2" color={RED} bg="#FFF5F5" onPress={() => confirmDeleteTier(t)} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  function renderBreaks() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quantity Breaks</Text>
          <Pressable onPress={openNewBreak} style={styles.newBtn}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.newBtnText}>New Break</Text>
          </Pressable>
        </View>
        {breaksLoading ? <ActivityIndicator color={BLUE} style={styles.loader} /> :
         breaks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="trending-down" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No qty breaks</Text>
            <Text style={styles.emptySub}>Set an explicit unit price that kicks in when a customer orders a minimum quantity of a product.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {breaks.map((b: any) => (
              <View key={b.id} style={styles.card}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{productName(b.productId)}</Text>
                  <Text style={styles.cardSub}>
                    {b.minQty}+ units → ${(b.unitPriceCents / 100).toFixed(2)} each
                  </Text>
                  <Text style={styles.cardMeta}>
                    {b.scope === 'tier' ? `Tier: ${tierName(b.tierId)}` : `Customer: ${userLabel(b.customerId)}`}
                    {!b.isActive && ' · Inactive'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => openEditBreak(b)} />
                  <IconBtn icon="trash-2" color={RED} bg="#FFF5F5" onPress={() => confirmDeleteBreak(b)} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  function renderCustom() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Custom Pricing</Text>
          <Pressable onPress={openNewCustom} style={styles.newBtn}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.newBtnText}>New Price</Text>
          </Pressable>
        </View>
        {customLoading ? <ActivityIndicator color={BLUE} style={styles.loader} /> :
         customPrices.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="user" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No custom prices</Text>
            <Text style={styles.emptySub}>Set a specific per-unit price for a product for an individual wholesale customer.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {customPrices.map((cp: any) => (
              <View key={cp.id} style={styles.card}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{productName(cp.productId)}</Text>
                  <Text style={styles.cardSub}>${(cp.unitPriceCents / 100).toFixed(2)} per unit</Text>
                  <Text style={styles.cardMeta}>
                    {userLabel(cp.customerId)}{!cp.isActive && ' · Inactive'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => openEditCustom(cp)} />
                  <IconBtn icon="trash-2" color={RED} bg="#FFF5F5" onPress={() => confirmDeleteCustom(cp)} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  function renderAssign() {
    return (
      <ScrollView contentContainerStyle={styles.listContent}>
        {wholesaleUsers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="users" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No wholesale customers</Text>
            <Text style={styles.emptySub}>Approved wholesale accounts will appear here for tier assignment.</Text>
          </View>
        ) : wholesaleUsers.map((u: any) => {
          const wa          = u.wholesaleAccount;
          const currentTier = wa?.tierId ?? null;
          return (
            <View key={u.id} style={styles.assignCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{wa?.companyName ?? u.name}</Text>
                  <Text style={styles.cardMeta}>{u.email}</Text>
                </View>
                <View style={[styles.tierBadge, { backgroundColor: currentTier ? '#EBF8FF' : '#F3F4F6' }]}>
                  <Text style={[styles.tierBadgeText, { color: currentTier ? BLUE : MUTED }]}>
                    {tierName(currentTier)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  onPress={() => handleAssignTier(wa.id, null)}
                  style={[styles.assignChip, {
                    backgroundColor: !currentTier ? NAVY : '#F3F4F6',
                    borderColor:     !currentTier ? NAVY : BORDER,
                  }]}
                >
                  <Text style={[styles.assignChipText, { color: !currentTier ? '#fff' : MUTED }]}>No Tier</Text>
                </Pressable>
                {tiers.map((t: any) => {
                  const active = currentTier === t.id;
                  return (
                    <Pressable key={t.id}
                      onPress={() => handleAssignTier(wa.id, t.id)}
                      style={[styles.assignChip, {
                        backgroundColor: active ? BLUE : '#F3F4F6',
                        borderColor:     active ? BLUE : BORDER,
                      }]}
                    >
                      <Text style={[styles.assignChipText, { color: active ? '#fff' : TEXT }]}>{t.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  const tierSaveErr   = (saveTierMut.error  as any)?.message;
  const breakSaveErr  = (saveBreakMut.error as any)?.message;
  const customSaveErr = (saveCustomMut.error as any)?.message;
  const breakFormValid = !!breakForm.productId && !!breakForm.minQty && !!breakForm.unitPrice &&
    (breakForm.scope === 'tier' ? !!breakForm.tierId : !!breakForm.customerId);
  const customFormValid = !!customForm.customerId && !!customForm.productId && !!customForm.unitPrice;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient colors={[NAVY, '#2A3F6F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Pricing Management</Text>
        <Text style={styles.headerSub}>Director-only · tiers, quantity breaks, custom pricing</Text>
      </LinearGradient>

      <View style={[styles.tabBar, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => { setTab(t.id); Haptics.selectionAsync(); }} style={styles.tabItem}>
              <Feather name={t.icon as any} size={15} color={active ? BLUE : MUTED} />
              <Text style={[styles.tabLabel, { color: active ? BLUE : MUTED, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
              {active && <View style={[styles.tabUnderline, { backgroundColor: BLUE }]} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'tiers'  && renderTiers()}
        {tab === 'breaks' && renderBreaks()}
        {tab === 'custom' && renderCustom()}
        {tab === 'assign' && renderAssign()}
      </View>

      {/* ── Tier Modal ── */}
      <Modal visible={tierModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTierModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalHeader
            title={tierForm.id ? 'Edit Tier' : 'New Tier'}
            onCancel={() => setTierModal(false)}
            onSave={() => saveTierMut.mutate(tierForm)}
            saveDisabled={!tierForm.name.trim()}
            saving={saveTierMut.isPending}
          />
          <ScrollView contentContainerStyle={styles.modalContent}>
            {!!tierSaveErr && <ErrBanner msg={tierSaveErr} />}
            <Field label="Tier Name *">
              <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                placeholder="e.g. Gold, Silver, Trade" placeholderTextColor={MUTED}
                value={tierForm.name} onChangeText={(v) => setTierForm((f) => ({ ...f, name: v }))}
                autoFocus autoCapitalize="words" />
            </Field>
            <Field label="Description">
              <TextInput style={[styles.input, styles.textArea, { color: TEXT, borderColor: BORDER }]}
                placeholder="Optional description for this tier" placeholderTextColor={MUTED}
                value={tierForm.description} onChangeText={(v) => setTierForm((f) => ({ ...f, description: v }))}
                multiline numberOfLines={3} textAlignVertical="top" />
            </Field>
            <Field label="Status">
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['active', 'inactive'] as const).map((s) => (
                  <Pressable key={s} onPress={() => setTierForm((f) => ({ ...f, status: s }))}
                    style={[styles.statusChip, {
                      flex: 1,
                      backgroundColor: tierForm.status === s ? (s === 'active' ? '#F0FDF4' : '#FEF9C3') : '#F3F4F6',
                      borderColor:     tierForm.status === s ? (s === 'active' ? GREEN : AMBER) : BORDER,
                    }]}>
                    <Text style={[styles.statusChipText, {
                      color: tierForm.status === s ? (s === 'active' ? '#166534' : '#854D0E') : MUTED,
                    }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <View style={[styles.infoBox, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
              <Feather name="info" size={14} color={BLUE} />
              <Text style={[styles.infoText, { color: '#1E3A5F' }]}>
                Tiers are named groupings only. No automatic discounts are applied. Set prices with Qty Breaks or Custom Pricing.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Qty Break Modal ── */}
      <Modal visible={breakModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBreakModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalHeader
            title={breakForm.id ? 'Edit Qty Break' : 'New Qty Break'}
            onCancel={() => setBreakModal(false)}
            onSave={() => saveBreakMut.mutate(breakForm)}
            saveDisabled={!breakFormValid}
            saving={saveBreakMut.isPending}
          />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!!breakSaveErr && <ErrBanner msg={breakSaveErr} />}
            <Field label="Product *">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {products.map((p: any) => (
                  <Pressable key={p.id} onPress={() => setBreakForm((f) => ({ ...f, productId: p.id }))}
                    style={[styles.pickerChip, {
                      backgroundColor: breakForm.productId === p.id ? BLUE : '#F3F4F6',
                      borderColor:     breakForm.productId === p.id ? BLUE : BORDER,
                    }]}>
                    <Text style={[styles.pickerChipText, { color: breakForm.productId === p.id ? '#fff' : TEXT }]} numberOfLines={1}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Field>
            <Field label="Applies To *">
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {([['tier', 'A Tier', 'layers'], ['customer', 'A Customer', 'user']] as const).map(([s, lbl, ic]) => (
                  <Pressable key={s} onPress={() => setBreakForm((f) => ({ ...f, scope: s as 'tier' | 'customer' }))}
                    style={[styles.scopeChip, { flex: 1, backgroundColor: breakForm.scope === s ? BLUE : '#F3F4F6', borderColor: breakForm.scope === s ? BLUE : BORDER }]}>
                    <Feather name={ic as any} size={14} color={breakForm.scope === s ? '#fff' : MUTED} />
                    <Text style={[styles.scopeChipText, { color: breakForm.scope === s ? '#fff' : TEXT }]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            {breakForm.scope === 'tier' ? (
              <Field label="Tier *">
                {tiers.length === 0
                  ? <Text style={{ color: MUTED, fontSize: 13 }}>No tiers yet — create a tier first.</Text>
                  : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {tiers.map((t: any) => (
                        <Pressable key={t.id} onPress={() => setBreakForm((f) => ({ ...f, tierId: t.id }))}
                          style={[styles.pickerChip, { backgroundColor: breakForm.tierId === t.id ? NAVY : '#F3F4F6', borderColor: breakForm.tierId === t.id ? NAVY : BORDER }]}>
                          <Text style={[styles.pickerChipText, { color: breakForm.tierId === t.id ? '#fff' : TEXT }]}>{t.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )
                }
              </Field>
            ) : (
              <Field label="Customer *">
                {wholesaleUsers.length === 0
                  ? <Text style={{ color: MUTED, fontSize: 13 }}>No approved wholesale customers.</Text>
                  : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {wholesaleUsers.map((u: any) => (
                        <Pressable key={u.id} onPress={() => setBreakForm((f) => ({ ...f, customerId: u.id }))}
                          style={[styles.pickerChip, { backgroundColor: breakForm.customerId === u.id ? NAVY : '#F3F4F6', borderColor: breakForm.customerId === u.id ? NAVY : BORDER }]}>
                          <Text style={[styles.pickerChipText, { color: breakForm.customerId === u.id ? '#fff' : TEXT }]}>
                            {u.wholesaleAccount?.companyName ?? u.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )
                }
              </Field>
            )}
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Field label="Min. Qty *" style={{ flex: 1 }}>
                <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  placeholder="e.g. 24" placeholderTextColor={MUTED} value={breakForm.minQty}
                  onChangeText={(v) => setBreakForm((f) => ({ ...f, minQty: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad" />
              </Field>
              <Field label="Price / Unit (AUD) *" style={{ flex: 1 }}>
                <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  placeholder="e.g. 3.50" placeholderTextColor={MUTED} value={breakForm.unitPrice}
                  onChangeText={(v) => setBreakForm((f) => ({ ...f, unitPrice: v }))}
                  keyboardType="decimal-pad" />
              </Field>
            </View>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Active</Text>
                <Text style={styles.switchSub}>Inactive breaks are ignored by the pricing engine</Text>
              </View>
              <Switch value={breakForm.isActive} onValueChange={(v) => setBreakForm((f) => ({ ...f, isActive: v }))} trackColor={{ true: BLUE }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Custom Pricing Modal ── */}
      <Modal visible={customModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCustomModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalHeader
            title={customForm.id ? 'Edit Custom Price' : 'New Custom Price'}
            onCancel={() => setCustomModal(false)}
            onSave={() => saveCustomMut.mutate(customForm)}
            saveDisabled={!customFormValid}
            saving={saveCustomMut.isPending}
          />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!!customSaveErr && <ErrBanner msg={customSaveErr} />}
            <Field label="Customer *">
              {wholesaleUsers.length === 0
                ? <Text style={{ color: MUTED, fontSize: 13 }}>No approved wholesale customers.</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {wholesaleUsers.map((u: any) => (
                      <Pressable key={u.id} onPress={() => setCustomForm((f) => ({ ...f, customerId: u.id }))}
                        style={[styles.pickerChip, { backgroundColor: customForm.customerId === u.id ? NAVY : '#F3F4F6', borderColor: customForm.customerId === u.id ? NAVY : BORDER }]}>
                        <Text style={[styles.pickerChipText, { color: customForm.customerId === u.id ? '#fff' : TEXT }]}>
                          {u.wholesaleAccount?.companyName ?? u.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )
              }
            </Field>
            <Field label="Product *">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {products.map((p: any) => (
                  <Pressable key={p.id} onPress={() => setCustomForm((f) => ({ ...f, productId: p.id }))}
                    style={[styles.pickerChip, { backgroundColor: customForm.productId === p.id ? BLUE : '#F3F4F6', borderColor: customForm.productId === p.id ? BLUE : BORDER }]}>
                    <Text style={[styles.pickerChipText, { color: customForm.productId === p.id ? '#fff' : TEXT }]} numberOfLines={1}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Field>
            <Field label="Price per Unit (AUD) *">
              <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                placeholder="e.g. 4.20" placeholderTextColor={MUTED} value={customForm.unitPrice}
                onChangeText={(v) => setCustomForm((f) => ({ ...f, unitPrice: v }))}
                keyboardType="decimal-pad" />
            </Field>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Active</Text>
                <Text style={styles.switchSub}>Inactive prices are not applied at checkout</Text>
              </View>
              <Switch value={customForm.isActive} onValueChange={(v) => setCustomForm((f) => ({ ...f, isActive: v }))} trackColor={{ true: BLUE }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────
function ModalHeader({ title, onCancel, onSave, saveDisabled, saving }: {
  title: string; onCancel: () => void; onSave: () => void; saveDisabled: boolean; saving: boolean;
}) {
  return (
    <View style={[mhStyle.row, { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }]}>
      <Pressable onPress={onCancel}>
        <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
      </Pressable>
      <Text style={{ fontSize: 17, fontWeight: '700', color: '#1C1C1E' }}>{title}</Text>
      <Pressable onPress={onSave} disabled={saveDisabled || saving}>
        <Text style={{ color: saveDisabled ? '#8E8E93' : '#1493FF', fontSize: 15, fontWeight: '700' }}>
          {saving ? 'Saving…' : 'Save'}
        </Text>
      </Pressable>
    </View>
  );
}
const mhStyle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
});

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>{label}</Text>
      {children}
    </View>
  );
}
function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: active ? '#F0FDF4' : '#FEF9C3' }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#166534' : '#854D0E' }}>
        {active ? 'Active' : 'Inactive'}
      </Text>
    </View>
  );
}
function IconBtn({ icon, color, bg, onPress }: { icon: string; color: string; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Feather name={icon as any} size={15} color={color} />
    </Pressable>
  );
}
function ErrBanner({ msg }: { msg: string }) {
  return (
    <View style={{ backgroundColor: '#FFF5F5', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
      <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '500' }}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:        { paddingHorizontal: 20, paddingBottom: 16, gap: 4 },
  headerTitle:   { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub:     { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '400' },
  tabBar:        { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem:       { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, position: 'relative' },
  tabLabel:      { fontSize: 11, letterSpacing: 0.3 },
  tabUnderline:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitle:  { fontSize: 18, fontWeight: '700', color: TEXT },
  newBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: BLUE },
  newBtnText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  listContent:   { padding: 16, gap: 10, paddingBottom: 32 },
  loader:        { marginTop: 40 },
  card:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER },
  assignCard:    { padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: CARD, borderColor: BORDER },
  cardTitle:     { fontSize: 15, fontWeight: '600', color: TEXT },
  cardSub:       { fontSize: 13, fontWeight: '400', color: MUTED },
  cardMeta:      { fontSize: 12, fontWeight: '400', color: MUTED },
  cardActions:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tierBadge:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tierBadgeText: { fontSize: 13, fontWeight: '600' },
  assignChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  assignChipText:{ fontSize: 13, fontWeight: '600' },
  emptyWrap:     { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, marginTop: 60 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: TEXT, textAlign: 'center' },
  emptySub:      { fontSize: 13, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 19 },
  modalContent:  { padding: 20, gap: 18 },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: CARD },
  textArea:      { height: 80 },
  statusChip:    { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  statusChipText:{ fontSize: 14, fontWeight: '600' },
  scopeChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  scopeChipText: { fontSize: 14, fontWeight: '600' },
  pickerChip:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, maxWidth: 180 },
  pickerChipText:{ fontSize: 13, fontWeight: '500' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel:   { fontSize: 14, fontWeight: '600', color: TEXT },
  switchSub:     { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  infoBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  infoText:      { flex: 1, fontSize: 13, fontWeight: '400', lineHeight: 19 },
});
