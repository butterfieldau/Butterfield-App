import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Keyboard,
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PosCustomerResult, type PosOrderItem, type PosLoyaltyResult, type PosHistoryOrder } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCachedPosProducts, savePosProductsCache } from '@/lib/posCache';

// ── Palette ──────────────────────────────────────────────────────────────────
const BG       = '#F0F3F8';
const WHITE    = '#FFFFFF';
const BLUE     = '#1493FF';
const CHERRY   = '#D20001';
const DARK     = '#0F172A';
const MID      = '#475569';
const MUTED    = '#94A3B8';
const BORDER   = '#E2E8F0';
const TICKET   = '#FAFBFF';

const CATEGORY_COLORS: Record<string, string> = {
  cookies:    '#F59E0B',
  coffee:     '#92400E',
  desserts:   '#EC4899',
  cakes:      '#F43F5E',
  sandwiches: '#10B981',
  drinks:     '#06B6D4',
  bundles:    '#8B5CF6',
  merch:      '#F97316',
  specials:   '#EF4444',
};
const CATEGORY_ORDER = ['cookies', 'coffee'];
const PRESET_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981',
  '#06B6D4', '#1493FF', '#8B5CF6', '#EC4899',
  '#92400E', '#0F766E', '#4F46E5', '#64748B',
];
const CAT_COLORS_KEY = 'pos_category_colors';
function getDefaultCatColor(cat: string): string {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? '#64748B';
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceAdjustmentCents: number;
}

interface TicketItem {
  localId: string;
  productId: string;
  productName: string;
  category: string;
  variantId?: string | null;
  variantName?: string | null;
  variantPriceCents?: number;
  selectedOptions: SelectedOption[];
  quantity: number;
  unitPriceCents: number;
  notes: string;
}

interface AttachedCustomerClaimedReward {
  id: string;
  rewardType: string;
  rewardName: string;
  voucherValueCents: number | null;
}

interface AttachedCustomer {
  userId: string;
  name: string;
  email?: string;
  loyaltyPoints: number;
  stampCount: number;
  loyaltyTier: string;
  freeCoffeeRewards: number;
  availableClaimedRewards: AttachedCustomerClaimedReward[];
}

interface AppliedDiscount {
  type: 'code' | 'pct' | 'free_coffee' | 'claimed_reward';
  code?: string;
  codeId?: string;
  pct?: number;
  claimedRewardId?: string;
  amountCents: number;
  label: string;
}

type OrderType = 'dine_in' | 'takeaway' | 'counter';

interface Ticket {
  id: string;
  items: TicketItem[];
  customer: AttachedCustomer | null;
  orderType: OrderType;
  notes: string;
  appliedDiscount: AppliedDiscount | null;
}

interface ProductDetail {
  id: string;
  name: string;
  description?: string;
  priceCents?: number | null;
  salePriceCents?: number | null;
  category?: string;
  images?: string[];
  variants: { id: string; name: string; priceCents: number; sortOrder: number }[];
  optionGroups: {
    id: string; name: string; description?: string;
    selectionType: 'single' | 'multi';
    isRequired: boolean;
    options: { id: string; name: string; priceAdjustmentCents: number; isDefault: boolean }[];
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
const uuid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const blankTicket = (): Ticket => ({ id: uuid(), items: [], customer: null, orderType: 'counter', notes: '', appliedDiscount: null });

function ticketSubtotal(t: Ticket): number {
  return t.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
}

function ticketTotal(t: Ticket): number {
  const sub = ticketSubtotal(t);
  const disc = t.appliedDiscount?.amountCents ?? 0;
  return Math.max(0, sub - disc);
}

function buildPosItems(items: TicketItem[]): PosOrderItem[] {
  return items.map(i => ({
    productId: i.productId,
    productName: i.productName,
    variantId: i.variantId ?? null,
    variantName: i.variantName ?? null,
    variantPriceCents: i.variantPriceCents,
    selectedOptions: i.selectedOptions,
    category: i.category,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    notes: i.notes || undefined,
  }));
}

const STAMP_GOAL = 6;

// ── POS Screen ────────────────────────────────────────────────────────────────
export default function PosScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Ticket state ──────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<Ticket[]>([blankTicket()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeTicket = tickets[activeIdx] ?? tickets[0]!;

  // ── Nav tab (narrow screens only) ─────────────────────────────────────────
  const [paneTab, setPaneTab] = useState<'menu' | 'ticket'>('menu');

  // ── Product browsing state ────────────────────────────────────────────────
  const [searchText, setSearchText]       = useState('');
  const [selCategory, setSelCategory]     = useState<string>('all');
  const [customCatColors, setCustomCatColors] = useState<Record<string, string>>({});
  const [colorPickerCat, setColorPickerCat]   = useState<string | null>(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [customiseData, setCustomiseData] = useState<{
    product: ProductDetail;
    editItem?: TicketItem;
  } | null>(null);
  const [showPayment,   setShowPayment]   = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{
    id: string; orderNumber: string; totalCents: number;
    paymentMethod: 'cash' | 'eftpos';
    amountTenderedCents?: number;
    loyaltyResult: PosLoyaltyResult | null;
  } | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [salesOpen, setSalesOpen]         = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [lastOrderId, setLastOrderId]     = useState<string | null>(null);

  // ── Detail cache (product → { variants, optionGroups }) ──────────────────
  const [detailCache, setDetailCache] = useState<Record<string, ProductDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // ── Local product cache ────────────────────────────────────────────────────
  // Seed React Query from AsyncStorage so products are instant on every open.
  const [cacheReady, setCacheReady] = useState(false);
  useEffect(() => {
    loadCachedPosProducts().then(cached => {
      if (cached?.length) {
        queryClient.setQueryData(['pos-products'], { data: cached });
      }
      setCacheReady(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted category colours
  useEffect(() => {
    AsyncStorage.getItem(CAT_COLORS_KEY).then(v => {
      if (v) try { setCustomCatColors(JSON.parse(v)); } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCatColor = useCallback((cat: string, color: string | null) => {
    setCustomCatColors(prev => {
      const next = { ...prev };
      if (color === null) delete next[cat.toLowerCase()];
      else next[cat.toLowerCase()] = color;
      AsyncStorage.setItem(CAT_COLORS_KEY, JSON.stringify(next));
      return next;
    });
    setColorPickerCat(null);
  }, []);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const res = await api.products.list();
      if ((res as any)?.data?.length) {
        savePosProductsCache((res as any).data);
      }
      return res;
    },
    staleTime: Infinity,   // never auto-refetch; only syncs on demand or at 4am
    enabled: cacheReady,   // wait until AsyncStorage check completes
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['pos-summary'],
    queryFn: () => api.pos.summary(),
    refetchInterval: 30_000,
  });

  // ── Filtered products ─────────────────────────────────────────────────────
  const allProducts = useMemo(() => {
    const raw = (productsData as any)?.data ?? [];
    // Exclude app-only products — they can't be purchased in-store
    return (raw as any[]).filter((p: any) => !p.isAppOnly);
  }, [productsData]);

  const categories = useMemo(() => {
    const cats = [...new Set(allProducts.map((p: any) => p.category ?? 'other').filter(Boolean))] as string[];
    return cats.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.toLowerCase());
      const bi = CATEGORY_ORDER.indexOf(b.toLowerCase());
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p: any) => {
      if (selCategory !== 'all' && (p.category ?? '') !== selCategory) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        return (p.name ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allProducts, selCategory, searchText]);

  // ── Ticket helpers ────────────────────────────────────────────────────────
  const updateTicket = useCallback((patch: Partial<Ticket>) => {
    setTickets(prev => prev.map((t, i) => i === activeIdx ? { ...t, ...patch } : t));
  }, [activeIdx]);

  const addItemToTicket = useCallback((item: TicketItem) => {
    setTickets(prev => {
      const t = prev[activeIdx] ?? prev[0]!;
      // Try to merge identical items (same product, variant, options)
      const matchIdx = t.items.findIndex(existing =>
        existing.productId === item.productId &&
        existing.variantId === item.variantId &&
        JSON.stringify(existing.selectedOptions) === JSON.stringify(item.selectedOptions) &&
        existing.notes === item.notes
      );
      let newItems: TicketItem[];
      if (matchIdx >= 0 && !item.notes) {
        newItems = t.items.map((x, i) => i === matchIdx ? { ...x, quantity: x.quantity + item.quantity } : x);
      } else {
        newItems = [...t.items, item];
      }
      // Clear discount: item composition changes affect both cheapest-coffee and %-based amounts
      return prev.map((ticket, i) => i === activeIdx ? { ...ticket, items: newItems, appliedDiscount: null } : ticket);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeIdx]);

  const removeItem = useCallback((localId: string) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      const newItems = t.items.filter(x => x.localId !== localId);
      // Clear discount: removing an item shifts subtotal (affecting % amounts) and cheapest coffee
      return { ...t, items: newItems, appliedDiscount: null };
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeIdx]);

  const updateItemQty = useCallback((localId: string, delta: number) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      const newItems = t.items.map(x => {
        if (x.localId !== localId) return x;
        const q = Math.max(1, x.quantity + delta);
        return { ...x, quantity: q };
      });
      // Clear discount: qty change shifts subtotal (affecting % amounts) and cheapest coffee
      return { ...t, items: newItems, appliedDiscount: null };
    }));
    Haptics.selectionAsync();
  }, [activeIdx]);

  const clearTicket = useCallback(() => {
    setTickets(prev => prev.map((t, i) => i === activeIdx ? blankTicket() : t));
  }, [activeIdx]);

  const holdTicket = useCallback(() => {
    if (activeTicket.items.length === 0) return;
    const maxHolds = 3;
    if (tickets.length >= maxHolds + 1) {
      Alert.alert('Hold Limit', 'Maximum 3 tickets on hold. Complete or clear an existing ticket first.');
      return;
    }
    // Add a new blank ticket and switch to it
    setTickets(prev => [...prev, blankTicket()]);
    setActiveIdx(tickets.length); // new ticket index
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeTicket.items.length, tickets.length]);

  // ── Product tap handler ───────────────────────────────────────────────────
  const handleProductTap = useCallback(async (product: any) => {
    const cached = detailCache[product.id];
    const hasVariants = product.hasVariants || (product.variants ?? []).length > 0;

    if (cached) {
      const hasOpts = cached.optionGroups.length > 0;
      if (!hasVariants && !hasOpts) {
        // Quick-add
        const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
        addItemToTicket({
          localId: uuid(), productId: product.id, productName: product.name,
          category: product.category ?? '', variantId: null, variantName: null,
          variantPriceCents: undefined, selectedOptions: [],
          quantity: 1, unitPriceCents: basePriceCents, notes: '',
        });
      } else {
        setCustomiseData({ product: cached });
      }
      return;
    }

    // Fetch detail
    setLoadingDetail(product.id);
    try {
      const res = await api.products.get(product.id);
      const detail = res.data as unknown as ProductDetail;
      setDetailCache(prev => ({ ...prev, [product.id]: detail }));

      const hasOpts = detail.optionGroups.length > 0;
      if (!hasVariants && !hasOpts) {
        const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
        addItemToTicket({
          localId: uuid(), productId: product.id, productName: product.name,
          category: product.category ?? '', variantId: null, variantName: null,
          variantPriceCents: undefined, selectedOptions: [],
          quantity: 1, unitPriceCents: basePriceCents, notes: '',
        });
      } else {
        setCustomiseData({ product: detail });
      }
    } catch {
      // Fallback: add without customisation
      const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
      addItemToTicket({
        localId: uuid(), productId: product.id, productName: product.name,
        category: product.category ?? '', variantId: null, variantName: null,
        variantPriceCents: undefined, selectedOptions: [],
        quantity: 1, unitPriceCents: basePriceCents, notes: '',
      });
    } finally {
      setLoadingDetail(null);
    }
  }, [detailCache, addItemToTicket]);

  // ── Order submission ──────────────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: (vars: {
      paymentMethod: 'cash' | 'eftpos';
      amountTenderedCents?: number;
    }) => api.pos.createOrder({
      items: buildPosItems(activeTicket.items),
      orderType: activeTicket.orderType,
      paymentMethod: vars.paymentMethod,
      amountTenderedCents: vars.amountTenderedCents,
      customerId: activeTicket.customer?.userId,
      notes: activeTicket.notes || undefined,
      discountCode: activeTicket.appliedDiscount?.type === 'code' ? activeTicket.appliedDiscount.code : undefined,
      discountCodeId: activeTicket.appliedDiscount?.type === 'code' ? activeTicket.appliedDiscount.codeId : undefined,
      manualDiscountPct: activeTicket.appliedDiscount?.type === 'pct' ? activeTicket.appliedDiscount.pct : undefined,
      redeemFreeCoffee: activeTicket.appliedDiscount?.type === 'free_coffee' ? true : undefined,
      claimedRewardId: activeTicket.appliedDiscount?.type === 'claimed_reward' ? activeTicket.appliedDiscount.claimedRewardId : undefined,
    }),
    onSuccess: (res, vars) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastOrderId(res.data.id);
      setCompletedOrder({
        id: res.data.id,
        orderNumber: res.data.orderNumber,
        totalCents: res.data.totalCents,
        paymentMethod: vars.paymentMethod,
        amountTenderedCents: vars.amountTenderedCents,
        loyaltyResult: res.loyaltyResult,
      });
      setShowPayment(false);
      // Clear the active ticket
      setTickets(prev => {
        if (prev.length === 1) return [blankTicket()];
        const next = prev.filter((_, i) => i !== activeIdx);
        return next.length ? next : [blankTicket()];
      });
      if (activeIdx > 0) setActiveIdx(0);
      refetchSummary();
      queryClient.invalidateQueries({ queryKey: ['pos-summary'] });
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Order Failed', err?.message ?? 'Could not complete order. Please try again.');
    },
  });

  const voidOrderMutation = useMutation({
    mutationFn: (id: string) => api.pos.voidOrder(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Voided', 'Last transaction has been voided.');
      setLastOrderId(null);
      refetchSummary();
    },
    onError: (err: any) => {
      Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).');
    },
  });

  const handleVoidLast = () => {
    if (!lastOrderId) {
      Alert.alert('No Transaction', 'No recent transaction to void.');
      return;
    }
    Alert.alert('Void Last Transaction', 'Are you sure you want to void the last completed transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: () => voidOrderMutation.mutate(lastOrderId) },
    ]);
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const subtotal = ticketSubtotal(activeTicket);
  const total = ticketTotal(activeTicket);
  const itemCount = activeTicket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="monitor" size={20} color={BLUE} />
          <Text style={styles.headerTitle}>Point of Sale</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {/* Sales strip toggle */}
          <Pressable onPress={() => setSalesOpen(v => !v)} style={styles.headerBtn}>
            <Feather name="bar-chart-2" size={16} color={MID} />
            <Text style={styles.headerBtnText}>
              {summaryData?.data
                ? `${summaryData.data.orderCount} orders · ${fmtCents(summaryData.data.revenueCents)}`
                : 'Today'}
            </Text>
          </Pressable>
          {/* History */}
          <Pressable onPress={() => setShowHistory(true)} style={styles.headerBtn}>
            <Feather name="clock" size={16} color={MID} />
            <Text style={styles.headerBtnText}>History</Text>
          </Pressable>
          {/* Void last */}
          <Pressable
            onPress={handleVoidLast}
            style={[styles.headerBtn, !lastOrderId && { opacity: 0.4 }]}
            disabled={!lastOrderId || voidOrderMutation.isPending}
          >
            <Feather name="x-circle" size={16} color={CHERRY} />
            <Text style={[styles.headerBtnText, { color: CHERRY }]}>Void Last</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Sales strip ─────────────────────────────────────────────────── */}
      {salesOpen && (
        <View style={styles.salesStrip}>
          <View style={styles.salesCard}>
            <Text style={styles.salesLabel}>Orders Today</Text>
            <Text style={styles.salesValue}>{summaryData?.data?.orderCount ?? 0}</Text>
          </View>
          <View style={styles.salesCard}>
            <Text style={styles.salesLabel}>Revenue Today</Text>
            <Text style={styles.salesValue}>{fmtCents(summaryData?.data?.revenueCents ?? 0)}</Text>
          </View>
        </View>
      )}

      {/* ── Hold tabs ──────────────────────────────────────────────────────── */}
      {tickets.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.holdTabsRow}>
          {tickets.map((t, i) => (
            <Pressable
              key={t.id}
              onPress={() => setActiveIdx(i)}
              style={[styles.holdTab, i === activeIdx && styles.holdTabActive]}
            >
              <Text style={[styles.holdTabText, i === activeIdx && { color: WHITE }]}>
                {i === 0 && tickets.length > 1 ? `T${i + 1}` : `Hold ${i}`}
                {t.items.length > 0 && ` (${t.items.reduce((s, x) => s + x.quantity, 0)})`}
              </Text>
              {i > 0 && (
                <Pressable
                  onPress={() => {
                    setTickets(prev => {
                      const next = prev.filter((_, j) => j !== i);
                      return next.length ? next : [blankTicket()];
                    });
                    setActiveIdx(prev => Math.max(0, prev > i ? prev - 1 : prev));
                  }}
                  hitSlop={8}
                  style={{ marginLeft: 4 }}
                >
                  <Feather name="x" size={12} color={i === activeIdx ? WHITE : MID} />
                </Pressable>
              )}
            </Pressable>
          ))}
          <Pressable onPress={holdTicket} style={styles.holdTabAdd}>
            <Feather name="plus" size={14} color={BLUE} />
          </Pressable>
        </ScrollView>
      )}

      {/* ── Narrow screen: tab switcher ────────────────────────────────────── */}
      {!isWide && (
        <View style={styles.paneTabBar}>
          <Pressable
            onPress={() => setPaneTab('menu')}
            style={[styles.paneTab, paneTab === 'menu' && styles.paneTabActive]}
          >
            <Text style={[styles.paneTabText, paneTab === 'menu' && styles.paneTabTextActive]}>Menu</Text>
          </Pressable>
          <Pressable
            onPress={() => setPaneTab('ticket')}
            style={[styles.paneTab, paneTab === 'ticket' && styles.paneTabActive]}
          >
            <Text style={[styles.paneTabText, paneTab === 'ticket' && styles.paneTabTextActive]}>
              Ticket {itemCount > 0 ? `(${itemCount})` : ''}
            </Text>
            {itemCount > 0 && (
              <View style={styles.paneTabBadge}><Text style={styles.paneTabBadgeText}>{fmtCents(total)}</Text></View>
            )}
          </Pressable>
        </View>
      )}

      {/* ── Main two-pane (or single-pane) ─────────────────────────────────── */}
      <View style={styles.body}>
        {/* ── Product browser ────────────────────────────────────────────── */}
        {(isWide || paneTab === 'menu') && (
          <View style={[styles.menuPane, isWide && { flex: 3 }]}>
            {/* Search + category chips */}
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Feather name="search" size={16} color={MUTED} style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search products…"
                  placeholderTextColor={MUTED}
                  value={searchText}
                  onChangeText={setSearchText}
                  returnKeyType="search"
                />
                {searchText.length > 0 && (
                  <Pressable onPress={() => setSearchText('')}>
                    <Feather name="x" size={16} color={MUTED} />
                  </Pressable>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              {categories.map(cat => {
                const active = selCategory === cat;
                const color  = customCatColors[cat.toLowerCase()] ?? getDefaultCatColor(cat);
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelCategory(cat)}
                    onLongPress={() => setColorPickerCat(cat)}
                    delayLongPress={400}
                    style={[
                      styles.catTile,
                      active
                        ? { backgroundColor: color, borderColor: color }
                        : { backgroundColor: `${color}18`, borderColor: `${color}45` },
                    ]}
                  >
                    <Text style={[styles.catTileLabel, { color: active ? '#fff' : color }]} numberOfLines={2}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}

              {/* "All" tile always at the end */}
              <Pressable
                onPress={() => setSelCategory('all')}
                style={[
                  styles.catTile,
                  selCategory === 'all'
                    ? { backgroundColor: BLUE, borderColor: BLUE }
                    : { backgroundColor: `${BLUE}15`, borderColor: `${BLUE}40` },
                ]}
              >
                <Text style={[styles.catTileLabel, { color: selCategory === 'all' ? '#fff' : BLUE }]}>All</Text>
              </Pressable>
            </ScrollView>

            {loadingProducts ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={BLUE} />
              </View>
            ) : (
              <FlatList
                data={filteredProducts}
                keyExtractor={item => item.id}
                numColumns={isWide ? 3 : 2}
                key={isWide ? 'wide' : 'narrow'}
                contentContainerStyle={{ padding: 8, gap: 0 }}
                columnWrapperStyle={{ gap: 8, marginBottom: 8, paddingHorizontal: 4 }}
                renderItem={({ item }) => (
                  <ProductGridCard
                    product={item}
                    onPress={() => handleProductTap(item)}
                    loading={loadingDetail === item.id}
                    isWide={isWide}
                  />
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {/* ── Ticket panel ───────────────────────────────────────────────── */}
        {(isWide || paneTab === 'ticket') && (
          <View style={[styles.ticketPane, isWide && { flex: 2 }]}>
            <TicketPanel
              ticket={activeTicket}
              onUpdateTicket={updateTicket}
              onRemoveItem={removeItem}
              onUpdateQty={updateItemQty}
              onClear={clearTicket}
              onHold={tickets.length <= 3 ? holdTicket : undefined}
              onAttachCustomer={() => setShowCustomerModal(true)}
              onCharge={() => setShowPayment(true)}
              onEditItem={(item) => {
                const cached = detailCache[item.productId];
                if (cached) setCustomiseData({ product: cached, editItem: item });
              }}
            />
          </View>
        )}
      </View>

      {/* ── Customise sheet ────────────────────────────────────────────────── */}
      {customiseData && (
        <CustomiseModal
          data={customiseData}
          onClose={() => setCustomiseData(null)}
          onAdd={(item) => {
            if (customiseData.editItem) {
              // Replace edited item — clear discount as item composition changed
              setTickets(prev => prev.map((t, i) => i !== activeIdx ? t : {
                ...t,
                items: t.items.map(x => x.localId === customiseData.editItem!.localId ? item : x),
                appliedDiscount: null,
              }));
            } else {
              addItemToTicket(item);
            }
            setCustomiseData(null);
            if (!isWide) setPaneTab('ticket');
          }}
        />
      )}

      {/* ── Payment modal ──────────────────────────────────────────────────── */}
      {showPayment && (
        <PaymentModal
          totalCents={total}
          subtotalCents={subtotal}
          discount={activeTicket.appliedDiscount}
          onClose={() => setShowPayment(false)}
          onConfirm={(method, tendered) => {
            createOrderMutation.mutate({ paymentMethod: method, amountTenderedCents: tendered });
          }}
          loading={createOrderMutation.isPending}
        />
      )}

      {/* ── Post-payment loyalty card ──────────────────────────────────────── */}
      {completedOrder && (
        <OrderCompleteModal
          order={completedOrder}
          onClose={() => setCompletedOrder(null)}
        />
      )}

      {/* ── Customer search / QR modal ────────────────────────────────────── */}
      {showCustomerModal && (
        <CustomerModal
          currentCustomer={activeTicket.customer}
          onSelect={(c) => {
            updateTicket({ customer: c, appliedDiscount: null });
            setShowCustomerModal(false);
          }}
          onRemove={() => {
            updateTicket({ customer: null, appliedDiscount: null });
            setShowCustomerModal(false);
          }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {/* ── History modal ──────────────────────────────────────────────────── */}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          onVoidSuccess={(id) => {
            if (id === lastOrderId) setLastOrderId(null);
            refetchSummary();
            queryClient.invalidateQueries({ queryKey: ['pos-summary'] });
          }}
        />
      )}

      {/* ── Category colour picker ─────────────────────────────────────────── */}
      <Modal
        visible={colorPickerCat !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setColorPickerCat(null)}
      >
        <Pressable style={styles.cpOverlay} onPress={() => setColorPickerCat(null)}>
          <Pressable style={styles.cpSheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.cpTitle}>
              Choose colour for{' '}
              <Text style={{ fontWeight: '700' }}>
                {colorPickerCat ? colorPickerCat.charAt(0).toUpperCase() + colorPickerCat.slice(1) : ''}
              </Text>
            </Text>
            <View style={styles.cpGrid}>
              {PRESET_COLORS.map(c => (
                <Pressable
                  key={c}
                  onPress={() => colorPickerCat && saveCatColor(colorPickerCat, c)}
                  style={[
                    styles.cpSwatch,
                    { backgroundColor: c },
                    colorPickerCat && (customCatColors[colorPickerCat.toLowerCase()] ?? getDefaultCatColor(colorPickerCat)) === c && styles.cpSwatchActive,
                  ]}
                />
              ))}
            </View>
            <Pressable
              onPress={() => colorPickerCat && saveCatColor(colorPickerCat, null)}
              style={styles.cpReset}
            >
              <Text style={styles.cpResetText}>Reset to default</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Product Grid Card ─────────────────────────────────────────────────────────
function ProductGridCard({
  product, onPress, loading, isWide,
}: {
  product: any; onPress: () => void; loading: boolean; isWide: boolean;
}) {
  const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
  const imgUrl = product.images?.[0] ?? null;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.productCard, { flex: 1 }]}
      activeOpacity={0.75}
    >
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={styles.productCardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.productCardImage, { backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' }]}>
          <Feather name="package" size={28} color={BLUE} />
        </View>
      )}
      <View style={styles.productCardBody}>
        <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Text style={styles.productCardPrice}>{fmtCents(basePriceCents)}</Text>
          {product.hasVariants && (
            <View style={styles.variantBadge}>
              <Text style={styles.variantBadgeText}>options</Text>
            </View>
          )}
        </View>
      </View>
      {loading && (
        <View style={styles.productCardOverlay}>
          <ActivityIndicator color={BLUE} size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Ticket Panel ──────────────────────────────────────────────────────────────
function TicketPanel({
  ticket, onUpdateTicket, onRemoveItem, onUpdateQty,
  onClear, onHold, onAttachCustomer, onCharge, onEditItem,
}: {
  ticket: Ticket;
  onUpdateTicket: (p: Partial<Ticket>) => void;
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onClear: () => void;
  onHold?: () => void;
  onAttachCustomer: () => void;
  onCharge: () => void;
  onEditItem: (item: TicketItem) => void;
}) {
  const subtotal = ticketSubtotal(ticket);
  const total = ticketTotal(ticket);
  const isEmpty = ticket.items.length === 0;
  const discount = ticket.appliedDiscount;

  // Local discount input state
  const [codeInput, setCodeInput] = React.useState('');
  const [validating, setValidating] = React.useState(false);
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [showCodeInput, setShowCodeInput] = React.useState(false);

  // Determine if customer has free coffee rewards and order has coffee items
  const hasCoffeeItems = ticket.items.some(i => i.category.toLowerCase() === 'coffee');
  const canRedeemFreeCoffee = (ticket.customer?.freeCoffeeRewards ?? 0) > 0 && hasCoffeeItems && discount?.type !== 'free_coffee';

  const applyPctDiscount = (pct: number) => {
    const amountCents = Math.round(subtotal * pct / 100);
    onUpdateTicket({ appliedDiscount: { type: 'pct', pct, amountCents, label: `${pct}% off` } });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const applyFreeCoffee = () => {
    const coffeeItems = ticket.items.filter(i => i.category.toLowerCase() === 'coffee');
    if (coffeeItems.length === 0) return;
    const cheapest = Math.min(...coffeeItems.map(i => i.unitPriceCents));
    onUpdateTicket({
      appliedDiscount: {
        type: 'free_coffee',
        amountCents: cheapest,
        label: `☕ Free Coffee (–${fmtCents(cheapest)})`,
      },
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const applyClaimedReward = (cr: AttachedCustomerClaimedReward) => {
    const subtotal = ticketSubtotal(ticket);
    // Voucher rewards deduct their face value (capped to subtotal); other rewards are fully free
    const amountCents = cr.voucherValueCents
      ? Math.min(cr.voucherValueCents, subtotal)
      : subtotal;
    const label = cr.voucherValueCents
      ? `🎁 ${cr.rewardName} (–${fmtCents(Math.min(cr.voucherValueCents, subtotal))})`
      : `🎁 ${cr.rewardName} (free)`;
    onUpdateTicket({
      appliedDiscount: {
        type: 'claimed_reward',
        claimedRewardId: cr.id,
        amountCents,
        label,
      },
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const applyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setValidating(true);
    setCodeError(null);
    try {
      const res = await api.discounts.validate({
        code,
        items: ticket.items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          selectedOptions: i.selectedOptions.map(o => ({
            optionId: o.optionId,
            groupId: o.groupId,
            priceAdjustmentCents: o.priceAdjustmentCents,
          })),
        })),
        orderType: 'pickup',
        customerId: ticket.customer?.userId,
      });
      if (res.valid) {
        onUpdateTicket({
          appliedDiscount: {
            type: 'code',
            code: res.code,
            codeId: res.id,
            amountCents: res.discountAmountCents,
            label: `Code: ${res.code} (–${fmtCents(res.discountAmountCents)})`,
          },
        });
        setShowCodeInput(false);
        setCodeInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setCodeError(err?.message ?? 'Invalid discount code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setValidating(false);
    }
  };

  const removeDiscount = () => {
    onUpdateTicket({ appliedDiscount: null });
    setCodeInput('');
    setCodeError(null);
    setShowCodeInput(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.ticketContainer}>
      {/* Customer bar */}
      <TouchableOpacity onPress={onAttachCustomer} style={styles.customerBar} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Feather name="user" size={16} color={ticket.customer ? BLUE : MUTED} />
          {ticket.customer ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{ticket.customer.name}</Text>
              <Text style={styles.customerSub}>
                {ticket.customer.loyaltyPoints} pts · {ticket.customer.stampCount}/{STAMP_GOAL} stamps
                {(ticket.customer.freeCoffeeRewards ?? 0) > 0 ? ` · ☕×${ticket.customer.freeCoffeeRewards}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.customerPlaceholder}>Attach customer</Text>
          )}
        </View>
        <Feather name="chevron-right" size={14} color={MUTED} />
      </TouchableOpacity>

      {/* Order type */}
      <View style={styles.orderTypeRow}>
        {(['counter', 'dine_in', 'takeaway'] as OrderType[]).map(type => (
          <Pressable
            key={type}
            onPress={() => onUpdateTicket({ orderType: type })}
            style={[styles.orderTypeChip, ticket.orderType === type && styles.orderTypeChipActive]}
          >
            <Text style={[styles.orderTypeText, ticket.orderType === type && styles.orderTypeTextActive]}>
              {type === 'counter' ? 'Counter' : type === 'dine_in' ? 'Dine In' : 'Takeaway'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Items list */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyTicket}>
            <Feather name="shopping-cart" size={36} color={MUTED} />
            <Text style={styles.emptyTicketText}>Tap products to add to the ticket</Text>
          </View>
        ) : (
          ticket.items.map(item => (
            <TicketItemRow
              key={item.localId}
              item={item}
              onRemove={() => onRemoveItem(item.localId)}
              onIncrement={() => onUpdateQty(item.localId, 1)}
              onDecrement={() => onUpdateQty(item.localId, -1)}
              onEdit={() => onEditItem(item)}
            />
          ))
        )}
      </ScrollView>

      {/* ── Discount section ─────────────────────────────────────────────────── */}
      {!isEmpty && (
        <View style={styles.discountSection}>
          {/* Applied discount badge */}
          {discount ? (
            <View style={styles.discountApplied}>
              <Feather name="tag" size={13} color="#16A34A" />
              <Text style={styles.discountAppliedText} numberOfLines={1}>{discount.label}</Text>
              <Pressable onPress={removeDiscount} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <Feather name="x" size={14} color={MID} />
              </Pressable>
            </View>
          ) : (
            <>
              {/* Quick % chips + code button */}
              <View style={styles.discountChips}>
                {([10, 20, 50] as const).map(pct => (
                  <Pressable key={pct} onPress={() => applyPctDiscount(pct)} style={styles.discountChip}>
                    <Text style={styles.discountChipText}>{pct}%</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => { setShowCodeInput(v => !v); setCodeError(null); }} style={styles.discountChipCode}>
                  <Feather name="hash" size={12} color={BLUE} />
                  <Text style={[styles.discountChipText, { color: BLUE }]}>Code</Text>
                </Pressable>
                {canRedeemFreeCoffee && (
                  <Pressable onPress={applyFreeCoffee} style={styles.discountChipCoffee}>
                    <Text style={styles.discountChipText}>☕ Free</Text>
                  </Pressable>
                )}
                {(ticket.customer?.availableClaimedRewards ?? []).map(cr => {
                  const chipLabel = cr.voucherValueCents
                    ? `🎁 $${(cr.voucherValueCents / 100).toFixed(0)} off`
                    : `🎁 ${cr.rewardName}`;
                  return (
                    <Pressable
                      key={cr.id}
                      onPress={() => applyClaimedReward(cr)}
                      style={styles.discountChipReward}
                    >
                      <Text style={styles.discountChipText}>{chipLabel}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {/* Code input row */}
              {showCodeInput && (
                <View style={styles.discountCodeRow}>
                  <TextInput
                    style={styles.discountCodeInput}
                    placeholder="Enter code…"
                    placeholderTextColor={MUTED}
                    value={codeInput}
                    onChangeText={t => { setCodeInput(t.toUpperCase()); setCodeError(null); }}
                    autoCapitalize="characters"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={applyCode}
                  />
                  <Pressable
                    onPress={applyCode}
                    disabled={validating || !codeInput.trim()}
                    style={[styles.discountCodeApplyBtn, (!codeInput.trim() || validating) && { opacity: 0.5 }]}
                  >
                    {validating
                      ? <ActivityIndicator size="small" color={WHITE} />
                      : <Text style={styles.discountCodeApplyText}>Apply</Text>}
                  </Pressable>
                </View>
              )}
              {codeError ? (
                <Text style={styles.discountCodeError}>{codeError}</Text>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* Totals */}
      {!isEmpty && (
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmtCents(subtotal)}</Text>
          </View>
          {discount && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#16A34A' }]}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#16A34A' }]}>–{fmtCents(discount.amountCents)}</Text>
            </View>
          )}
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalFinalLabel}>Total</Text>
            <Text style={styles.totalFinalValue}>{fmtCents(total)}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.ticketActions}>
        {!isEmpty && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <Pressable onPress={onClear} style={styles.clearBtn}>
              <Feather name="trash-2" size={14} color={CHERRY} />
              <Text style={styles.clearBtnText}>Clear</Text>
            </Pressable>
            {onHold && (
              <Pressable onPress={onHold} style={styles.holdBtn}>
                <Feather name="pause" size={14} color={MID} />
                <Text style={styles.holdBtnText}>Hold</Text>
              </Pressable>
            )}
          </View>
        )}
        <TouchableOpacity
          onPress={onCharge}
          style={[styles.chargeBtn, isEmpty && { opacity: 0.5 }]}
          disabled={isEmpty}
          activeOpacity={0.8}
        >
          <Feather name="credit-card" size={18} color={WHITE} />
          <Text style={styles.chargeBtnText}>
            {isEmpty ? 'Charge' : `Charge ${fmtCents(total)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Ticket Item Row ───────────────────────────────────────────────────────────
function TicketItemRow({
  item, onRemove, onIncrement, onDecrement, onEdit,
}: {
  item: TicketItem; onRemove: () => void;
  onIncrement: () => void; onDecrement: () => void; onEdit: () => void;
}) {
  const lineTotal = item.unitPriceCents * item.quantity;
  const optionSummary = item.selectedOptions.map(o => o.optionName).join(', ');
  const variantLabel = item.variantName;

  return (
    <View style={styles.ticketItem}>
      <TouchableOpacity onPress={onEdit} style={{ flex: 1 }} activeOpacity={0.7}>
        <Text style={styles.ticketItemName} numberOfLines={1}>{item.productName}</Text>
        {(variantLabel || optionSummary) && (
          <Text style={styles.ticketItemMeta} numberOfLines={1}>
            {[variantLabel, optionSummary].filter(Boolean).join(' · ')}
          </Text>
        )}
        {item.notes ? (
          <Text style={styles.ticketItemNotes} numberOfLines={1}>Note: {item.notes}</Text>
        ) : null}
      </TouchableOpacity>
      <View style={styles.ticketItemRight}>
        <Text style={styles.ticketItemPrice}>{fmtCents(lineTotal)}</Text>
        <View style={styles.qtyControls}>
          <Pressable onPress={onDecrement} style={styles.qtyBtn} hitSlop={6}>
            {item.quantity === 1
              ? <Feather name="trash-2" size={14} color={CHERRY} />
              : <Feather name="minus" size={14} color={MID} />}
          </Pressable>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <Pressable onPress={onIncrement} style={styles.qtyBtn} hitSlop={6}>
            <Feather name="plus" size={14} color={BLUE} />
          </Pressable>
        </View>
      </View>
      <Pressable onPress={onRemove} style={styles.ticketItemDelete} hitSlop={8}>
        <Feather name="x" size={14} color={MUTED} />
      </Pressable>
    </View>
  );
}

// ── Customise Modal ───────────────────────────────────────────────────────────
function CustomiseModal({ data, onClose, onAdd }: {
  data: { product: ProductDetail; editItem?: TicketItem };
  onClose: () => void;
  onAdd: (item: TicketItem) => void;
}) {
  const { product, editItem } = data;
  const basePriceCents = product.salePriceCents ?? product.priceCents ?? 0;
  const hasVariants = product.variants.length > 0;

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    editItem?.variantId ?? (hasVariants ? product.variants[0]?.id ?? null : null)
  );
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>(
    () => {
      const init: Record<string, string[]> = {};
      if (editItem) {
        for (const o of editItem.selectedOptions) {
          if (!init[o.groupId]) init[o.groupId] = [];
          init[o.groupId]!.push(o.optionId);
        }
      } else {
        for (const g of product.optionGroups) {
          const defaults = g.options.filter(o => o.isDefault).map(o => o.id);
          if (defaults.length > 0) init[g.id] = g.selectionType === 'single' ? [defaults[0]!] : defaults;
        }
      }
      return init;
    }
  );
  const [quantity, setQuantity] = useState(editItem?.quantity ?? 1);
  const [notes, setNotes] = useState(editItem?.notes ?? '');

  const selectedVariant = product.variants.find(v => v.id === selectedVariantId) ?? null;
  const variantPrice = selectedVariant?.priceCents ?? basePriceCents;

  const optionDelta = product.optionGroups.reduce((sum, g) => {
    const sel = selectedOptions[g.id] ?? [];
    return sum + g.options.filter(o => sel.includes(o.id)).reduce((s, o) => s + o.priceAdjustmentCents, 0);
  }, 0);

  const unitPriceCents = variantPrice + optionDelta;

  const toggleOption = (groupId: string, optionId: string, selectionType: 'single' | 'multi') => {
    setSelectedOptions(prev => {
      const current = prev[groupId] ?? [];
      if (selectionType === 'single') {
        return { ...prev, [groupId]: [optionId] };
      } else {
        const next = current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId];
        return { ...prev, [groupId]: next };
      }
    });
  };

  const handleAdd = () => {
    const allSelectedOptions: SelectedOption[] = product.optionGroups.flatMap(g => {
      const sel = selectedOptions[g.id] ?? [];
      return g.options.filter(o => sel.includes(o.id)).map(o => ({
        groupId: g.id,
        groupName: g.name,
        optionId: o.id,
        optionName: o.name,
        priceAdjustmentCents: o.priceAdjustmentCents,
      }));
    });

    onAdd({
      localId: editItem?.localId ?? uuid(),
      productId: product.id,
      productName: product.name,
      category: product.category ?? '',
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      variantPriceCents: selectedVariant?.priceCents,
      selectedOptions: allSelectedOptions,
      quantity,
      unitPriceCents,
      notes,
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1}>{product.name}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {/* Variant picker */}
          {hasVariants && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Size / Variant</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map(v => {
                  const isSelected = selectedVariantId === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setSelectedVariantId(v.id)}
                      style={[styles.variantChip, isSelected && styles.variantChipActive]}
                    >
                      <Text style={[styles.variantChipText, isSelected && { color: WHITE }]}>
                        {v.name} · {fmtCents(v.priceCents)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Option groups */}
          {product.optionGroups.map(group => (
            <View key={group.id} style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.sectionTitle}>{group.name}</Text>
                {group.isRequired && (
                  <Text style={styles.requiredBadge}>Required</Text>
                )}
              </View>
              {group.description ? (
                <Text style={styles.sectionSubtitle}>{group.description}</Text>
              ) : null}
              <View style={{ gap: 8, marginTop: 8 }}>
                {group.options.map(opt => {
                  const isSelected = (selectedOptions[group.id] ?? []).includes(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => toggleOption(group.id, opt.id, group.selectionType)}
                      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    >
                      <View style={[styles.optionCheck, group.selectionType === 'single' ? styles.optionRadio : {}, isSelected && styles.optionCheckSelected]}>
                        {isSelected && <Feather name="check" size={11} color={WHITE} />}
                      </View>
                      <Text style={styles.optionName}>{opt.name}</Text>
                      {opt.priceAdjustmentCents !== 0 && (
                        <Text style={styles.optionPrice}>
                          {opt.priceAdjustmentCents > 0 ? '+' : ''}{fmtCents(opt.priceAdjustmentCents)}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Quantity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quantity</Text>
            <View style={styles.quantityStepper}>
              <Pressable
                onPress={() => setQuantity(q => Math.max(1, q - 1))}
                style={styles.stepperBtn}
              >
                <Feather name="minus" size={18} color={MID} />
              </Pressable>
              <Text style={styles.stepperQty}>{quantity}</Text>
              <Pressable
                onPress={() => setQuantity(q => Math.min(99, q + 1))}
                style={styles.stepperBtn}
              >
                <Feather name="plus" size={18} color={DARK} />
              </Pressable>
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. No ice, extra hot…"
              placeholderTextColor={MUTED}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.sheetFooter}>
          <View>
            <Text style={styles.sheetPriceLabel}>Unit price</Text>
            <Text style={styles.sheetPrice}>{fmtCents(unitPriceCents)}</Text>
          </View>
          <TouchableOpacity onPress={handleAdd} style={styles.addToOrderBtn} activeOpacity={0.85}>
            <Text style={styles.addToOrderBtnText}>
              {editItem ? 'Update Item' : `Add ${quantity > 1 ? `${quantity}x ` : ''}· ${fmtCents(unitPriceCents * quantity)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({
  totalCents, subtotalCents, discount, onClose, onConfirm, loading,
}: {
  totalCents: number; subtotalCents: number;
  discount: AppliedDiscount | null;
  onClose: () => void;
  onConfirm: (method: 'cash' | 'eftpos', tendered?: number) => void;
  loading: boolean;
}) {
  const [method, setMethod] = useState<'cash' | 'eftpos'>('eftpos');
  const [tendered, setTendered] = useState('');

  const tenderedCents = Math.round(parseFloat(tendered || '0') * 100);
  const changeCents = method === 'cash' ? Math.max(0, tenderedCents - totalCents) : 0;
  const cashOk = method !== 'cash' || tenderedCents >= totalCents;

  const handleKeypad = (val: string) => {
    if (val === 'backspace') {
      setTendered(prev => prev.slice(0, -1));
    } else if (val === '.') {
      if (!tendered.includes('.')) setTendered(prev => prev + '.');
    } else {
      const next = tendered + val;
      if (!isNaN(parseFloat(next)) || next === '.') setTendered(next);
    }
  };

  // Quick tender presets
  const roundUpPresets = [5, 10, 20, 50].filter(d => d * 100 >= totalCents).slice(0, 3);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.customiseRoot}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} hitSlop={12} disabled={loading}>
              <Feather name="x" size={22} color={DARK} />
            </Pressable>
            <Text style={styles.sheetTitle}>Payment</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            {/* Total */}
            <View style={styles.payTotal}>
              <Text style={styles.payTotalLabel}>Total Due</Text>
              <Text style={styles.payTotalValue}>{fmtCents(totalCents)}</Text>
            </View>
            {/* Discount summary */}
            {discount && (
              <View style={styles.payDiscountRow}>
                <Feather name="tag" size={13} color="#16A34A" />
                <Text style={styles.payDiscountLabel}>{discount.label}</Text>
                <Text style={styles.payDiscountSaving}>–{fmtCents(discount.amountCents)}</Text>
              </View>
            )}

            {/* Method selector */}
            <View style={styles.methodRow}>
              <Pressable
                onPress={() => setMethod('eftpos')}
                style={[styles.methodBtn, method === 'eftpos' && styles.methodBtnActive]}
              >
                <Feather name="credit-card" size={20} color={method === 'eftpos' ? WHITE : MID} />
                <Text style={[styles.methodBtnText, method === 'eftpos' && { color: WHITE }]}>EFTPOS</Text>
              </Pressable>
              <Pressable
                onPress={() => { setMethod('cash'); setTendered(''); }}
                style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive]}
              >
                <Feather name="dollar-sign" size={20} color={method === 'cash' ? WHITE : MID} />
                <Text style={[styles.methodBtnText, method === 'cash' && { color: WHITE }]}>Cash</Text>
              </Pressable>
            </View>

            {method === 'eftpos' && (
              <View style={styles.eftposInstructions}>
                <Feather name="wifi" size={24} color={BLUE} />
                <Text style={styles.eftposText}>Present card or device to EFTPOS terminal</Text>
                <Text style={styles.eftposSubText}>Tap, insert, or swipe · then confirm below</Text>
              </View>
            )}

            {method === 'cash' && (
              <View>
                {/* Quick presets */}
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Tendered Amount</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {roundUpPresets.map(d => (
                    <Pressable
                      key={d}
                      onPress={() => setTendered(String(d))}
                      style={styles.presetBtn}
                    >
                      <Text style={styles.presetBtnText}>${d}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Tendered display */}
                <View style={styles.tenderedDisplay}>
                  <Text style={styles.tenderedText}>${tendered || '0'}</Text>
                </View>

                {/* Change */}
                {tenderedCents >= totalCents && (
                  <View style={styles.changeRow}>
                    <Text style={styles.changeLabel}>Change</Text>
                    <Text style={styles.changeValue}>{fmtCents(changeCents)}</Text>
                  </View>
                )}

                {/* Numpad */}
                <View style={styles.numpad}>
                  {['7','8','9','4','5','6','1','2','3','.','0','backspace'].map(k => (
                    <Pressable key={k} onPress={() => handleKeypad(k)} style={styles.numpadKey}>
                      {k === 'backspace'
                        ? <Feather name="delete" size={20} color={DARK} />
                        : <Text style={styles.numpadKeyText}>{k}</Text>}
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            {loading ? (
              <View style={[styles.addToOrderBtn, { justifyContent: 'center' }]}>
                <ActivityIndicator color={WHITE} />
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => onConfirm(method, method === 'cash' ? tenderedCents : undefined)}
                style={[styles.addToOrderBtn, !cashOk && { opacity: 0.5 }]}
                disabled={!cashOk || loading}
                activeOpacity={0.85}
              >
                <Text style={styles.addToOrderBtnText}>
                  {method === 'cash'
                    ? `Confirm Cash · ${fmtCents(totalCents)}`
                    : `Confirm EFTPOS · ${fmtCents(totalCents)}`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Order Complete / Loyalty Modal ────────────────────────────────────────────
function OrderCompleteModal({ order, onClose }: {
  order: {
    id: string; orderNumber: string; totalCents: number;
    paymentMethod: 'cash' | 'eftpos';
    amountTenderedCents?: number;
    loyaltyResult: PosLoyaltyResult | null;
  };
  onClose: () => void;
}) {
  const changeCents = order.paymentMethod === 'cash' && order.amountTenderedCents
    ? Math.max(0, order.amountTenderedCents - order.totalCents)
    : null;
  const lr = order.loyaltyResult;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.completeBg}>
        <View style={styles.completeCard}>
          {/* Checkmark */}
          <View style={styles.completeCheck}>
            <Feather name="check" size={32} color={WHITE} />
          </View>
          <Text style={styles.completeTitle}>Payment Complete</Text>
          <Text style={styles.completeOrder}>#{order.orderNumber}</Text>
          <Text style={styles.completeTotal}>{fmtCents(order.totalCents)}</Text>
          {changeCents !== null && changeCents > 0 && (
            <View style={styles.changeRowComplete}>
              <Text style={styles.changeLabelComplete}>Change Due</Text>
              <Text style={styles.changeValueComplete}>{fmtCents(changeCents)}</Text>
            </View>
          )}

          {/* Loyalty result */}
          {lr && (
            <View style={styles.loyaltyCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={styles.loyaltyStatLabel}>Points Earned</Text>
                  <Text style={styles.loyaltyStatValue}>+{lr.pointsEarned}</Text>
                  <Text style={styles.loyaltyStatSub}>{lr.newBalance} total</Text>
                </View>
                <View style={styles.loyaltyDivider} />
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={styles.loyaltyStatLabel}>Stamps</Text>
                  <Text style={styles.loyaltyStatValue}>{lr.newStampCount}/{STAMP_GOAL}</Text>
                  <Text style={styles.loyaltyStatSub}>{lr.stampsAdded > 0 ? '+1 stamp' : 'no coffee'}</Text>
                </View>
              </View>
              {lr.rewardUnlocked && (
                <View style={styles.rewardUnlocked}>
                  <Feather name="gift" size={16} color="#16A34A" />
                  <Text style={styles.rewardUnlockedText}>☕ Free coffee reward unlocked!</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity onPress={onClose} style={styles.completeCloseBtn} activeOpacity={0.8}>
            <Text style={styles.completeCloseBtnText}>New Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Customer Modal ────────────────────────────────────────────────────────────
function CustomerModal({
  currentCustomer, onSelect, onRemove, onClose,
}: {
  currentCustomer: AttachedCustomer | null;
  onSelect: (c: AttachedCustomer) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [mode, setMode]       = useState<'search' | 'scan'>('search');
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<PosCustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanAt = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.pos.customerSearch({ q: query.trim() });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleQrScan = useCallback(async ({ data }: { data: string }) => {
    if (!data.startsWith('BUTTERFIELD:')) return;
    const now = Date.now();
    if (now - lastScanAt.current < 2000) return;
    lastScanAt.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const res = await api.pos.customerSearch({ qrPayload: data });
      if (res.data.length > 0) {
        const c = res.data[0]!;
        onSelect({
          userId: c.userId, name: c.name, email: c.email,
          loyaltyPoints: c.loyaltyPoints, stampCount: c.stampCount,
          loyaltyTier: c.loyaltyTier, freeCoffeeRewards: c.freeCoffeeRewards ?? 0,
          availableClaimedRewards: c.availableClaimedRewards ?? [],
        });
      } else {
        Alert.alert('Not Found', 'Customer not found for this QR code.');
      }
    } catch {
      Alert.alert('Error', 'Could not look up customer.');
    }
  }, [onSelect]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>Attach Customer</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Current customer */}
        {currentCustomer && (
          <View style={styles.currentCustomerCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{currentCustomer.name}</Text>
              <Text style={styles.customerSub}>
                {currentCustomer.loyaltyPoints} pts · {currentCustomer.stampCount}/{STAMP_GOAL} stamps
              </Text>
            </View>
            <Pressable onPress={onRemove} style={styles.removeCustomerBtn}>
              <Text style={styles.removeCustomerText}>Remove</Text>
            </Pressable>
          </View>
        )}

        {/* Mode switch */}
        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('search')} style={[styles.modeBtn, mode === 'search' && styles.modeBtnActive]}>
            <Feather name="search" size={16} color={mode === 'search' ? BLUE : MID} />
            <Text style={[styles.modeBtnText, mode === 'search' && { color: BLUE }]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              if (!permission?.granted) await requestPermission();
              setMode('scan');
            }}
            style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}
          >
            <Feather name="maximize" size={16} color={mode === 'scan' ? BLUE : MID} />
            <Text style={[styles.modeBtnText, mode === 'scan' && { color: BLUE }]}>Scan QR</Text>
          </Pressable>
        </View>

        {mode === 'search' && (
          <View style={{ flex: 1 }}>
            <View style={[styles.searchInputWrap, { margin: 12 }]}>
              <Feather name="search" size={16} color={MUTED} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Name or email…"
                placeholderTextColor={MUTED}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            <FlatList
              data={results}
              keyExtractor={item => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => onSelect({
                    userId: item.userId, name: item.name, email: item.email,
                    loyaltyPoints: item.loyaltyPoints, stampCount: item.stampCount,
                    loyaltyTier: item.loyaltyTier, freeCoffeeRewards: item.freeCoffeeRewards ?? 0,
                    availableClaimedRewards: item.availableClaimedRewards ?? [],
                  })}
                  style={styles.customerResultRow}
                  activeOpacity={0.7}
                >
                  <View style={styles.customerAvatar}>
                    <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>{item.name}</Text>
                    <Text style={styles.customerSub}>{item.email} · {item.loyaltyPoints} pts</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                query.length >= 2 && !searching
                  ? <Text style={{ textAlign: 'center', color: MUTED, padding: 24 }}>No customers found</Text>
                  : null
              }
            />
          </View>
        )}

        {mode === 'scan' && (
          <View style={{ flex: 1 }}>
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden' }}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleQrScan}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                <Feather name="camera-off" size={48} color={MUTED} />
                <Text style={{ color: MID, textAlign: 'center' }}>Camera access required to scan QR codes</Text>
                <Pressable onPress={requestPermission} style={styles.presetBtn}>
                  <Text style={styles.presetBtnText}>Grant Permission</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── History Modal ─────────────────────────────────────────────────────────────
type HistoryFilter = 'all' | 'active' | 'voided';

function HistoryModal({
  onClose, onVoidSuccess,
}: {
  onClose: () => void;
  onVoidSuccess: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [now, setNow] = useState(() => Date.now());

  // Tick every 15s so the "Void" window timer refreshes
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pos-history'],
    queryFn: () => api.pos.orders(),
    staleTime: 30_000,
  });

  const allOrders: PosHistoryOrder[] = (data as any)?.data ?? [];

  // Self-contained void mutation so we know exactly which order is being voided
  const voidMutation = useMutation({
    mutationFn: (id: string) => api.pos.voidOrder(id),
    onSuccess: (_, id) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Voided', 'Transaction has been voided.');
      onVoidSuccess(id);
      queryClient.invalidateQueries({ queryKey: ['pos-history'] });
      refetch();
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).');
    },
  });

  const totalRevenue = allOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + o.totalCents, 0);

  const filteredOrders = useMemo(() => {
    if (filter === 'active') return allOrders.filter(o => o.status !== 'cancelled');
    if (filter === 'voided') return allOrders.filter(o => o.status === 'cancelled');
    return allOrders;
  }, [allOrders, filter]);

  const countActive = allOrders.filter(o => o.status !== 'cancelled').length;
  const countVoided = allOrders.filter(o => o.status === 'cancelled').length;

  const statusColor = (s: string) => {
    if (s === 'cancelled') return CHERRY;
    if (s === 'received' || s === 'preparing') return '#F59E0B';
    return '#16A34A';
  };

  const statusLabel = (s: string) => {
    if (s === 'cancelled') return 'Voided';
    if (s === 'received') return 'Received';
    if (s === 'preparing') return 'Preparing';
    if (s === 'ready') return 'Ready';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-AU', {
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Australia/Sydney',
      });
    } catch { return ''; }
  };

  const canVoid = (order: PosHistoryOrder) => {
    if (order.status === 'cancelled') return false;
    return now - new Date(order.createdAt).getTime() < 5 * 60 * 1000;
  };

  const handleVoid = (order: PosHistoryOrder) => {
    Alert.alert(
      'Void Transaction',
      `Void order #${order.orderNumber} (${fmtCents(order.totalCents)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void', style: 'destructive',
          onPress: () => voidMutation.mutate(order.id),
        },
      ]
    );
  };

  const FILTER_CHIPS: { key: HistoryFilter; label: string; count: number }[] = [
    { key: 'all',    label: 'All',    count: allOrders.length },
    { key: 'active', label: 'Active', count: countActive },
    { key: 'voided', label: 'Voided', count: countVoided },
  ];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>Sales History</Text>
          <Pressable onPress={() => refetch()} hitSlop={12} disabled={isRefetching}>
            <Feather name="refresh-cw" size={18} color={isRefetching ? MUTED : BLUE} />
          </Pressable>
        </View>

        {/* Summary bar */}
        <View style={styles.historySummaryBar}>
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Transactions</Text>
            <Text style={styles.historySummaryValue}>{countActive}</Text>
          </View>
          <View style={styles.historySummaryDivider} />
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Revenue</Text>
            <Text style={styles.historySummaryValue}>{fmtCents(totalRevenue)}</Text>
          </View>
          <View style={styles.historySummaryDivider} />
          <View style={styles.historySummaryItem}>
            <Text style={styles.historySummaryLabel}>Voided</Text>
            <Text style={[styles.historySummaryValue, { color: CHERRY }]}>{countVoided}</Text>
          </View>
        </View>

        {/* Status filter chips */}
        <View style={styles.historyFilterRow}>
          {FILTER_CHIPS.map(chip => (
            <Pressable
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={[styles.historyFilterChip, filter === chip.key && styles.historyFilterChipActive]}
            >
              <Text style={[styles.historyFilterChipText, filter === chip.key && styles.historyFilterChipTextActive]}>
                {chip.label}
              </Text>
              <View style={[
                styles.historyFilterCount,
                filter === chip.key && styles.historyFilterCountActive,
              ]}>
                <Text style={[
                  styles.historyFilterCountText,
                  filter === chip.key && styles.historyFilterCountTextActive,
                ]}>
                  {chip.count}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={BLUE} size="large" />
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 }}>
            <Feather name="inbox" size={48} color={MUTED} />
            <Text style={{ color: MID, fontSize: 16, fontWeight: '600' }}>
              {allOrders.length === 0 ? 'No transactions today' : `No ${filter} transactions`}
            </Text>
            <Text style={{ color: MUTED, textAlign: 'center', fontSize: 14 }}>
              {allOrders.length === 0
                ? 'POS sales will appear here as they are completed.'
                : 'Try a different filter above.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredOrders}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 12, gap: 0 }}
            showsVerticalScrollIndicator={false}
            onRefresh={refetch}
            refreshing={isRefetching}
            renderItem={({ item }) => {
              const expanded = expandedId === item.id;
              const voidable = canVoid(item);
              const isVoiding = voidMutation.isPending && voidMutation.variables === item.id;
              return (
                <View style={[
                  styles.historyRow,
                  item.status === 'cancelled' && styles.historyRowVoided,
                ]}>
                  <Pressable
                    onPress={() => setExpandedId(expanded ? null : item.id)}
                    style={styles.historyRowHeader}
                  >
                    {/* Left: order # + time */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.historyOrderNum}>#{item.orderNumber}</Text>
                        <View style={[styles.historyStatusBadge, { backgroundColor: statusColor(item.status) + '22' }]}>
                          <Text style={[styles.historyStatusText, { color: statusColor(item.status) }]}>
                            {statusLabel(item.status)}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Feather name="clock" size={11} color={MUTED} />
                        <Text style={styles.historyMeta}>{fmtTime(item.createdAt)}</Text>
                        {item.customerName && (
                          <>
                            <Text style={styles.historyMetaDot}>·</Text>
                            <Feather name="user" size={11} color={MUTED} />
                            <Text style={styles.historyMeta}>{item.customerName}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Right: total + payment */}
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[
                        styles.historyTotal,
                        item.status === 'cancelled' && { color: MUTED, textDecorationLine: 'line-through' },
                      ]}>
                        {fmtCents(item.totalCents)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather
                          name={item.paymentMethod === 'cash' ? 'dollar-sign' : 'credit-card'}
                          size={12}
                          color={MUTED}
                        />
                        <Text style={styles.historyPayMethod}>
                          {item.paymentMethod === 'cash' ? 'Cash' : 'EFTPOS'}
                        </Text>
                      </View>
                    </View>

                    <Feather
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={MUTED}
                      style={{ marginLeft: 8 }}
                    />
                  </Pressable>

                  {/* Expanded items */}
                  {expanded && (
                    <View style={styles.historyItemsSection}>
                      {item.items.map((li, idx) => (
                        <View key={idx} style={styles.historyLineItem}>
                          <Text style={styles.historyLineQty}>{li.quantity}×</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyLineName}>
                              {li.productName}{li.variantName ? ` (${li.variantName})` : ''}
                            </Text>
                            {li.notes ? (
                              <Text style={styles.historyLineNote}>{li.notes}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.historyLinePrice}>{fmtCents(li.unitPriceCents * li.quantity)}</Text>
                        </View>
                      ))}
                      {item.notes && (
                        <Text style={styles.historyOrderNote}>Note: {item.notes}</Text>
                      )}

                      {/* Void button */}
                      {item.status !== 'cancelled' && (
                        <View style={styles.historyVoidRow}>
                          {voidable ? (
                            <TouchableOpacity
                              onPress={() => handleVoid(item)}
                              style={styles.historyVoidBtn}
                              disabled={isVoiding}
                              activeOpacity={0.8}
                            >
                              {isVoiding
                                ? <ActivityIndicator size="small" color={WHITE} />
                                : <><Feather name="x-circle" size={14} color={WHITE} />
                                   <Text style={styles.historyVoidBtnText}>Void Transaction</Text></>
                              }
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.historyVoidExpired}>
                              Void window expired (5 min limit)
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:               { flex: 1, backgroundColor: BG },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: WHITE, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  headerTitle:        { fontSize: 18, fontWeight: '700', color: DARK },
  headerBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  headerBtnText:      { fontSize: 12, fontWeight: '600', color: MID },

  salesStrip:         { flexDirection: 'row', backgroundColor: '#EFF6FF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 16, paddingVertical: 10, gap: 20 },
  salesCard:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  salesLabel:         { fontSize: 12, color: MUTED, fontWeight: '500' },
  salesValue:         { fontSize: 16, fontWeight: '700', color: DARK, marginLeft: 4 },

  holdTabsRow:        { backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 12, paddingVertical: 8, flexGrow: 0 },
  holdTab:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 6 },
  holdTabActive:      { backgroundColor: BLUE },
  holdTabText:        { fontSize: 13, fontWeight: '600', color: MID },
  holdTabAdd:         { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },

  paneTabBar:         { flexDirection: 'row', backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  paneTab:            { flex: 1, paddingVertical: 10, alignItems: 'center' },
  paneTabActive:      { borderBottomWidth: 2, borderBottomColor: BLUE },
  paneTabText:        { fontSize: 14, fontWeight: '600', color: MUTED },
  paneTabTextActive:  { color: BLUE },
  paneTabBadge:       { marginTop: 2, backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  paneTabBadgeText:   { fontSize: 11, fontWeight: '700', color: BLUE },

  body:               { flex: 1, flexDirection: 'row' },
  menuPane:           { flex: 1, backgroundColor: BG },
  ticketPane:         { backgroundColor: TICKET, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: BORDER },

  searchRow:          { padding: 12, paddingBottom: 6 },
  searchInputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  searchInput:        { flex: 1, fontSize: 15, color: DARK },
  categoryScroll: { flexGrow: 0, height: 84, marginBottom: 2 },
  catTile:        { width: 72, height: 68, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  catTileLabel:   { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },

  productCard:        { backgroundColor: WHITE, borderRadius: 10, overflow: 'hidden', margin: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  productCardImage:   { width: '100%', aspectRatio: 1.2, backgroundColor: '#F8FAFC' },
  productCardBody:    { padding: 8 },
  productCardName:    { fontSize: 13, fontWeight: '600', color: DARK, lineHeight: 17 },
  productCardPrice:   { fontSize: 14, fontWeight: '700', color: BLUE },
  productCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center' },
  variantBadge:       { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  variantBadgeText:   { fontSize: 10, color: BLUE, fontWeight: '600' },

  ticketContainer:    { flex: 1, display: 'flex', flexDirection: 'column' },
  customerBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 14, paddingVertical: 12 },
  customerName:       { fontSize: 14, fontWeight: '700', color: DARK },
  customerSub:        { fontSize: 12, color: MUTED, marginTop: 1 },
  customerPlaceholder: { fontSize: 14, color: MUTED },

  orderTypeRow:       { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  orderTypeChip:      { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' },
  orderTypeChipActive: { backgroundColor: BLUE },
  orderTypeText:      { fontSize: 12, fontWeight: '600', color: MID },
  orderTypeTextActive: { color: WHITE },

  emptyTicket:        { padding: 32, alignItems: 'center', gap: 12 },
  emptyTicketText:    { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

  ticketItem:         { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, backgroundColor: WHITE, marginBottom: 1 },
  ticketItemName:     { fontSize: 14, fontWeight: '600', color: DARK },
  ticketItemMeta:     { fontSize: 12, color: MUTED, marginTop: 2 },
  ticketItemNotes:    { fontSize: 11, color: BLUE, marginTop: 2, fontStyle: 'italic' },
  ticketItemRight:    { alignItems: 'flex-end', gap: 6 },
  ticketItemPrice:    { fontSize: 14, fontWeight: '700', color: DARK },
  qtyControls:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:             { width: 26, height: 26, borderRadius: 6, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  qtyText:            { fontSize: 14, fontWeight: '700', color: DARK, minWidth: 20, textAlign: 'center' },
  ticketItemDelete:   { marginLeft: 8, marginTop: 2, padding: 4 },

  totalsSection:      { borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, backgroundColor: WHITE },
  totalRow:           { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel:         { fontSize: 13, color: MID },
  totalValue:         { fontSize: 13, fontWeight: '600', color: DARK },
  totalRowFinal:      { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  totalFinalLabel:    { fontSize: 16, fontWeight: '700', color: DARK },
  totalFinalValue:    { fontSize: 18, fontWeight: '800', color: DARK },

  ticketActions:      { padding: 12, backgroundColor: WHITE, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  clearBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  clearBtnText:       { fontSize: 14, fontWeight: '600', color: CHERRY },
  holdBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  holdBtnText:        { fontSize: 14, fontWeight: '600', color: MID },
  chargeBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: CHERRY, borderRadius: 12, paddingVertical: 16 },
  chargeBtnText:      { fontSize: 18, fontWeight: '800', color: WHITE },

  // Modals
  customiseRoot:      { flex: 1, backgroundColor: WHITE },
  sheetHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  sheetTitle:         { fontSize: 17, fontWeight: '700', color: DARK, flex: 1, textAlign: 'center' },
  sheetFooter:        { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: WHITE, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, flexDirection: 'row', alignItems: 'center', gap: 16 },
  sheetPriceLabel:    { fontSize: 12, color: MUTED, fontWeight: '500' },
  sheetPrice:         { fontSize: 22, fontWeight: '800', color: DARK },
  addToOrderBtn:      { flex: 1, backgroundColor: CHERRY, borderRadius: 12, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  addToOrderBtnText:  { fontSize: 16, fontWeight: '800', color: WHITE },

  section:            { marginBottom: 20 },
  sectionTitle:       { fontSize: 14, fontWeight: '700', color: DARK, marginBottom: 10 },
  sectionSubtitle:    { fontSize: 12, color: MUTED, marginTop: -6, marginBottom: 8 },
  requiredBadge:      { fontSize: 11, fontWeight: '700', color: CHERRY, backgroundColor: '#FFF1F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  variantChip:        { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  variantChipActive:  { backgroundColor: BLUE, borderColor: BLUE },
  variantChipText:    { fontSize: 13, fontWeight: '600', color: MID },

  optionRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: 'transparent' },
  optionRowSelected:  { backgroundColor: '#EFF6FF', borderColor: BLUE },
  optionCheck:        { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: BORDER, justifyContent: 'center', alignItems: 'center', backgroundColor: WHITE },
  optionRadio:        { borderRadius: 10 },
  optionCheckSelected: { backgroundColor: BLUE, borderColor: BLUE },
  optionName:         { flex: 1, fontSize: 14, color: DARK },
  optionPrice:        { fontSize: 13, fontWeight: '600', color: MID },

  quantityStepper:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 0, backgroundColor: '#F1F5F9', borderRadius: 12, alignSelf: 'flex-start' },
  stepperBtn:         { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  stepperQty:         { fontSize: 20, fontWeight: '800', color: DARK, minWidth: 44, textAlign: 'center' },

  notesInput:         { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: BORDER, fontSize: 14, color: DARK, minHeight: 72, textAlignVertical: 'top' },

  // Payment
  payTotal:           { alignItems: 'center', paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, marginBottom: 20 },
  payTotalLabel:      { fontSize: 14, color: MUTED, fontWeight: '500' },
  payTotalValue:      { fontSize: 40, fontWeight: '800', color: DARK, marginTop: 4 },
  methodRow:          { flexDirection: 'row', gap: 10, marginBottom: 24 },
  methodBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: BORDER },
  methodBtnActive:    { backgroundColor: BLUE, borderColor: BLUE },
  methodBtnText:      { fontSize: 15, fontWeight: '700', color: MID },
  eftposInstructions: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  eftposText:         { fontSize: 16, fontWeight: '600', color: DARK, textAlign: 'center' },
  eftposSubText:      { fontSize: 13, color: MUTED, textAlign: 'center' },
  presetBtn:          { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  presetBtnText:      { fontSize: 15, fontWeight: '700', color: BLUE },
  tenderedDisplay:    { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, alignItems: 'flex-end', marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  tenderedText:       { fontSize: 36, fontWeight: '800', color: DARK },
  changeRow:          { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 16 },
  changeLabel:        { fontSize: 15, fontWeight: '600', color: '#16A34A' },
  changeValue:        { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  numpad:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numpadKey:          { width: '30%', aspectRatio: 2, backgroundColor: '#F1F5F9', borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexGrow: 1 },
  numpadKeyText:      { fontSize: 22, fontWeight: '700', color: DARK },

  // Complete
  completeBg:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  completeCard:       { backgroundColor: WHITE, borderRadius: 20, padding: 28, alignItems: 'center', width: '100%', maxWidth: 380 },
  completeCheck:      { width: 64, height: 64, borderRadius: 32, backgroundColor: '#16A34A', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  completeTitle:      { fontSize: 22, fontWeight: '800', color: DARK, marginBottom: 4 },
  completeOrder:      { fontSize: 14, color: MUTED, fontWeight: '600', marginBottom: 4 },
  completeTotal:      { fontSize: 34, fontWeight: '900', color: DARK, marginBottom: 12 },
  changeRowComplete:  { flexDirection: 'row', gap: 12, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 16 },
  changeLabelComplete: { fontSize: 15, fontWeight: '600', color: '#16A34A' },
  changeValueComplete: { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  loyaltyCard:        { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, width: '100%', marginBottom: 20 },
  loyaltyDivider:     { width: 1, backgroundColor: '#BFDBFE', marginVertical: 4 },
  loyaltyStatLabel:   { fontSize: 12, color: MUTED, fontWeight: '500', marginBottom: 4 },
  loyaltyStatValue:   { fontSize: 24, fontWeight: '800', color: BLUE },
  loyaltyStatSub:     { fontSize: 11, color: MUTED, marginTop: 2 },
  rewardUnlocked:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10 },
  rewardUnlockedText: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  completeCloseBtn:   { backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' },
  completeCloseBtnText: { fontSize: 16, fontWeight: '800', color: WHITE },

  // Customer modal
  currentCustomerCard: { margin: 12, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center' },
  removeCustomerBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  removeCustomerText: { fontSize: 13, fontWeight: '700', color: CHERRY },
  modeRow:            { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  modeBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  modeBtnActive:      { borderBottomWidth: 2, borderBottomColor: BLUE },
  modeBtnText:        { fontSize: 14, fontWeight: '600', color: MID },
  customerResultRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  customerAvatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  customerAvatarText: { fontSize: 18, fontWeight: '700', color: WHITE },

  // History modal
  historySummaryBar:      { flexDirection: 'row', backgroundColor: '#EFF6FF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingVertical: 12 },
  historySummaryItem:     { flex: 1, alignItems: 'center', gap: 2 },
  historySummaryLabel:    { fontSize: 11, fontWeight: '500', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  historySummaryValue:    { fontSize: 20, fontWeight: '800', color: DARK },
  historySummaryDivider:  { width: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 4 },

  historyRow:             { backgroundColor: WHITE, borderRadius: 12, marginBottom: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  historyRowVoided:       { opacity: 0.65 },
  historyRowHeader:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  historyOrderNum:        { fontSize: 15, fontWeight: '700', color: DARK },
  historyStatusBadge:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  historyStatusText:      { fontSize: 11, fontWeight: '700' },
  historyMeta:            { fontSize: 12, color: MUTED },
  historyMetaDot:         { fontSize: 12, color: MUTED },
  historyTotal:           { fontSize: 17, fontWeight: '800', color: DARK },
  historyPayMethod:       { fontSize: 12, color: MUTED, fontWeight: '500' },

  historyItemsSection:    { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FAFBFF', gap: 6 },
  historyLineItem:        { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  historyLineQty:         { fontSize: 13, fontWeight: '700', color: MUTED, minWidth: 24 },
  historyLineName:        { fontSize: 13, color: DARK, fontWeight: '500', flex: 1 },
  historyLineNote:        { fontSize: 11, color: BLUE, fontStyle: 'italic', marginTop: 1 },
  historyLinePrice:       { fontSize: 13, fontWeight: '700', color: DARK },
  historyOrderNote:       { fontSize: 12, color: MID, fontStyle: 'italic', marginTop: 4, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },

  historyVoidRow:         { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  historyVoidBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CHERRY, borderRadius: 8, paddingVertical: 10 },
  historyVoidBtnText:     { fontSize: 14, fontWeight: '700', color: WHITE },
  historyVoidExpired:     { fontSize: 12, color: MUTED, textAlign: 'center', fontStyle: 'italic' },

  historyFilterRow:         { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  historyFilterChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  historyFilterChipActive:  { backgroundColor: BLUE, borderColor: BLUE },
  historyFilterChipText:    { fontSize: 13, fontWeight: '600', color: MID },
  historyFilterChipTextActive: { color: WHITE },
  historyFilterCount:       { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  historyFilterCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  historyFilterCountText:   { fontSize: 10, fontWeight: '700', color: MID },
  historyFilterCountTextActive: { color: WHITE },

  // Discount section
  discountSection:      { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, paddingHorizontal: 12, paddingVertical: 8 },
  discountChips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  discountChip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  discountChipCode:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  discountChipCoffee:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  discountChipReward:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  discountChipText:     { fontSize: 13, fontWeight: '700', color: MID },
  discountApplied:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#A7F3D0' },
  discountAppliedText:  { fontSize: 13, fontWeight: '600', color: '#16A34A', flex: 1 },
  discountCodeRow:      { flexDirection: 'row', gap: 8, marginTop: 8 },
  discountCodeInput:    { flex: 1, backgroundColor: WHITE, borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '700', color: DARK },
  discountCodeApplyBtn: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
  discountCodeApplyText: { fontSize: 14, fontWeight: '700', color: WHITE },
  discountCodeError:    { fontSize: 12, color: CHERRY, marginTop: 4 },

  // Payment discount row
  payDiscountRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
  payDiscountLabel:     { fontSize: 13, fontWeight: '600', color: '#16A34A', flex: 1 },
  payDiscountSaving:    { fontSize: 13, fontWeight: '800', color: '#16A34A' },

  // Category colour picker
  cpOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  cpSheet:      { backgroundColor: WHITE, borderRadius: 20, padding: 20, width: 280, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  cpTitle:      { fontSize: 14, color: MID, marginBottom: 16, textAlign: 'center' },
  cpGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 },
  cpSwatch:     { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  cpSwatchActive: { borderColor: DARK, transform: [{ scale: 1.1 }] },
  cpReset:      { alignItems: 'center', paddingVertical: 8 },
  cpResetText:  { fontSize: 13, color: MUTED, fontWeight: '600' },
});
