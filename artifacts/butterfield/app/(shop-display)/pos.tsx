import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Animated, Alert, FlatList, Image, Keyboard,
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type PosCustomerResult,
  type PosOrderItem,
  type PosLoyaltyResult,
  type PosHistoryOrder,
  type PosSurcharge,
  type PosRegisterCurrentResponse,
  type PosRegisterCashMovement,
  type RegisterSessionReport,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadCachedPosProducts, savePosProductsCache,
  upsertCustomerCache, searchCustomerCache,
  type CachedPosCustomer, type OfflineQueueEntry,
} from '@/lib/posCache';
import { sendReceiptPrint, sendLinklyReceiptPrint, sendRegisterSummaryPrint, sendTaxInvoicePrint, sendOpenDrawer } from '@/lib/printer';
import { OfflineProvider, useOffline } from '@/context/OfflineContext';

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
const CAT_COLORS_KEY           = 'pos_category_colors';
const DISCOUNT_PRESETS_KEY     = 'pos_discount_presets';
const HELD_TICKETS_KEY         = 'pos_held_tickets';
const VOID_PIN_THRESHOLD_CENTS = 5_000;    // $50 — ticket voids above this need supervisor PIN
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
  priceOverrideCents?: number;
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
  birthday?: string | null;
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
  idempotencyKey: string;
  items: TicketItem[];
  customer: AttachedCustomer | null;
  orderType: OrderType;
  notes: string;
  appliedDiscount: AppliedDiscount | null;
  priceOverrideSupervisorPin?: string;
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
const blankTicket = (): Ticket => ({ id: uuid(), idempotencyKey: uuid(), items: [], customer: null, orderType: 'counter', notes: '', appliedDiscount: null });

function isBirthdayMonth(birthday?: string | null): boolean {
  if (!birthday) return false;
  const parts = birthday.split('-');
  if (parts.length < 2) return false;
  return parseInt(parts[1], 10) - 1 === new Date().getMonth();
}

function ticketSubtotal(t: Ticket): number {
  return t.items.reduce((s, i) => s + (i.priceOverrideCents ?? i.unitPriceCents) * i.quantity, 0);
}

function ticketTotal(t: Ticket): number {
  const sub = ticketSubtotal(t);
  const disc = t.appliedDiscount?.amountCents ?? 0;
  return Math.max(0, sub - disc);
}

function buildRegisterSummaryPrintLines(report: RegisterSessionReport): string[] {
  const s = report.summary;
  const closeMethod = report.closeMethod === 'auto' ? 'Auto Close' : 'Manual Close';
  const staffLine = report.closedByName ?? report.openedByName ?? 'Not recorded';
  const actualCash = s.actualCountedCashCents === null ? 'Not entered' : fmtCents(s.actualCountedCashCents);
  const variance = s.varianceCents === null ? 'Not calculated' : fmtCents(s.varianceCents);
  const notes = [report.closeNote, report.varianceNote].filter(Boolean).join(' | ');
  return [
    'Date\t' + report.tradingDate,
    'Register\t' + report.registerName,
    'Location\t' + (report.registerLocation ?? 'Butterfield'),
    'Staff\t' + staffLine,
    '===',
    'Opening Float\t' + fmtCents(s.startingFloatCents ?? 0),
    'Cash Sales\t' + fmtCents(s.cashSalesCents),
    'Card Sales\t' + fmtCents(s.cardSalesCents),
    'Refunds\t' + fmtCents(s.totalRefundsCents),
    'Discounts\t' + fmtCents(s.discountsCents),
    'Surcharges\t' + fmtCents(s.surchargesCents),
    'Cash Added\t' + fmtCents(s.cashAddedCents),
    'Cash Removed\t' + fmtCents(s.cashRemovedCents),
    'Expected Cash\t' + fmtCents(s.expectedCashCents),
    'Actual Cash\t' + actualCash,
    'Variance\t' + variance,
    'Total Sales\t' + fmtCents(s.totalSalesCents),
    'Close Method\t' + closeMethod,
    '---',
    'Notes\t' + (notes || 'None'),
  ];
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
    ...(i.priceOverrideCents !== undefined && {
      priceOverrideCents: i.priceOverrideCents,
      originalPriceCents: i.unitPriceCents,
    }),
  }));
}

const STAMP_GOAL = 6;

// ── POS Screen (inner, wrapped by OfflineProvider below) ─────────────────────
function PosScreenInner() {
  const insets = useSafeAreaInsets();
  const layoutHandledSafeArea = useLayoutHandledSafeArea();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, pendingCount, syncToast, enqueueOrder } = useOffline();

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
    paymentMethod: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
    loyaltyResult: PosLoyaltyResult | null;
    // Ticket snapshot captured before clearActiveTicket() — needed for printing
    customerName: string;
    customerEmail?: string;
    ticketItems: Array<{ name: string; quantity: number; unitPriceCents: number; variantName?: string; options: string[] }>;
    discountAmountCents: number;
    discountLabel: string;
  } | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<'search' | 'scan'>('search');
  const [showSearch, setShowSearch]       = useState(false);
  const [salesOpen, setSalesOpen]         = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showRegisterPin, setShowRegisterPin] = useState(false);
  const [floatPromptDismissed, setFloatPromptDismissed] = useState(false);
  const [discountPinGate, setDiscountPinGate] = useState<{
    paymentMethod: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents?: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
  } | null>(null);
  const [showVoidSheet, setShowVoidSheet]   = useState(false);
  const [registerApprovalPrompt, setRegisterApprovalPrompt] = useState<null | {
    mode: 'movement' | 'close';
    payload: any;
    title: string;
    subtitle: string;
  }>(null);
  const [discountPresets, setDiscountPresets] = useState<number[]>([10, 20, 50]);
  const [lastOrderId, setLastOrderId]     = useState<string | null>(null);

  // ── Post-sale balance cache ────────────────────────────────────────────────
  // Keyed by customerId — stores the server-confirmed balance after a completed
  // POS sale so that if staff re-attach the same customer before the next live
  // fetch completes, we can use the post-sale value as a provisional balance.
  type RecentBalance = { loyaltyPoints: number; stampCount: number; freeCoffeeRewards: number };
  const recentBalancesRef = useRef<Record<string, RecentBalance>>({});

  // ── Receipt-printed guard ─────────────────────────────────────────────────
  // Tracks which Linkly session IDs have already triggered a receipt print.
  // Prevents double-printing when the poll callback and createOrderMutation.onSuccess
  // both run (normal path), or when startup recovery resolves before createOrderMutation.
  const receiptPrintedRef = useRef<Set<string>>(new Set());

  // ── Product list ref (scroll-to-top on category change) ──────────────────
  const productListRef = useRef<any>(null);

  useEffect(() => {
    productListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selCategory]);

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

  // Load discount presets
  useEffect(() => {
    AsyncStorage.getItem(DISCOUNT_PRESETS_KEY).then(v => {
      if (v) try { setDiscountPresets(JSON.parse(v)); } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore held tickets so they survive app restarts
  useEffect(() => {
    AsyncStorage.getItem(HELD_TICKETS_KEY).then(v => {
      if (!v) return;
      try {
        const saved = JSON.parse(v) as { tickets: Ticket[]; activeIdx: number };
        if (Array.isArray(saved.tickets) && saved.tickets.length > 0) {
          const hasContent = saved.tickets.some(t => t.items.length > 0);
          if (hasContent) {
            setTickets(saved.tickets);
            setActiveIdx(typeof saved.activeIdx === 'number'
              ? Math.min(saved.activeIdx, saved.tickets.length - 1) : 0);
          }
        }
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist all tickets + active index on every change
  useEffect(() => {
    AsyncStorage.setItem(HELD_TICKETS_KEY, JSON.stringify({ tickets, activeIdx }));
  }, [tickets, activeIdx]);


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
  const {
    data: productsData,
    isLoading: loadingProducts,
    isFetching: syncingProducts,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const res = await api.products.list();
      if ((res as any)?.data?.length) {
        savePosProductsCache((res as any).data);
      }
      return res;
    },
    staleTime: Infinity,   // never auto-refetch; only syncs on demand
    enabled: cacheReady,   // wait until AsyncStorage check completes
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['pos-summary'],
    queryFn: () => api.pos.summary(),
    refetchInterval: 30_000,
  });
  const {
    data: registerData,
    refetch: refetchRegister,
  } = useQuery({
    queryKey: ['pos-register-current'],
    queryFn: () => api.pos.registerCurrent(),
    refetchInterval: 30_000,
  });

  // ── Full sync (products + summary + settings + surcharges) ────────────────
  const [syncingAll, setSyncingAll] = useState(false);
  const syncAll = useCallback(async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Promise.all([
        refetchProducts(),
        refetchSummary(),
        refetchRegister(),
        queryClient.invalidateQueries({ queryKey: ['pos-store-settings'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] }),
        queryClient.invalidateQueries({ queryKey: ['pos-loyalty-config'] }),
      ]);
    } finally {
      setSyncingAll(false);
    }
  }, [syncingAll, refetchProducts, refetchSummary, refetchRegister, queryClient]);

  // ── Store settings (for auto-print) ──────────────────────────────────────
  const isShopDisplay = user?.role === 'shop_display';
  const { data: storeData } = useQuery({
    queryKey: ['pos-store-settings'],
    queryFn: async () => {
      if (isShopDisplay) {
        const res = await api.shopDisplay.store();
        return (res as any)?.data?.[0] ?? null;
      }
      const res = await api.director.settings();
      const s = (res as any)?.data ?? {};
      return {
        printerIp:    s.printerIp ?? null,
        printerPort:  s.printerPort ? Number(s.printerPort) : 9100,
        printerBrand: s.printerBrand ?? 'epson',
        autoPrint:    s.autoPrint === 'true' || s.autoPrint === true,
        autoDrawer:   s.autoDrawer === 'true' || s.autoDrawer === true,
        drawerPin:    (Number(s.drawerPin ?? s.drawer_pin ?? 0) === 1 ? 1 : 0) as 0 | 1,
        dailySpecial: s.dailySpecial ?? s.daily_special ?? null,
      };
    },
    staleTime: 60_000,
  });
  const registerState = registerData?.data ?? null;
  const registerSession = registerState?.session ?? null;
  const cashEnabled = registerState?.cashEnabled ?? false;

  const printRegisterReport = useCallback(async (report: RegisterSessionReport) => {
    const store = storeData as any;
    if (!store?.printerIp) {
      Alert.alert('No Printer', 'Configure a printer IP in POS settings to print the daily register summary.');
      return;
    }
    const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
    await sendRegisterSummaryPrint({
      title: 'Daily Register Summary',
      lines: buildRegisterSummaryPrintLines(report),
      printerBrand: store.printerBrand ?? 'epson',
    }, store.printerIp, store.printerPort ?? 9100, fetchBytes);
  }, [isShopDisplay, storeData]);

  useEffect(() => {
    const pending = registerState?.pendingAutoPrintReport;
    const store = storeData as any;
    if (!pending || !store?.printerIp) return;
    let cancelled = false;
    (async () => {
      try {
        await printRegisterReport(pending);
        if (!cancelled) {
          await api.pos.markRegisterSummaryPrinted(pending.id);
          refetchRegister();
        }
      } catch {
        // Keep the pending report so the user can print it manually if needed.
      }
    })();
    return () => { cancelled = true; };
  }, [printRegisterReport, refetchRegister, registerState?.pendingAutoPrintReport, storeData]);

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

  // Pre-select the first category once products load (never default to "All")
  useEffect(() => {
    if (categories.length > 0 && selCategory === 'all') {
      setSelCategory(categories[0]!);
    }
  }, [categories]);

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

  const updateItemPriceOverride = useCallback((localId: string, newPriceCents: number | undefined, supervisorPin?: string) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      const newItems = t.items.map(x => {
        if (x.localId !== localId) return x;
        if (newPriceCents === undefined || newPriceCents === x.unitPriceCents) {
          const { priceOverrideCents: _removed, ...rest } = x;
          return rest as TicketItem;
        }
        return { ...x, priceOverrideCents: newPriceCents };
      });
      return {
        ...t,
        items: newItems,
        priceOverrideSupervisorPin: supervisorPin ?? t.priceOverrideSupervisorPin,
      };
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeIdx]);

  const clearTicket = useCallback(() => {
    setTickets(prev => prev.map((t, i) => i === activeIdx ? blankTicket() : t));
  }, [activeIdx]);

  const holdTicket = useCallback(() => {
    if (activeTicket.items.length === 0) return;
    const maxHolds = 5;
    if (tickets.length >= maxHolds + 1) {
      Alert.alert('Hold Limit', 'Maximum 5 tickets on hold. Complete or clear an existing ticket first.');
      return;
    }
    // Add a new blank ticket and switch to it
    setTickets(prev => [...prev, blankTicket()]);
    setActiveIdx(tickets.length); // new ticket index
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeTicket.items.length, tickets.length]);

  const deleteHeldTicket = useCallback((idx: number) => {
    setTickets(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [blankTicket()];
    });
    setActiveIdx(prev => {
      if (prev > idx) return prev - 1;
      if (prev === idx) return 0;
      return prev;
    });
  }, []);

  const saveDiscountPresets = useCallback((presets: number[]) => {
    setDiscountPresets(presets);
    AsyncStorage.setItem(DISCOUNT_PRESETS_KEY, JSON.stringify(presets));
  }, []);

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
  const activeIdempotencyKey = activeTicket.idempotencyKey;

  const buildOrderPayload = useCallback((vars: {
    paymentMethod: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents?: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
    linklySessionId?: string;
    supervisorPin?: string;
  }) => ({
    items: buildPosItems(activeTicket.items),
    coffeeItemCount: activeTicket.items
      .filter((item) => item.category.toLowerCase() === 'coffee')
      .reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    orderType: activeTicket.orderType,
    paymentMethod: (vars.paymentMethod === 'split' ? 'eftpos' : vars.paymentMethod) as 'cash' | 'eftpos',
    amountTenderedCents: vars.amountTenderedCents,
    surchargeCents: vars.surchargeCents,
    splitPayments: vars.splitPayments,
    linklySessionId: vars.linklySessionId,
    customerId: activeTicket.customer?.userId,
    notes: activeTicket.notes || undefined,
    discountCode: activeTicket.appliedDiscount?.type === 'code' ? activeTicket.appliedDiscount.code : undefined,
    discountCodeId: activeTicket.appliedDiscount?.type === 'code' ? activeTicket.appliedDiscount.codeId : undefined,
    manualDiscountPct: activeTicket.appliedDiscount?.type === 'pct' ? activeTicket.appliedDiscount.pct : undefined,
    redeemFreeCoffee: activeTicket.appliedDiscount?.type === 'free_coffee' ? true : undefined,
    claimedRewardId: activeTicket.appliedDiscount?.type === 'claimed_reward' ? activeTicket.appliedDiscount.claimedRewardId : undefined,
    birthdayBonus: activeTicket.customer ? isBirthdayMonth(activeTicket.customer.birthday) : undefined,
    idempotencyKey: activeIdempotencyKey,
    supervisorPin: vars.supervisorPin ?? activeTicket.priceOverrideSupervisorPin,
    hasPriceOverride: activeTicket.items.some(i => i.priceOverrideCents !== undefined),
  }), [activeTicket, activeIdempotencyKey]);

  const clearActiveTicket = useCallback(() => {
    setTickets(prev => {
      if (prev.length === 1) return [blankTicket()];
      const next = prev.filter((_, i) => i !== activeIdx);
      return next.length ? next : [blankTicket()];
    });
    if (activeIdx > 0) setActiveIdx(0);
  }, [activeIdx]);

  const createOrderMutation = useMutation({
    mutationFn: (vars: {
      paymentMethod: 'cash' | 'eftpos' | 'split';
      amountTenderedCents?: number;
      surchargeCents?: number;
      splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
      linklySessionId?: string;
      supervisorPin?: string;
    }) => api.pos.createOrder(buildOrderPayload(vars)),
    onSuccess: (res, vars) => {
      // Capture ticket snapshot BEFORE clearActiveTicket() discards it.
      // res.data only has { id, orderNumber, totalCents, paymentMethod, status } — no items.
      const snapshotItems = activeTicket.items.map(i => ({
        name: i.productName,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        variantName: i.variantName ?? undefined,
        options: (i.selectedOptions ?? []).map((o: any) => o.optionName ?? o.textValue ?? '').filter(Boolean) as string[],
      }));
      const snapshotCustomerName = activeTicket.customer?.name ?? 'Walk-in';
      const discountAmountCents = activeTicket.appliedDiscount?.amountCents ?? 0;
      const discountLabel = activeTicket.appliedDiscount?.label ?? '';

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastOrderId(res.data.id);
      // Persist post-sale balance so re-attaching the same customer before the
      // next live fetch completes shows the accurate post-transaction balance.
      if (activeTicket.customer?.userId && res.loyaltyResult) {
        recentBalancesRef.current[activeTicket.customer.userId] = {
          loyaltyPoints: res.loyaltyResult.newBalance,
          stampCount: res.loyaltyResult.newStampCount,
          // freeCoffeeRewards can't be derived from the POS loyalty result alone;
          // keep the pre-sale value as a reasonable approximation.
          freeCoffeeRewards: activeTicket.customer.freeCoffeeRewards,
        };
      }
      setCompletedOrder({
        id: res.data.id,
        orderNumber: res.data.orderNumber,
        totalCents: res.data.totalCents,
        paymentMethod: vars.paymentMethod,
        amountTenderedCents: vars.amountTenderedCents,
        surchargeCents: vars.surchargeCents ?? 0,
        splitPayments: vars.splitPayments,
        loyaltyResult: res.loyaltyResult,
        customerName: snapshotCustomerName,
        customerEmail: activeTicket.customer?.email,
        ticketItems: snapshotItems,
        discountAmountCents,
        discountLabel,
      });
      setShowPayment(false);
      clearActiveTicket();
      refetchSummary();
      refetchRegister();
      queryClient.invalidateQueries({ queryKey: ['pos-summary'] });
      // Auto-print receipt using the captured ticket items (not the sparse res.data).
      // Guard: if the Linkly poll callback already printed (receiptPrintedRef), skip to
      // avoid double-printing. For cash and split payments there is no session to check,
      // so always print. For EFTPOS, only print if the session hasn't already been printed.
      const store = storeData as any;
      const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
      const alreadyPrinted = vars.linklySessionId
        ? receiptPrintedRef.current.has(vars.linklySessionId)
        : false;
      const isCashSale = vars.paymentMethod === 'cash' || vars.paymentMethod === 'split';
      if (!alreadyPrinted && store?.autoPrint && store?.printerIp) {
        if (vars.linklySessionId) receiptPrintedRef.current.add(vars.linklySessionId);
        sendReceiptPrint({
          orderId: res.data.id,
          customerName: snapshotCustomerName,
          type: 'pickup',
          items: snapshotItems,
          totalCents: res.data.totalCents,
          discountCents: discountAmountCents,
          surchargeCents: vars.surchargeCents ?? 0,
          loyaltyPointsEarned: res.loyaltyResult?.pointsEarned,
          printerBrand: store.printerBrand ?? 'epson',
          autoDrawer: !!(store as any).autoDrawer,
          drawerPin: ((store as any).drawerPin ?? 0) as 0 | 1,
        }, store.printerIp, store.printerPort ?? 9100, fetchBytes).catch(() => {});
      } else if (!alreadyPrinted && !store?.autoPrint && store?.autoDrawer && store?.printerIp && isCashSale) {
        // No receipt printing, but auto-drawer is on — open the drawer directly for cash/split sales.
        sendOpenDrawer(store.printerIp, store.printerPort ?? 9100, fetchBytes, ((store as any).drawerPin ?? 0) as 0 | 1, store.printerBrand as 'epson' | 'star' | undefined).catch(() => {});
      }
    },
    onError: (err: any, vars) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err?.code === 'DISCOUNT_PIN_REQUIRED') {
        // Server requires supervisor PIN for this discount level — capture it
        setDiscountPinGate({
          paymentMethod: vars.paymentMethod,
          amountTenderedCents: vars.amountTenderedCents,
          surchargeCents: vars.surchargeCents,
          splitPayments: vars.splitPayments,
        });
        return;
      }
      if (err?.code === 'REGISTER_FLOAT_REQUIRED') {
        setShowPayment(false);
        setShowRegisterPin(true);
        Alert.alert('Cash Float Required', err?.message ?? 'Enter the opening cash float before taking cash payments.');
        return;
      }
      Alert.alert('Order Failed', err?.message ?? 'Could not complete order. Please try again.');
    },
  });

  const setRegisterFloatMutation = useMutation({
    mutationFn: (amountCents: number) => api.pos.setRegisterFloat(amountCents),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchRegister();
    },
    onError: (err: any) => Alert.alert('Cash Float', err?.message ?? 'Could not save the opening cash float.'),
  });

  const cashMovementMutation = useMutation({
    mutationFn: (vars: { movementType: 'add' | 'remove'; amountCents: number; reason?: string; supervisorPin?: string }) =>
      api.pos.addRegisterCashMovement(vars),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetchRegister();
    },
    onError: (err: any, vars) => {
      if (err?.code === 'SUPERVISOR_PIN_REQUIRED') {
        setRegisterApprovalPrompt({
          mode: 'movement',
          payload: vars,
          title: 'Manager Approval',
          subtitle: 'Enter your POS PIN to approve this cash removal',
        });
        return;
      }
      Alert.alert('Cash Movement', err?.message ?? 'Could not update the cash drawer.');
    },
  });

  const closeRegisterMutation = useMutation({
    mutationFn: (vars: { actualCountedCashCents: number; closeNote?: string; varianceNote?: string; supervisorPin?: string }) =>
      api.pos.closeRegister(vars),
    onSuccess: async (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (res.data) {
        try {
          await printRegisterReport(res.data);
          await api.pos.markRegisterSummaryPrinted(res.data.id);
        } catch (err: any) {
          Alert.alert('Register Closed', err?.message ?? 'Register closed, but the summary could not be printed.');
        }
      }
      refetchRegister();
    },
    onError: (err: any, vars) => {
      if (err?.code === 'SUPERVISOR_PIN_REQUIRED') {
        setRegisterApprovalPrompt({
          mode: 'close',
          payload: vars,
          title: 'Manager Approval',
          subtitle: 'Enter your POS PIN to approve this cash variance',
        });
        return;
      }
      Alert.alert('Close Register', err?.message ?? 'Could not close the register.');
    },
  });

  const updateRegisterSettingsMutation = useMutation({
    mutationFn: (enabled: boolean) => api.pos.updateRegisterSettings({ autoCloseEnabled: enabled }),
    onSuccess: () => refetchRegister(),
    onError: (err: any) => Alert.alert('Register Setting', err?.message ?? 'Could not update auto-close.'),
  });

  const handleChargeConfirm = useCallback((params: {
    method: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
    linklySessionId?: string;
  }) => {
    const mutateVars = {
      paymentMethod: params.method,
      amountTenderedCents: params.amountTenderedCents,
      surchargeCents: params.surchargeCents,
      splitPayments: params.splitPayments,
      linklySessionId: params.linklySessionId,
    };
    if (!isOnline) {
      // Queue order offline
      const payload = buildOrderPayload(mutateVars);
      const totalCents = ticketTotal(activeTicket);
      const entry: OfflineQueueEntry = {
        idempotencyKey: activeIdempotencyKey,
        queuedAt: new Date().toISOString(),
        syncStatus: 'pending',
        payload: payload as any,
        totalCents,
        customerName: activeTicket.customer?.name,
        itemSummary: activeTicket.items.map(i =>
          `${i.quantity}× ${i.productName}`).join(', ').slice(0, 80),
      };
      enqueueOrder(entry).then(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompletedOrder({
          id: 'offline-' + activeIdempotencyKey,
          orderNumber: 'QUEUED',
          totalCents,
          paymentMethod: params.method,
          amountTenderedCents: params.amountTenderedCents,
          surchargeCents: params.surchargeCents ?? 0,
          splitPayments: params.splitPayments,
          loyaltyResult: null,
          customerName: activeTicket.customer?.name ?? 'Walk-in',
          customerEmail: activeTicket.customer?.email,
          ticketItems: activeTicket.items.map(i => ({
            name: i.productName,
            quantity: i.quantity,
            unitPriceCents: i.unitPriceCents,
            variantName: i.variantName ?? undefined,
            options: (i.selectedOptions ?? []).map((o: any) => o.optionName ?? o.textValue ?? '').filter(Boolean) as string[],
          })),
          discountAmountCents: activeTicket.appliedDiscount?.amountCents ?? 0,
          discountLabel: activeTicket.appliedDiscount?.label ?? '',
        });
        setShowPayment(false);
        clearActiveTicket();
      });
    } else {
      createOrderMutation.mutate(mutateVars);
    }
  }, [isOnline, buildOrderPayload, activeTicket, activeIdempotencyKey, enqueueOrder, createOrderMutation, clearActiveTicket]);


  // ── EFTPOS approval receipt callback ──────────────────────────────────────
  // Called by PaymentModal when the terminal approves. Prints the Linkly
  // receipt text (from the terminal itself) if non-empty AND the store has a
  // printer configured — then marks receiptPrintedRef so createOrderMutation
  // .onSuccess skips double-printing. If no receiptText is provided (terminal
  // didn't send one) the ref is NOT marked and onSuccess falls back to printing
  // with the real orderId.
  const handlePrintReceiptForEftpos = useCallback((sessionId: string, receiptText: string) => {
    if (receiptPrintedRef.current.has(sessionId)) return;
    const store = storeData as any;
    if (!receiptText || !store?.autoPrint || !store?.printerIp) return;
    // Only mark the ref (and suppress the onSuccess print) when we actually print.
    receiptPrintedRef.current.add(sessionId);
    const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
    sendLinklyReceiptPrint({
      lines: receiptText.split('\n'),
      printerBrand: store.printerBrand ?? 'epson',
    }, store.printerIp, store.printerPort ?? 9100, fetchBytes).catch(() => {});
  }, [storeData, isShopDisplay]);

  const voidOrderMutation = useMutation({
    mutationFn: (vars: { id: string; supervisorPin?: string }) => api.pos.voidOrder(vars.id, vars.supervisorPin),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Voided', 'Transaction has been voided.');
      setLastOrderId(null);
      refetchSummary();
    },
    onError: (err: any) => {
      Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).');
    },
  });

  const logTicketVoidMutation = useMutation({
    mutationFn: (vars: { items: { name: string; quantity: number }[]; totalCents: number; supervisorPin?: string }) =>
      api.pos.logTicketVoid(vars),
    onError: (err: any) => {
      Alert.alert('Void Failed', err?.message ?? 'Could not void sale. Please try again.');
    },
  });

  const handleVoidLast = () => {
    if (!lastOrderId) {
      Alert.alert('No Transaction', 'No recent transaction to void.');
      return;
    }
    Alert.alert('Void Last Transaction', 'Are you sure you want to void the last completed transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Void', style: 'destructive', onPress: () => voidOrderMutation.mutate({ id: lastOrderId }) },
    ]);
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const subtotal = ticketSubtotal(activeTicket);
  const total = ticketTotal(activeTicket);
  const itemCount = activeTicket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View
      style={[styles.root, { paddingTop: layoutHandledSafeArea ? 0 : insets.top }]}
    >
      {/* ── Sync toast ──────────────────────────────────────────────────────── */}
      {!!syncToast && (
        <View style={styles.syncToast}>
          <Feather name="check-circle" size={14} color={WHITE} />
          <Text style={styles.syncToastText}>{syncToast}</Text>
        </View>
      )}
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="monitor" size={20} color={BLUE} />
          <Text style={styles.headerTitle}>Point of Sale</Text>
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Feather name="wifi-off" size={11} color={WHITE} />
              <Text style={styles.offlineBadgeText}>
                Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
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
          {/* Hold orders */}
          <Pressable onPress={() => setShowHoldModal(true)} style={styles.headerBtn}>
            <Feather name="layers" size={16} color={tickets.filter((_, i) => i !== activeIdx && tickets[i].items.length > 0).length > 0 ? BLUE : MID} />
            <Text style={[styles.headerBtnText, tickets.filter((_, i) => i !== activeIdx && tickets[i].items.length > 0).length > 0 && { color: BLUE }]}>
              Hold{tickets.filter((_, i) => i !== activeIdx && tickets[i].items.length > 0).length > 0
                ? ` (${tickets.filter((_, i) => i !== activeIdx && tickets[i].items.length > 0).length})`
                : ''}
            </Text>
          </Pressable>
          {/* Search toggle */}
          <Pressable
            onPress={() => { setShowSearch(v => !v); }}
            style={[styles.headerBtn, showSearch && { backgroundColor: `${BLUE}20` }]}
          >
            <Feather name="search" size={16} color={showSearch ? BLUE : MID} />
          </Pressable>
          {/* Sync everything */}
          <Pressable
            onPress={syncAll}
            disabled={syncingAll}
            style={[styles.headerBtn, syncingAll && { opacity: 0.5 }]}
          >
            <Feather name="refresh-cw" size={16} color={syncingAll ? MUTED : MID} />
            <Text style={styles.headerBtnText}>{syncingAll ? 'Syncing…' : 'Sync'}</Text>
          </Pressable>
          {/* Register */}
          <Pressable onPress={() => setShowRegisterPin(true)} style={styles.headerBtn}>
            <Feather name="archive" size={16} color={cashEnabled ? MID : CHERRY} />
            <Text style={[styles.headerBtnText, !cashEnabled && { color: CHERRY }]}>Register</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Search bar (collapsible) ────────────────────────────────────── */}
      {showSearch && (
        <View style={styles.headerSearchRow}>
          <Feather name="search" size={15} color={MUTED} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { flex: 1 }]}
            placeholder="Search products…"
            placeholderTextColor={MUTED}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            autoFocus
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Feather name="x" size={15} color={MUTED} />
            </Pressable>
          )}
        </View>
      )}

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
            <View style={styles.categoryScrollWrap}>
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
            </View>

            {loadingProducts ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={BLUE} />
              </View>
            ) : (
              <FlatList
                ref={productListRef}
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
              onPriceOverride={updateItemPriceOverride}
              onClear={clearTicket}
              onHold={tickets.length <= 6 ? holdTicket : undefined}
              onAttachCustomer={() => { setCustomerModalMode('search'); setShowCustomerModal(true); }}
              onScanQR={() => { setCustomerModalMode('scan'); setShowCustomerModal(true); }}
              onCharge={() => setShowPayment(true)}
              onEditItem={(item) => {
                const cached = detailCache[item.productId];
                if (cached) setCustomiseData({ product: cached, editItem: item });
              }}
              discountPresets={discountPresets}
              onVoidSale={() => setShowVoidSheet(true)}
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
          cashEnabled={cashEnabled}
          onClose={() => setShowPayment(false)}
          onConfirm={handleChargeConfirm}
          onPrintReceipt={handlePrintReceiptForEftpos}
          loading={createOrderMutation.isPending}
          isOnline={isOnline}
        />
      )}

      {/* ── Post-payment loyalty card ──────────────────────────────────────── */}
      {completedOrder && (
        <OrderCompleteModal
          order={completedOrder}
          customerEmail={completedOrder.customerEmail}
          onClose={() => setCompletedOrder(null)}
          onPrintTaxInvoice={() => {
            const store = storeData as any;
            if (!store?.printerIp) {
              Alert.alert('No Printer', 'Configure a printer IP in POS settings to print.');
              return;
            }
            const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
            sendTaxInvoicePrint({
              orderId: completedOrder.id,
              customerName: completedOrder.customerName,
              type: 'pickup',
              items: completedOrder.ticketItems,
              totalCents: completedOrder.totalCents,
              discountCents: completedOrder.discountAmountCents,
              surchargeCents: completedOrder.surchargeCents,
              loyaltyPointsEarned: completedOrder.loyaltyResult?.pointsEarned,
              printerBrand: store.printerBrand ?? 'epson',
              paymentMethod: completedOrder.paymentMethod,
            }, store.printerIp, store.printerPort ?? 9100, fetchBytes)
              .catch((e: any) => Alert.alert('Print Failed', e?.message ?? 'Could not reach printer.'));
          }}
        />
      )}

      {/* ── Customer search / QR modal ────────────────────────────────────── */}
      {showCustomerModal && (
        <CustomerModal
          currentCustomer={activeTicket.customer}
          initialMode={customerModalMode}
          recentBalances={recentBalancesRef.current}
          onSelect={(c) => {
            updateTicket({ customer: c, appliedDiscount: null });
            setShowCustomerModal(false);
            upsertCustomerCache(c).catch(() => {});
          }}
          onRemove={() => {
            updateTicket({ customer: null, appliedDiscount: null });
            setShowCustomerModal(false);
          }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {/* ── Hold orders modal ──────────────────────────────────────────────── */}
      {showHoldModal && (
        <HoldModal
          tickets={tickets}
          activeIdx={activeIdx}
          onResume={(idx) => { setActiveIdx(idx); setShowHoldModal(false); }}
          onDelete={deleteHeldTicket}
          onClose={() => setShowHoldModal(false)}
        />
      )}

      {/* ── Morning cash float prompt ──────────────────────────────────────── */}
      {!!registerData && !cashEnabled && !floatPromptDismissed && (
        <CashFloatPrompt
          onSave={(amountCents) => {
            setRegisterFloatMutation.mutate(amountCents, {
              onSuccess: () => setFloatPromptDismissed(true),
            });
          }}
          onSkip={() => setFloatPromptDismissed(true)}
          busy={setRegisterFloatMutation.isPending}
        />
      )}

      {/* ── Register PIN gate ──────────────────────────────────────────────── */}
      {showRegisterPin && (
        <PosPinModal
          title="Register"
          subtitle="Enter your POS PIN to access the register"
          onClose={() => setShowRegisterPin(false)}
          onSuccess={() => { setShowRegisterPin(false); setShowRegister(true); }}
        />
      )}

      {/* ── Register modal ─────────────────────────────────────────────────── */}
      {showRegister && (
        <RegisterModal
          visible={showRegister}
          onClose={() => setShowRegister(false)}
          data={registerState}
          loading={!registerData}
          onSaveFloat={(amountCents) => setRegisterFloatMutation.mutate(amountCents)}
          onCashMovement={(payload) => cashMovementMutation.mutate(payload)}
          onCloseRegister={(payload) => closeRegisterMutation.mutate(payload)}
          onToggleAutoClose={(enabled) => updateRegisterSettingsMutation.mutate(enabled)}
          discountPresets={discountPresets}
          onChangePresets={saveDiscountPresets}
          onPrintSummary={async () => {
            if (!registerSession?.closedAt) return;
            await printRegisterReport(registerSession);
            await api.pos.markRegisterSummaryPrinted(registerSession.id);
            refetchRegister();
          }}
          onOpenDrawer={async () => {
            const store = storeData as any;
            if (!store?.printerIp) {
              Alert.alert('No Printer', 'Configure a printer IP in POS settings to open the cash drawer.');
              return;
            }
            const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
            await sendOpenDrawer(store.printerIp, store.printerPort ?? 9100, fetchBytes, (store.drawerPin ?? 0) as 0 | 1, store.printerBrand as 'epson' | 'star' | undefined);
          }}
          busy={
            setRegisterFloatMutation.isPending ||
            cashMovementMutation.isPending ||
            closeRegisterMutation.isPending ||
            updateRegisterSettingsMutation.isPending
          }
        />
      )}
      {discountPinGate && (
        <SupervisorPinCapture
          onClose={() => setDiscountPinGate(null)}
          title="Supervisor Required"
          subtitle="This discount requires manager authorisation"
          onSuccess={(pin) => {
            const params = discountPinGate;
            setDiscountPinGate(null);
            createOrderMutation.mutate({ ...params, supervisorPin: pin });
          }}
        />
      )}
      {registerApprovalPrompt && (
        <SupervisorPinCapture
          onClose={() => setRegisterApprovalPrompt(null)}
          title={registerApprovalPrompt.title}
          subtitle={registerApprovalPrompt.subtitle}
          onSuccess={(pin) => {
            const prompt = registerApprovalPrompt;
            setRegisterApprovalPrompt(null);
            if (prompt.mode === 'movement') {
              cashMovementMutation.mutate({ ...prompt.payload, supervisorPin: pin });
            } else {
              closeRegisterMutation.mutate({ ...prompt.payload, supervisorPin: pin });
            }
          }}
        />
      )}

      {/* ── History modal ──────────────────────────────────────────────────── */}
      {showHistory && (
        <HistoryModal
          onClose={() => setShowHistory(false)}
          storeData={storeData}
          isShopDisplay={isShopDisplay}
          onVoidSuccess={(id) => {
            if (id === lastOrderId) setLastOrderId(null);
            refetchSummary();
            queryClient.invalidateQueries({ queryKey: ['pos-summary'] });
          }}
        />
      )}

      {/* ── Void sale sheet ────────────────────────────────────────────────── */}
      {showVoidSheet && (
        <VoidConfirmSheet
          ticket={activeTicket}
          lastOrderId={lastOrderId}
          voidThresholdCents={VOID_PIN_THRESHOLD_CENTS}
          onClose={() => setShowVoidSheet(false)}
          onVoidTicket={(supervisorPin) => {
            const items = activeTicket.items.map(i => ({ name: i.productName, quantity: i.quantity }));
            const totalCents = ticketTotal(activeTicket);
            logTicketVoidMutation.mutate({ items, totalCents, supervisorPin }, {
              onSuccess: () => {
                setShowVoidSheet(false);
                clearTicket();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              },
            });
          }}
          onVoidLastOrder={(supervisorPin) => {
            if (lastOrderId) {
              setShowVoidSheet(false);
              voidOrderMutation.mutate({ id: lastOrderId, supervisorPin });
            }
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
  ticket, onUpdateTicket, onRemoveItem, onUpdateQty, onPriceOverride,
  onClear, onHold, onAttachCustomer, onScanQR, onCharge, onEditItem,
  discountPresets, onVoidSale,
}: {
  ticket: Ticket;
  onUpdateTicket: (p: Partial<Ticket>) => void;
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onPriceOverride: (localId: string, newPriceCents: number | undefined, supervisorPin?: string) => void;
  onClear: () => void;
  onHold?: () => void;
  onAttachCustomer: () => void;
  onScanQR: () => void;
  onCharge: () => void;
  onEditItem: (item: TicketItem) => void;
  discountPresets: number[];
  onVoidSale?: () => void;
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
  // Total coffee quantity in this ticket (e.g. 2× flat white = coffeeCount 2)
  const coffeeCount = ticket.items
    .filter(i => i.category.toLowerCase() === 'coffee')
    .reduce((sum, i) => sum + (i.quantity ?? 1), 0);
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
      {/* Customer section */}
      {ticket.customer ? (
        <View style={styles.customerSection}>
          <TouchableOpacity onPress={onAttachCustomer} style={styles.customerBarInner} activeOpacity={0.7}>
            <Feather name="user" size={16} color={BLUE} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.customerName}>{ticket.customer.name}</Text>
                {isBirthdayMonth(ticket.customer.birthday) && (
                  <Text style={{ fontSize: 14 }}>🎂</Text>
                )}
              </View>
              <Text style={styles.customerSub}>
                {ticket.customer.loyaltyPoints} pts
                {(ticket.customer.freeCoffeeRewards ?? 0) > 0 ? ` · ☕ ×${ticket.customer.freeCoffeeRewards} free` : ''}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={MUTED} />
          </TouchableOpacity>
          {/* Interactive stamp card */}
          <View style={styles.stampRow}>
            {Array.from({ length: STAMP_GOAL }).map((_, i) => {
              const filled = i < (ticket.customer?.stampCount ?? 0);
              return (
                <View
                  key={i}
                  style={[
                    styles.stampCircle,
                    filled && styles.stampCircleFilled,
                  ]}
                >
                  {filled ? <Feather name="coffee" size={11} color={WHITE} /> : null}
                </View>
              );
            })}
            <Text style={styles.stampLabel}>{ticket.customer.stampCount}/{STAMP_GOAL}</Text>
            <Text style={[styles.stampLabel, { marginLeft: 0, color: MUTED }]}>
              {hasCoffeeItems ? '— stamps apply automatically after payment' : '— add coffee to earn stamps'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.customerBtnRow}>
          <Pressable onPress={onAttachCustomer} style={styles.customerBtn}>
            <Feather name="user" size={14} color={BLUE} />
            <Text style={styles.customerBtnText}>Attach Customer</Text>
          </Pressable>
          <View style={styles.customerBtnDivider} />
          <Pressable onPress={onScanQR} style={styles.customerBtn}>
            <Feather name="maximize" size={14} color={MID} />
            <Text style={[styles.customerBtnText, { color: MID }]}>Scan QR</Text>
          </Pressable>
        </View>
      )}

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

      {/* Order note */}
      <View style={styles.ticketNotesRow}>
        <Feather name="file-text" size={13} color={MUTED} style={{ marginTop: 1 }} />
        <TextInput
          style={styles.ticketNotesInput}
          placeholder="Add order note…"
          placeholderTextColor={MUTED}
          value={ticket.notes}
          onChangeText={v => onUpdateTicket({ notes: v })}
          returnKeyType="done"
          blurOnSubmit
        />
        {ticket.notes.length > 0 && (
          <Pressable onPress={() => onUpdateTicket({ notes: '' })} hitSlop={8}>
            <Feather name="x" size={13} color={MUTED} />
          </Pressable>
        )}
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
              onPriceOverride={(newPriceCents, pin) => onPriceOverride(item.localId, newPriceCents, pin)}
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
                {discountPresets.map(pct => (
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
        {onVoidSale && (
          <Pressable onPress={onVoidSale} style={styles.voidSaleBtn}>
            <Feather name="slash" size={13} color={MUTED} />
            <Text style={styles.voidSaleBtnText}>Void Sale</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Ticket Item Row ───────────────────────────────────────────────────────────
function TicketItemRow({
  item, onRemove, onIncrement, onDecrement, onEdit, onPriceOverride,
}: {
  item: TicketItem; onRemove: () => void;
  onIncrement: () => void; onDecrement: () => void; onEdit: () => void;
  onPriceOverride: (newPriceCents: number | undefined, supervisorPin?: string) => void;
}) {
  const effectiveUnitPrice = item.priceOverrideCents ?? item.unitPriceCents;
  const lineTotal = effectiveUnitPrice * item.quantity;
  const origLineTotal = item.unitPriceCents * item.quantity;
  const hasOverride = item.priceOverrideCents !== undefined;
  const optionSummary = item.selectedOptions.map(o => o.optionName).join(', ');
  const variantLabel = item.variantName;

  const [showPriceEdit, setShowPriceEdit] = React.useState(false);
  const [rawPrice, setRawPrice] = React.useState('');
  const [showPinCapture, setShowPinCapture] = React.useState(false);
  const [pendingPriceCents, setPendingPriceCents] = React.useState<number | null>(null);

  const openPriceEdit = () => {
    setRawPrice((effectiveUnitPrice / 100).toFixed(2));
    setShowPriceEdit(true);
    Haptics.selectionAsync();
  };

  const confirmPriceEdit = () => {
    const parsed = parseFloat(rawPrice.replace(/[^0-9.]/g, ''));
    if (isNaN(parsed) || parsed < 0) { setShowPriceEdit(false); return; }
    const newCents = Math.round(parsed * 100);
    if (newCents === item.unitPriceCents) {
      onPriceOverride(undefined);
      setShowPriceEdit(false);
      return;
    }
    const reduction = item.unitPriceCents - newCents;
    if (reduction > 100) {
      setPendingPriceCents(newCents);
      setShowPriceEdit(false);
      setShowPinCapture(true);
    } else {
      onPriceOverride(newCents);
      setShowPriceEdit(false);
    }
  };

  return (
    <>
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
          <TouchableOpacity onPress={openPriceEdit} activeOpacity={0.7} hitSlop={6}>
            {hasOverride ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.ticketItemPriceStrike}>{fmtCents(origLineTotal)}</Text>
                <Text style={[styles.ticketItemPrice, { color: CHERRY }]}>{fmtCents(lineTotal)}</Text>
              </View>
            ) : (
              <Text style={styles.ticketItemPrice}>{fmtCents(lineTotal)}</Text>
            )}
          </TouchableOpacity>
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

      <Modal visible={showPriceEdit} transparent animationType="fade" onRequestClose={() => setShowPriceEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.pinOverlay} onPress={() => setShowPriceEdit(false)}>
            <Pressable style={styles.priceEditSheet} onPress={() => {}}>
              <Text style={styles.priceEditTitle}>Set Price</Text>
              <Text style={styles.priceEditSub} numberOfLines={1}>{item.productName}</Text>
              <View style={styles.priceEditInputRow}>
                <Text style={styles.priceEditDollar}>$</Text>
                <TextInput
                  style={styles.priceEditInput}
                  value={rawPrice}
                  onChangeText={setRawPrice}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmPriceEdit}
                  placeholder="0.00"
                  placeholderTextColor={MUTED}
                />
              </View>
              {hasOverride && (
                <Text style={styles.priceEditOriginal}>Original: {fmtCents(item.unitPriceCents)}</Text>
              )}
              <Text style={styles.priceEditHint}>Reductions over $1.00 require a supervisor PIN</Text>
              <View style={styles.priceEditActions}>
                <Pressable onPress={() => setShowPriceEdit(false)} style={styles.priceEditCancel}>
                  <Text style={styles.priceEditCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={confirmPriceEdit} style={styles.priceEditConfirm}>
                  <Text style={styles.priceEditConfirmText}>Set Price</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {showPinCapture && (
        <SupervisorPinCapture
          title="Price Override"
          subtitle="Enter supervisor PIN to reduce price by more than $1.00"
          onClose={() => { setShowPinCapture(false); setPendingPriceCents(null); }}
          onSuccess={(pin) => {
            if (pendingPriceCents !== null) {
              onPriceOverride(pendingPriceCents, pin);
            }
            setShowPinCapture(false);
            setPendingPriceCents(null);
          }}
        />
      )}
    </>
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

// ── Payment Modal (method → confirm) ────────────────────────────────────────
type PaymentConfirmParams = {
  method: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number;
  surchargeCents: number;
  splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
  linklySessionId?: string;
};

function PaymentModal({
  totalCents, subtotalCents, discount, cashEnabled, onClose, onConfirm, onPrintReceipt, loading, isOnline,
}: {
  totalCents: number;
  subtotalCents: number;
  discount: AppliedDiscount | null;
  cashEnabled: boolean;
  onClose: () => void;
  onConfirm: (params: PaymentConfirmParams) => void;
  onPrintReceipt?: (sessionId: string, receiptText: string) => void;
  loading: boolean;
  isOnline: boolean;
}) {
  const [method, setMethod] = useState<'cash' | 'eftpos' | 'split'>(!isOnline && cashEnabled ? 'cash' : 'eftpos');
  const [tendered, setTendered] = useState('');
  // Split: each committed part has an amount + method (cash or eftpos)
  const [splitParts, setSplitParts] = useState<{ amountCents: number; method: 'cash' | 'eftpos'; linklySessionId?: string | null }[]>([]);
  const [splitInput, setSplitInput] = useState('');

  // Linkly EFTPOS state (full-payment mode)
  const [linklyStep, setLinklyStep] = useState<'idle' | 'initiating' | 'waiting' | 'approved' | 'declined'>('idle');
  const [linklySessionId, setLinklySessionId] = useState<string | null>(null);
  const [linklyText, setLinklyText] = useState('');
  const linklyPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards: tracks which sessions have already fired receipt + onConfirm
  const receiptPrintedRef = useRef<Set<string>>(new Set());

  // Linkly EFTPOS state (split-part mode — runs one part at a time)
  const [splitCardStep, setSplitCardStep] = useState<'idle' | 'initiating' | 'waiting' | 'declined'>('idle');
  const [splitCardSessionId, setSplitCardSessionId] = useState<string | null>(null);
  const [splitCardText, setSplitCardText] = useState('');
  const splitCardPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load surcharges
  const { data: surchargesData } = useQuery({
    queryKey: ['pos-surcharges'],
    queryFn: () => api.pos.surcharges(),
    staleTime: 60_000,
  });
  const surcharges: PosSurcharge[] = (surchargesData as any)?.data ?? [];

  // Computed surcharges for current method + day
  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const dayOfWeek = DAY_NAMES[new Date().getDay()]!;
  const applicableSurcharges = useMemo(() => surcharges.filter(s => {
    if (!s.isActive) return false;
    const effectiveMethod = method === 'split' ? 'cash' : method;
    if (s.triggerType === 'payment_method') return s.triggerValue === effectiveMethod;
    if (s.triggerType === 'day_of_week') return s.triggerValue === dayOfWeek;
    return false;
  }), [surcharges, method, dayOfWeek]);

  const computedSurchargeCents = useMemo(() =>
    applicableSurcharges.reduce((sum, s) => {
      if (s.amountType === 'pct_basis_points') return sum + Math.round(totalCents * s.amountValue / 10000);
      return sum + s.amountValue;
    }, 0),
  [applicableSurcharges, totalCents]);

  const chargeTotalCents = totalCents + computedSurchargeCents;
  const splitCommittedCents = splitParts.reduce((s, p) => s + p.amountCents, 0);
  const splitCurrentCents = Math.round(parseFloat(splitInput || '0') * 100);
  const splitRemainingCents = Math.max(0, chargeTotalCents - splitCommittedCents);
  const tenderedCents = Math.round(parseFloat(tendered || '0') * 100);
  const cashChangeCents = Math.max(0, tenderedCents - chargeTotalCents);
  const cashOk = method !== 'cash' || (cashEnabled && tenderedCents >= chargeTotalCents);
  // Split is ready only when all parts are explicitly collected (no auto-include)
  const splitOk = method !== 'split' || splitCommittedCents >= chargeTotalCents;
  const roundUpPresets = [5, 10, 20, 50, 100].filter(d => d * 100 >= chargeTotalCents).slice(0, 3);

  // Cleanup poll timeouts on unmount
  useEffect(() => () => {
    if (linklyPollRef.current) clearTimeout(linklyPollRef.current);
    if (splitCardPollRef.current) clearTimeout(splitCardPollRef.current);
  }, []);

  useEffect(() => {
    if (!cashEnabled && method === 'cash') setMethod('eftpos');
  }, [cashEnabled, method]);

  const handleKeypad = (val: string, setter: (s: string) => void, current: string) => {
    if (val === 'backspace') setter(current.slice(0, -1));
    else if (val === '.') { if (!current.includes('.')) setter(current + '.'); }
    else { const next = current + val; if (!isNaN(parseFloat(next)) || next === '.') setter(next); }
  };

  const handleLinklyInitiate = async () => {
    setLinklyStep('initiating');
    setLinklyText('Connecting to terminal…');
    try {
      const res = await api.pos.linklyInitiate(chargeTotalCents) as any;
      const sessionId = res?.data?.sessionId;
      if (!sessionId) throw new Error('No session ID returned');
      setLinklySessionId(sessionId);
      setLinklyStep('waiting');
      setLinklyText('Waiting for card…');
      // Fixed 2-second poll interval — no backoff so approval is detected within ~2 s.
      const schedulePoll = () => {
        linklyPollRef.current = setTimeout(async () => {
          try {
            const pollRes = await api.pos.linklyPoll(sessionId) as any;
            const pd = pollRes?.data;
            if (pd?.responseText) setLinklyText(pd.responseText);
            if (pd?.complete) {
              linklyPollRef.current = null;
              if (pd.approved) {
                setLinklyStep('approved');
                const terminalSurchargeCents = Math.max(0, Math.floor(Number(pd.amountSurchargeCents ?? 0)));
                const totalSurchargeCents = computedSurchargeCents + terminalSurchargeCents;
                // Print the Linkly terminal receipt (if the terminal provided one) exactly once.
                // onPrintReceipt marks receiptPrintedRef so createOrderMutation.onSuccess skips
                // double-printing. If no receiptText, the ref stays unset and onSuccess falls back
                // to a full POS receipt with the real orderId.
                onPrintReceipt?.(sessionId, pd.receiptText ?? '');
                onConfirm({ method: 'eftpos', surchargeCents: totalSurchargeCents, linklySessionId: sessionId });
              } else {
                setLinklyStep('declined');
              }
            } else {
              schedulePoll();
            }
          } catch {
            schedulePoll();
          }
        }, 2000);
      };
      schedulePoll();
    } catch (err: any) {
      setLinklyStep('idle');
      setLinklyText('');
      Alert.alert('EFTPOS Error', err?.message ?? 'Could not connect to the Linkly terminal. Check the Linkly Cloud integration settings for this device.');
    }
  };

  const handleLinklyCancel = async () => {
    if (linklyPollRef.current) { clearTimeout(linklyPollRef.current); linklyPollRef.current = null; }
    if (linklySessionId) { try { await api.pos.linklyCancel(linklySessionId); } catch {} }
    setLinklyStep('idle');
    setLinklySessionId(null);
    setLinklyText('');
  };

  // ── Split: charge one person's portion via Linkly EFTPOS ──
  const handleSplitCardPayment = async () => {
    const amountCents = Math.min(splitCurrentCents, splitRemainingCents);
    if (amountCents <= 0) return;
    setSplitCardStep('initiating');
    setSplitCardText('Connecting to terminal…');
    try {
      const res = await api.pos.linklyInitiate(amountCents) as any;
      const sessionId = res?.data?.sessionId;
      if (!sessionId) throw new Error('No session ID returned');
      setSplitCardSessionId(sessionId);
      setSplitCardStep('waiting');
      setSplitCardText('Waiting for card…');
      // Fixed 2-second poll interval — no backoff so approval is detected within ~2 s.
      const schedulePoll = () => {
        splitCardPollRef.current = setTimeout(async () => {
          try {
            const pollRes = await api.pos.linklyPoll(sessionId) as any;
            const pd = pollRes?.data;
            if (pd?.responseText) setSplitCardText(pd.responseText);
            if (pd?.complete) {
              splitCardPollRef.current = null;
              if (pd.approved) {
                // Guard against double-commit for this split part
                if (!receiptPrintedRef.current.has(sessionId)) {
                  receiptPrintedRef.current.add(sessionId);
                  setSplitParts(ps => [...ps, { amountCents, method: 'eftpos', linklySessionId: sessionId }]);
                  setSplitInput('');
                  setSplitCardStep('idle');
                  setSplitCardText('');
                  setSplitCardSessionId(null);
                }
              } else {
                setSplitCardStep('declined');
              }
            } else {
              schedulePoll();
            }
          } catch {
            schedulePoll();
          }
        }, 2000);
      };
      schedulePoll();
    } catch (err: any) {
      setSplitCardStep('idle');
      setSplitCardText('');
      Alert.alert('EFTPOS Error', err?.message ?? 'Could not connect to terminal.');
    }
  };

  const handleSplitCardCancel = async () => {
    if (splitCardPollRef.current) { clearTimeout(splitCardPollRef.current); splitCardPollRef.current = null; }
    if (splitCardSessionId) { try { await api.pos.linklyCancel(splitCardSessionId); } catch {} }
    setSplitCardStep('idle');
    setSplitCardSessionId(null);
    setSplitCardText('');
  };

  const handleConfirm = () => {
    if (method === 'cash') {
      onConfirm({ method: 'cash', amountTenderedCents: tenderedCents, surchargeCents: computedSurchargeCents });
    } else if (method === 'eftpos') {
      handleLinklyInitiate().catch(() => {});
    } else if (method === 'split') {
      onConfirm({
        method: 'split',
        amountTenderedCents: splitCommittedCents,
        surchargeCents: computedSurchargeCents,
        splitPayments: splitParts.map(p => ({ method: p.method, amountCents: p.amountCents, linklySessionId: p.linklySessionId ?? null })),
      });
    }
  };

  const isSplitCardBusy = splitCardStep === 'initiating' || splitCardStep === 'waiting';
  const isLinklyBusy = linklyStep === 'initiating' || linklyStep === 'waiting';
  const canClose = !loading && linklyStep === 'idle' && !isSplitCardBusy;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={canClose ? onClose : undefined}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.customiseRoot}>
          {/* ── Header ── */}
          <View style={styles.sheetHeader}>
            <Pressable
              onPress={isLinklyBusy ? handleLinklyCancel : onClose}
              hitSlop={12}
              disabled={loading && !isLinklyBusy}
            >
              <Feather name={isLinklyBusy ? 'arrow-left' : 'x'} size={22} color={DARK} />
            </Pressable>
            <Text style={styles.sheetTitle}>Payment</Text>
            <View style={{ width: 22 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

            {/* ── Compact totals strip ── */}
            <View style={{ backgroundColor: DARK, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 }}>
              {discount && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Feather name="tag" size={12} color="#4ADE80" />
                    <Text style={{ fontSize: 12, color: '#4ADE80', fontWeight: '600' }}>{discount.label}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#4ADE80', fontWeight: '600' }}>–{fmtCents(discount.amountCents)}</Text>
                </View>
              )}
              {applicableSurcharges.map(s => {
                const amt = s.amountType === 'pct_basis_points' ? Math.round(totalCents * s.amountValue / 10000) : s.amountValue;
                return (
                  <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#FCA5A5' }}>{s.name}</Text>
                    <Text style={{ fontSize: 12, color: '#FCA5A5' }}>+{fmtCents(amt)}</Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: applicableSurcharges.length > 0 || discount ? 1 : 0, borderTopColor: '#FFFFFF22', paddingTop: applicableSurcharges.length > 0 || discount ? 8 : 0, marginTop: applicableSurcharges.length > 0 || discount ? 4 : 0 }}>
                <Text style={{ fontSize: 13, color: '#FFFFFFAA', fontWeight: '500' }}>TOTAL DUE</Text>
                <Text style={{ fontSize: 26, color: WHITE, fontWeight: '800', letterSpacing: -0.5 }}>{fmtCents(chargeTotalCents)}</Text>
              </View>
            </View>

            {/* ── Offline notice ── */}
            {!isOnline && (
              <View style={styles.offlinePayNotice}>
                <Feather name="wifi-off" size={14} color="#92400E" />
                <Text style={styles.offlinePayNoticeText}>
                  No connection — EFTPOS unavailable. Cash only. Order will be queued when back online.
                </Text>
              </View>
            )}
            {!cashEnabled && (
              <View style={[styles.offlinePayNotice, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Feather name="alert-circle" size={14} color={CHERRY} />
                <Text style={[styles.offlinePayNoticeText, { color: '#991B1B' }]}>
                  Enter the opening cash float in Register before taking cash payments.
                </Text>
              </View>
            )}

            {/* ── Method selector ── */}
            <View style={styles.methodRow}>
              <Pressable
                onPress={() => !isOnline ? undefined : setMethod('eftpos')}
                style={[styles.methodBtn, method === 'eftpos' && styles.methodBtnActive, !isOnline && styles.methodBtnDisabled]}
              >
                <Feather name="credit-card" size={18} color={method === 'eftpos' ? WHITE : !isOnline ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'eftpos' && { color: WHITE }, !isOnline && { color: MUTED }]}>EFTPOS</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!cashEnabled) return; setMethod('cash'); setTendered(''); }}
                style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive, !cashEnabled && styles.methodBtnDisabled]}
              >
                <Feather name="dollar-sign" size={18} color={method === 'cash' ? WHITE : !cashEnabled ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'cash' && { color: WHITE }, !cashEnabled && { color: MUTED }]}>Cash</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!isOnline) return; setMethod('split'); setSplitParts([]); setSplitInput(''); }}
                style={[styles.methodBtn, method === 'split' && styles.methodBtnActive, !isOnline && styles.methodBtnDisabled]}
              >
                <Feather name="git-branch" size={16} color={method === 'split' ? WHITE : !isOnline ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'split' && { color: WHITE }, !isOnline && { color: MUTED }]}>Split</Text>
              </Pressable>
            </View>

            {/* ── Cash: two-column layout (info left | numpad right) ── */}
            {method === 'cash' && (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>

                {/* Left column: tendered display + change + quick presets */}
                <View style={{ flex: 1 }}>
                  {/* Dark amount display — fills available height */}
                  <View style={{ backgroundColor: DARK, borderRadius: 14, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, flex: 1, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 }}>TENDERED</Text>
                    <Text style={{ fontSize: 34, color: WHITE, fontWeight: '800', letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
                      {tendered ? `$${tendered}` : '$–'}
                    </Text>
                    {tenderedCents > 0 && tenderedCents >= chargeTotalCents && (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12 }}>
                        <Text style={{ fontSize: 10, color: '#4ADE80', fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>CHANGE DUE</Text>
                        <Text style={{ fontSize: 26, color: '#4ADE80', fontWeight: '800', letterSpacing: -0.5 }}>{fmtCents(cashChangeCents)}</Text>
                      </View>
                    )}
                  </View>
                  {/* Quick presets row */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <Pressable onPress={() => setTendered((chargeTotalCents / 100).toFixed(2))} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                      <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>Exact</Text>
                    </Pressable>
                    {roundUpPresets.map(d => (
                      <Pressable key={d} onPress={() => setTendered(String(d))} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
                        <Text style={{ fontSize: 13, color: DARK, fontWeight: '700' }}>${d}</Text>
                      </Pressable>
                    ))}
                    {tendered !== '' && (
                      <Pressable onPress={() => setTendered('')} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#FFF1F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' }}>
                        <Text style={{ fontSize: 13, color: CHERRY, fontWeight: '600' }}>Clear</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Right column: numpad */}
                <View style={{ width: 216, gap: 7 }}>
                  {[['7','8','9'],['4','5','6'],['1','2','3'],['.','0','backspace']].map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                      {row.map(k => (
                        <Pressable
                          key={k}
                          onPress={() => handleKeypad(k, setTendered, tendered)}
                          style={({ pressed }) => ({
                            flex: 1, height: 62,
                            backgroundColor: pressed ? '#CBD5E1' : k === 'backspace' ? '#FFF1F2' : '#F1F5F9',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: k === 'backspace' ? '#FECACA' : '#E2E8F0',
                            justifyContent: 'center', alignItems: 'center',
                          })}
                        >
                          {k === 'backspace'
                            ? <Feather name="delete" size={20} color={CHERRY} />
                            : <Text style={{ fontSize: 24, fontWeight: '600', color: DARK }}>{k}</Text>
                          }
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>

              </View>
            )}

            {/* ── Split: multi-party cash collection ── */}
            {method === 'split' && (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>

                {/* Left column: committed parts list + shortcuts */}
                <View style={{ flex: 1 }}>
                  {/* Parts list card */}
                  <View style={{ backgroundColor: DARK, borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, flex: 1, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 }}>SPLIT PAYMENTS</Text>

                    {/* Committed parts — each shows cash or card icon */}
                    {splitParts.map((part, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: part.method === 'eftpos' ? BLUE : '#4ADE80', alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name={part.method === 'eftpos' ? 'credit-card' : 'check'} size={9} color="#0F172A" />
                          </View>
                          <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>
                            Person {i + 1}{'  '}<Text style={{ fontSize: 11, color: part.method === 'eftpos' ? BLUE : '#4ADE80' }}>{part.method === 'eftpos' ? 'Card' : 'Cash'}</Text>
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15, color: WHITE, fontWeight: '700' }}>{fmtCents(part.amountCents)}</Text>
                          <Pressable onPress={() => setSplitParts(ps => ps.filter((_, j) => j !== i))} hitSlop={8}>
                            <Feather name="x" size={14} color="#475569" />
                          </Pressable>
                        </View>
                      </View>
                    ))}

                    {/* Current input row (pending person) */}
                    {splitRemainingCents > 0 && !isSplitCardBusy && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: splitParts.length > 0 ? 8 : 0, borderTopWidth: splitParts.length > 0 ? 1 : 0, borderTopColor: '#1E293B' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#475569' }} />
                          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>Person {splitParts.length + 1}</Text>
                        </View>
                        <Text style={{ fontSize: 15, color: splitCurrentCents > 0 ? WHITE : '#475569', fontWeight: '700' }}>
                          {splitCurrentCents > 0 ? fmtCents(splitCurrentCents) : '—'}
                        </Text>
                      </View>
                    )}

                    {/* Linkly terminal status during split card payment */}
                    {isSplitCardBusy && (
                      <View style={{ paddingTop: splitParts.length > 0 ? 8 : 0, borderTopWidth: splitParts.length > 0 ? 1 : 0, borderTopColor: '#1E293B', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={BLUE} />
                        <Text style={{ fontSize: 12, color: WHITE, fontWeight: '600', textAlign: 'center' }}>{splitCardText || 'Connecting…'}</Text>
                        <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center' }}>Present card to terminal</Text>
                        <Pressable onPress={handleSplitCardCancel} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF1F2' }}>
                          <Text style={{ fontSize: 12, color: CHERRY, fontWeight: '600' }}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Declined state */}
                    {splitCardStep === 'declined' && (
                      <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E293B', alignItems: 'center', gap: 8 }}>
                        <Feather name="x-circle" size={22} color={CHERRY} />
                        <Text style={{ fontSize: 12, color: CHERRY, fontWeight: '600' }}>Card Declined</Text>
                        {!!splitCardText && <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center' }}>{splitCardText}</Text>}
                        <Pressable onPress={() => { setSplitCardStep('idle'); setSplitCardText(''); }} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8FAFC' }}>
                          <Text style={{ fontSize: 12, color: DARK, fontWeight: '600' }}>Try Again</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Remaining balance */}
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: splitRemainingCents === 0 ? '#4ADE80' : MUTED, fontWeight: '700', letterSpacing: 0.5 }}>
                        {splitRemainingCents === 0 ? '✓ FULLY COLLECTED' : 'REMAINING'}
                      </Text>
                      {splitRemainingCents > 0 && (
                        <Text style={{ fontSize: 18, color: WHITE, fontWeight: '800' }}>{fmtCents(splitRemainingCents)}</Text>
                      )}
                    </View>
                  </View>

                  {/* Equal-split shortcuts + Remaining fill */}
                  {!isSplitCardBusy && splitRemainingCents > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {[2, 3, 4, 5].map(n => (
                        <Pressable key={n} onPress={() => setSplitInput((splitRemainingCents / n / 100).toFixed(2))} style={{ paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
                          <Text style={{ fontSize: 12, color: MID, fontWeight: '700' }}>÷{n}</Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => setSplitInput((splitRemainingCents / 100).toFixed(2))} style={{ paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                        <Text style={{ fontSize: 12, color: BLUE, fontWeight: '700' }}>All</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Pay Cash / Pay Card buttons — shown when an amount is entered */}
                  {splitCurrentCents > 0 && splitRemainingCents > 0 && !isSplitCardBusy && splitCardStep !== 'declined' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          if (!cashEnabled) return;
                          const adding = Math.min(splitCurrentCents, splitRemainingCents);
                          setSplitParts(ps => [...ps, { amountCents: adding, method: 'cash' }]);
                          setSplitInput('');
                        }}
                        style={{ flex: 1, backgroundColor: cashEnabled ? '#ECFDF5' : '#E2E8F0', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: cashEnabled ? '#BBF7D0' : BORDER }}
                      >
                        <Feather name="dollar-sign" size={14} color={cashEnabled ? '#16A34A' : MUTED} />
                        <Text style={{ fontSize: 13, color: cashEnabled ? '#16A34A' : MUTED, fontWeight: '700' }}>Cash</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleSplitCardPayment}
                        style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BFDBFE' }}
                      >
                        <Feather name="credit-card" size={14} color={BLUE} />
                        <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>Card</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Right column: numpad */}
                <View style={{ width: 216, gap: 7 }}>
                  {[['7','8','9'],['4','5','6'],['1','2','3'],['.','0','backspace']].map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                      {row.map(k => (
                        <Pressable
                          key={k}
                          onPress={() => handleKeypad(k, setSplitInput, splitInput)}
                          style={({ pressed }) => ({
                            flex: 1, height: 62,
                            backgroundColor: pressed ? '#CBD5E1' : k === 'backspace' ? '#FFF1F2' : '#F1F5F9',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: k === 'backspace' ? '#FECACA' : '#E2E8F0',
                            justifyContent: 'center', alignItems: 'center',
                          })}
                        >
                          {k === 'backspace'
                            ? <Feather name="delete" size={20} color={CHERRY} />
                            : <Text style={{ fontSize: 24, fontWeight: '600', color: DARK }}>{k}</Text>
                          }
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>

              </View>
            )}

            {/* ── EFTPOS: Linkly status (only shown when active) ── */}
            {method === 'eftpos' && linklyStep !== 'idle' && (
              <View style={[styles.eftposInstructions, { marginTop: 12 }]}>
                {(linklyStep === 'initiating' || linklyStep === 'waiting') && (
                  <>
                    <ActivityIndicator size="large" color={BLUE} />
                    <Text style={styles.eftposText}>{linklyText || 'Connecting…'}</Text>
                    <Text style={styles.eftposSubText}>Present card or device to the terminal</Text>
                    <TouchableOpacity onPress={handleLinklyCancel} style={[styles.presetBtn, { borderColor: '#FECACA', backgroundColor: '#FFF1F2' }]} activeOpacity={0.75}>
                      <Text style={[styles.presetBtnText, { color: CHERRY }]}>Cancel Transaction</Text>
                    </TouchableOpacity>
                  </>
                )}
                {linklyStep === 'approved' && (
                  <>
                    <Feather name="check-circle" size={40} color="#16A34A" />
                    <Text style={[styles.eftposText, { color: '#16A34A' }]}>Payment Approved</Text>
                  </>
                )}
                {linklyStep === 'declined' && (
                  <>
                    <Feather name="x-circle" size={40} color={CHERRY} />
                    <Text style={[styles.eftposText, { color: CHERRY }]}>Payment Declined</Text>
                    {!!linklyText && <Text style={styles.eftposSubText}>{linklyText}</Text>}
                    <TouchableOpacity onPress={() => { setLinklyStep('idle'); setLinklyText(''); }} style={styles.presetBtn} activeOpacity={0.75}>
                      <Text style={styles.presetBtnText}>Try Again</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

          </ScrollView>

          {/* ── Footer: confirm button ── */}
          <View style={styles.sheetFooter}>
            {loading || isLinklyBusy ? (
              <View style={[styles.addToOrderBtn, { justifyContent: 'center' }]}>
                <ActivityIndicator color={WHITE} />
              </View>
            ) : method === 'eftpos' && linklyStep === 'idle' ? (
              <TouchableOpacity onPress={handleConfirm} style={styles.addToOrderBtn} activeOpacity={0.85}>
                <Feather name="credit-card" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm EFTPOS · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : method === 'cash' ? (
              <TouchableOpacity onPress={handleConfirm} style={[styles.addToOrderBtn, !cashOk && { opacity: 0.5 }]} disabled={!cashOk || loading} activeOpacity={0.85}>
                <Feather name="dollar-sign" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm Cash · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : method === 'split' ? (
              <TouchableOpacity onPress={handleConfirm} style={[styles.addToOrderBtn, !splitOk && { opacity: 0.5 }]} disabled={!splitOk || loading} activeOpacity={0.85}>
                <Feather name="git-branch" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm Split · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Order Complete / Loyalty Modal ────────────────────────────────────────────
function OrderCompleteModal({ order, customerEmail: initialEmail, onClose, onPrintTaxInvoice }: {
  order: {
    id: string; orderNumber: string; totalCents: number;
    paymentMethod: 'cash' | 'eftpos' | 'split';
    amountTenderedCents?: number;
    surchargeCents: number;
    splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
    loyaltyResult: PosLoyaltyResult | null;
    customerName: string;
    ticketItems: Array<{ name: string; quantity: number; unitPriceCents: number; variantName?: string; options: string[] }>;
    discountAmountCents: number;
    discountLabel: string;
  };
  customerEmail?: string;
  onClose: () => void;
  onPrintTaxInvoice?: () => void;
}) {
  const changeCents = order.paymentMethod === 'cash' && order.amountTenderedCents
    ? Math.max(0, order.amountTenderedCents - order.totalCents)
    : null;
  const lr = order.loyaltyResult;
  const isOffline = order.id.startsWith('offline-');

  const [emailOpen,    setEmailOpen]    = useState(false);
  const [emailValue,   setEmailValue]   = useState(initialEmail ?? '');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent,    setEmailSent]    = useState(false);

  const handleSendEmail = async () => {
    const trimmed = emailValue.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setEmailSending(true);
    try {
      await api.pos.emailInvoice(order.id, trimmed);
      setEmailSent(true);
      setEmailOpen(false);
    } catch (e: any) {
      Alert.alert('Email Failed', e?.message ?? 'Could not send the invoice. Check Resend is connected.');
    } finally {
      setEmailSending(false);
    }
  };

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

          {/* Action buttons — with spacing between each */}

          {/* TAX Invoice — manual, never auto-printed */}
          {!isOffline && onPrintTaxInvoice && (
            <TouchableOpacity
              onPress={onPrintTaxInvoice}
              style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignSelf: 'stretch', alignItems: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, color: '#334155', fontWeight: '600' }}>🖨  Print TAX Invoice</Text>
            </TouchableOpacity>
          )}

          {/* Email Invoice */}
          {!isOffline && (
            emailSent ? (
              <View style={{ marginTop: 10, paddingVertical: 10, alignSelf: 'stretch', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#16A34A', fontWeight: '700' }}>✓ Invoice sent</Text>
              </View>
            ) : emailOpen ? (
              <View style={{ marginTop: 10, alignSelf: 'stretch' }}>
                <TextInput
                  value={emailValue}
                  onChangeText={setEmailValue}
                  placeholder="customer@email.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#1C1C1E', backgroundColor: '#F8FAFC', marginBottom: 8 }}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => { setEmailOpen(false); }}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', backgroundColor: '#F8FAFC' }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSendEmail}
                    disabled={emailSending}
                    style={{ flex: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: emailSending ? '#93C5FD' : BLUE, alignItems: 'center' }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, color: WHITE, fontWeight: '700' }}>{emailSending ? 'Sending…' : 'Send Invoice'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setEmailOpen(true)}
                style={{ marginTop: 10, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', alignSelf: 'stretch', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                activeOpacity={0.7}
              >
                <Feather name="mail" size={14} color="#334155" />
                <Text style={{ fontSize: 14, color: '#334155', fontWeight: '600' }}>Email Invoice</Text>
              </TouchableOpacity>
            )
          )}

          {/* New Order — clear visual separation */}
          <TouchableOpacity onPress={onClose} style={[styles.completeCloseBtn, { marginTop: 16 }]} activeOpacity={0.8}>
            <Text style={styles.completeCloseBtnText}>New Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Customer Modal ────────────────────────────────────────────────────────────
function CustomerModal({
  currentCustomer, onSelect, onRemove, onClose, initialMode = 'search', recentBalances = {},
}: {
  currentCustomer: AttachedCustomer | null;
  onSelect: (c: AttachedCustomer) => void;
  onRemove: () => void;
  onClose: () => void;
  initialMode?: 'search' | 'scan';
  recentBalances?: Record<string, { loyaltyPoints: number; stampCount: number; freeCoffeeRewards: number }>;
}) {
  const { isOnline } = useOffline();
  const [mode, setMode]       = useState<'search' | 'scan'>(initialMode);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<PosCustomerResult[]>([]);
  const [cachedResults, setCachedResults] = useState<CachedPosCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCustomerId, setLoadingCustomerId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanAt = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load cached customers on mount (used as fallback when offline)
  useEffect(() => {
    searchCustomerCache('').then(setCachedResults).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOnline) {
      // Offline: search local cache
      searchCustomerCache(query).then(setCachedResults).catch(() => {});
      return;
    }
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
  }, [query, isOnline]);

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
        const customer: AttachedCustomer = {
          userId: c.userId, name: c.name, email: c.email,
          loyaltyPoints: c.loyaltyPoints, stampCount: c.stampCount,
          loyaltyTier: c.loyaltyTier, freeCoffeeRewards: c.freeCoffeeRewards ?? 0,
          birthday: c.birthday ?? null,
          availableClaimedRewards: c.availableClaimedRewards ?? [],
        };
        onSelect(customer);
        Alert.alert(`✓ ${c.name} attached`, `${c.loyaltyPoints} pts · ${c.stampCount}/${STAMP_GOAL} stamps`);
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
            {!isOnline && (
              <View style={styles.offlineCacheNotice}>
                <Feather name="wifi-off" size={13} color="#92400E" />
                <Text style={styles.offlineCacheNoticeText}>Offline — showing recently seen customers</Text>
              </View>
            )}
            <View style={[styles.searchInputWrap, { margin: 12 }]}>
              <Feather name="search" size={16} color={MUTED} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={isOnline ? "Name, email, phone or referral code…" : "Search cached customers…"}
                placeholderTextColor={MUTED}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            {isOnline ? (
              <FlatList
                data={results}
                keyExtractor={item => item.userId}
                renderItem={({ item }) => {
                  const isLoadingThis = loadingCustomerId === item.userId;
                  return (
                    <TouchableOpacity
                      onPress={async () => {
                        if (loadingCustomerId) return;
                        setLoadingCustomerId(item.userId);
                        try {
                          // Always do a fresh live fetch on selection to get the
                          // point balance current at the moment of attachment.
                          const res = await api.pos.customerSearch({ userId: item.userId });
                          const live = res.data[0];
                          if (live) {
                            onSelect({
                              userId: live.userId, name: live.name, email: live.email,
                              loyaltyPoints: live.loyaltyPoints, stampCount: live.stampCount,
                              loyaltyTier: live.loyaltyTier,
                              freeCoffeeRewards: live.freeCoffeeRewards ?? 0,
                              birthday: live.birthday ?? null,
                              availableClaimedRewards: live.availableClaimedRewards ?? [],
                            });
                          } else {
                            throw new Error('No data returned');
                          }
                        } catch {
                          // Fallback: use post-sale cached balance if available (more recent
                          // than the search result), otherwise use the search result value.
                          const recent = recentBalances[item.userId];
                          onSelect({
                            userId: item.userId, name: item.name, email: item.email,
                            loyaltyPoints: recent?.loyaltyPoints ?? item.loyaltyPoints,
                            stampCount: recent?.stampCount ?? item.stampCount,
                            loyaltyTier: item.loyaltyTier,
                            freeCoffeeRewards: recent?.freeCoffeeRewards ?? item.freeCoffeeRewards ?? 0,
                            birthday: item.birthday ?? null,
                            availableClaimedRewards: item.availableClaimedRewards ?? [],
                          });
                          Alert.alert('Balance may not be current', 'Could not refresh loyalty balance — showing last known value. Verify with the customer.');
                        } finally {
                          setLoadingCustomerId(null);
                        }
                      }}
                      style={styles.customerResultRow}
                      activeOpacity={0.7}
                      disabled={!!loadingCustomerId}
                    >
                      <View style={styles.customerAvatar}>
                        <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{item.name}</Text>
                        <Text style={styles.customerSub}>{item.email} · {item.loyaltyPoints} pts</Text>
                      </View>
                      {isLoadingThis
                        ? <ActivityIndicator size="small" color={BLUE} />
                        : <Feather name="chevron-right" size={16} color={MUTED} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  query.length >= 2 && !searching
                    ? <Text style={{ textAlign: 'center', color: MUTED, padding: 24 }}>No customers found</Text>
                    : null
                }
              />
            ) : (
              <FlatList
                data={cachedResults}
                keyExtractor={item => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => onSelect({
                      userId: item.userId, name: item.name, email: item.email,
                      loyaltyPoints: item.loyaltyPoints, stampCount: item.stampCount,
                      loyaltyTier: item.loyaltyTier, freeCoffeeRewards: item.freeCoffeeRewards ?? 0,
                      birthday: item.birthday ?? null,
                      availableClaimedRewards: item.availableClaimedRewards ?? [],
                    })}
                    style={styles.customerResultRow}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.customerAvatar, { backgroundColor: '#D97706' }]}>
                      <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerName}>{item.name}</Text>
                      <Text style={styles.customerSub}>{item.email} · {item.loyaltyPoints} pts (offline — points may differ)</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={MUTED} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ textAlign: 'center', color: MUTED, padding: 24 }}>No cached customers</Text>
                }
              />
            )}
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
  onClose, onVoidSuccess, storeData, isShopDisplay,
}: {
  onClose: () => void;
  onVoidSuccess: (id: string) => void;
  storeData?: any;
  isShopDisplay?: boolean;
}) {
  const queryClient = useQueryClient();
  const { failedItems, retryItem, dismissItem } = useOffline();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [now, setNow] = useState(() => Date.now());

  // Tick every 15s so the "Void" window timer refreshes
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const {
    data,
    isLoading,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['pos-history'],
    queryFn: ({ pageParam }) => api.pos.ordersPage({ cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    staleTime: 30_000,
  });

  const allOrders: PosHistoryOrder[] = data?.pages.flatMap(p => p.data) ?? [];

  // Self-contained void mutation so we know exactly which order is being voided
  const voidMutation = useMutation({
    mutationFn: (vars: { id: string; supervisorPin: string }) => api.pos.voidOrder(vars.id, vars.supervisorPin),
    onSuccess: (_, vars) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Voided', 'Transaction has been voided.');
      onVoidSuccess(vars.id);
      queryClient.invalidateQueries({ queryKey: ['pos-history'] });
      refetch();
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).');
    },
  });

  const [pinForVoid,   setPinForVoid]   = useState<PosHistoryOrder | null>(null);
  const [pinForRefund, setPinForRefund] = useState<{ order: PosHistoryOrder; reason?: string } | null>(null);

  // Linkly refund state
  const [refundLinklyStep, setRefundLinklyStep] = useState<'idle' | 'initiating' | 'waiting' | 'approved' | 'declined'>('idle');
  const [refundLinklySessionId, setRefundLinklySessionId] = useState<string | null>(null);
  const [refundLinklyText, setRefundLinklyText] = useState('');
  const refundLinklyPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refundReceiptPrintedRef = useRef<Set<string>>(new Set());
  const [pendingRefundPayload, setPendingRefundPayload] = useState<{ orderId: string; amountCents: number; reason?: string } | null>(null);

  const stopRefundLinklyPoll = () => {
    if (refundLinklyPollRef.current) {
      clearTimeout(refundLinklyPollRef.current);
      refundLinklyPollRef.current = null;
    }
  };

  const resetRefundLinklyState = () => {
    stopRefundLinklyPoll();
    setRefundLinklyStep('idle');
    setRefundLinklySessionId(null);
    setRefundLinklyText('');
    setPendingRefundPayload(null);
  };

  const handleRefundLinklyCancel = async () => {
    if (refundLinklySessionId) {
      try { await api.pos.linklyCancel(refundLinklySessionId); } catch {}
    }
    resetRefundLinklyState();
  };

  const refundMutation = useMutation({
    mutationFn: (vars: { orderId: string; amountCents: number; reason?: string; supervisorPin?: string; linklySessionId?: string }) =>
      api.pos.refundOrder(vars.orderId, { amountCents: vars.amountCents, reason: vars.reason, supervisorPin: vars.supervisorPin, linklySessionId: vars.linklySessionId }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const { isFullRefund, refundAmountCents } = res as any;
      resetRefundLinklyState();
      Alert.alert('Refund Issued', `${isFullRefund ? 'Full' : 'Partial'} refund of ${fmtCents(refundAmountCents)} processed.`);
      queryClient.invalidateQueries({ queryKey: ['pos-history'] });
      refetch();
    },
    onError: (err: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      resetRefundLinklyState();
      Alert.alert('Refund Failed', err?.message ?? 'Could not process refund.');
    },
  });

  const handleRefund = (order: PosHistoryOrder) => {
    Alert.alert(
      'Issue Refund',
      `Refund order #${order.orderNumber} (${fmtCents(order.totalCents)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Full Refund',
          style: 'destructive',
          onPress: () => setPinForRefund({ order, reason: 'Full refund' }),
        },
      ],
    );
  };

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
    // Supervisor PIN always required to void a completed transaction (server enforces this too)
    setPinForVoid(order);
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

        {/* ── Failed sync items section ──────────────────────────────────── */}
        {failedItems.length > 0 && (
          <View style={styles.failedSyncSection}>
            <View style={styles.failedSyncHeader}>
              <Feather name="alert-circle" size={15} color={CHERRY} />
              <Text style={styles.failedSyncTitle}>Sync Failed ({failedItems.length})</Text>
            </View>
            <Text style={styles.failedSyncSubtitle}>These orders could not be submitted. Retry or dismiss each one.</Text>
            {failedItems.map(item => (
              <View key={item.idempotencyKey} style={styles.failedSyncRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.failedSyncItems} numberOfLines={1}>{item.itemSummary || 'Order'}</Text>
                  <Text style={styles.failedSyncMeta}>
                    {fmtCents(item.totalCents)}{item.customerName ? ` · ${item.customerName}` : ''}
                    {item.syncError ? ` · ${item.syncError}` : ''}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => retryItem(item.idempotencyKey)} style={styles.failedSyncRetryBtn}>
                    <Text style={styles.failedSyncRetryText}>Retry</Text>
                  </Pressable>
                  <Pressable onPress={() => dismissItem(item.idempotencyKey)} style={styles.failedSyncDismissBtn}>
                    <Text style={styles.failedSyncDismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

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

                      {/* Surcharge / split breakdown */}
                      {(item.surchargeCents > 0 || item.splitPayments) && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, gap: 4 }}>
                          {item.surchargeCents > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={styles.historyLineNote}>Surcharge</Text>
                              <Text style={[styles.historyLineNote, { color: '#EA580C' }]}>+{fmtCents(item.surchargeCents)}</Text>
                            </View>
                          )}
                          {item.splitPayments && item.splitPayments.length > 0 && (
                            <View style={{ gap: 2 }}>
                              {item.splitPayments.map((sp, si) => (
                                <View key={si} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                  <Text style={styles.historyLineNote}>{sp.method === 'cash' ? 'Cash' : 'EFTPOS'}</Text>
                                  <Text style={styles.historyLineNote}>{fmtCents(sp.amountCents)}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      {/* Action buttons row */}
                      <View style={styles.historyVoidRow}>
                        {/* Reprint button */}
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync();
                            Alert.alert('Reprint', `Reprinting receipt for #${item.orderNumber}…\n(Requires printer configured in Settings)`);
                          }}
                          style={styles.historyReprintBtn}
                          activeOpacity={0.8}
                        >
                          <Feather name="printer" size={13} color={BLUE} />
                          <Text style={styles.historyReprintBtnText}>Reprint</Text>
                        </TouchableOpacity>

                        {/* Void button */}
                        {item.status !== 'cancelled' && voidable && (
                          <TouchableOpacity
                            onPress={() => handleVoid(item)}
                            style={styles.historyVoidBtn}
                            disabled={isVoiding}
                            activeOpacity={0.8}
                          >
                            {isVoiding
                              ? <ActivityIndicator size="small" color={WHITE} />
                              : <><Feather name="x-circle" size={13} color={WHITE} />
                                 <Text style={styles.historyVoidBtnText}>Void</Text></>
                            }
                          </TouchableOpacity>
                        )}
                        {item.status !== 'cancelled' && !voidable && (
                          <Text style={styles.historyVoidExpired}>Void window expired</Text>
                        )}

                        {/* Refund button (director / manager only) */}
                        {item.status !== 'cancelled' && !voidable && (
                          <TouchableOpacity
                            onPress={() => handleRefund(item)}
                            style={styles.historyRefundBtn}
                            disabled={refundMutation.isPending && refundMutation.variables?.orderId === item.id}
                            activeOpacity={0.8}
                          >
                            {refundMutation.isPending && (refundMutation.variables as any)?.orderId === item.id
                              ? <ActivityIndicator size="small" color={WHITE} />
                              : <><Feather name="rotate-ccw" size={13} color={WHITE} />
                                 <Text style={styles.historyRefundBtnText}>Refund</Text></>
                            }
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
            ListFooterComponent={
              hasNextPage ? (
                <TouchableOpacity
                  onPress={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  style={styles.loadMoreBtn}
                  activeOpacity={0.8}
                >
                  {isFetchingNextPage
                    ? <ActivityIndicator size="small" color={BLUE} />
                    : <Text style={styles.loadMoreText}>Load older transactions</Text>
                  }
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </View>

      {/* PIN gate for refunds */}
      {pinForRefund && (
        <PosPinModal
          onClose={() => setPinForRefund(null)}
          onSuccess={async (pin) => {
            const { order, reason } = pinForRefund;
            setPinForRefund(null);

            if (order.paymentMethod === 'eftpos') {
              // EFTPOS: initiate a Linkly terminal refund first, then commit to DB on approval
              setRefundLinklyStep('initiating');
              setRefundLinklyText('Connecting to terminal…');
              setPendingRefundPayload({ orderId: order.id, amountCents: order.totalCents, reason });
              try {
                const res = await api.pos.linklyInitiateRefund(order.id, order.totalCents, pin);
                const sessionId = (res as any)?.data?.sessionId as string;
                if (!sessionId) throw new Error('No session ID returned from terminal.');
                setRefundLinklySessionId(sessionId);
                setRefundLinklyStep('waiting');
                setRefundLinklyText('Present the original card to the terminal');

                // Poll until the terminal completes the refund.
                // Exponential backoff: starts at 2 s, doubles each cycle, capped at 15 s.
                let refundPollDelay = 2000;
                const scheduleRefundPoll = () => {
                  refundLinklyPollRef.current = setTimeout(async () => {
                    try {
                      const poll = await api.pos.linklyPoll(sessionId);
                      const d = (poll as any)?.data;
                      if (d?.responseText) setRefundLinklyText(d.responseText);
                      if (d?.complete) {
                        refundLinklyPollRef.current = null;
                        if (d.approved) {
                          setRefundLinklyStep('approved');
                          setRefundLinklyText('Refund approved');
                          // Guard: print and commit refund exactly once even if poll fires twice
                          if (!refundReceiptPrintedRef.current.has(sessionId)) {
                            refundReceiptPrintedRef.current.add(sessionId);
                            // Print the Linkly terminal refund receipt if the terminal provided one.
                            if (d.receiptText && storeData?.autoPrint && storeData?.printerIp) {
                              const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
                              sendLinklyReceiptPrint({
                                lines: (d.receiptText as string).split('\n'),
                                printerBrand: storeData?.printerBrand ?? 'epson',
                              }, storeData.printerIp, storeData.printerPort ?? 9100, fetchBytes).catch(() => {});
                            }
                            refundMutation.mutate({ orderId: order.id, amountCents: order.totalCents, reason, linklySessionId: sessionId });
                          }
                        } else {
                          setRefundLinklyStep('declined');
                          setRefundLinklyText(d.responseText || 'Declined by terminal');
                        }
                      } else {
                        refundPollDelay = Math.min(refundPollDelay * 2, 15000);
                        scheduleRefundPoll();
                      }
                    } catch {
                      refundPollDelay = Math.min(refundPollDelay * 2, 15000);
                      scheduleRefundPoll();
                    }
                  }, refundPollDelay);
                };
                scheduleRefundPoll();
              } catch (err: any) {
                setRefundLinklyStep('declined');
                setRefundLinklyText(err?.message ?? 'Could not reach Linkly terminal.');
              }
            } else {
              // Cash / other: commit refund directly
              refundMutation.mutate({ orderId: order.id, amountCents: order.totalCents, reason, supervisorPin: pin });
            }
          }}
        />
      )}

      {/* PIN gate for void (always required to void a completed order) */}
      {pinForVoid && (
        <PosPinModal
          onClose={() => setPinForVoid(null)}
          onSuccess={(pin) => {
            const order = pinForVoid;
            setPinForVoid(null);
            voidMutation.mutate({ id: order.id, supervisorPin: pin });
          }}
        />
      )}

      {/* Linkly refund waiting overlay */}
      {refundLinklyStep !== 'idle' && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 24, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={[styles.eftposInstructions, { width: '100%' }]}>
            {(refundLinklyStep === 'initiating' || refundLinklyStep === 'waiting') && (
              <>
                <ActivityIndicator size="large" color={BLUE} />
                <Text style={styles.eftposText}>{refundLinklyText || 'Connecting…'}</Text>
                <Text style={styles.eftposSubText}>Present the original card to the terminal</Text>
                <TouchableOpacity onPress={handleRefundLinklyCancel} style={[styles.presetBtn, { borderColor: '#FECACA', backgroundColor: '#FFF1F2' }]} activeOpacity={0.75}>
                  <Text style={[styles.presetBtnText, { color: CHERRY }]}>Cancel Refund</Text>
                </TouchableOpacity>
              </>
            )}
            {refundLinklyStep === 'approved' && (
              <>
                <Feather name="check-circle" size={44} color="#16A34A" />
                <Text style={[styles.eftposText, { color: '#16A34A' }]}>Refund Approved</Text>
                <Text style={styles.eftposSubText}>Processing…</Text>
              </>
            )}
            {refundLinklyStep === 'declined' && (
              <>
                <Feather name="x-circle" size={44} color={CHERRY} />
                <Text style={[styles.eftposText, { color: CHERRY }]}>Refund Declined</Text>
                {!!refundLinklyText && <Text style={styles.eftposSubText}>{refundLinklyText}</Text>}
                <TouchableOpacity onPress={resetRefundLinklyState} style={styles.presetBtn} activeOpacity={0.75}>
                  <Text style={styles.presetBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}

const AUD_DENOMS = [
  { label: '$100', cents: 10000, note: true },
  { label: '$50',  cents: 5000,  note: true },
  { label: '$20',  cents: 2000,  note: true },
  { label: '$10',  cents: 1000,  note: true },
  { label: '$5',   cents: 500,   note: true },
  { label: '$2',   cents: 200,   note: false },
  { label: '$1',   cents: 100,   note: false },
  { label: '50¢',  cents: 50,    note: false },
  { label: '20¢',  cents: 20,    note: false },
  { label: '10¢',  cents: 10,    note: false },
  { label: '5¢',   cents: 5,     note: false },
];

// ── Cash Float Prompt ─────────────────────────────────────────────────────────
function CashFloatPrompt({ onSave, onSkip, busy }: {
  onSave: (amountCents: number) => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const [value, setValue] = React.useState('');
  const isValid = parseFloat(value || '0') > 0;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onSkip}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: WHITE, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, gap: 4 }}>
          {/* Icon + heading */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Feather name="dollar-sign" size={24} color={BLUE} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', color: DARK, textAlign: 'center' }}>Morning Cash Float</Text>
            <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Enter the starting cash in the drawer to enable cash payments for today.
            </Text>
          </View>

          {/* Amount input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: isValid ? BLUE : BORDER, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: DARK, marginRight: 6 }}>$</Text>
            <TextInput
              style={{ flex: 1, fontSize: 28, fontWeight: '700', color: DARK, padding: 0 }}
              placeholder="0.00"
              placeholderTextColor={MUTED}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={v => setValue(v.replace(/[^0-9.]/g, ''))}
              autoFocus
              selectTextOnFocus
            />
            <Text style={{ fontSize: 14, color: MUTED, fontWeight: '600' }}>AUD</Text>
          </View>

          {/* Quick amounts */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[100, 200, 300, 500].map(amt => (
              <Pressable
                key={amt}
                onPress={() => { setValue(amt.toFixed(2)); Haptics.selectionAsync(); }}
                style={{ flex: 1, backgroundColor: value === amt.toFixed(2) ? BLUE : '#F1F5F9', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: value === amt.toFixed(2) ? WHITE : MID }}>${amt}</Text>
              </Pressable>
            ))}
          </View>

          {/* Set float button */}
          <TouchableOpacity
            onPress={() => isValid && onSave(Math.round(parseFloat(value) * 100))}
            style={[{ backgroundColor: isValid ? BLUE : '#CBD5E1', borderRadius: 12, paddingVertical: 15, alignItems: 'center' }, busy && { opacity: 0.7 }]}
            disabled={!isValid || busy}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color={WHITE} />
              : <Text style={{ fontSize: 16, fontWeight: '800', color: WHITE }}>Set Float</Text>}
          </TouchableOpacity>

          {/* Skip */}
          <Pressable onPress={onSkip} style={{ paddingVertical: 12, alignItems: 'center' }} hitSlop={8}>
            <Text style={{ fontSize: 14, color: MUTED, fontWeight: '500' }}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RegisterModal({
  visible,
  onClose,
  data,
  loading,
  onSaveFloat,
  onCashMovement,
  onCloseRegister,
  onToggleAutoClose,
  discountPresets,
  onChangePresets,
  onPrintSummary,
  onOpenDrawer,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  data: PosRegisterCurrentResponse | null;
  loading: boolean;
  onSaveFloat: (amountCents: number) => void;
  onCashMovement: (payload: { movementType: 'add' | 'remove'; amountCents: number; reason?: string }) => void;
  onCloseRegister: (payload: { actualCountedCashCents: number; closeNote?: string; varianceNote?: string }) => void;
  onToggleAutoClose: (enabled: boolean) => void;
  discountPresets: number[];
  onChangePresets: (presets: number[]) => void;
  onPrintSummary: () => Promise<void>;
  onOpenDrawer: () => Promise<void>;
  busy: boolean;
}) {
  const queryClient = useQueryClient();
  const session = data?.session ?? null;
  const summary = session?.summary;
  const [floatInput, setFloatInput] = useState('');
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [movementType, setMovementType] = useState<'add' | 'remove'>('add');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});
  const [closeNote, setCloseNote] = useState('');
  const [varianceNote, setVarianceNote] = useState('');

  // ── Discount Presets state ────────────────────────────────────────────────
  const [localPresets, setLocalPresets] = React.useState<number[]>(discountPresets);
  const [newPct, setNewPct] = React.useState('');
  const [presetError, setPresetError] = React.useState<string | null>(null);

  // Sync localPresets when parent discountPresets changes (e.g. on open)
  React.useEffect(() => { setLocalPresets(discountPresets); }, [visible]);

  const addPreset = () => {
    const val = parseInt(newPct, 10);
    if (!val || val < 1 || val > 99) { setPresetError('Enter 1–99'); return; }
    if (localPresets.includes(val)) { setPresetError(`${val}% already exists`); return; }
    setLocalPresets(prev => [...prev, val].sort((a, b) => a - b));
    setNewPct('');
    setPresetError(null);
  };
  const removePreset = (pct: number) => setLocalPresets(prev => prev.filter(p => p !== pct));
  const savePresets = () => { onChangePresets(localPresets); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };

  // ── Surcharge state ───────────────────────────────────────────────────────
  const [surchargeTab, setSurchargeTab] = React.useState<'list' | 'add'>('list');
  const [newSurchargeName, setNewSurchargeName] = React.useState('');
  const [newSurchargeTriggerType, setNewSurchargeTriggerType] = React.useState<'payment_method' | 'day_of_week'>('payment_method');
  const [newSurchargeTriggerValue, setNewSurchargeTriggerValue] = React.useState('eftpos');
  const [newSurchargeAmountType, setNewSurchargeAmountType] = React.useState<'pct_basis_points' | 'fixed_cents'>('pct_basis_points');
  const [newSurchargeAmount, setNewSurchargeAmount] = React.useState('');
  const [surchargeError, setSurchargeError] = React.useState<string | null>(null);

  const { data: surchargesData, refetch: refetchSurcharges } = useQuery({
    queryKey: ['pos-surcharges'],
    queryFn: () => api.pos.surcharges(),
    staleTime: 30_000,
  });
  const surcharges: PosSurcharge[] = (surchargesData as any)?.data ?? [];

  const createSurchargeMutation = useMutation({
    mutationFn: () => api.pos.createSurcharge({
      name: newSurchargeName.trim(),
      triggerType: newSurchargeTriggerType,
      triggerValue: newSurchargeTriggerValue,
      amountType: newSurchargeAmountType,
      amountValue: Math.round(parseFloat(newSurchargeAmount || '0') * 100),
    }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] });
      refetchSurcharges();
      setSurchargeTab('list');
      setNewSurchargeName('');
      setNewSurchargeAmount('');
      setSurchargeError(null);
    },
    onError: (err: any) => setSurchargeError(err?.message ?? 'Failed to create surcharge'),
  });

  const deleteSurchargeMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteSurcharge(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] });
      refetchSurcharges();
    },
  });

  const toggleSurchargeMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => api.pos.updateSurcharge(vars.id, { isActive: vars.isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] }); refetchSurcharges(); },
  });

  const handleAddSurcharge = () => {
    if (!newSurchargeName.trim()) { setSurchargeError('Enter a name'); return; }
    if (!newSurchargeAmount || parseFloat(newSurchargeAmount) <= 0) { setSurchargeError('Enter a valid amount'); return; }
    setSurchargeError(null);
    createSurchargeMutation.mutate();
  };

  const fmtSurchargeValue = (s: PosSurcharge) =>
    s.amountType === 'pct_basis_points'
      ? `${(s.amountValue / 100).toFixed(2)}%`
      : fmtCents(s.amountValue);

  useEffect(() => {
    if (!visible || !session) return;
    if (summary?.startingFloatCents != null) {
      setFloatInput((summary.startingFloatCents / 100).toFixed(2));
    }
    setDenomCounts({});
    setCloseNote(session.closeNote ?? '');
    setVarianceNote(session.varianceNote ?? '');
  }, [session, visible]);

  const [openSection, setOpenSection] = React.useState<'float' | 'drawer' | 'close' | 'presets' | 'surcharges' | null>(null);
  const toggleSection = (key: typeof openSection) =>
    setOpenSection(prev => (prev === key ? null : key));

  const countedCents = AUD_DENOMS.reduce((sum, d) => {
    const qty = parseInt(denomCounts[d.cents] ?? '0', 10);
    return sum + (isNaN(qty) || qty < 0 ? 0 : qty * d.cents);
  }, 0);
  const variancePreview = summary ? countedCents - summary.expectedCashCents : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>Register</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          {loading || !summary ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator color={BLUE} />
            </View>
          ) : (
            <>
              <View style={styles.registerHero}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.registerHeroTitle}>{session?.registerName ?? 'Register'}</Text>
                  <Text style={styles.registerHeroSub}>{session?.registerLocation ?? 'Butterfield Cookies'}</Text>
                  <Text style={styles.registerHeroMeta}>Trading day {session?.tradingDate}</Text>
                </View>
                <View style={[styles.registerStatusPill, data?.cashEnabled ? styles.registerStatusOpen : styles.registerStatusNeedsFloat]}>
                  <Text style={[styles.registerStatusText, !data?.cashEnabled && { color: CHERRY }]}>
                    {data?.cashEnabled ? 'Cash Ready' : 'Float Required'}
                  </Text>
                </View>
              </View>

              <View style={styles.registerGrid}>
                <View style={styles.registerCard}>
                  <Text style={styles.registerMetricLabel}>Opening Float</Text>
                  <Text style={styles.registerMetricValue}>{fmtCents(summary.startingFloatCents ?? 0)}</Text>
                </View>
                <View style={styles.registerCard}>
                  <Text style={styles.registerMetricLabel}>Expected Cash</Text>
                  <Text style={styles.registerMetricValue}>{fmtCents(summary.expectedCashCents)}</Text>
                </View>
                <View style={styles.registerCard}>
                  <Text style={styles.registerMetricLabel}>Cash Sales</Text>
                  <Text style={styles.registerMetricValue}>{fmtCents(summary.cashSalesCents)}</Text>
                </View>
                <View style={styles.registerCard}>
                  <Text style={styles.registerMetricLabel}>Card Sales</Text>
                  <Text style={styles.registerMetricValue}>{fmtCents(summary.cardSalesCents)}</Text>
                </View>
              </View>

              <View style={styles.registerSection}>
                <Text style={styles.sectionTitle}>Today&apos;s Totals</Text>
                {[
                  ['Cash Refunds', fmtCents(summary.cashRefundsCents)],
                  ['Card Refunds', fmtCents(summary.cardRefundsCents)],
                  ['Discounts', fmtCents(summary.discountsCents)],
                  ['Surcharges', fmtCents(summary.surchargesCents)],
                  ['Cash Added', fmtCents(summary.cashAddedCents)],
                  ['Cash Removed', fmtCents(summary.cashRemovedCents)],
                  ['Total Sales', fmtCents(summary.totalSalesCents)],
                ].map(([label, value]) => (
                  <View key={label} style={styles.registerLine}>
                    <Text style={styles.registerLineLabel}>{label}</Text>
                    <Text style={styles.registerLineValue}>{value}</Text>
                  </View>
                ))}
              </View>

              {/* ── All Channels Today ─────────────────────────────────── */}
              {(() => {
                const posTotal       = summary.totalSalesCents;
                const inAppTotal     = data?.inAppOrders?.revenueCents ?? 0;
                const wholesaleTotal = data?.wholesaleOrders?.revenueCents ?? 0;
                const grandTotal     = posTotal + inAppTotal + wholesaleTotal;
                const inAppCount     = data?.inAppOrders?.count ?? 0;
                const wsCount        = data?.wholesaleOrders?.count ?? 0;
                return (
                  <View style={styles.registerSection}>
                    <Text style={styles.sectionTitle}>All Channels Today</Text>
                    <View style={styles.registerLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.registerLineLabel}>POS</Text>
                      </View>
                      <Text style={styles.registerLineValue}>{fmtCents(posTotal)}</Text>
                    </View>
                    <View style={styles.registerLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.registerLineLabel}>Customer App</Text>
                        <Text style={[styles.registerLineLabel, { fontSize: 11, marginTop: 1 }]}>{inAppCount} order{inAppCount !== 1 ? 's' : ''}</Text>
                      </View>
                      <Text style={styles.registerLineValue}>{fmtCents(inAppTotal)}</Text>
                    </View>
                    <View style={styles.registerLine}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.registerLineLabel}>Wholesale</Text>
                        <Text style={[styles.registerLineLabel, { fontSize: 11, marginTop: 1 }]}>{wsCount} order{wsCount !== 1 ? 's' : ''}</Text>
                      </View>
                      <Text style={styles.registerLineValue}>{fmtCents(wholesaleTotal)}</Text>
                    </View>
                    <View style={[styles.registerLine, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#334155', marginTop: 6, paddingTop: 10 }]}>
                      <Text style={[styles.registerLineLabel, { fontWeight: '700', color: DARK }]}>Grand Total</Text>
                      <Text style={[styles.registerLineValue, { fontWeight: '800', color: BLUE, fontSize: 18 }]}>{fmtCents(grandTotal)}</Text>
                    </View>
                  </View>
                );
              })()}

              {/* ── Settings accordion ─────────────────────────────────── */}
              <View style={styles.regAccordionGroup}>

                {/* Open Drawer */}
                <Pressable
                  style={({ pressed }) => [styles.regAccordionRow, (pressed || drawerBusy) && { opacity: 0.6 }]}
                  disabled={drawerBusy}
                  onPress={async () => {
                    setDrawerBusy(true);
                    try {
                      await onOpenDrawer();
                    } catch {
                    } finally {
                      setDrawerBusy(false);
                    }
                  }}
                >
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Feather name="unlock" size={16} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>{drawerBusy ? 'Opening Drawer…' : 'Open Cash Drawer'}</Text>
                    <Text style={styles.regAccordionSub}>Send pulse to open via receipt printer</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={MUTED} />
                </Pressable>

                <View style={styles.regAccordionDivider} />

                {/* Cash Float */}
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('float')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="dollar-sign" size={16} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Cash Float</Text>
                    <Text style={styles.regAccordionSub}>{data?.cashEnabled ? fmtCents(summary.startingFloatCents ?? 0) : 'Not set — required to accept cash'}</Text>
                  </View>
                  <Feather name={openSection === 'float' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'float' && (
                  <View style={styles.regAccordionBody}>
                    <TextInput
                      style={styles.registerInput}
                      placeholder="0.00"
                      placeholderTextColor={MUTED}
                      keyboardType="decimal-pad"
                      value={floatInput}
                      onChangeText={setFloatInput}
                    />
                    <TouchableOpacity
                      onPress={() => { onSaveFloat(Math.round(parseFloat(floatInput || '0') * 100)); toggleSection('float'); }}
                      style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]}
                      disabled={busy}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addToOrderBtnText}>{data?.cashEnabled ? 'Update Float' : 'Start Cash Float'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                {/* Cash In Drawer */}
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('drawer')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="refresh-cw" size={16} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Cash In Drawer</Text>
                    <Text style={styles.regAccordionSub}>Add or remove cash · {data?.cashMovements?.length ?? 0} movement{data?.cashMovements?.length === 1 ? '' : 's'} today</Text>
                  </View>
                  <Feather name={openSection === 'drawer' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'drawer' && (
                  <View style={styles.regAccordionBody}>
                    <View style={styles.registerToggleRow}>
                      <Pressable onPress={() => setMovementType('add')} style={[styles.registerToggleBtn, movementType === 'add' && styles.registerToggleBtnActive]}>
                        <Text style={[styles.registerToggleText, movementType === 'add' && styles.registerToggleTextActive]}>Add Cash</Text>
                      </Pressable>
                      <Pressable onPress={() => setMovementType('remove')} style={[styles.registerToggleBtn, movementType === 'remove' && styles.registerToggleBtnActive]}>
                        <Text style={[styles.registerToggleText, movementType === 'remove' && styles.registerToggleTextActive]}>Remove Cash</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={styles.registerInput}
                      placeholder="Amount"
                      placeholderTextColor={MUTED}
                      keyboardType="decimal-pad"
                      value={movementAmount}
                      onChangeText={setMovementAmount}
                    />
                    <TextInput
                      style={[styles.registerInput, styles.registerTextarea]}
                      placeholder="Reason / note"
                      placeholderTextColor={MUTED}
                      multiline
                      value={movementReason}
                      onChangeText={setMovementReason}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        onCashMovement({ movementType, amountCents: Math.round(parseFloat(movementAmount || '0') * 100), reason: movementReason });
                        setMovementAmount('');
                        setMovementReason('');
                      }}
                      style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]}
                      disabled={busy}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addToOrderBtnText}>{movementType === 'add' ? 'Add Cash to Drawer' : 'Remove Cash from Drawer'}</Text>
                    </TouchableOpacity>
                    {data?.cashMovements?.length ? (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        {data.cashMovements.slice(0, 5).map((movement: PosRegisterCashMovement) => (
                          <View key={movement.id} style={styles.registerMovementRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.registerMovementTitle}>
                                {movement.movementType === 'add' ? 'Cash Added' : 'Cash Removed'} · {fmtCents(movement.amountCents)}
                              </Text>
                              <Text style={styles.registerMovementMeta}>
                                {movement.reason || 'No note'}{movement.createdByName ? ` · ${movement.createdByName}` : ''}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                {/* Count Cash & Close */}
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('close')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#FFF7ED' }]}>
                    <Feather name="lock" size={16} color="#EA580C" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Count Cash &amp; Close Register</Text>
                    <Text style={styles.regAccordionSub}>{session?.closedAt ? 'Closed · tap to print summary' : `Expected ${fmtCents(summary.expectedCashCents)} in drawer`}</Text>
                  </View>
                  <Feather name={openSection === 'close' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'close' && (
                  <View style={styles.regAccordionBody}>
                    <Text style={styles.denomGroupLabel}>Notes</Text>
                    {AUD_DENOMS.filter(d => d.note).map(d => {
                      const qty = parseInt(denomCounts[d.cents] ?? '0', 10);
                      const subtotal = (isNaN(qty) || qty < 0 ? 0 : qty) * d.cents;
                      return (
                        <View key={d.cents} style={styles.denomRow}>
                          <Text style={styles.denomLabel}>{d.label}</Text>
                          <View style={styles.denomQtyRow}>
                            <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String(Math.max(0, (parseInt(p[d.cents] ?? '0', 10) || 0) - 1)) }))} style={styles.denomBtn} hitSlop={6}>
                              <Feather name="minus" size={14} color={MID} />
                            </Pressable>
                            <TextInput style={styles.denomInput} keyboardType="number-pad" value={denomCounts[d.cents] ?? ''} placeholder="0" placeholderTextColor={MUTED} onChangeText={v => setDenomCounts(p => ({ ...p, [d.cents]: v.replace(/[^0-9]/g, '') }))} selectTextOnFocus />
                            <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String((parseInt(p[d.cents] ?? '0', 10) || 0) + 1) }))} style={styles.denomBtn} hitSlop={6}>
                              <Feather name="plus" size={14} color={MID} />
                            </Pressable>
                          </View>
                          <Text style={styles.denomSubtotal}>{subtotal > 0 ? fmtCents(subtotal) : '—'}</Text>
                        </View>
                      );
                    })}
                    <Text style={[styles.denomGroupLabel, { marginTop: 10 }]}>Coins</Text>
                    {AUD_DENOMS.filter(d => !d.note).map(d => {
                      const qty = parseInt(denomCounts[d.cents] ?? '0', 10);
                      const subtotal = (isNaN(qty) || qty < 0 ? 0 : qty) * d.cents;
                      return (
                        <View key={d.cents} style={styles.denomRow}>
                          <Text style={styles.denomLabel}>{d.label}</Text>
                          <View style={styles.denomQtyRow}>
                            <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String(Math.max(0, (parseInt(p[d.cents] ?? '0', 10) || 0) - 1)) }))} style={styles.denomBtn} hitSlop={6}>
                              <Feather name="minus" size={14} color={MID} />
                            </Pressable>
                            <TextInput style={styles.denomInput} keyboardType="number-pad" value={denomCounts[d.cents] ?? ''} placeholder="0" placeholderTextColor={MUTED} onChangeText={v => setDenomCounts(p => ({ ...p, [d.cents]: v.replace(/[^0-9]/g, '') }))} selectTextOnFocus />
                            <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String((parseInt(p[d.cents] ?? '0', 10) || 0) + 1) }))} style={styles.denomBtn} hitSlop={6}>
                              <Feather name="plus" size={14} color={MID} />
                            </Pressable>
                          </View>
                          <Text style={styles.denomSubtotal}>{subtotal > 0 ? fmtCents(subtotal) : '—'}</Text>
                        </View>
                      );
                    })}
                    <View style={styles.denomSummaryBox}>
                      <View style={styles.registerLine}>
                        <Text style={[styles.registerLineLabel, { fontWeight: '700', color: DARK }]}>Total Counted</Text>
                        <Text style={[styles.registerLineValue, { fontWeight: '800', color: DARK, fontSize: 18 }]}>{fmtCents(countedCents)}</Text>
                      </View>
                      <View style={styles.registerLine}>
                        <Text style={styles.registerLineLabel}>Expected Cash</Text>
                        <Text style={styles.registerLineValue}>{fmtCents(summary?.expectedCashCents ?? 0)}</Text>
                      </View>
                      <View style={[styles.registerLine, { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 6, paddingTop: 8 }]}>
                        <Text style={[styles.registerLineLabel, { fontWeight: '700' }]}>Variance</Text>
                        <Text style={[styles.registerLineValue, { fontWeight: '700', color: variancePreview === 0 ? '#15803D' : variancePreview > 0 ? '#15803D' : CHERRY }]}>
                          {variancePreview > 0 ? '+' : ''}{fmtCents(variancePreview)}
                        </Text>
                      </View>
                    </View>
                    <TextInput style={[styles.registerInput, styles.registerTextarea]} placeholder="Close note (optional)" placeholderTextColor={MUTED} multiline value={closeNote} onChangeText={setCloseNote} />
                    {variancePreview !== 0 && (
                      <TextInput style={[styles.registerInput, styles.registerTextarea]} placeholder="Reason for cash variance" placeholderTextColor={MUTED} multiline value={varianceNote} onChangeText={setVarianceNote} />
                    )}
                    <TouchableOpacity
                      onPress={() => onCloseRegister({ actualCountedCashCents: countedCents, closeNote, varianceNote: variancePreview !== 0 ? varianceNote : undefined })}
                      style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]}
                      disabled={busy}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addToOrderBtnText}>Close Register</Text>
                    </TouchableOpacity>
                    {!!session?.closedAt && (
                      <Pressable onPress={() => void onPrintSummary()} style={styles.registerSecondaryBtn}>
                        <Feather name="printer" size={14} color={BLUE} />
                        <Text style={styles.registerSecondaryBtnText}>Print Summary</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                {/* Auto Close — toggle inline, no expand needed */}
                <Pressable
                  style={styles.regAccordionRow}
                  onPress={() => data?.canEditAutoClose && onToggleAutoClose(!data.autoCloseEnabled)}
                  disabled={!data?.canEditAutoClose}
                >
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F5F3FF' }]}>
                    <Feather name="clock" size={16} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.regAccordionTitle, !data?.canEditAutoClose && { opacity: 0.5 }]}>Auto Close at 11:59pm</Text>
                    <Text style={styles.regAccordionSub}>{data?.canEditAutoClose ? 'Tap to toggle' : 'Manager or director only'}</Text>
                  </View>
                  <Pressable
                    onPress={() => data?.canEditAutoClose && onToggleAutoClose(!data.autoCloseEnabled)}
                    style={[styles.registerSwitch, data?.autoCloseEnabled && styles.registerSwitchOn, !data?.canEditAutoClose && { opacity: 0.35 }]}
                    hitSlop={8}
                  >
                    <View style={[styles.registerSwitchKnob, data?.autoCloseEnabled && styles.registerSwitchKnobOn]} />
                  </Pressable>
                </Pressable>

                <View style={styles.regAccordionDivider} />

                {/* Quick Discount Presets */}
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('presets')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#FFF1F2' }]}>
                    <Feather name="percent" size={16} color={CHERRY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Quick Discount Presets</Text>
                    <Text style={styles.regAccordionSub}>{localPresets.length > 0 ? localPresets.map(p => `${p}%`).join(' · ') : 'No presets set'}</Text>
                  </View>
                  <Feather name={openSection === 'presets' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'presets' && (
                  <View style={styles.regAccordionBody}>
                    <Text style={styles.sectionSubtitle}>Percentage buttons shown on every ticket for fast discounting.</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
                      {localPresets.map(pct => (
                        <View key={pct} style={styles.settingsPresetChip}>
                          <Text style={styles.settingsPresetText}>{pct}%</Text>
                          <Pressable onPress={() => removePreset(pct)} hitSlop={6} style={{ marginLeft: 6 }}>
                            <Feather name="x" size={12} color={MID} />
                          </Pressable>
                        </View>
                      ))}
                      {localPresets.length === 0 && <Text style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No presets — add one below</Text>}
                    </View>
                    <View style={styles.settingsAddRow}>
                      <TextInput
                        style={styles.settingsAddInput}
                        placeholder="e.g. 15"
                        placeholderTextColor={MUTED}
                        value={newPct}
                        onChangeText={v => { setNewPct(v.replace(/[^0-9]/g, '')); setPresetError(null); }}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onSubmitEditing={addPreset}
                        maxLength={2}
                      />
                      <Text style={{ fontSize: 15, fontWeight: '600', color: MID, marginLeft: 4 }}>%</Text>
                      <Pressable onPress={addPreset} style={styles.settingsAddBtn}>
                        <Text style={styles.settingsAddBtnText}>Add</Text>
                      </Pressable>
                    </View>
                    {presetError ? <Text style={{ fontSize: 12, color: CHERRY, marginTop: 6 }}>{presetError}</Text> : null}
                    <TouchableOpacity onPress={savePresets} style={[styles.addToOrderBtn, { marginTop: 12 }]} activeOpacity={0.85}>
                      <Text style={styles.addToOrderBtnText}>Save Presets</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                {/* Payment Surcharges */}
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('surcharges')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="credit-card" size={16} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Payment Surcharges</Text>
                    <Text style={styles.regAccordionSub}>{surcharges.length === 0 ? 'None configured' : `${surcharges.filter(s => s.isActive).length} active · ${surcharges.length} total`}</Text>
                  </View>
                  <Feather name={openSection === 'surcharges' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'surcharges' && (
                  <View style={styles.regAccordionBody}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={styles.sectionSubtitle}>Auto-applied by payment method or day of week.</Text>
                      <Pressable onPress={() => setSurchargeTab(surchargeTab === 'list' ? 'add' : 'list')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name={surchargeTab === 'list' ? 'plus' : 'list'} size={15} color={BLUE} />
                        <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>{surchargeTab === 'list' ? 'Add' : 'List'}</Text>
                      </Pressable>
                    </View>

                    {surchargeTab === 'list' && (
                      <View style={{ gap: 8 }}>
                        {surcharges.length === 0 && <Text style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No surcharges configured.</Text>}
                        {surcharges.map(s => (
                          <View key={s.id} style={styles.surchargeRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.surchargeRowName}>{s.name}</Text>
                              <Text style={styles.surchargeRowMeta}>
                                {s.triggerType === 'payment_method' ? s.triggerValue.toUpperCase() : s.triggerValue.charAt(0).toUpperCase() + s.triggerValue.slice(1)}
                                {' · '}+{fmtSurchargeValue(s)} {' · '}{s.isActive ? '✓ Active' : 'Disabled'}
                              </Text>
                            </View>
                            <Pressable onPress={() => toggleSurchargeMutation.mutate({ id: s.id, isActive: !s.isActive })} style={[styles.surchargeToggle, s.isActive && styles.surchargeToggleActive]} hitSlop={8}>
                              <Text style={[styles.surchargeToggleText, s.isActive && styles.surchargeToggleTextActive]}>{s.isActive ? 'On' : 'Off'}</Text>
                            </Pressable>
                            <Pressable onPress={() => Alert.alert('Delete Surcharge', `Remove "${s.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteSurchargeMutation.mutate(s.id) }])} hitSlop={8} style={{ padding: 6, marginLeft: 4 }}>
                              <Feather name="trash-2" size={15} color={CHERRY} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}

                    {surchargeTab === 'add' && (
                      <View style={{ gap: 12 }}>
                        <TextInput style={styles.surchargeNameInput} placeholder="Name (e.g. EFTPOS Surcharge)" placeholderTextColor={MUTED} value={newSurchargeName} onChangeText={setNewSurchargeName} returnKeyType="next" />
                        <View>
                          <Text style={[styles.sectionSubtitle, { marginBottom: 6 }]}>Trigger</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onPress={() => { setNewSurchargeTriggerType('payment_method'); setNewSurchargeTriggerValue('eftpos'); }} style={[styles.surchargeChip, newSurchargeTriggerType === 'payment_method' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeTriggerType === 'payment_method' && { color: WHITE }]}>By Payment</Text>
                            </Pressable>
                            <Pressable onPress={() => { setNewSurchargeTriggerType('day_of_week'); setNewSurchargeTriggerValue('sunday'); }} style={[styles.surchargeChip, newSurchargeTriggerType === 'day_of_week' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeTriggerType === 'day_of_week' && { color: WHITE }]}>By Day</Text>
                            </Pressable>
                          </View>
                          {newSurchargeTriggerType === 'payment_method' && (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                              {['eftpos', 'cash'].map(v => (
                                <Pressable key={v} onPress={() => setNewSurchargeTriggerValue(v)} style={[styles.surchargeChip, newSurchargeTriggerValue === v && styles.surchargeChipActive]}>
                                  <Text style={[styles.surchargeChipText, newSurchargeTriggerValue === v && { color: WHITE }]}>{v.toUpperCase()}</Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                          {newSurchargeTriggerType === 'day_of_week' && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                              <View style={{ flexDirection: 'row', gap: 8 }}>
                                {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => (
                                  <Pressable key={d} onPress={() => setNewSurchargeTriggerValue(d)} style={[styles.surchargeChip, newSurchargeTriggerValue === d && styles.surchargeChipActive]}>
                                    <Text style={[styles.surchargeChipText, newSurchargeTriggerValue === d && { color: WHITE }]}>{d.slice(0,3).toUpperCase()}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            </ScrollView>
                          )}
                        </View>
                        <View>
                          <Text style={[styles.sectionSubtitle, { marginBottom: 6 }]}>Amount Type</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onPress={() => setNewSurchargeAmountType('pct_basis_points')} style={[styles.surchargeChip, newSurchargeAmountType === 'pct_basis_points' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeAmountType === 'pct_basis_points' && { color: WHITE }]}>Percentage %</Text>
                            </Pressable>
                            <Pressable onPress={() => setNewSurchargeAmountType('fixed_cents')} style={[styles.surchargeChip, newSurchargeAmountType === 'fixed_cents' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeAmountType === 'fixed_cents' && { color: WHITE }]}>Fixed $</Text>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.settingsAddRow}>
                          <TextInput
                            style={styles.settingsAddInput}
                            placeholder={newSurchargeAmountType === 'pct_basis_points' ? 'e.g. 1.5 (%)' : 'e.g. 0.50 ($)'}
                            placeholderTextColor={MUTED}
                            value={newSurchargeAmount}
                            onChangeText={v => { setNewSurchargeAmount(v.replace(/[^0-9.]/g, '')); setSurchargeError(null); }}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                          />
                          <Text style={{ fontSize: 15, fontWeight: '600', color: MID, marginLeft: 6 }}>
                            {newSurchargeAmountType === 'pct_basis_points' ? '%' : 'AUD'}
                          </Text>
                        </View>
                        {surchargeError ? <Text style={{ fontSize: 12, color: CHERRY }}>{surchargeError}</Text> : null}
                        <TouchableOpacity onPress={handleAddSurcharge} style={[styles.settingsAddBtn, { paddingHorizontal: 24, alignSelf: 'flex-start' }]} disabled={createSurchargeMutation.isPending} activeOpacity={0.85}>
                          {createSurchargeMutation.isPending ? <ActivityIndicator size="small" color={WHITE} /> : <Text style={styles.settingsAddBtnText}>Add Surcharge</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}

              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Hold Orders Modal ─────────────────────────────────────────────────────────
function HoldModal({ tickets, activeIdx, onResume, onDelete, onClose }: {
  tickets: Ticket[];
  activeIdx: number;
  onResume: (idx: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
}) {
  const held = tickets
    .map((t, i) => ({ ticket: t, idx: i }))
    .filter(({ idx, ticket }) => idx !== activeIdx && ticket.items.length > 0);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>
            {held.length > 0 ? `${held.length} Order${held.length > 1 ? 's' : ''} on Hold` : 'Held Orders'}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {held.length === 0 ? (
          <View style={styles.holdEmptyState}>
            <Feather name="inbox" size={40} color={MUTED} />
            <Text style={styles.holdEmptyTitle}>No held orders</Text>
            <Text style={styles.holdEmptyText}>Use the Hold button on a ticket to park it here.</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
            {held.map(({ ticket, idx }) => {
              const total = ticketTotal(ticket);
              const itemCount = ticket.items.reduce((s, i) => s + i.quantity, 0);
              const summary = ticket.items.map(i =>
                `${i.productName}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`
              ).join(', ');
              return (
                <TouchableOpacity
                  key={ticket.id}
                  style={styles.holdRow}
                  onPress={() => onResume(idx)}
                  activeOpacity={0.75}
                >
                  <View style={styles.holdRowIcon}>
                    <Feather name="shopping-bag" size={18} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {ticket.customer && (
                        <Text style={styles.holdRowCustomer}>{ticket.customer.name}</Text>
                      )}
                      <Text style={styles.holdRowMeta}>
                        {itemCount} item{itemCount !== 1 ? 's' : ''} · {ticket.orderType === 'dine_in' ? 'Dine In' : ticket.orderType === 'takeaway' ? 'Takeaway' : 'Counter'}
                      </Text>
                    </View>
                    <Text style={styles.holdRowItems} numberOfLines={2}>{summary}</Text>
                    {ticket.notes ? (
                      <Text style={styles.holdRowNote} numberOfLines={1}>📝 {ticket.notes}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.holdRowTotal}>{fmtCents(total)}</Text>
                    <Pressable
                      onPress={() => onDelete(idx)}
                      hitSlop={8}
                      style={styles.holdRowDelete}
                    >
                      <Feather name="trash-2" size={14} color={CHERRY} />
                    </Pressable>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── POS Settings PIN Gate (verifies server-side, passes pin to onSuccess) ─────
function PosPinModal({ onClose, onSuccess, title, subtitle }: {
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { height: screenH } = useWindowDimensions();
  const { user } = useAuth();
  const [digits, setDigits] = React.useState<string[]>([]);
  const [error,  setError]  = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const appendDigit = (d: string) => {
    if (digits.length >= 4 || checking) return;
    const next = [...digits, d];
    setDigits(next);
    setError('');
    Haptics.selectionAsync();
    if (next.length === 4) verify(next.join(''));
  };

  const backspace = () => {
    if (checking) return;
    setDigits(prev => prev.slice(0, -1));
    setError('');
    Haptics.selectionAsync();
  };

  const verify = async (pin: string) => {
    setChecking(true);
    try {
      const verifyFn = user?.role === 'shop_display'
        ? api.shopDisplay.verifySettingsPin
        : api.director.verifySettingsPin;
      const res = await verifyFn(pin);
      if (res.granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess(pin);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake();
        setError('Incorrect PIN.');
        setDigits([]);
      }
    } catch {
      setError('Connection error. Try again.');
      setDigits([]);
    } finally {
      setChecking(false);
    }
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.pinOverlay} onPress={onClose}>
        <Pressable style={[styles.pinSheet, { maxHeight: screenH * 0.72 }]} onPress={() => {}}>
          {/* Header */}
          <View style={styles.pinHeader}>
            <View style={styles.pinLockCircle}>
              <Feather name="lock" size={22} color={BLUE} />
            </View>
            <Text style={styles.pinTitle}>{title ?? 'POS Settings'}</Text>
            <Text style={styles.pinSub}>{subtitle ?? 'Enter your POS PIN to continue'}</Text>
          </View>

          {/* Dots */}
          <Animated.View style={[styles.pinDotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[styles.pinDot, digits[i] !== undefined && styles.pinDotFilled]} />
            ))}
          </Animated.View>

          {!!error && <Text style={styles.pinError}>{error}</Text>}
          {checking && <ActivityIndicator color={BLUE} style={{ marginBottom: 8 }} />}

          {/* Numpad */}
          <View style={styles.pinNumpad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={`k-${i}`} style={styles.pinKeyPlaceholder} />;
              const isBack = key === '⌫';
              return (
                <Pressable
                  key={`k-${i}`}
                  onPress={() => isBack ? backspace() : appendDigit(key)}
                  style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyPressed]}
                >
                  <Text style={[styles.pinKeyText, isBack && styles.pinBackText]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={styles.pinCancel}>
            <Text style={styles.pinCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Supervisor PIN Capture (collects PIN without server verify, for POS gates) ─
function SupervisorPinCapture({ onClose, onSuccess, title, subtitle }: {
  onClose: () => void;
  onSuccess: (pin: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const { height: screenH } = useWindowDimensions();
  const [digits, setDigits] = React.useState<string[]>([]);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const appendDigit = (d: string) => {
    if (digits.length >= 4) return;
    const next = [...digits, d];
    setDigits(next);
    Haptics.selectionAsync();
    if (next.length === 4) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(next.join(''));
    }
  };

  const backspace = () => {
    setDigits(prev => prev.slice(0, -1));
    Haptics.selectionAsync();
  };

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'] as const;
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.pinOverlay} onPress={onClose}>
        <Pressable style={[styles.pinSheet, { maxHeight: screenH * 0.72 }]} onPress={() => {}}>
          <View style={styles.pinHeader}>
            <View style={styles.pinLockCircle}>
              <Feather name="shield" size={22} color={BLUE} />
            </View>
            <Text style={styles.pinTitle}>{title ?? 'Supervisor Authorisation'}</Text>
            <Text style={styles.pinSub}>{subtitle ?? 'Enter your POS PIN to continue'}</Text>
          </View>
          <Animated.View style={[styles.pinDotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[styles.pinDot, digits[i] !== undefined && styles.pinDotFilled]} />
            ))}
          </Animated.View>
          <View style={styles.pinNumpad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={`k-${i}`} style={styles.pinKeyPlaceholder} />;
              const isBack = key === '⌫';
              return (
                <Pressable
                  key={key}
                  onPress={() => isBack ? backspace() : appendDigit(key)}
                  style={({ pressed }) => [styles.pinKey, pressed && styles.pinKeyPressed]}
                >
                  <Text style={[styles.pinKeyText, isBack && styles.pinBackText]}>{key}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={onClose} style={styles.pinCancel}>
            <Text style={styles.pinCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Void Confirm Sheet ────────────────────────────────────────────────────────
function VoidConfirmSheet({
  ticket, lastOrderId, voidThresholdCents, onClose, onVoidTicket, onVoidLastOrder,
}: {
  ticket: Ticket;
  lastOrderId: string | null;
  voidThresholdCents: number;
  onClose: () => void;
  onVoidTicket: (supervisorPin?: string) => void;
  onVoidLastOrder: (supervisorPin: string) => void;
}) {
  const total = ticketTotal(ticket);
  const hasItems = ticket.items.length > 0;
  const requiresPin = hasItems && total >= voidThresholdCents;
  const [showPin, setShowPin]       = useState(false);
  const [pinTarget, setPinTarget]   = useState<'ticket' | 'order'>('ticket');

  const handleVoidTicket = () => {
    if (requiresPin) {
      setPinTarget('ticket');
      setShowPin(true);
    } else {
      onVoidTicket();
    }
  };

  const handleVoidLastOrder = () => {
    setPinTarget('order');
    setShowPin(true);
  };

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.voidOverlay} onPress={onClose}>
          <Pressable style={styles.voidSheet} onPress={() => {}}>
            <View style={styles.voidHandle} />

            <View style={styles.voidHeader}>
              <View style={styles.voidIconBg}>
                <Feather name="slash" size={20} color={CHERRY} />
              </View>
              <Text style={styles.voidTitle}>Void Sale</Text>
            </View>

            {hasItems && (
              <View style={styles.voidSection}>
                <Text style={styles.voidSectionLabel}>CURRENT TICKET</Text>
                <View style={styles.voidItemsList}>
                  {ticket.items.map(item => (
                    <View key={item.localId} style={styles.voidItemRow}>
                      <Text style={styles.voidItemQty}>{item.quantity}×</Text>
                      <Text style={styles.voidItemName} numberOfLines={1}>{item.productName}</Text>
                      <Text style={styles.voidItemPrice}>
                        {fmtCents((item.priceOverrideCents ?? item.unitPriceCents) * item.quantity)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.voidTotalRow}>
                  <Text style={styles.voidTotalLabel}>Total to void</Text>
                  <Text style={styles.voidTotalValue}>{fmtCents(total)}</Text>
                </View>
                {requiresPin && (
                  <View style={styles.voidPinNote}>
                    <Feather name="shield" size={12} color="#F59E0B" />
                    <Text style={styles.voidPinNoteText}>
                      Supervisor PIN required for voids over {fmtCents(voidThresholdCents)}
                    </Text>
                  </View>
                )}
                <TouchableOpacity onPress={handleVoidTicket} style={styles.voidConfirmBtn} activeOpacity={0.8}>
                  <Feather name="x-circle" size={16} color={WHITE} />
                  <Text style={styles.voidConfirmBtnText}>Void This Ticket</Text>
                </TouchableOpacity>
              </View>
            )}

            {lastOrderId && (
              <View style={styles.voidSection}>
                <Text style={styles.voidSectionLabel}>LAST TRANSACTION</Text>
                <Text style={styles.voidLastNote}>
                  Supervisor PIN required to void a completed payment.
                </Text>
                <TouchableOpacity onPress={handleVoidLastOrder} style={styles.voidLastBtn} activeOpacity={0.8}>
                  <Feather name="rotate-ccw" size={15} color={CHERRY} />
                  <Text style={styles.voidLastBtnText}>Void Last Transaction</Text>
                </TouchableOpacity>
              </View>
            )}

            {!hasItems && !lastOrderId && (
              <View style={styles.voidEmpty}>
                <Feather name="check-circle" size={36} color={MUTED} />
                <Text style={styles.voidEmptyText}>No active sale or recent transaction to void</Text>
              </View>
            )}

            <Pressable onPress={onClose} style={styles.voidCancelBtn}>
              <Text style={styles.voidCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {showPin && (
        <SupervisorPinCapture
          title="Void Authorisation"
          subtitle={
            pinTarget === 'ticket'
              ? 'Enter supervisor PIN to void this sale'
              : 'Enter supervisor PIN to void the last transaction'
          }
          onClose={() => setShowPin(false)}
          onSuccess={(pin) => {
            setShowPin(false);
            if (pinTarget === 'ticket') {
              onVoidTicket(pin);
            } else {
              onVoidLastOrder(pin);
            }
          }}
        />
      )}
    </>
  );
}

// ── POS Settings Modal ────────────────────────────────────────────────────────

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
  categoryScrollWrap: { height: 84, flexShrink: 0 },
  categoryScroll: { flex: 1 },
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
  customerBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 14, paddingVertical: 12 },
  customerSection:    { backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  customerBarInner:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stampRow:           { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  stampCircle:        { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE, justifyContent: 'center', alignItems: 'center' },
  stampCircleFilled:  { backgroundColor: '#92400E', borderColor: '#92400E' },
  stampCircleNext:    { borderColor: BLUE, borderWidth: 2 },
  stampLabel:         { fontSize: 11, color: MUTED, marginLeft: 'auto' as any },
  customerName:       { fontSize: 14, fontWeight: '700', color: DARK },
  customerSub:        { fontSize: 12, color: MUTED, marginTop: 1 },
  customerPlaceholder: { fontSize: 14, color: MUTED },
  customerBtnRow:     { flexDirection: 'row', backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  customerBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  customerBtnText:    { fontSize: 13, fontWeight: '600', color: BLUE },
  customerBtnDivider: { width: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginVertical: 8 },
  headerSearchRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, paddingHorizontal: 14, paddingVertical: 9 },

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
  registerHero:       { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER, flexDirection: 'row', gap: 12, alignItems: 'center' },
  registerHeroTitle:  { fontSize: 18, fontWeight: '800', color: DARK },
  registerHeroSub:    { fontSize: 13, color: MID, marginTop: 2 },
  registerHeroMeta:   { fontSize: 12, color: MUTED, marginTop: 6 },
  registerStatusPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#E2E8F0' },
  registerStatusOpen: { backgroundColor: '#DCFCE7' },
  registerStatusNeedsFloat: { backgroundColor: '#FEE2E2' },
  registerStatusText: { fontSize: 12, fontWeight: '800', color: '#166534' },
  registerGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  registerCard:       { width: '47.8%', backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER },
  registerMetricLabel:{ fontSize: 12, color: MUTED, fontWeight: '600' },
  registerMetricValue:{ fontSize: 20, color: DARK, fontWeight: '800', marginTop: 6 },
  registerSection:    { backgroundColor: WHITE, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: BORDER },
  regAccordionGroup:  { backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  regAccordionRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  regAccordionIcon:   { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  regAccordionTitle:  { fontSize: 14, fontWeight: '700', color: DARK },
  regAccordionSub:    { fontSize: 12, color: MUTED, marginTop: 2 },
  regAccordionBody:   { paddingHorizontal: 14, paddingBottom: 16, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, backgroundColor: '#FAFBFC' },
  regAccordionDivider:{ height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: 60 },
  registerLine:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  registerLineLabel:  { fontSize: 13, color: MID, fontWeight: '600' },
  registerLineValue:  { fontSize: 14, color: DARK, fontWeight: '800' },
  registerInput:      { backgroundColor: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: BORDER, fontSize: 14, color: DARK, marginBottom: 10 },
  registerTextarea:   { minHeight: 84, textAlignVertical: 'top' },
  registerToggleRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  registerToggleBtn:  { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8FAFC', paddingVertical: 10, alignItems: 'center' },
  registerToggleBtnActive: { backgroundColor: BLUE, borderColor: BLUE },
  registerToggleText: { fontSize: 13, fontWeight: '700', color: MID },
  registerToggleTextActive: { color: WHITE },
  registerMovementRow:{ borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER, padding: 10 },
  registerMovementTitle: { fontSize: 13, fontWeight: '700', color: DARK },
  registerMovementMeta: { fontSize: 12, color: MUTED, marginTop: 3 },
  registerVarianceRow:{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  denomGroupLabel:    { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  denomRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  denomLabel:         { width: 44, fontSize: 15, fontWeight: '700', color: DARK },
  denomQtyRow:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8 },
  denomBtn:           { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  denomInput:         { flex: 1, height: 36, borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: WHITE, textAlign: 'center', fontSize: 16, fontWeight: '700', color: DARK },
  denomSubtotal:      { width: 70, textAlign: 'right', fontSize: 13, fontWeight: '600', color: DARK },
  denomSummaryBox:    { marginTop: 14, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 4 },
  registerAutoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  registerSwitch:    { width: 54, height: 30, borderRadius: 999, backgroundColor: '#CBD5E1', padding: 3, justifyContent: 'center' },
  registerSwitchOn:  { backgroundColor: BLUE },
  registerSwitchKnob:{ width: 24, height: 24, borderRadius: 12, backgroundColor: WHITE },
  registerSwitchKnobOn: { alignSelf: 'flex-end' },
  registerSecondaryBtn: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  registerSecondaryBtnText: { fontSize: 13, fontWeight: '700', color: BLUE },

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
  payTotal:             { alignItems: 'center', paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, marginBottom: 20 },
  payTotalLabel:        { fontSize: 14, color: MUTED, fontWeight: '500' },
  payTotalValue:        { fontSize: 40, fontWeight: '800', color: DARK, marginTop: 4 },
  payDiscountRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  payDiscountLabel:     { fontSize: 13, color: '#16A34A', fontWeight: '500', flex: 1 },
  payDiscountSaving:    { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  payBreakdownBox:      { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: BORDER },
  payBreakdownRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  payBreakdownLabel:    { fontSize: 14, color: MID },
  payBreakdownValue:    { fontSize: 14, fontWeight: '600', color: DARK },
  methodRow:            { flexDirection: 'row', gap: 8, marginBottom: 10 },
  methodBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: BORDER },
  methodBtnActive:      { backgroundColor: BLUE, borderColor: BLUE },
  methodBtnText:        { fontSize: 14, fontWeight: '700', color: MID },
  eftposInstructions:   { alignItems: 'center', paddingVertical: 32, gap: 12 },
  eftposText:           { fontSize: 16, fontWeight: '600', color: DARK, textAlign: 'center' },
  eftposSubText:        { fontSize: 13, color: MUTED, textAlign: 'center' },
  presetBtn:            { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  presetBtnText:        { fontSize: 15, fontWeight: '700', color: BLUE },
  tenderedDisplay:      { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, alignItems: 'flex-end', marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  tenderedText:         { fontSize: 36, fontWeight: '800', color: DARK },
  changeRow:            { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ECFDF5', borderRadius: 10, padding: 12, marginBottom: 16 },
  changeLabel:          { fontSize: 15, fontWeight: '600', color: '#16A34A' },
  changeValue:          { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  numpad:               { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignSelf: 'flex-start', width: 210 },
  numpadKey:            { width: 64, height: 46, backgroundColor: '#F1F5F9', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  numpadKeyText:        { fontSize: 20, fontWeight: '700', color: DARK, textAlignVertical: 'center' },
  // Tip selection
  tipOption:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: BORDER },
  tipOptionActive:      { backgroundColor: '#EFF6FF', borderColor: BLUE },
  tipOptionLabel:       { fontSize: 15, fontWeight: '600', color: DARK },
  tipOptionLabelActive: { color: BLUE },
  tipOptionAmount:      { fontSize: 15, fontWeight: '700', color: MID },
  tipOptionAmountActive:{ color: BLUE },
  // Split payment
  splitAmountBox:       { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: 1 },
  // Surcharge preview (in payment modal)
  surchargePreviewBox:  { backgroundColor: '#FFF7ED', borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: '#FDBA74' },
  surchargePreviewTitle:{ fontSize: 12, fontWeight: '700', color: '#EA580C', marginBottom: 4 },
  surchargeLabel:       { fontSize: 13, color: '#92400E' },
  surchargeCentsText:   { fontSize: 13, fontWeight: '600', color: '#EA580C' },

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

  historyVoidRow:         { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  historyVoidBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: CHERRY, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  historyVoidBtnText:     { fontSize: 13, fontWeight: '700', color: WHITE },
  historyVoidExpired:     { fontSize: 12, color: MUTED, fontStyle: 'italic', flex: 1 },
  historyReprintBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  historyReprintBtnText:  { fontSize: 13, fontWeight: '700', color: BLUE },
  historyRefundBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#92400E', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  historyRefundBtnText:   { fontSize: 13, fontWeight: '700', color: WHITE },
  loadMoreBtn:            { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginHorizontal: 16, marginBottom: 8, marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE },
  loadMoreText:           { fontSize: 14, fontWeight: '600', color: BLUE },

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

  // Payment discount row (old style kept for any usage; canonical definition is in Payment section above)
  // Surcharge management rows
  surchargeRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  surchargeRowName:      { fontSize: 14, fontWeight: '600', color: DARK },
  surchargeRowMeta:      { fontSize: 11, color: MUTED, marginTop: 2 },
  surchargeToggle:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  surchargeToggleActive: { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
  surchargeToggleText:   { fontSize: 12, fontWeight: '700', color: MID },
  surchargeToggleTextActive: { color: '#065F46' },
  surchargeChip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  surchargeChipActive:   { backgroundColor: BLUE, borderColor: BLUE },
  surchargeChipText:     { fontSize: 13, fontWeight: '600', color: MID },
  surchargeNameInput:    { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: DARK },

  // Ticket notes
  ticketNotesRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: WHITE, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  ticketNotesInput: { flex: 1, fontSize: 13, color: DARK, paddingVertical: 0 },

  // Hold modal
  holdOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  holdSheet:      { backgroundColor: WHITE, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  holdEmptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 48 },
  holdEmptyTitle: { fontSize: 16, fontWeight: '700', color: DARK },
  holdEmptyText:  { fontSize: 13, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },
  holdRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FAFBFF', borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER },
  holdRowIcon:    { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  holdRowCustomer: { fontSize: 13, fontWeight: '700', color: DARK },
  holdRowMeta:    { fontSize: 12, color: MUTED },
  holdRowItems:   { fontSize: 13, color: MID, lineHeight: 18 },
  holdRowNote:    { fontSize: 12, color: BLUE, marginTop: 3, fontStyle: 'italic' },
  holdRowTotal:   { fontSize: 15, fontWeight: '800', color: DARK },
  holdRowDelete:  { padding: 4 },

  // Settings modal
  settingsOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  settingsSheet:         { backgroundColor: WHITE, borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  settingsSectionTitle:  { fontSize: 15, fontWeight: '700', color: DARK, marginBottom: 4 },
  settingsSectionDesc:   { fontSize: 13, color: MUTED, lineHeight: 18 },
  settingsPresetChip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  settingsPresetText:    { fontSize: 14, fontWeight: '700', color: DARK },
  settingsAddRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsAddInput:      { width: 70, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '700', color: DARK, textAlign: 'center' },
  settingsAddBtn:        { backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  settingsAddBtnText:    { fontSize: 14, fontWeight: '700', color: WHITE },

  // Category colour picker
  cpOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  cpSheet:      { backgroundColor: WHITE, borderRadius: 20, padding: 20, width: 280, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  cpTitle:      { fontSize: 14, color: MID, marginBottom: 16, textAlign: 'center' },
  cpGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 16 },
  cpSwatch:     { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  cpSwatchActive: { borderColor: DARK, transform: [{ scale: 1.1 }] },
  cpReset:      { alignItems: 'center', paddingVertical: 8 },
  cpResetText:  { fontSize: 13, color: MUTED, fontWeight: '600' },

  // Offline badge in header
  offlineBadge:           { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#D97706', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  offlineBadgeText:       { fontSize: 11, fontWeight: '700', color: WHITE },

  // Sync toast (top of screen)
  syncToast:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16A34A', paddingVertical: 10, paddingHorizontal: 16 },
  syncToastText:          { fontSize: 13, fontWeight: '700', color: WHITE },

  // Payment modal offline notice
  offlinePayNotice:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FCD34D' },
  offlinePayNoticeText:   { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },

  // Disabled method button
  methodBtnDisabled:      { opacity: 0.4 },

  // Customer modal offline cache notice
  offlineCacheNotice:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FCD34D' },
  offlineCacheNoticeText: { fontSize: 12, color: '#92400E', fontWeight: '600' },

  // History modal — failed sync section
  failedSyncSection:      { backgroundColor: '#FFF1F2', margin: 12, marginBottom: 0, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FECDD3' },
  failedSyncHeader:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  failedSyncTitle:        { fontSize: 14, fontWeight: '700', color: CHERRY },
  failedSyncSubtitle:     { fontSize: 12, color: '#9F1239', marginBottom: 10 },
  failedSyncRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FECDD3' },
  failedSyncItems:        { fontSize: 13, fontWeight: '600', color: DARK },
  failedSyncMeta:         { fontSize: 12, color: MID, marginTop: 2 },
  failedSyncRetryBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: BLUE },
  failedSyncRetryText:    { fontSize: 12, fontWeight: '700', color: WHITE },
  failedSyncDismissBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER },
  failedSyncDismissText:  { fontSize: 12, fontWeight: '700', color: MID },

  // PIN gate modal
  pinOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pinSheet:         { backgroundColor: WHITE, borderRadius: 24, width: '100%', maxWidth: 360, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12, overflow: 'hidden' },
  pinHeader:        { alignItems: 'center', paddingTop: 28, paddingBottom: 16, paddingHorizontal: 20 },
  pinLockCircle:    { width: 56, height: 56, borderRadius: 28, backgroundColor: `${BLUE}15`, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  pinTitle:         { fontSize: 18, fontWeight: '800', color: DARK, marginBottom: 6 },
  pinSub:           { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  pinDotsRow:       { flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: 20 },
  pinDot:           { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: BORDER, backgroundColor: WHITE },
  pinDotFilled:     { backgroundColor: BLUE, borderColor: BLUE },
  pinError:         { fontSize: 13, color: CHERRY, textAlign: 'center', marginBottom: 8, marginHorizontal: 20 },
  pinNumpad:        { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, justifyContent: 'center', marginBottom: 8 },
  pinKey:           { width: 80, height: 56, borderRadius: 14, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  pinKeyPressed:    { backgroundColor: `${BLUE}20` },
  pinKeyPlaceholder:{ width: 80, height: 56 },
  pinKeyText:       { fontSize: 22, fontWeight: '600', color: DARK },
  pinBackText:      { fontSize: 20, color: MID },
  pinCancel:        { alignItems: 'center', paddingVertical: 16 },
  pinCancelText:    { fontSize: 15, color: MUTED, fontWeight: '600' },

  // Ticket item price override
  ticketItemPriceStrike: { fontSize: 11, color: MUTED, textDecorationLine: 'line-through', textAlign: 'right' },

  // Price edit modal
  priceEditSheet:       { backgroundColor: WHITE, borderRadius: 20, width: '100%', maxWidth: 340, padding: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  priceEditTitle:       { fontSize: 17, fontWeight: '800', color: DARK, textAlign: 'center', marginBottom: 4 },
  priceEditSub:         { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 20 },
  priceEditInputRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: BLUE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, backgroundColor: '#F8FAFF' },
  priceEditDollar:      { fontSize: 22, fontWeight: '700', color: DARK, marginRight: 4 },
  priceEditInput:       { flex: 1, fontSize: 28, fontWeight: '700', color: DARK, padding: 0 },
  priceEditOriginal:    { fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 4 },
  priceEditHint:        { fontSize: 11, color: MUTED, textAlign: 'center', marginBottom: 20, lineHeight: 16 },
  priceEditActions:     { flexDirection: 'row', gap: 10 },
  priceEditCancel:      { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, justifyContent: 'center', alignItems: 'center' },
  priceEditCancelText:  { fontSize: 15, fontWeight: '600', color: MID },
  priceEditConfirm:     { flex: 1, height: 46, borderRadius: 12, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  priceEditConfirmText: { fontSize: 15, fontWeight: '700', color: WHITE },

  // Void sale button (ticket toolbar)
  voidSaleBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8, paddingVertical: 8, borderRadius: 8 },
  voidSaleBtnText:      { fontSize: 13, fontWeight: '600', color: MUTED },

  // Void confirm sheet
  voidOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  voidSheet:            { backgroundColor: WHITE, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 32, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  voidHandle:           { width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  voidHeader:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  voidIconBg:           { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF1F2', justifyContent: 'center', alignItems: 'center' },
  voidTitle:            { fontSize: 20, fontWeight: '800', color: DARK },
  voidSection:          { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  voidSectionLabel:     { fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  voidItemsList:        { gap: 6, marginBottom: 10 },
  voidItemRow:          { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voidItemQty:          { fontSize: 13, fontWeight: '700', color: MID, width: 24 },
  voidItemName:         { flex: 1, fontSize: 13, color: DARK, fontWeight: '500' },
  voidItemPrice:        { fontSize: 13, fontWeight: '700', color: DARK },
  voidTotalRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, marginBottom: 10 },
  voidTotalLabel:       { fontSize: 14, fontWeight: '600', color: MID },
  voidTotalValue:       { fontSize: 16, fontWeight: '800', color: DARK },
  voidPinNote:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FDE68A' },
  voidPinNoteText:      { fontSize: 12, color: '#92400E', fontWeight: '500', flex: 1 },
  voidConfirmBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CHERRY, borderRadius: 12, paddingVertical: 14 },
  voidConfirmBtnText:   { fontSize: 15, fontWeight: '800', color: WHITE },
  voidLastNote:         { fontSize: 13, color: MUTED, marginBottom: 10, lineHeight: 18 },
  voidLastBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, borderWidth: 1.5, borderColor: '#FECDD3', backgroundColor: '#FFF1F2' },
  voidLastBtnText:      { fontSize: 15, fontWeight: '700', color: CHERRY },
  voidEmpty:            { alignItems: 'center', paddingVertical: 28, gap: 10 },
  voidEmptyText:        { fontSize: 14, color: MUTED, textAlign: 'center' },
  voidCancelBtn:        { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  voidCancelText:       { fontSize: 15, fontWeight: '600', color: MUTED },

});

// ── Export (wraps inner screen with OfflineProvider) ──────────────────────────
export default function PosScreen() {
  return (
    <OfflineProvider>
      <PosScreenInner />
    </OfflineProvider>
  );
}
