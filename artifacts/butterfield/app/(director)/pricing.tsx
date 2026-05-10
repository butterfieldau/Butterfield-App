import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const NAVY   = '#1A2B4A';
const RED    = '#F40009';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

type Tab = 'tiers' | 'breaks' | 'custom' | 'assign';

interface TierForm {
  id?: string;
  name: string;
  description: string;
  status: 'active' | 'hidden' | 'archived';
  defaultDiscountPct: string;
  minOrderCents: string;
  minOrderQty: string;
  paymentTerms: string;
  cutOffTime: string;
  leadTimeDays: string;
  freeDeliveryThresholdCents: string;
  productAccessRule: 'all' | 'tiers' | 'whitelist' | 'category';
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  requiresApproval: boolean;
  notes: string;
  internalNotes: string;
}

const EMPTY_TIER: TierForm = {
  name: '',
  description: '',
  status: 'active',
  defaultDiscountPct: '0',
  minOrderCents: '0',
  minOrderQty: '0',
  paymentTerms: 'net14',
  cutOffTime: '12:00',
  leadTimeDays: '2',
  freeDeliveryThresholdCents: '',
  productAccessRule: 'all',
  deliveryEnabled: true,
  pickupEnabled: true,
  requiresApproval: false,
  notes: '',
  internalNotes: '',
};

function fmtAUD(cents: number | null | undefined): string {
  if (!cents && cents !== 0) return '—';
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_COLOR: Record<string, string> = {
  active: GREEN, hidden: AMBER, archived: MUTED,
};

const PAYMENT_TERMS = [
  { v: 'on_order', l: 'Invoice on order' },
  { v: 'net7',     l: '7 days' },
  { v: 'net14',    l: '14 days' },
  { v: 'net30',    l: '30 days' },
  { v: 'custom',   l: 'Custom' },
];

export default function PricingScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('tiers');

  // ── Tiers ─────────────────────────────────────────────────────────────────
  const tiersQ = useQuery({
    queryKey: ['director', 'tiers'],
    queryFn: () => api.director.tiers(),
  });
  const tiers = tiersQ.data?.data ?? [];

  const breaksQ = useQuery({
    queryKey: ['director', 'qtyBreaks'],
    queryFn: () => api.director.qtyBreaks(),
  });
  const breaks = breaksQ.data?.data ?? [];

  const customQ = useQuery({
    queryKey: ['director', 'customerPricing'],
    queryFn: () => api.director.customerPricing(),
  });
  const customRows = customQ.data?.data ?? [];

  const productsQ = useQuery({
    queryKey: ['director', 'products'],
    queryFn: () => api.director.products(),
  });
  const products = productsQ.data?.data ?? [];

  const usersQ = useQuery({
    queryKey: ['director', 'users'],
    queryFn: () => api.director.users(),
  });
  const wholesaleUsers = (usersQ.data?.data ?? []).filter((u: any) => u.role === 'wholesale' && u.wholesaleAccount);

  const productMap = useMemo(() => Object.fromEntries(products.map((p: any) => [p.id, p])), [products]);
  const tierMap    = useMemo(() => Object.fromEntries(tiers.map((t: any) => [t.id, t])), [tiers]);
  const userMap    = useMemo(() => Object.fromEntries(wholesaleUsers.map((u: any) => [u.id, u])), [wholesaleUsers]);

  // ── Tier modal ───────────────────────────────────────────────────────────
  const [tierModal, setTierModal] = useState(false);
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_TIER);

  const openNewTier = () => { setTierForm(EMPTY_TIER); setTierModal(true); };
  const openEditTier = (t: any) => {
    setTierForm({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      status: t.status,
      defaultDiscountPct: String(t.defaultDiscountPct ?? 0),
      minOrderCents: String(((t.minOrderCents ?? 0) / 100).toFixed(2)),
      minOrderQty: String(t.minOrderQty ?? 0),
      paymentTerms: t.paymentTerms ?? 'net14',
      cutOffTime: t.cutOffTime ?? '12:00',
      leadTimeDays: String(t.leadTimeDays ?? 2),
      freeDeliveryThresholdCents: t.freeDeliveryThresholdCents != null ? String((t.freeDeliveryThresholdCents / 100).toFixed(2)) : '',
      productAccessRule: t.productAccessRule ?? 'all',
      deliveryEnabled: t.deliveryEnabled ?? true,
      pickupEnabled: t.pickupEnabled ?? true,
      requiresApproval: t.requiresApproval ?? false,
      notes: t.notes ?? '',
      internalNotes: t.internalNotes ?? '',
    });
    setTierModal(true);
  };

  const saveTier = useMutation({
    mutationFn: async () => {
      const payload = {
        name: tierForm.name.trim(),
        description: tierForm.description,
        status: tierForm.status,
        defaultDiscountPct: parseInt(tierForm.defaultDiscountPct) || 0,
        minOrderCents: Math.round((parseFloat(tierForm.minOrderCents) || 0) * 100),
        minOrderQty: parseInt(tierForm.minOrderQty) || 0,
        paymentTerms: tierForm.paymentTerms,
        cutOffTime: tierForm.cutOffTime,
        leadTimeDays: parseInt(tierForm.leadTimeDays) || 2,
        freeDeliveryThresholdCents: tierForm.freeDeliveryThresholdCents ? Math.round(parseFloat(tierForm.freeDeliveryThresholdCents) * 100) : null,
        productAccessRule: tierForm.productAccessRule,
        deliveryEnabled: tierForm.deliveryEnabled,
        pickupEnabled: tierForm.pickupEnabled,
        requiresApproval: tierForm.requiresApproval,
        notes: tierForm.notes,
        internalNotes: tierForm.internalNotes,
      };
      if (tierForm.id) return api.director.updateTier(tierForm.id, payload);
      return api.director.createTier(payload);
    },
    onSuccess: () => {
      setTierModal(false);
      qc.invalidateQueries({ queryKey: ['director', 'tiers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Could not save tier', e.message),
  });

  const archiveTier = useMutation({
    mutationFn: (id: string) => api.director.archiveTier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director', 'tiers'] }),
  });

  // ── Quantity break modal ─────────────────────────────────────────────────
  const [breakModal, setBreakModal] = useState(false);
  const [breakForm, setBreakForm] = useState<any>({
    productId: '', scope: 'tier', tierId: '', customerId: '',
    minQty: '10', maxQty: '', unitPriceCents: '', discountPct: '', notes: '',
  });

  const saveBreak = useMutation({
    mutationFn: async () => {
      const b = breakForm;
      if (!b.productId) throw new Error('Choose a product');
      if (b.scope === 'tier' && !b.tierId) throw new Error('Choose a tier');
      if (b.scope === 'customer' && !b.customerId) throw new Error('Choose a customer');
      const payload: any = {
        productId: b.productId,
        scope: b.scope,
        tierId: b.scope === 'tier' ? b.tierId : null,
        customerId: b.scope === 'customer' ? b.customerId : null,
        minQty: parseInt(b.minQty) || 1,
        maxQty: b.maxQty ? parseInt(b.maxQty) : null,
        unitPriceCents: b.unitPriceCents ? Math.round(parseFloat(b.unitPriceCents) * 100) : null,
        discountPct: b.discountPct ? parseInt(b.discountPct) : null,
        notes: b.notes,
      };
      return api.director.createQtyBreak(payload);
    },
    onSuccess: () => {
      setBreakModal(false);
      qc.invalidateQueries({ queryKey: ['director', 'qtyBreaks'] });
    },
    onError: (e: any) => Alert.alert('Could not save price break', e.message),
  });

  const deleteBreak = useMutation({
    mutationFn: (id: string) => api.director.deleteQtyBreak(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director', 'qtyBreaks'] }),
  });

  // ── Custom customer pricing modal ────────────────────────────────────────
  const [customModal, setCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState<any>({
    customerId: '', productId: '', category: '',
    unitPriceCents: '', discountPct: '', notes: '',
  });

  const saveCustom = useMutation({
    mutationFn: async () => {
      const f = customForm;
      if (!f.customerId) throw new Error('Choose a customer');
      if (!f.productId && !f.category) throw new Error('Choose a product or category');
      return api.director.createCustomerPricing({
        customerId: f.customerId,
        productId: f.productId || null,
        category: f.category || null,
        unitPriceCents: f.unitPriceCents ? Math.round(parseFloat(f.unitPriceCents) * 100) : null,
        discountPct: f.discountPct ? parseInt(f.discountPct) : null,
        notes: f.notes,
      });
    },
    onSuccess: () => {
      setCustomModal(false);
      qc.invalidateQueries({ queryKey: ['director', 'customerPricing'] });
    },
    onError: (e: any) => Alert.alert('Could not save custom price', e.message),
  });

  const deleteCustom = useMutation({
    mutationFn: (id: string) => api.director.deleteCustomerPricing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director', 'customerPricing'] }),
  });

  // ── Assign tier to customer ──────────────────────────────────────────────
  const assignTier = useMutation({
    mutationFn: (data: { accountId: string; tierId: string | null; customPricingEnabled?: boolean }) =>
      api.director.assignTier(data.accountId, { tierId: data.tierId, customPricingEnabled: data.customPricingEnabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director', 'users'] }),
    onError: (e: any) => Alert.alert('Could not assign tier', e.message),
  });

  const suspendCustomer = useMutation({
    mutationFn: (data: { accountId: string; isSuspended: boolean; reason?: string }) =>
      api.director.suspendWholesale(data.accountId, { isSuspended: data.isSuspended, suspendedReason: data.reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director', 'users'] }),
    onError: (e: any) => Alert.alert('Could not update suspension', e.message),
  });

  const refresh = () => {
    tiersQ.refetch(); breaksQ.refetch(); customQ.refetch(); usersQ.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Tab strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={[s.tabBar, { flex: 1 }]}>
          {([
            { k: 'tiers',  label: 'Tiers',      icon: 'layers' },
            { k: 'breaks', label: 'Qty Breaks',  icon: 'trending-down' },
            { k: 'custom', label: 'Custom',      icon: 'user-check' },
            { k: 'assign', label: 'Assign',      icon: 'briefcase' },
          ] as { k: Tab; label: string; icon: string }[]).map(t => (
            <Pressable key={t.k} onPress={() => { Haptics.selectionAsync(); setTab(t.k); }}
              style={[s.tab, tab === t.k && s.tabActive]}>
              <Feather name={t.icon as any} size={14} color={tab === t.k ? BLUE : MUTED} />
              <Text style={[s.tabText, { color: tab === t.k ? BLUE : MUTED, fontFamily: tab === t.k ? 'Inter_700Bold' : 'Inter_500Medium' }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={tiersQ.isFetching || breaksQ.isFetching || customQ.isFetching} onRefresh={refresh} />}
      >
        {/* ─────────────────────────── TIERS ─────────────────────────── */}
        {tab === 'tiers' && (
          <>
            <View style={s.headerRow}>
              <Text style={s.h1}>Pricing Tiers</Text>
              <Pressable onPress={openNewTier} style={s.primaryBtn}>
                <Feather name="plus" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>New tier</Text>
              </Pressable>
            </View>

            {tiersQ.isLoading ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} /> :
             tiers.length === 0 ? (
              <View style={s.empty}>
                <Feather name="layers" size={28} color={MUTED} />
                <Text style={s.emptyText}>No tiers yet. Create Bronze, Silver, Gold…</Text>
              </View>
            ) : tiers.map((t: any) => (
              <View key={t.id} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.cardTitle}>{t.name}</Text>
                      <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[t.status] ?? MUTED) + '22' }]}>
                        <Text style={[s.statusPillText, { color: STATUS_COLOR[t.status] ?? MUTED }]}>{t.status?.toUpperCase()}</Text>
                      </View>
                    </View>
                    {!!t.description && <Text style={s.cardSub}>{t.description}</Text>}
                  </View>
                  <Text style={s.bigDiscount}>{t.defaultDiscountPct ?? 0}%</Text>
                </View>

                <View style={s.metaGrid}>
                  <Meta label="Min order"   value={fmtAUD(t.minOrderCents)} />
                  <Meta label="Min qty"     value={String(t.minOrderQty || '—')} />
                  <Meta label="Payment"     value={(PAYMENT_TERMS.find(p => p.v === t.paymentTerms)?.l) ?? t.paymentTerms} />
                  <Meta label="Lead time"   value={`${t.leadTimeDays}d`} />
                  <Meta label="Cut-off"     value={t.cutOffTime} />
                  <Meta label="Free deliv." value={t.freeDeliveryThresholdCents ? fmtAUD(t.freeDeliveryThresholdCents) : '—'} />
                </View>

                <View style={s.cardActions}>
                  <Pressable onPress={() => openEditTier(t)} style={s.linkBtn}>
                    <Feather name="edit-2" size={13} color={BLUE} />
                    <Text style={s.linkBtnText}>Edit</Text>
                  </Pressable>
                  {t.status !== 'archived' && (
                    <Pressable
                      onPress={() => Alert.alert('Archive tier?', `${t.name} will be hidden from new assignments.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Archive', style: 'destructive', onPress: () => archiveTier.mutate(t.id) },
                      ])}
                      style={s.linkBtn}>
                      <Feather name="archive" size={13} color={RED} />
                      <Text style={[s.linkBtnText, { color: RED }]}>Archive</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ─────────────────────────── QTY BREAKS ───────────────────── */}
        {tab === 'breaks' && (
          <>
            <View style={s.headerRow}>
              <Text style={s.h1}>Quantity Price Breaks</Text>
              <Pressable
                onPress={() => {
                  setBreakForm({ productId: products[0]?.id ?? '', scope: 'tier', tierId: tiers[0]?.id ?? '', customerId: '',
                    minQty: '10', maxQty: '', unitPriceCents: '', discountPct: '', notes: '' });
                  setBreakModal(true);
                }}
                style={s.primaryBtn}>
                <Feather name="plus" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>New break</Text>
              </Pressable>
            </View>

            {breaksQ.isLoading ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} /> :
             breaks.length === 0 ? (
              <View style={s.empty}>
                <Feather name="trending-down" size={28} color={MUTED} />
                <Text style={s.emptyText}>No quantity breaks. Add bulk pricing to specific products.</Text>
              </View>
            ) : breaks.map((b: any) => {
              const prod = productMap[b.productId];
              const target = b.scope === 'tier' ? tierMap[b.tierId]?.name : userMap[b.customerId]?.name;
              return (
                <View key={b.id} style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{prod?.name ?? '(deleted product)'}</Text>
                      <Text style={s.cardSub}>
                        {b.scope === 'tier' ? `Tier: ${target ?? '—'}` : `Customer: ${target ?? '—'}`}
                        {' · '}
                        {b.minQty}{b.maxQty ? `–${b.maxQty}` : '+'} units
                      </Text>
                    </View>
                    <Text style={s.bigPrice}>
                      {b.unitPriceCents ? fmtAUD(b.unitPriceCents) : `${b.discountPct}%`}
                    </Text>
                  </View>
                  <View style={s.cardActions}>
                    <View style={[s.statusPill, { backgroundColor: (b.isActive ? GREEN : MUTED) + '22' }]}>
                      <Text style={[s.statusPillText, { color: b.isActive ? GREEN : MUTED }]}>{b.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
                    </View>
                    <Pressable onPress={() => deleteBreak.mutate(b.id)} style={s.linkBtn}>
                      <Feather name="trash-2" size={13} color={RED} />
                      <Text style={[s.linkBtnText, { color: RED }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ─────────────────────────── CUSTOM PRICING ───────────────── */}
        {tab === 'custom' && (
          <>
            <View style={s.headerRow}>
              <Text style={s.h1}>Customer Custom Pricing</Text>
              <Pressable
                onPress={() => {
                  setCustomForm({ customerId: wholesaleUsers[0]?.id ?? '', productId: '', category: '',
                    unitPriceCents: '', discountPct: '', notes: '' });
                  setCustomModal(true);
                }}
                style={s.primaryBtn}>
                <Feather name="plus" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>New custom price</Text>
              </Pressable>
            </View>
            <Text style={s.helper}>Customers must have <Text style={{ fontFamily: 'Inter_700Bold' }}>custom pricing enabled</Text> in the Assign tab for these to apply.</Text>

            {customQ.isLoading ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} /> :
             customRows.length === 0 ? (
              <View style={s.empty}>
                <Feather name="user-check" size={28} color={MUTED} />
                <Text style={s.emptyText}>No custom prices yet.</Text>
              </View>
            ) : customRows.map((c: any) => (
              <View key={c.id} style={s.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{userMap[c.customerId]?.name ?? '(deleted user)'}</Text>
                    <Text style={s.cardSub}>
                      {c.productId ? `Product: ${productMap[c.productId]?.name ?? '?'}` : `Category: ${c.category}`}
                    </Text>
                  </View>
                  <Text style={s.bigPrice}>
                    {c.unitPriceCents ? fmtAUD(c.unitPriceCents) : `${c.discountPct}%`}
                  </Text>
                </View>
                <View style={s.cardActions}>
                  <Pressable onPress={() => deleteCustom.mutate(c.id)} style={s.linkBtn}>
                    <Feather name="trash-2" size={13} color={RED} />
                    <Text style={[s.linkBtnText, { color: RED }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ─────────────────────────── ASSIGN ──────────────────────── */}
        {tab === 'assign' && (
          <>
            <Text style={s.h1}>Assign Tiers to Wholesale Customers</Text>
            <Text style={s.helper}>Pick a tier for each customer, or enable Custom pricing for fully bespoke.</Text>

            {usersQ.isLoading ? <ActivityIndicator color={BLUE} style={{ marginTop: 40 }} /> :
             wholesaleUsers.length === 0 ? (
              <View style={s.empty}>
                <Feather name="briefcase" size={28} color={MUTED} />
                <Text style={s.emptyText}>No wholesale customers yet.</Text>
              </View>
            ) : wholesaleUsers.map((u: any) => {
              const acct = u.wholesaleAccount;
              const currentTier = tiers.find((t: any) => t.id === acct.tierId);
              return (
                <View key={u.id} style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{acct.companyName}</Text>
                      <Text style={s.cardSub}>{u.name} · {u.email}</Text>
                    </View>
                    {acct.isSuspended && (
                      <View style={[s.statusPill, { backgroundColor: RED + '22' }]}>
                        <Text style={[s.statusPillText, { color: RED }]}>SUSPENDED</Text>
                      </View>
                    )}
                  </View>

                  <Text style={s.fieldLabel}>Tier</Text>
                  <View style={s.chipRow}>
                    <Pressable
                      onPress={() => assignTier.mutate({ accountId: acct.id, tierId: null })}
                      style={[s.tierChip, !acct.tierId && s.tierChipActive]}
                    >
                      <Text style={[s.tierChipText, !acct.tierId && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>None</Text>
                    </Pressable>
                    {tiers.filter((t: any) => t.status !== 'archived').map((t: any) => {
                      const sel = acct.tierId === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => assignTier.mutate({ accountId: acct.id, tierId: t.id })}
                          style={[s.tierChip, sel && s.tierChipActive]}
                        >
                          <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{t.name}</Text>
                          <Text style={s.tierChipPct}>{t.defaultDiscountPct}%</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={s.toggleRow}>
                    <Text style={s.toggleLabel}>Custom pricing enabled</Text>
                    <Switch
                      value={acct.customPricingEnabled}
                      onValueChange={(v) => assignTier.mutate({ accountId: acct.id, tierId: null, customPricingEnabled: v })}
                      trackColor={{ true: BLUE + '99', false: BORDER }}
                      thumbColor={acct.customPricingEnabled ? BLUE : '#fff'}
                    />
                  </View>

                  <View style={s.toggleRow}>
                    <Text style={s.toggleLabel}>Suspended</Text>
                    <Switch
                      value={acct.isSuspended}
                      onValueChange={(v) => suspendCustomer.mutate({
                        accountId: acct.id,
                        isSuspended: v,
                        reason: v ? 'Suspended by Director' : undefined,
                      })}
                      trackColor={{ true: RED + '99', false: BORDER }}
                      thumbColor={acct.isSuspended ? RED : '#fff'}
                    />
                  </View>

                  {currentTier && (
                    <Text style={s.tierSummary}>
                      Currently on <Text style={{ fontFamily: 'Inter_700Bold' }}>{currentTier.name}</Text> — {currentTier.defaultDiscountPct}% off, min order {fmtAUD(currentTier.minOrderCents)}
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ───────────────── TIER MODAL ──────────────── */}
      <Modal visible={tierModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTierModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BG }}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setTierModal(false)}><Text style={s.modalCancel}>Cancel</Text></Pressable>
            <Text style={s.modalTitle}>{tierForm.id ? 'Edit Tier' : 'Create Tier'}</Text>
            <Pressable onPress={() => saveTier.mutate()} disabled={saveTier.isPending || !tierForm.name.trim()}>
              <Text style={[s.modalSave, (!tierForm.name.trim() || saveTier.isPending) && { opacity: 0.4 }]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
            <Field label="Tier name *" value={tierForm.name} onChangeText={(v) => setTierForm({ ...tierForm, name: v })} placeholder="e.g. Gold" />
            <Field label="Description" value={tierForm.description} onChangeText={(v) => setTierForm({ ...tierForm, description: v })} multiline placeholder="What this tier offers..." />

            <Text style={s.fieldLabel}>Status</Text>
            <View style={s.chipRow}>
              {(['active', 'hidden', 'archived'] as const).map(st => (
                <Pressable key={st} onPress={() => setTierForm({ ...tierForm, status: st })}
                  style={[s.tierChip, tierForm.status === st && s.tierChipActive]}>
                  <Text style={[s.tierChipText, tierForm.status === st && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{st.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Default discount %" value={tierForm.defaultDiscountPct} onChangeText={(v) => setTierForm({ ...tierForm, defaultDiscountPct: v })} keyboardType="number-pad" />
              <Field flex label="Lead time (days)" value={tierForm.leadTimeDays} onChangeText={(v) => setTierForm({ ...tierForm, leadTimeDays: v })} keyboardType="number-pad" />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Min order ($)" value={tierForm.minOrderCents} onChangeText={(v) => setTierForm({ ...tierForm, minOrderCents: v })} keyboardType="decimal-pad" placeholder="0.00" />
              <Field flex label="Min order qty" value={tierForm.minOrderQty} onChangeText={(v) => setTierForm({ ...tierForm, minOrderQty: v })} keyboardType="number-pad" />
            </View>

            <Text style={s.fieldLabel}>Payment terms</Text>
            <View style={s.chipRow}>
              {PAYMENT_TERMS.map(p => (
                <Pressable key={p.v} onPress={() => setTierForm({ ...tierForm, paymentTerms: p.v })}
                  style={[s.tierChip, tierForm.paymentTerms === p.v && s.tierChipActive]}>
                  <Text style={[s.tierChipText, tierForm.paymentTerms === p.v && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{p.l}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Cut-off time" value={tierForm.cutOffTime} onChangeText={(v) => setTierForm({ ...tierForm, cutOffTime: v })} placeholder="12:00" />
              <Field flex label="Free delivery threshold ($)" value={tierForm.freeDeliveryThresholdCents} onChangeText={(v) => setTierForm({ ...tierForm, freeDeliveryThresholdCents: v })} keyboardType="decimal-pad" placeholder="0.00" />
            </View>

            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Delivery enabled</Text>
              <Switch value={tierForm.deliveryEnabled} onValueChange={(v) => setTierForm({ ...tierForm, deliveryEnabled: v })} trackColor={{ true: BLUE + '99', false: BORDER }} thumbColor={tierForm.deliveryEnabled ? BLUE : '#fff'} />
            </View>
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Pickup enabled</Text>
              <Switch value={tierForm.pickupEnabled} onValueChange={(v) => setTierForm({ ...tierForm, pickupEnabled: v })} trackColor={{ true: BLUE + '99', false: BORDER }} thumbColor={tierForm.pickupEnabled ? BLUE : '#fff'} />
            </View>
            <View style={s.toggleRow}>
              <Text style={s.toggleLabel}>Requires approval per order</Text>
              <Switch value={tierForm.requiresApproval} onValueChange={(v) => setTierForm({ ...tierForm, requiresApproval: v })} trackColor={{ true: AMBER + '99', false: BORDER }} thumbColor={tierForm.requiresApproval ? AMBER : '#fff'} />
            </View>

            <Field label="Customer-facing notes" value={tierForm.notes} onChangeText={(v) => setTierForm({ ...tierForm, notes: v })} multiline />
            <Field label="Internal Director notes" value={tierForm.internalNotes} onChangeText={(v) => setTierForm({ ...tierForm, internalNotes: v })} multiline />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ───────────────── BREAK MODAL ─────────────── */}
      <Modal visible={breakModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBreakModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BG }}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setBreakModal(false)}><Text style={s.modalCancel}>Cancel</Text></Pressable>
            <Text style={s.modalTitle}>New Quantity Break</Text>
            <Pressable onPress={() => saveBreak.mutate()} disabled={saveBreak.isPending}>
              <Text style={[s.modalSave, saveBreak.isPending && { opacity: 0.4 }]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
            <Text style={s.fieldLabel}>Product</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={s.chipRow}>
                {products.map((p: any) => {
                  const sel = breakForm.productId === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => setBreakForm({ ...breakForm, productId: p.id })}
                      style={[s.tierChip, sel && s.tierChipActive]}>
                      <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Scope</Text>
            <View style={s.chipRow}>
              {(['tier', 'customer'] as const).map(sc => (
                <Pressable key={sc} onPress={() => setBreakForm({ ...breakForm, scope: sc })}
                  style={[s.tierChip, breakForm.scope === sc && s.tierChipActive]}>
                  <Text style={[s.tierChipText, breakForm.scope === sc && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{sc === 'tier' ? 'Tier-wide' : 'Specific customer'}</Text>
                </Pressable>
              ))}
            </View>

            {breakForm.scope === 'tier' ? (
              <>
                <Text style={s.fieldLabel}>Tier</Text>
                <View style={s.chipRow}>
                  {tiers.map((t: any) => {
                    const sel = breakForm.tierId === t.id;
                    return (
                      <Pressable key={t.id} onPress={() => setBreakForm({ ...breakForm, tierId: t.id })}
                        style={[s.tierChip, sel && s.tierChipActive]}>
                        <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{t.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text style={s.fieldLabel}>Customer</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={s.chipRow}>
                    {wholesaleUsers.map((u: any) => {
                      const sel = breakForm.customerId === u.id;
                      return (
                        <Pressable key={u.id} onPress={() => setBreakForm({ ...breakForm, customerId: u.id })}
                          style={[s.tierChip, sel && s.tierChipActive]}>
                          <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{u.wholesaleAccount?.companyName ?? u.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Min qty *" value={breakForm.minQty} onChangeText={(v) => setBreakForm({ ...breakForm, minQty: v })} keyboardType="number-pad" />
              <Field flex label="Max qty (optional)" value={breakForm.maxQty} onChangeText={(v) => setBreakForm({ ...breakForm, maxQty: v })} keyboardType="number-pad" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Unit price (AUD)" value={breakForm.unitPriceCents} onChangeText={(v) => setBreakForm({ ...breakForm, unitPriceCents: v })} keyboardType="decimal-pad" placeholder="3.50" />
              <Field flex label="…or discount %" value={breakForm.discountPct} onChangeText={(v) => setBreakForm({ ...breakForm, discountPct: v })} keyboardType="number-pad" />
            </View>
            <Field label="Note (internal)" value={breakForm.notes} onChangeText={(v) => setBreakForm({ ...breakForm, notes: v })} multiline />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ───────────────── CUSTOM MODAL ────────────── */}
      <Modal visible={customModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCustomModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: BG }}>
          <View style={s.modalHeader}>
            <Pressable onPress={() => setCustomModal(false)}><Text style={s.modalCancel}>Cancel</Text></Pressable>
            <Text style={s.modalTitle}>Custom Customer Price</Text>
            <Pressable onPress={() => saveCustom.mutate()} disabled={saveCustom.isPending}>
              <Text style={[s.modalSave, saveCustom.isPending && { opacity: 0.4 }]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 64 }}>
            <Text style={s.fieldLabel}>Customer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={s.chipRow}>
                {wholesaleUsers.map((u: any) => {
                  const sel = customForm.customerId === u.id;
                  return (
                    <Pressable key={u.id} onPress={() => setCustomForm({ ...customForm, customerId: u.id })}
                      style={[s.tierChip, sel && s.tierChipActive]}>
                      <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{u.wholesaleAccount?.companyName ?? u.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Apply to product (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={s.chipRow}>
                <Pressable onPress={() => setCustomForm({ ...customForm, productId: '' })}
                  style={[s.tierChip, !customForm.productId && s.tierChipActive]}>
                  <Text style={[s.tierChipText, !customForm.productId && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>None</Text>
                </Pressable>
                {products.map((p: any) => {
                  const sel = customForm.productId === p.id;
                  return (
                    <Pressable key={p.id} onPress={() => setCustomForm({ ...customForm, productId: p.id, category: '' })}
                      style={[s.tierChip, sel && s.tierChipActive]}>
                      <Text style={[s.tierChipText, sel && { color: BLUE, fontFamily: 'Inter_700Bold' }]}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {!customForm.productId && (
              <Field label="…or category" value={customForm.category} onChangeText={(v) => setCustomForm({ ...customForm, category: v })} placeholder="e.g. cookies" />
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field flex label="Unit price (AUD)" value={customForm.unitPriceCents} onChangeText={(v) => setCustomForm({ ...customForm, unitPriceCents: v })} keyboardType="decimal-pad" placeholder="2.75" />
              <Field flex label="…or discount %" value={customForm.discountPct} onChangeText={(v) => setCustomForm({ ...customForm, discountPct: v })} keyboardType="number-pad" />
            </View>
            <Field label="Note" value={customForm.notes} onChangeText={(v) => setCustomForm({ ...customForm, notes: v })} multiline />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Reusable subcomponents ─────────────────────────────────────────────────

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: '30%' }}>
      <Text style={{ fontFamily: 'Inter_500Medium', color: MUTED, fontSize: 10, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontFamily: 'Inter_600SemiBold', color: TEXT, fontSize: 13, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, multiline, keyboardType, flex, hint,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean; keyboardType?: any; flex?: boolean; hint?: string;
}) {
  return (
    <View style={{ marginBottom: 12, flex: flex ? 1 : undefined }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[s.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
      />
      {hint ? <Text style={{ fontFamily: 'Inter_400Regular', color: MUTED, fontSize: 11, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  tabBar:        { flexDirection: 'row', backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: BLUE },
  tabText:       { fontSize: 12 },

  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  h1:            { fontFamily: 'Inter_700Bold', fontSize: 20, color: TEXT },
  helper:        { fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 18 },

  primaryBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  primaryBtnText:{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 },

  card:          { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER, gap: 10 },
  cardTitle:     { fontFamily: 'Inter_700Bold', fontSize: 16, color: TEXT },
  cardSub:       { fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED, marginTop: 2 },
  bigDiscount:   { fontFamily: 'Inter_700Bold', fontSize: 22, color: BLUE },
  bigPrice:      { fontFamily: 'Inter_700Bold', fontSize: 18, color: BLUE },

  metaGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  cardActions:   { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4 },
  linkBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnText:   { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: BLUE },

  statusPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillText:{ fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },

  empty:         { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText:     { fontFamily: 'Inter_400Regular', fontSize: 13, color: MUTED, textAlign: 'center' },

  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD },
  modalTitle:    { fontFamily: 'Inter_700Bold', fontSize: 16, color: TEXT },
  modalCancel:   { fontFamily: 'Inter_500Medium', fontSize: 14, color: MUTED },
  modalSave:     { fontFamily: 'Inter_700Bold', fontSize: 14, color: BLUE },

  fieldLabel:    { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: MUTED, letterSpacing: 0.5, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' },
  input:         { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_400Regular', fontSize: 14, color: TEXT },

  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tierChip:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierChipActive:{ borderColor: BLUE, backgroundColor: BLUE + '15' },
  tierChipText:  { fontFamily: 'Inter_500Medium', fontSize: 12, color: TEXT },
  tierChipPct:   { fontFamily: 'Inter_700Bold', fontSize: 11, color: MUTED },

  toggleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER, marginTop: 4 },
  toggleLabel:   { fontFamily: 'Inter_500Medium', fontSize: 13, color: TEXT },

  tierSummary:   { fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED, fontStyle: 'italic', marginTop: 8 },
});
