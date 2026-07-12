import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DirectorTabScreen } from '@/components/DirectorTabScreen';
import { api } from '@/lib/api';
import type {
  DirectorProduct,
  DirectorUserSummary,
  CustomerPricingRule,
  PricingTier,
  QuantityPriceBreak,
  TierProductRule,
} from '@/lib/api';
import {
  BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED,
  GLASS_BG, GLASS_BORDER,
} from '@/components/director/directorColors';

type Tab = 'tiers' | 'breaks' | 'custom' | 'assign';
type RuleType = 'percentage' | 'flat' | 'qty_break';
type FeatherIconName = ComponentProps<typeof Feather>['name'];

const TABS: { id: Tab; label: string; icon: FeatherIconName }[] = [
  { id: 'tiers',  label: 'Tiers',              icon: 'layers' },
  { id: 'breaks', label: 'All Volume Rules',    icon: 'trending-down' },
  { id: 'custom', label: 'Customer Overrides',  icon: 'user' },
  { id: 'assign', label: 'Assign',              icon: 'tag' },
];

interface TierForm {
  id?: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  defaultDiscountPct: string;
}
interface CustomForm {
  id?: string;
  customerId: string;
  productId: string;
  unitPrice: string;
  isActive: boolean;
}
interface QtyBreakRow { minQty: string; price: string }
interface TierRuleForm {
  productId: string;
  productName: string;
  type: RuleType;
  discountPct: string;
  flatPrice: string;
  qtyBreaks: QtyBreakRow[];
  existingRuleIds: string[];
}

const EMPTY_TIER: TierForm = { name: '', description: '', status: 'active', defaultDiscountPct: '' };
const EMPTY_CUSTOM: CustomForm = { customerId: '', productId: '', unitPrice: '', isActive: true };
const EMPTY_TIER_RULE: TierRuleForm = {
  productId: '', productName: '', type: 'percentage',
  discountPct: '', flatPrice: '', qtyBreaks: [{ minQty: '1', price: '' }],
  existingRuleIds: [],
};

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

export default function DirectorPricing() {
  const qc     = useQueryClient();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('tiers');

  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);

  const [tierModal,    setTierModal]    = useState(false);
  const [tierForm,     setTierForm]     = useState<TierForm>(EMPTY_TIER);
  const [customModal,  setCustomModal]  = useState(false);
  const [customForm,   setCustomForm]   = useState<CustomForm>(EMPTY_CUSTOM);
  const [ruleModal,    setRuleModal]    = useState(false);
  const [ruleForm,     setRuleForm]     = useState<TierRuleForm>(EMPTY_TIER_RULE);
  const [productSearch, setProductSearch] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = useCallback((text: string) => {
    setProductSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['director-tiers'],
    queryFn: () => api.director.tiers(),
  });
  const tiers: PricingTier[] = tiersData?.data ?? [];

  const { data: breaksData, isLoading: breaksLoading } = useQuery({
    queryKey: ['director-qty-breaks'],
    queryFn: () => api.director.qtyBreaks(),
    enabled: tab === 'breaks',
  });
  const breaks: QuantityPriceBreak[] = breaksData?.data ?? [];

  const { data: customData, isLoading: customLoading } = useQuery({
    queryKey: ['director-customer-pricing'],
    queryFn: () => api.director.customerPricing(),
    enabled: tab === 'custom',
  });
  const customPrices: CustomerPricingRule[] = customData?.data ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['director-wholesale-products'],
    queryFn: () => api.director.wholesaleProducts(),
    staleTime: 60_000,
  });
  const allProducts: DirectorProduct[] = productsData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['director-users'],
    queryFn: () => api.director.users(),
    staleTime: 30_000,
  });
  const wholesaleUsers: DirectorUserSummary[] = (usersData?.data ?? []).filter(
    (user) => user.role === 'wholesale' && user.wholesaleAccount,
  );

  const { data: tierRulesData, isLoading: tierRulesLoading } = useQuery({
    queryKey: ['director-tier-product-rules', selectedTier?.id],
    queryFn: () => api.director.tierProductRules(selectedTier!.id),
    enabled: !!selectedTier,
  });
  const tierProductRules: TierProductRule[] = tierRulesData?.data ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const invalidateTiers  = () => qc.invalidateQueries({ queryKey: ['director-tiers'] });
  const invalidateBreaks = () => qc.invalidateQueries({ queryKey: ['director-qty-breaks'] });
  const invalidateCustom = () => qc.invalidateQueries({ queryKey: ['director-customer-pricing'] });
  const invalidateUsers  = () => qc.invalidateQueries({ queryKey: ['director-users'] });
  const invalidateTierRules = () => qc.invalidateQueries({ queryKey: ['director-tier-product-rules', selectedTier?.id] });

  const saveTierMut = useMutation({
    mutationFn: (f: TierForm) => {
      const pct = f.defaultDiscountPct ? Math.max(0, Math.min(100, parseInt(f.defaultDiscountPct, 10) || 0)) : 0;
      const payload = { name: f.name, description: f.description, status: f.status, defaultDiscountPct: pct };
      return f.id
        ? api.director.updateTier(f.id, payload)
        : api.director.createTier(payload);
    },
    onSuccess: (res) => {
      invalidateTiers();
      setTierModal(false);
      if (selectedTier && res.data.id === selectedTier.id) setSelectedTier(res.data);
    },
  });

  const deleteTierMut = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => api.director.deleteTier(id, force),
    onSuccess: () => { invalidateTiers(); setSelectedTier(null); },
  });

  const saveRuleMut = useMutation({
    mutationFn: async (f: TierRuleForm) => {
      if (!selectedTier) throw new Error('No tier selected');
      if (!f.productId) throw new Error('Select a product');

      // 1. Validate all inputs before touching the database
      let newRules: Parameters<typeof api.director.createQtyBreak>[0][] = [];

      if (f.type === 'percentage') {
        const pct = parseFloat(f.discountPct);
        if (isNaN(pct) || pct <= 0 || pct >= 100) throw new Error('Enter a valid discount % (1–99)');
        newRules = [{ productId: f.productId, minQty: 1, discountPct: Math.round(pct), scope: 'tier', tierId: selectedTier.id }];
      } else if (f.type === 'flat') {
        const cents = Math.round(parseFloat(f.flatPrice) * 100);
        if (!cents || cents <= 0) throw new Error('Enter a valid flat price');
        newRules = [{ productId: f.productId, minQty: 1, unitPriceCents: cents, scope: 'tier', tierId: selectedTier.id }];
      } else {
        if (f.qtyBreaks.length === 0) throw new Error('Add at least one qty break');
        newRules = f.qtyBreaks.map((row) => {
          const qty   = parseInt(row.minQty, 10);
          const cents = Math.round(parseFloat(row.price) * 100);
          if (!qty || qty < 1) throw new Error('Each break needs a valid minimum qty');
          if (!cents || cents <= 0) throw new Error('Each break needs a valid price');
          return { productId: f.productId, minQty: qty, unitPriceCents: cents, scope: 'tier', tierId: selectedTier.id };
        });
      }

      // 2. Create new rules first — if this fails, old rules are untouched
      await Promise.all(newRules.map((rule) => api.director.createQtyBreak(rule)));

      // 3. Only now delete the old rules (new pricing is already live)
      if (f.existingRuleIds.length > 0) {
        await Promise.all(f.existingRuleIds.map((id) => api.director.deleteQtyBreak(id)));
      }
    },
    onSuccess: () => { invalidateTierRules(); invalidateBreaks(); setRuleModal(false); },
  });

  const deleteRulesMut = useMutation({
    mutationFn: (ruleIds: string[]) => Promise.all(ruleIds.map((id) => api.director.deleteQtyBreak(id))),
    onSuccess: () => { invalidateTierRules(); invalidateBreaks(); },
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
    const p = allProducts.find((pr) => pr.id === id);
    return p?.name ?? id.slice(0, 12) + '…';
  };
  const tierName = (id: string | null) => {
    if (!id) return 'No tier';
    return tiers.find((t) => t.id === id)?.name ?? 'Unknown';
  };
  const userLabel = (userId: string) => {
    const u = wholesaleUsers.find((user) => user.id === userId);
    return u?.wholesaleAccount?.companyName ?? u?.name ?? userId.slice(0, 10);
  };
  const customersOnTier = (tierId: string) =>
    wholesaleUsers.filter((user) => user.wholesaleAccount?.tierId === tierId).length;

  // Inline price editing state (productId → price string)
  const [inlinePrices,  setInlinePrices]  = useState<Record<string, string>>({});
  const [inlineSaving,  setInlineSaving]  = useState<Set<string>>(new Set());

  // Group product rules by productId for the tier detail view
  const rulesByProduct = new Map<string, TierProductRule[]>();
  for (const rule of tierProductRules) {
    const arr = rulesByProduct.get(rule.productId) ?? [];
    arr.push(rule);
    rulesByProduct.set(rule.productId, arr);
  }

  // Sync inline prices from loaded tier rules — merge so in-progress typing is preserved
  useEffect(() => {
    setInlinePrices((prev) => {
      const next = { ...prev };
      rulesByProduct.forEach((rules, productId) => {
        const flat = rules.length === 1 && rules[0].minQty === 1 && rules[0].unitPriceCents != null && rules[0].discountPct == null
          ? rules[0] : null;
        if (flat) next[productId] = (flat.unitPriceCents! / 100).toFixed(2);
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierRulesData]);

  // Filter products for search
  const searchLower = debouncedSearch.toLowerCase().trim();
  const visibleProducts = searchLower
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(searchLower) ||
        (p.category ?? '').toLowerCase().includes(searchLower),
      )
    : [...allProducts].sort((a, b) => {
        const ca = (a.category ?? '').toLowerCase();
        const cb = (b.category ?? '').toLowerCase();
        return ca !== cb ? ca.localeCompare(cb) : a.name.localeCompare(b.name);
      });
  // keep legacy alias for search-result display counts
  const searchedProducts = visibleProducts;

  // ── Action handlers ───────────────────────────────────────────────────────
  const openNewTier  = () => { setTierForm(EMPTY_TIER); setTierModal(true); };
  const openEditTier = (t: PricingTier) => {
    setTierForm({
      id: t.id, name: t.name, description: t.description ?? '',
      status: t.status === 'active' ? 'active' : 'inactive',
      defaultDiscountPct: t.defaultDiscountPct ? String(t.defaultDiscountPct) : '',
    });
    setTierModal(true);
  };
  const confirmDeleteTier = (t: PricingTier) => {
    const count = customersOnTier(t.id);
    const msg = count > 0
      ? `${count} customer${count !== 1 ? 's are' : ' is'} assigned to this tier and will be unassigned.`
      : 'This cannot be undone.';
    Alert.alert(`Delete "${t.name}"?`, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTierMut.mutate({ id: t.id, force: true }) },
    ]);
  };

  const openAddRule = (productId: string, productName: string) => {
    const existing = rulesByProduct.get(productId) ?? [];
    if (existing.length > 0) {
      const firstRule = existing[0];
      const hasMultiple = existing.length > 1 || (existing[0].minQty > 1);
      let type: RuleType = 'percentage';
      if (hasMultiple || existing.some((r) => r.minQty > 1)) type = 'qty_break';
      else if (firstRule.unitPriceCents != null) type = 'flat';
      else if (firstRule.discountPct != null) type = 'percentage';

      setRuleForm({
        productId,
        productName,
        type,
        discountPct: firstRule.discountPct != null ? String(firstRule.discountPct) : '',
        flatPrice: firstRule.unitPriceCents != null ? (firstRule.unitPriceCents / 100).toFixed(2) : '',
        qtyBreaks: existing.map((r) => ({
          minQty: String(r.minQty),
          price: r.unitPriceCents != null ? (r.unitPriceCents / 100).toFixed(2) : '',
        })),
        existingRuleIds: existing.map((r) => r.id),
      });
    } else {
      setRuleForm({ ...EMPTY_TIER_RULE, productId, productName });
    }
    setRuleModal(true);
  };

  const confirmDeleteRule = (productId: string, name: string) => {
    const ruleIds = (rulesByProduct.get(productId) ?? []).map((r) => r.id);
    Alert.alert(`Remove rule for "${name}"?`, 'The product will fall back to the tier default discount.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        deleteRulesMut.mutate(ruleIds);
        setInlinePrices((prev) => { const n = { ...prev }; delete n[productId]; return n; });
      }},
    ]);
  };

  const openNewCustom  = () => { setCustomForm(EMPTY_CUSTOM); setCustomModal(true); };
  const openEditCustom = (cp: CustomerPricingRule) => {
    setCustomForm({
      id: cp.id, customerId: cp.customerId, productId: cp.productId,
      unitPrice: cp.unitPriceCents ? (cp.unitPriceCents / 100).toFixed(2) : '',
      isActive: cp.isActive !== false,
    });
    setCustomModal(true);
  };
  const confirmDeleteCustom = (cp: CustomerPricingRule) => {
    Alert.alert('Delete Custom Price?',
      `${userLabel(cp.customerId)} · ${productName(cp.productId)} · $${((cp.unitPriceCents ?? 0) / 100).toFixed(2)}/unit`,
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

  async function handleInlinePriceBlur(productId: string) {
    if (!selectedTier) return;
    const text  = (inlinePrices[productId] ?? '').trim();
    const cents = Math.round(parseFloat(text) * 100);
    if (!text || isNaN(cents) || cents <= 0) return;

    const existingRules = rulesByProduct.get(productId) ?? [];
    const savedFlat = existingRules.length === 1 && existingRules[0].minQty === 1 &&
      existingRules[0].unitPriceCents != null && existingRules[0].discountPct == null
      ? existingRules[0] : null;
    if (savedFlat && savedFlat.unitPriceCents === cents) return; // unchanged

    setInlineSaving((prev) => new Set([...prev, productId]));
    try {
      // Create new rule first so pricing is never gapped
      await api.director.createQtyBreak({
        productId, minQty: 1, unitPriceCents: cents,
        scope: 'tier', tierId: selectedTier.id,
      });
      // Then remove old rules
      if (existingRules.length > 0) {
        await Promise.all(existingRules.map((r) => api.director.deleteQtyBreak(r.id)));
      }
      invalidateTierRules();
      invalidateBreaks();
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally {
      setInlineSaving((prev) => { const n = new Set(prev); n.delete(productId); return n; });
    }
  }

  function ruleDescription(rules: TierProductRule[]): string {
    if (rules.length === 0) return '';
    if (rules.length === 1) {
      const r = rules[0];
      if (r.discountPct != null) return `${r.discountPct}% off wholesale`;
      if (r.unitPriceCents != null) return `$${(r.unitPriceCents / 100).toFixed(2)}/unit`;
    }
    return `${rules.length}-tier qty break`;
  }

  // ── Tab renderers ─────────────────────────────────────────────────────────

  function renderTierList() {
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
            <Text style={styles.emptySub}>Create tiers to group customers and set per-product pricing within each tier.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {tiers.map((t) => {
              const count = customersOnTier(t.id);
              const discPct = t.defaultDiscountPct ?? 0;
              return (
                <Pressable key={t.id} style={styles.tierCard} onPress={() => { Haptics.selectionAsync(); setSelectedTier(t); setProductSearch(''); setDebouncedSearch(''); }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.cardTitle}>{t.name}</Text>
                      <StatusBadge status={t.status ?? ''} />
                      {discPct > 0 && (
                        <View style={styles.discBadge}>
                          <Text style={styles.discBadgeText}>{discPct}% default off</Text>
                        </View>
                      )}
                    </View>
                    {!!t.description && <Text style={styles.cardSub} numberOfLines={1}>{t.description}</Text>}
                    <Text style={styles.cardMeta}>{count} customer{count !== 1 ? 's' : ''} · Tap to manage product pricing</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => openEditTier(t)} />
                    <IconBtn icon="trash-2" color={RED} bg="#FFF5F5" onPress={() => confirmDeleteTier(t)} />
                    <Feather name="chevron-right" size={16} color={MUTED} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  function renderTierDetail(tier: PricingTier) {
    const discPct = tier.defaultDiscountPct ?? 0;
    const count   = customersOnTier(tier.id);

    return (
      <View style={{ flex: 1 }}>
        <Pressable onPress={() => { setSelectedTier(null); setProductSearch(''); setDebouncedSearch(''); }} style={styles.backBtn}>
          <Feather name="arrow-left" size={16} color={BLUE} />
          <Text style={{ color: BLUE, fontSize: 14, fontWeight: '600' }}>All Tiers</Text>
        </Pressable>

        <ScrollView contentContainerStyle={[styles.listContent, { gap: 16 }]} keyboardShouldPersistTaps="handled">
          {/* Tier header card */}
          <View style={[styles.card, { padding: 16, gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.cardTitle, { fontSize: 17 }]}>{tier.name}</Text>
                  <StatusBadge status={tier.status ?? ''} />
                </View>
                {!!tier.description && <Text style={styles.cardSub}>{tier.description}</Text>}
              </View>
              <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => openEditTier(tier)} />
            </View>
            <View style={styles.tierStatRow}>
              <TierStat label="Customers" value={String(count)} />
              <TierStat label="Default Discount" value={discPct > 0 ? `${discPct}% off` : 'None'} />
            </View>
            {discPct === 0 && (
              <View style={[styles.infoBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                <Feather name="info" size={13} color="#C2410C" />
                <Text style={[styles.infoText, { color: '#9A3412', fontSize: 12 }]}>
                  No default discount set. Products without a specific rule will use standard wholesale price.
                  Set a default discount % to apply a blanket tier discount.
                </Text>
              </View>
            )}
          </View>

          {/* Product Pricing section */}
          <View style={{ gap: 10 }}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { fontSize: 15 }]}>Product Prices</Text>
            </View>

            {/* Hint */}
            <View style={[styles.infoBox, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
              <Feather name="info" size={13} color={BLUE} />
              <Text style={[styles.infoText, { color: '#1E3A5F', fontSize: 12 }]}>
                Enter a flat price per product and it saves automatically on blur. For volume or percentage rules, tap the edit icon.
              </Text>
            </View>

            {/* Search */}
            <View style={[styles.searchBar, { borderColor: BORDER, backgroundColor: CARD }]}>
              <Feather name="search" size={15} color={MUTED} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: TEXT, paddingVertical: 0 }}
                placeholder="Filter products…"
                placeholderTextColor={MUTED}
                value={productSearch}
                onChangeText={handleSearchChange}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {productSearch.length > 0 && (
                <Pressable onPress={() => { setProductSearch(''); setDebouncedSearch(''); }}>
                  <Feather name="x" size={15} color={MUTED} />
                </Pressable>
              )}
            </View>

            {tierRulesLoading ? (
              <ActivityIndicator color={BLUE} style={{ marginTop: 20 }} />
            ) : visibleProducts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No products found</Text>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {searchLower.length > 0 && (
                  <Text style={[styles.cardMeta, { paddingHorizontal: 4 }]}>
                    {visibleProducts.length} result{visibleProducts.length !== 1 ? 's' : ''}
                  </Text>
                )}
                {visibleProducts.map((p) => {
                  const rules    = rulesByProduct.get(p.id) ?? [];
                  const isComplex = rules.length > 1 ||
                    (rules.length === 1 && (rules[0].discountPct != null || rules[0].minQty > 1));
                  const isSaving = inlineSaving.has(p.id);
                  const priceVal = inlinePrices[p.id] ?? '';
                  const hasPrice = !!priceVal;

                  return (
                    <View key={p.id} style={[styles.productRuleCard, { alignItems: 'center' }]}>
                      {/* Left: name + category + complex rule badge */}
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.cardTitle, { fontSize: 13 }]} numberOfLines={1}>{p.name}</Text>
                        {!!p.category && <Text style={[styles.cardMeta, { fontSize: 11 }]}>{p.category}</Text>}
                        {isComplex && (
                          <Text style={{ fontSize: 11, color: GREEN, fontWeight: '600' }}>
                            {ruleDescription(rules)}
                          </Text>
                        )}
                      </View>

                      {/* Right: price input (simple/no rule) or edit btn (complex) */}
                      {isComplex ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <IconBtn icon="edit-2" color={BLUE} bg="#EBF8FF" onPress={() => { Haptics.selectionAsync(); openAddRule(p.id, p.name); }} />
                          <IconBtn icon="trash-2" color={RED} bg="#FFF5F5" onPress={() => confirmDeleteRule(p.id, p.name)} />
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {isSaving ? (
                            <ActivityIndicator size="small" color={BLUE} style={{ width: 90 }} />
                          ) : (
                            <View style={{
                              flexDirection: 'row', alignItems: 'center',
                              borderWidth: 1, borderRadius: 10,
                              borderColor: hasPrice ? GREEN : BORDER,
                              backgroundColor: hasPrice ? '#F0FFF4' : CARD,
                              paddingHorizontal: 10, paddingVertical: 6,
                              width: 90,
                            }}>
                              <Text style={{ fontSize: 13, color: MUTED, marginRight: 2 }}>$</Text>
                              <TextInput
                                style={{ flex: 1, fontSize: 13, color: TEXT, paddingVertical: 0 }}
                                value={priceVal}
                                onChangeText={(t) => setInlinePrices((prev) => ({ ...prev, [p.id]: t }))}
                                onBlur={() => handleInlinePriceBlur(p.id)}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                placeholderTextColor={MUTED}
                                returnKeyType="done"
                              />
                            </View>
                          )}
                          {/* Edit btn to open full rule modal (for qty-break / % upgrade) */}
                          <IconBtn
                            icon="sliders"
                            color={MUTED}
                            bg={CARD}
                            onPress={() => { Haptics.selectionAsync(); openAddRule(p.id, p.name); }}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  function renderBreaks() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Volume Rules</Text>
        </View>
        <View style={[styles.infoBox, { marginHorizontal: 16, backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
          <Feather name="info" size={14} color={BLUE} />
          <Text style={[styles.infoText, { color: '#1E3A5F' }]}>
            Read-only audit view of all tier and customer volume rules. To add or edit rules, open a tier from the Tiers tab or use Customer Overrides.
          </Text>
        </View>
        {breaksLoading ? <ActivityIndicator color={BLUE} style={styles.loader} /> :
         breaks.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="trending-down" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No volume rules</Text>
            <Text style={styles.emptySub}>Rules created in the Tiers tab will appear here.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {breaks.map((b) => {
              const priceStr = b.unitPriceCents != null
                ? `$${(b.unitPriceCents / 100).toFixed(2)}/unit`
                : b.discountPct != null
                  ? `${b.discountPct}% off`
                  : 'Unknown';
              return (
                <View key={b.id} style={styles.card}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{productName(b.productId)}</Text>
                    <Text style={styles.cardSub}>
                      {b.minQty === 1 ? 'All qtys' : `${b.minQty}+ units`} → {priceStr}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {b.scope === 'tier' ? `Tier: ${tierName(b.tierId ?? null)}` : `Customer: ${userLabel(b.customerId ?? '')}`}
                      {!b.isActive && ' · Inactive'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  function renderCustom() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Customer Overrides</Text>
          <Pressable onPress={openNewCustom} style={styles.newBtn}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.newBtnText}>New Override</Text>
          </Pressable>
        </View>
        <View style={[styles.infoBox, { marginHorizontal: 16, backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Feather name="alert-triangle" size={14} color="#C2410C" />
          <Text style={[styles.infoText, { color: '#9A3412' }]}>
            These prices override a customer's tier for a specific product. Use sparingly — tier rules are the primary pricing control.
          </Text>
        </View>
        {customLoading ? <ActivityIndicator color={BLUE} style={styles.loader} /> :
         customPrices.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="user" size={32} color={BORDER} />
            <Text style={styles.emptyTitle}>No customer overrides</Text>
            <Text style={styles.emptySub}>Set a specific per-unit price for a product for an individual wholesale customer.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {customPrices.map((cp) => (
              <View key={cp.id} style={styles.card}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{productName(cp.productId)}</Text>
                  <Text style={styles.cardSub}>${((cp.unitPriceCents ?? 0) / 100).toFixed(2)} per unit</Text>
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
        ) : wholesaleUsers.map((u) => {
          const wa          = u.wholesaleAccount;
          const currentTier = wa?.tierId ?? null;
          const assignedTierObj = tiers.find((t) => t.id === currentTier);
          return (
            <View key={u.id} style={styles.assignCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{wa?.companyName ?? u.name}</Text>
                  <Text style={styles.cardMeta}>{u.email}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.tierBadge, { backgroundColor: currentTier ? '#EBF8FF' : '#F3F4F6' }]}>
                    <Text style={[styles.tierBadgeText, { color: currentTier ? BLUE : MUTED }]}>
                      {tierName(currentTier)}
                    </Text>
                  </View>
                  {assignedTierObj && (assignedTierObj.defaultDiscountPct ?? 0) > 0 && (
                    <Text style={{ fontSize: 11, color: GREEN, fontWeight: '600' }}>
                      {assignedTierObj.defaultDiscountPct}% default off
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  onPress={() => handleAssignTier(wa?.id ?? '', null)}
                  style={[styles.assignChip, {
                    backgroundColor: !currentTier ? NAVY : '#F3F4F6',
                    borderColor:     !currentTier ? NAVY : BORDER,
                  }]}
                >
                  <Text style={[styles.assignChipText, { color: !currentTier ? '#fff' : MUTED }]}>No Tier</Text>
                </Pressable>
                {tiers.map((t) => {
                  const active = currentTier === t.id;
                  return (
                    <Pressable key={t.id}
                      onPress={() => handleAssignTier(wa?.id ?? '', t.id)}
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

  const tierSaveErr   = saveTierMut.error ? getErrorMessage(saveTierMut.error) : undefined;
  const ruleSaveErr   = saveRuleMut.error ? getErrorMessage(saveRuleMut.error) : undefined;
  const customSaveErr = saveCustomMut.error ? getErrorMessage(saveCustomMut.error) : undefined;
  const customFormValid = !!customForm.customerId && !!customForm.productId && !!customForm.unitPrice;
  const ruleFormValid = !!ruleForm.productId && (
    ruleForm.type === 'percentage' ? !!ruleForm.discountPct :
    ruleForm.type === 'flat' ? !!ruleForm.flatPrice :
    ruleForm.qtyBreaks.length > 0 && ruleForm.qtyBreaks.every((r) => !!r.minQty && !!r.price)
  );

  return (
    <DirectorTabScreen title="Pricing Management" subtitle="Tiers · volume rules · customer overrides">

      <View style={[styles.tabBar, { backgroundColor: CARD, borderBottomColor: BORDER }]}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Pressable key={t.id} onPress={() => { setTab(t.id); setSelectedTier(null); Haptics.selectionAsync(); }} style={styles.tabItem}>
              <Feather name={t.icon} size={15} color={active ? BLUE : MUTED} />
              <Text style={[styles.tabLabel, { color: active ? BLUE : MUTED, fontWeight: active ? '700' : '400' }]}>
                {t.label}
              </Text>
              {active && <View style={[styles.tabUnderline, { backgroundColor: BLUE }]} />}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'tiers'  && (selectedTier ? renderTierDetail(selectedTier) : renderTierList())}
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
            <Field label="Default Discount % (off standard wholesale)">
              <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                placeholder="e.g. 15 (leave blank for no blanket discount)" placeholderTextColor={MUTED}
                value={tierForm.defaultDiscountPct}
                onChangeText={(v) => setTierForm((f) => ({ ...f, defaultDiscountPct: v.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad" />
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                Applies to all products in this tier without a specific rule.
              </Text>
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
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Tier Product Rule Modal ── */}
      <Modal visible={ruleModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRuleModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalHeader
            title={ruleForm.existingRuleIds.length > 0 ? 'Edit Product Rule' : 'Add Product Rule'}
            onCancel={() => setRuleModal(false)}
            onSave={() => saveRuleMut.mutate(ruleForm)}
            saveDisabled={!ruleFormValid}
            saving={saveRuleMut.isPending}
          />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!!ruleSaveErr && <ErrBanner msg={ruleSaveErr} />}

            <View style={[styles.infoBox, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
              <Feather name="package" size={14} color={BLUE} />
              <Text style={[styles.infoText, { color: '#1E3A5F', fontWeight: '600' }]} numberOfLines={1}>
                {ruleForm.productName || 'Unknown product'}
              </Text>
            </View>

            <Field label="Pricing Type *">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([
                  ['percentage', 'Percentage', 'percent'] as const,
                  ['flat',       'Set Price',  'dollar-sign'] as const,
                  ['qty_break',  'Qty Break',  'trending-down'] as const,
                ]).map(([type, label, icon]) => (
                  <Pressable key={type}
                    onPress={() => setRuleForm((f) => ({ ...f, type }))}
                    style={[styles.typeChip, {
                      backgroundColor: ruleForm.type === type ? NAVY : '#F3F4F6',
                      borderColor:     ruleForm.type === type ? NAVY : BORDER,
                    }]}
                  >
                    <Feather name={icon} size={13} color={ruleForm.type === type ? '#fff' : MUTED} />
                    <Text style={[styles.typeChipText, { color: ruleForm.type === type ? '#fff' : TEXT }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>

            {ruleForm.type === 'percentage' && (
              <Field label="Discount % off standard wholesale *">
                <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  placeholder="e.g. 15" placeholderTextColor={MUTED}
                  value={ruleForm.discountPct}
                  onChangeText={(v) => setRuleForm((f) => ({ ...f, discountPct: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad" autoFocus />
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Applies to all order quantities.
                </Text>
              </Field>
            )}

            {ruleForm.type === 'flat' && (
              <Field label="Set Price per Unit (AUD) *">
                <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  placeholder="e.g. 4.20" placeholderTextColor={MUTED}
                  value={ruleForm.flatPrice}
                  onChangeText={(v) => setRuleForm((f) => ({ ...f, flatPrice: v }))}
                  keyboardType="decimal-pad" autoFocus />
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  Applies to all order quantities.
                </Text>
              </Field>
            )}

            {ruleForm.type === 'qty_break' && (
              <Field label="Quantity Break Schedule *">
                <Text style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Set price tiers by minimum quantity (e.g. 1+: $4.80, 10+: $4.20, 25+: $3.90)
                </Text>
                {ruleForm.qtyBreaks.map((row, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Min qty</Text>
                      <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                        placeholder="e.g. 10" placeholderTextColor={MUTED}
                        value={row.minQty}
                        onChangeText={(v) => {
                          const rows = [...ruleForm.qtyBreaks];
                          rows[idx] = { ...rows[idx], minQty: v.replace(/[^0-9]/g, '') };
                          setRuleForm((f) => ({ ...f, qtyBreaks: rows }));
                        }}
                        keyboardType="number-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Price/unit (AUD)</Text>
                      <TextInput style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                        placeholder="e.g. 4.20" placeholderTextColor={MUTED}
                        value={row.price}
                        onChangeText={(v) => {
                          const rows = [...ruleForm.qtyBreaks];
                          rows[idx] = { ...rows[idx], price: v };
                          setRuleForm((f) => ({ ...f, qtyBreaks: rows }));
                        }}
                        keyboardType="decimal-pad" />
                    </View>
                    {ruleForm.qtyBreaks.length > 1 && (
                      <Pressable onPress={() => setRuleForm((f) => ({ ...f, qtyBreaks: f.qtyBreaks.filter((_, i) => i !== idx) }))}
                        style={{ marginTop: 18 }}>
                        <Feather name="x-circle" size={18} color={RED} />
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable
                  onPress={() => setRuleForm((f) => ({ ...f, qtyBreaks: [...f.qtyBreaks, { minQty: '', price: '' }] }))}
                  style={styles.addBreakBtn}
                >
                  <Feather name="plus" size={14} color={BLUE} />
                  <Text style={{ color: BLUE, fontSize: 13, fontWeight: '600' }}>Add Another Break</Text>
                </Pressable>
              </Field>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Customer Override Modal ── */}
      <Modal visible={customModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCustomModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalHeader
            title={customForm.id ? 'Edit Override' : 'New Override'}
            onCancel={() => setCustomModal(false)}
            onSave={() => saveCustomMut.mutate(customForm)}
            saveDisabled={!customFormValid}
            saving={saveCustomMut.isPending}
          />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!!customSaveErr && <ErrBanner msg={customSaveErr} />}
            <View style={[styles.infoBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <Feather name="alert-triangle" size={14} color="#C2410C" />
              <Text style={[styles.infoText, { color: '#9A3412', fontSize: 12 }]}>
                This override takes priority over the customer's tier pricing. Use sparingly.
              </Text>
            </View>
            <Field label="Customer *">
              {wholesaleUsers.length === 0
                ? <Text style={{ color: MUTED, fontSize: 13 }}>No approved wholesale customers.</Text>
                : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {wholesaleUsers.map((u) => (
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
                {allProducts.map((p) => (
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
                <Text style={styles.switchSub}>Inactive overrides are not applied at checkout</Text>
              </View>
              <Switch value={customForm.isActive} onValueChange={(v) => setCustomForm((f) => ({ ...f, isActive: v }))} trackColor={{ true: BLUE }} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </DirectorTabScreen>
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

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>{label}</Text>
      {children}
    </View>
  );
}
function TierStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 10 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{value}</Text>
      <Text style={{ fontSize: 11, color: MUTED }}>{label}</Text>
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
function IconBtn({ icon, color, bg, onPress }: { icon: FeatherIconName; color: string; bg: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Feather name={icon} size={15} color={color} />
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
  tabBar:          { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem:         { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3, position: 'relative' },
  tabLabel:        { fontSize: 10, letterSpacing: 0.3 },
  tabUnderline:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitle:    { fontSize: 18, fontWeight: '700', color: TEXT },
  newBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: BLUE },
  newBtnText:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  listContent:     { padding: 16, gap: 10, paddingBottom: 32 },
  loader:          { marginTop: 40 },
  card:            { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  tierCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  productRuleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER },
  assignCard:      { padding: 14, borderRadius: 14, borderWidth: 1, backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 3 },
  cardTitle:       { fontSize: 15, fontWeight: '600', color: TEXT },
  cardSub:         { fontSize: 13, fontWeight: '400', color: MUTED },
  cardMeta:        { fontSize: 12, fontWeight: '400', color: MUTED },
  cardActions:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tierBadge:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tierBadgeText:   { fontSize: 13, fontWeight: '600' },
  assignChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  assignChipText:  { fontSize: 13, fontWeight: '600' },
  discBadge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  discBadgeText:   { fontSize: 11, fontWeight: '700', color: '#166534' },
  emptyWrap:       { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, marginTop: 40 },
  emptyTitle:      { fontSize: 16, fontWeight: '600', color: TEXT, textAlign: 'center' },
  emptySub:        { fontSize: 13, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 19 },
  modalContent:    { padding: 20, gap: 18 },
  input:           { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: CARD },
  textArea:        { height: 80 },
  statusChip:      { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  statusChipText:  { fontSize: 14, fontWeight: '600' },
  pickerChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, maxWidth: 180 },
  pickerChipText:  { fontSize: 13, fontWeight: '500' },
  switchRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel:     { fontSize: 14, fontWeight: '600', color: TEXT },
  switchSub:       { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  infoBox:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  infoText:        { flex: 1, fontSize: 13, fontWeight: '400', lineHeight: 19 },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  tierStatRow:     { flexDirection: 'row', gap: 10 },
  searchBar:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addRuleBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addRuleBtnText:  { fontSize: 13, fontWeight: '600' },
  typeChip:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  typeChipText:    { fontSize: 12, fontWeight: '600' },
  addBreakBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: BLUE, justifyContent: 'center', borderStyle: 'dashed' },
});
