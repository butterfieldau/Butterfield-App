import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Alert, Animated, FlatList,
  Pressable, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLayoutHandledSafeArea } from '@/context/LayoutSafeAreaContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadDetailCache, saveDetailEntry,
  upsertCustomerCache,
  type OfflineQueueEntry,
} from '@/lib/posCache';
import { sendReceiptPrint as _sendReceiptPrint, sendLinklyReceiptPrint, sendTaxInvoicePrint } from '@/lib/printer';
import { OfflineProvider, useOffline } from '@/context/OfflineContext';
import ZReportModal from '@/components/ZReportModal';
import PosPinModal from '@/components/PosPinModal';
import type { RegisterSessionReport } from '@/lib/api';

import {
  WHITE, MUTED,
  CATEGORY_COLORS, PRESET_COLORS,
  VOID_PIN_THRESHOLD_CENTS,
  type TicketItem, type Ticket, type ProductDetail,
  type PosCompletedOrder, type PosDiscountPinGate, type PosRegisterApprovalPrompt, type PosOrderVars,
  fmtCents, uuid, blankTicket,
  ticketSubtotal, ticketTotal,
  buildPosOrderPayload,
} from '@/components/pos/types';
import {
  LINKLY_ACTIVE_SESSION_KEY,
  startLinklyStream,
  type LinklyStreamControl,
} from '@/components/pos/linklyStream';
import styles from '@/components/pos/posStyles';
import {
  PrinterStatusModal, SupervisorPinCapture, ReorderCategoriesModal,
  VoidConfirmSheet, HoldModal, TicketPanel, CustomiseModal, OrderCompleteModal,
  CustomerModal, PaymentModal, CashFloatPrompt, HistoryModal, RegisterModal,
  LinklyRecoveryModal, CategoryActionSheet, CategoryColorPicker,
} from '@/components/pos';
import PosHeader from '@/components/pos/PosHeader';
import PosProductBrowser from '@/components/pos/PosProductBrowser';
import { usePosQueries } from '@/components/pos/hooks/usePosQueries';
import { usePosHidScanner } from '@/components/pos/hooks/usePosHidScanner';

// ── Local constants ───────────────────────────────────────────────────────────
const CAT_COLORS_KEY       = 'pos_category_colors';
const CAT_ORDER_KEY        = 'pos_category_order';
const DISCOUNT_PRESETS_KEY = 'pos_discount_presets';
const HELD_TICKETS_KEY     = 'pos_held_tickets';

function getDefaultCatColor(cat: string, apiColor?: string | null): string {
  if (apiColor) return apiColor;
  const slug = cat.toLowerCase();
  if (CATEGORY_COLORS[slug]) return CATEGORY_COLORS[slug];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash + slug.charCodeAt(i)) % PRESET_COLORS.length;
  return PRESET_COLORS[hash]!;
}

// ── POS Screen (inner, wrapped by OfflineProvider below) ─────────────────────
function PosScreenInner() {
  const insets = useSafeAreaInsets();
  const layoutHandledSafeArea = useLayoutHandledSafeArea();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isOnline, pendingCount, syncToast, enqueueOrder } = useOffline();
  const isShopDisplay = user?.role === 'shop_display';

  // ── Ticket state ──────────────────────────────────────────────────────────
  const [tickets, setTickets] = useState<Ticket[]>([blankTicket()]);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeTicket = tickets[activeIdx] ?? tickets[0]!;

  const [paneTab, setPaneTab] = useState<'menu' | 'ticket'>('menu');
  const [searchText, setSearchText]       = useState('');
  const [selCategory, setSelCategory]     = useState<string>('all');
  const [customCatColors, setCustomCatColors] = useState<Record<string, string>>({});
  const [colorPickerCat, setColorPickerCat]   = useState<string | null>(null);
  const [customCatOrder, setCustomCatOrder]   = useState<string[]>([]);
  const [catActionCat,   setCatActionCat]     = useState<string | null>(null);
  const [showReorderModal, setShowReorderModal] = useState(false);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [customiseData, setCustomiseData] = useState<{
    product: ProductDetail; editItem?: TicketItem;
  } | null>(null);
  const [showPayment,   setShowPayment]   = useState(false);
  const [completedOrder, setCompletedOrder] = useState<PosCompletedOrder | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<'search' | 'scan'>('search');
  const [showSearch, setShowSearch]       = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showRegisterPin, setShowRegisterPin] = useState(false);
  const [showPrinterStatus, setShowPrinterStatus] = useState(false);
  const [printerDrawerBusy, setPrinterDrawerBusy] = useState(false);
  const [showZReport, setShowZReport] = useState(false);
  const [zReportData, setZReportData] = useState<RegisterSessionReport | null>(null);
  const [zReportPrinting, setZReportPrinting] = useState(false);
  const [floatPromptDismissed, setFloatPromptDismissed] = useState(false);
  const [discountPinGate, setDiscountPinGate] = useState<PosDiscountPinGate | null>(null);
  const [showVoidSheet, setShowVoidSheet]   = useState(false);
  const [registerApprovalPrompt, setRegisterApprovalPrompt] = useState<PosRegisterApprovalPrompt | null>(null);
  const [discountPresets, setDiscountPresets] = useState<number[]>([10, 20, 50]);
  const [lastOrderId, setLastOrderId]     = useState<string | null>(null);
  const [historyOpenAtFailed, setHistoryOpenAtFailed] = useState(false);
  const [lastDrawerSuccessAt, setLastDrawerSuccessAt] = useState<Date | null>(null);

  const recentBalancesRef = useRef<Record<string, { loyaltyPoints: number; stampCount: number; freeCoffeeRewards: number }>>({});
  const receiptPrintedRef = useRef<Set<string>>(new Set());
  const autoPrintedSessionsRef = useRef<Set<string>>(new Set());
  const [printStatusMap, setPrintStatusMap] = useState<Record<string, 'pending' | 'printed' | 'failed'>>({});
  const linklyPrintStatusRef = useRef<Record<string, 'printed' | 'failed'>>({});
  const linklySessionToOrderIdRef = useRef<Record<string, string>>({});
  const updatePrintStatus = useCallback((orderId: string, status: 'pending' | 'printed' | 'failed') => {
    setPrintStatusMap(prev => ({ ...prev, [orderId]: status }));
  }, []);
  const [detailCache, setDetailCache] = useState<Record<string, ProductDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const productListRef = useRef<FlatList<any>>(null);

  // ── Linkly crash-recovery state ───────────────────────────────────────────
  const [recoverySession, setRecoverySession] = useState<{ sessionId: string; amountCents: number } | null>(null);
  const [recoveryText, setRecoveryText] = useState('Checking payment status…');
  const [recoveryDone, setRecoveryDone] = useState<{ approved: boolean; text: string } | null>(null);
  const recoveryPollRef = useRef<LinklyStreamControl | null>(null);

  // ── Data queries + store settings (via hook) ──────────────────────────────
  const {
    loadingProducts, refetchSummary, refetchRegister,
    registerData, storeData, syncAll, syncingAll, lastSyncedAt,
    registerState, registerSession, cashEnabled,
    printRegisterReport, openDrawerWithTracking,
    allProducts, categories,
  } = usePosQueries({ queryClient, isShopDisplay, setDetailCache, setPrinterDrawerBusy, setLastDrawerSuccessAt });

  // ── HID scanner (via hook) ────────────────────────────────────────────────
  const anyModalOpen = showCustomerModal || showPayment || showVoidSheet || !!customiseData || showRegister || !!discountPinGate || showZReport;
  const updateTicket = useCallback((patch: Partial<Ticket>) => {
    setTickets(prev => prev.map((t, i) => i === activeIdx ? { ...t, ...patch } : t));
  }, [activeIdx]);

  const {
    attachCustomerToCart,
    scannerBannerOpacity, scannerBannerSlide, scannerBanner,
  } = usePosHidScanner({ activeIdx, tickets, updateTicket });

  // ── Init effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadDetailCache().then(map => {
      if (Object.keys(map).length > 0) setDetailCache(map as Record<string, ProductDetail>);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    AsyncStorage.getItem(CAT_COLORS_KEY).then(v => { if (v) try { setCustomCatColors(JSON.parse(v)); } catch {} });
    AsyncStorage.getItem(CAT_ORDER_KEY).then(v => { if (v) try { setCustomCatOrder(JSON.parse(v)); } catch {} });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    AsyncStorage.getItem(DISCOUNT_PRESETS_KEY).then(v => { if (v) try { setDiscountPresets(JSON.parse(v)); } catch {} });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    AsyncStorage.getItem(HELD_TICKETS_KEY).then(v => {
      if (!v) return;
      try {
        const saved = JSON.parse(v) as { tickets: Ticket[]; activeIdx: number };
        if (Array.isArray(saved.tickets) && saved.tickets.length > 0) {
          const hasContent = saved.tickets.some(t => t.items.length > 0);
          if (hasContent) {
            setTickets(saved.tickets);
            setActiveIdx(typeof saved.activeIdx === 'number' ? Math.min(saved.activeIdx, saved.tickets.length - 1) : 0);
          }
        }
      } catch {}
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    AsyncStorage.setItem(HELD_TICKETS_KEY, JSON.stringify({ tickets, activeIdx }));
  }, [tickets, activeIdx]);

  // ── Linkly cold-start recovery ─────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(LINKLY_ACTIVE_SESSION_KEY).then(async (raw) => {
      if (!raw) return;
      let saved: { sessionId: string; amountCents: number; startedAt: number };
      try {
        saved = JSON.parse(raw);
        if (!saved?.sessionId) { await AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY); return; }
      } catch { await AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY); return; }

      if (Date.now() - (saved.startedAt ?? 0) > 3 * 60 * 60 * 1000) {
        await AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY);
        return;
      }

      try {
        const pollRes = await api.pos.linklyPoll(saved.sessionId) as any;
        const pd = pollRes?.data;
        if (pd?.complete) {
          await AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY);
          const verb = pd.approved ? 'approved' : 'declined';
          Alert.alert('Previous Payment ' + (pd.approved ? 'Approved' : 'Declined'), `A payment session (${fmtCents(saved.amountCents)}) was recovered from the terminal and was ${verb}.`);
          return;
        }
        const statusHint = pd?.responseText ? `\n\nTerminal status: ${pd.responseText}` : '';
        Alert.alert('Resume Payment?', `An EFTPOS payment of ${fmtCents(saved.amountCents)} was in progress when the app closed. Would you like to resume monitoring the terminal?${statusHint}`, [
          { text: 'Dismiss', style: 'destructive', onPress: () => { AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {}); } },
          { text: 'Resume', onPress: () => { setRecoverySession({ sessionId: saved.sessionId, amountCents: saved.amountCents }); setRecoveryText(pd?.responseText ?? 'Resuming — waiting for terminal…'); setRecoveryDone(null); } },
        ]);
      } catch {
        Alert.alert('Resume Payment?', `An EFTPOS payment of ${fmtCents(saved.amountCents)} was in progress when the app closed. Would you like to resume monitoring the terminal?`, [
          { text: 'Dismiss', style: 'destructive', onPress: () => { AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {}); } },
          { text: 'Resume', onPress: () => { setRecoverySession({ sessionId: saved.sessionId, amountCents: saved.amountCents }); setRecoveryText('Resuming — waiting for terminal…'); setRecoveryDone(null); } },
        ]);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recoverySession) return;
    recoveryPollRef.current?.cancel();
    const ctrl = startLinklyStream(
      recoverySession.sessionId,
      (text) => setRecoveryText(text),
      (pd) => {
        recoveryPollRef.current = null;
        AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {});
        setRecoveryDone({ approved: pd.approved, text: pd.approved ? `Payment of ${fmtCents(recoverySession.amountCents)} approved.` : `Payment of ${fmtCents(recoverySession.amountCents)} was declined.` });
      },
      undefined,
      () => { recoveryPollRef.current = null; AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {}); setRecoveryDone({ approved: false, text: 'Payment session timed out. Please check the terminal.' }); },
    );
    recoveryPollRef.current = ctrl;
    return () => { ctrl.cancel(); };
  }, [recoverySession]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-print register report ─────────────────────────────────────────────
  useEffect(() => {
    const pending = registerState?.pendingAutoPrintReport;
    const store = storeData as any;
    if (!pending || !store?.printerIp) return;
    if (autoPrintedSessionsRef.current.has(pending.id)) return;
    autoPrintedSessionsRef.current.add(pending.id);
    (async () => {
      try {
        await printRegisterReport(pending);
        await api.pos.markRegisterSummaryPrinted(pending.id);
        refetchRegister();
      } catch { autoPrintedSessionsRef.current.delete(pending.id); }
    })();
  }, [printRegisterReport, refetchRegister, registerState?.pendingAutoPrintReport?.id, storeData]);

  // ── Category / product memos ──────────────────────────────────────────────
  const orderedCategories = useMemo(() => {
    if (customCatOrder.length === 0) return categories;
    return [...categories].sort((a, b) => {
      const ai = customCatOrder.indexOf(a.slug), bi = customCatOrder.indexOf(b.slug);
      if (ai === -1 && bi === -1) return 0; if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
  }, [categories, customCatOrder]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p: any) => {
      if (selCategory !== 'all' && (p.category ?? '') !== selCategory) return false;
      if (searchText.trim()) { const q = searchText.toLowerCase(); return (p.name ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q); }
      return true;
    });
  }, [allProducts, selCategory, searchText]);

  useEffect(() => {
    if (orderedCategories.length > 0 && selCategory === 'all') setSelCategory(orderedCategories[0]!.slug);
  }, [orderedCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Category helpers ──────────────────────────────────────────────────────
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

  const saveCatOrder = useCallback((slugs: string[]) => {
    setCustomCatOrder(slugs);
    AsyncStorage.setItem(CAT_ORDER_KEY, JSON.stringify(slugs));
  }, []);

  const saveDiscountPresets = useCallback((presets: number[]) => {
    setDiscountPresets(presets);
    AsyncStorage.setItem(DISCOUNT_PRESETS_KEY, JSON.stringify(presets));
  }, []);

  // ── Ticket helpers ────────────────────────────────────────────────────────
  const addItemToTicket = useCallback((item: TicketItem) => {
    setTickets(prev => {
      const t = prev[activeIdx] ?? prev[0]!;
      const matchIdx = t.items.findIndex(existing =>
        existing.productId === item.productId && existing.variantId === item.variantId &&
        JSON.stringify(existing.selectedOptions) === JSON.stringify(item.selectedOptions) && existing.notes === item.notes
      );
      let newItems: TicketItem[];
      if (matchIdx >= 0 && !item.notes) {
        newItems = t.items.map((x, i) => i === matchIdx ? { ...x, quantity: x.quantity + item.quantity } : x);
      } else { newItems = [...t.items, item]; }
      return prev.map((ticket, i) => i === activeIdx ? { ...ticket, items: newItems, appliedDiscount: null } : ticket);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeIdx]);

  const removeItem = useCallback((localId: string) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      return { ...t, items: t.items.filter(x => x.localId !== localId), appliedDiscount: null };
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeIdx]);

  const updateItemQty = useCallback((localId: string, delta: number) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      return { ...t, items: t.items.map(x => x.localId !== localId ? x : { ...x, quantity: Math.max(1, x.quantity + delta) }), appliedDiscount: null };
    }));
    Haptics.selectionAsync();
  }, [activeIdx]);

  const updateItemPriceOverride = useCallback((localId: string, newPriceCents: number | undefined, supervisorPin?: string) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeIdx) return t;
      const newItems = t.items.map(x => {
        if (x.localId !== localId) return x;
        if (newPriceCents === undefined || newPriceCents === x.unitPriceCents) { const { priceOverrideCents: _removed, ...rest } = x; return rest as TicketItem; }
        return { ...x, priceOverrideCents: newPriceCents };
      });
      return { ...t, items: newItems, priceOverrideSupervisorPin: supervisorPin ?? t.priceOverrideSupervisorPin };
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [activeIdx]);

  const clearTicket = useCallback(() => {
    setTickets(prev => prev.map((t, i) => i === activeIdx ? blankTicket() : t));
  }, [activeIdx]);

  const holdTicket = useCallback(() => {
    if (activeTicket.items.length === 0) return;
    const maxHolds = 5;
    if (tickets.length >= maxHolds + 1) { Alert.alert('Hold Limit', 'Maximum 5 tickets on hold. Complete or clear an existing ticket first.'); return; }
    setTickets(prev => [...prev, blankTicket()]);
    setActiveIdx(tickets.length);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [activeTicket.items.length, tickets.length]);

  const deleteHeldTicket = useCallback((idx: number) => {
    setTickets(prev => { const next = prev.filter((_, i) => i !== idx); return next.length ? next : [blankTicket()]; });
    setActiveIdx(prev => { if (prev > idx) return prev - 1; if (prev === idx) return 0; return prev; });
  }, []);

  // ── Product tap handler ───────────────────────────────────────────────────
  const handleProductTap = useCallback(async (product: any) => {
    const cached = detailCache[product.id];
    const hasVariants = product.hasVariants || (product.variants ?? []).length > 0;
    if (cached) {
      const hasOpts = cached.optionGroups.length > 0;
      if (!hasVariants && !hasOpts) {
        addItemToTicket({ localId: uuid(), productId: product.id, productName: product.name, category: product.category ?? '', variantId: null, variantName: null, variantPriceCents: undefined, selectedOptions: [], quantity: 1, unitPriceCents: product.salePriceCents ?? product.priceCents ?? 0, notes: '' });
      } else { setCustomiseData({ product: cached }); }
      return;
    }
    setLoadingDetail(product.id);
    try {
      const res = await api.products.get(product.id);
      const detail = res.data as unknown as ProductDetail;
      setDetailCache(prev => ({ ...prev, [product.id]: detail }));
      saveDetailEntry(product.id, detail);
      if (!hasVariants && !detail.optionGroups.length) {
        addItemToTicket({ localId: uuid(), productId: product.id, productName: product.name, category: product.category ?? '', variantId: null, variantName: null, variantPriceCents: undefined, selectedOptions: [], quantity: 1, unitPriceCents: product.salePriceCents ?? product.priceCents ?? 0, notes: '' });
      } else { setCustomiseData({ product: detail }); }
    } catch {
      addItemToTicket({ localId: uuid(), productId: product.id, productName: product.name, category: product.category ?? '', variantId: null, variantName: null, variantPriceCents: undefined, selectedOptions: [], quantity: 1, unitPriceCents: product.salePriceCents ?? product.priceCents ?? 0, notes: '' });
    } finally { setLoadingDetail(null); }
  }, [detailCache, addItemToTicket]);

  // ── Order submission ──────────────────────────────────────────────────────
  const activeIdempotencyKey = activeTicket.idempotencyKey;

  const buildOrderPayload = useCallback((vars: PosOrderVars) =>
    buildPosOrderPayload(activeTicket, activeIdempotencyKey, vars),
  [activeTicket, activeIdempotencyKey]);

  const clearActiveTicket = useCallback(() => {
    setTickets(prev => { if (prev.length === 1) return [blankTicket()]; const next = prev.filter((_, i) => i !== activeIdx); return next.length ? next : [blankTicket()]; });
    if (activeIdx > 0) setActiveIdx(0);
  }, [activeIdx]);

  const createOrderMutation = useMutation({
    mutationFn: (vars: { paymentMethod: 'cash' | 'eftpos' | 'split'; amountTenderedCents?: number; surchargeCents?: number; splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[]; linklySessionId?: string; supervisorPin?: string }) =>
      api.pos.createOrder(buildOrderPayload(vars)),
    onSuccess: (res, vars) => {
      const snapshotItems = activeTicket.items.map(i => ({ name: i.productName, quantity: i.quantity, unitPriceCents: i.unitPriceCents, variantName: i.variantName ?? undefined, options: (i.selectedOptions ?? []).map((o: any) => o.optionName ?? o.textValue ?? '').filter(Boolean) as string[], notes: i.notes?.trim() || undefined }));
      const snapshotCustomerName = activeTicket.customer?.name ?? 'Walk-in';
      const discountAmountCents = activeTicket.appliedDiscount?.amountCents ?? 0;
      const discountLabel = activeTicket.appliedDiscount?.label ?? '';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastOrderId(res.data.id);
      if (activeTicket.customer?.userId && res.loyaltyResult) {
        recentBalancesRef.current[activeTicket.customer.userId] = { loyaltyPoints: res.loyaltyResult.newBalance, stampCount: res.loyaltyResult.newStampCount, freeCoffeeRewards: activeTicket.customer.freeCoffeeRewards };
      }
      setCompletedOrder({ id: res.data.id, orderNumber: res.data.orderNumber, totalCents: res.data.totalCents, paymentMethod: vars.paymentMethod, amountTenderedCents: vars.amountTenderedCents, surchargeCents: vars.surchargeCents ?? 0, splitPayments: vars.splitPayments, loyaltyResult: res.loyaltyResult, customerName: snapshotCustomerName, customerEmail: activeTicket.customer?.email, ticketItems: snapshotItems, discountAmountCents, discountLabel });
      setShowPayment(false);
      clearActiveTicket();
      refetchSummary();
      refetchRegister();
      queryClient.invalidateQueries({ queryKey: ['pos-summary'] });
      const store = storeData as any;
      const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
      const alreadyPrinted = vars.linklySessionId ? receiptPrintedRef.current.has(vars.linklySessionId) : false;
      const isCashSale = vars.paymentMethod === 'cash' || vars.paymentMethod === 'split';
      const printOrderId = res.data.id;
      if (!alreadyPrinted && store?.autoPrint && store?.printerIp) {
        if (vars.linklySessionId) receiptPrintedRef.current.add(vars.linklySessionId);
        updatePrintStatus(printOrderId, 'pending');
        _sendReceiptPrint({ orderId: printOrderId, customerName: snapshotCustomerName, type: 'pickup', items: snapshotItems, totalCents: res.data.totalCents, discountCents: discountAmountCents, surchargeCents: vars.surchargeCents ?? 0, loyaltyPointsEarned: res.loyaltyResult?.pointsEarned, notes: activeTicket.notes?.trim() || undefined, printerBrand: store.printerBrand ?? 'epson', autoDrawer: !!(store as any).autoDrawer, drawerPin: ((store as any).drawerPin ?? 0) as 0 | 1 }, store.printerIp, store.printerPort ?? 9100, fetchBytes)
          .then(() => updatePrintStatus(printOrderId, 'printed'))
          .catch(() => updatePrintStatus(printOrderId, 'failed'));
      } else if (alreadyPrinted && vars.linklySessionId) {
        linklySessionToOrderIdRef.current[vars.linklySessionId] = printOrderId;
        const ls = linklyPrintStatusRef.current[vars.linklySessionId];
        if (ls) { updatePrintStatus(printOrderId, ls); } else { updatePrintStatus(printOrderId, 'pending'); }
      } else if (!alreadyPrinted && !store?.autoPrint && store?.autoDrawer && store?.printerIp && isCashSale) {
        openDrawerWithTracking().catch(() => {});
      }
    },
    onError: (err: any, vars) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (err?.body?.code === 'DISCOUNT_PIN_REQUIRED') { setDiscountPinGate({ paymentMethod: vars.paymentMethod, amountTenderedCents: vars.amountTenderedCents, surchargeCents: vars.surchargeCents, splitPayments: vars.splitPayments }); return; }
      if (err?.body?.code === 'REGISTER_FLOAT_REQUIRED') { setShowPayment(false); setShowRegisterPin(true); Alert.alert('Cash Float Required', err?.message ?? 'Enter the opening cash float before taking cash payments.'); return; }
      Alert.alert('Order Failed', err?.message ?? 'Could not complete order. Please try again.');
    },
  });

  const setRegisterFloatMutation = useMutation({
    mutationFn: (amountCents: number) => api.pos.setRegisterFloat(amountCents),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetchRegister(); },
    onError: (err: any) => Alert.alert('Cash Float', err?.message ?? 'Could not save the opening cash float.'),
  });

  const cashMovementMutation = useMutation({
    mutationFn: (vars: { movementType: 'add' | 'remove'; amountCents: number; reason?: string; supervisorPin?: string }) => api.pos.addRegisterCashMovement(vars),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); refetchRegister(); },
    onError: (err: any, vars) => {
      if (err?.body?.code === 'SUPERVISOR_PIN_REQUIRED') { setRegisterApprovalPrompt({ mode: 'movement', payload: vars, title: 'Manager Approval', subtitle: 'Enter your POS PIN to approve this cash removal' }); return; }
      Alert.alert('Cash Movement', err?.message ?? 'Could not update the cash drawer.');
    },
  });

  const closeRegisterMutation = useMutation({
    mutationFn: (vars: { actualCountedCashCents: number; closeNote?: string; varianceNote?: string }) => api.pos.closeRegister(vars),
    onSuccess: async (res) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); if (res.data) { setZReportData(res.data); setShowZReport(true); } refetchRegister(); },
    onError: (err: any) => Alert.alert('Close Register', err?.message ?? 'Could not close the register.'),
  });

  const updateRegisterSettingsMutation = useMutation({
    mutationFn: (enabled: boolean) => api.pos.updateRegisterSettings({ autoCloseEnabled: enabled }),
    onSuccess: () => refetchRegister(),
    onError: (err: any) => Alert.alert('Register Setting', err?.message ?? 'Could not update auto-close.'),
  });

  const handleChargeConfirm = useCallback((params: { method: 'cash' | 'eftpos' | 'split'; amountTenderedCents?: number; surchargeCents: number; splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[]; linklySessionId?: string }) => {
    const mutateVars = { paymentMethod: params.method, amountTenderedCents: params.amountTenderedCents, surchargeCents: params.surchargeCents, splitPayments: params.splitPayments, linklySessionId: params.linklySessionId };
    if (!isOnline) {
      const payload = buildOrderPayload(mutateVars);
      const totalCents = ticketTotal(activeTicket);
      const entry: OfflineQueueEntry = { idempotencyKey: activeIdempotencyKey, queuedAt: new Date().toISOString(), syncStatus: 'pending', payload: payload as any, totalCents, customerName: activeTicket.customer?.name, itemSummary: activeTicket.items.map(i => `${i.quantity}× ${i.productName}`).join(', ').slice(0, 80) };
      enqueueOrder(entry).then(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCompletedOrder({ id: 'offline-' + activeIdempotencyKey, orderNumber: 'QUEUED', totalCents, paymentMethod: params.method, amountTenderedCents: params.amountTenderedCents, surchargeCents: params.surchargeCents ?? 0, splitPayments: params.splitPayments, loyaltyResult: null, customerName: activeTicket.customer?.name ?? 'Walk-in', customerEmail: activeTicket.customer?.email, ticketItems: activeTicket.items.map(i => ({ name: i.productName, quantity: i.quantity, unitPriceCents: i.unitPriceCents, variantName: i.variantName ?? undefined, options: (i.selectedOptions ?? []).map((o: any) => o.optionName ?? o.textValue ?? '').filter(Boolean) as string[] })), discountAmountCents: activeTicket.appliedDiscount?.amountCents ?? 0, discountLabel: activeTicket.appliedDiscount?.label ?? '' });
        setShowPayment(false);
        clearActiveTicket();
      });
    } else { createOrderMutation.mutate(mutateVars); }
  }, [isOnline, buildOrderPayload, activeTicket, activeIdempotencyKey, enqueueOrder, createOrderMutation, clearActiveTicket]);

  const handlePrintReceiptForEftpos = useCallback((sessionId: string, receiptText: string) => {
    if (receiptPrintedRef.current.has(sessionId)) return;
    const store = storeData as any;
    if (!receiptText || !store?.autoPrint || !store?.printerIp) return;
    receiptPrintedRef.current.add(sessionId);
    const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
    sendLinklyReceiptPrint({ lines: receiptText.split('\n'), printerBrand: store.printerBrand ?? 'epson' }, store.printerIp, store.printerPort ?? 9100, fetchBytes)
      .then(() => { linklyPrintStatusRef.current[sessionId] = 'printed'; const orderId = linklySessionToOrderIdRef.current[sessionId]; if (orderId) updatePrintStatus(orderId, 'printed'); })
      .catch(() => { linklyPrintStatusRef.current[sessionId] = 'failed'; const orderId = linklySessionToOrderIdRef.current[sessionId]; if (orderId) updatePrintStatus(orderId, 'failed'); });
  }, [storeData, isShopDisplay, updatePrintStatus]);

  const voidOrderMutation = useMutation({
    mutationFn: (vars: { id: string; supervisorPin?: string }) => api.pos.voidOrder(vars.id, vars.supervisorPin),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('Voided', 'Transaction has been voided.'); setLastOrderId(null); refetchSummary(); },
    onError: (err: any) => Alert.alert('Cannot Void', err?.message ?? 'Order cannot be voided (must be within 5 minutes).'),
  });

  const logTicketVoidMutation = useMutation({
    mutationFn: (vars: { items: { name: string; quantity: number }[]; totalCents: number; supervisorPin?: string }) => api.pos.logTicketVoid(vars),
    onError: (err: any) => Alert.alert('Void Failed', err?.message ?? 'Could not void sale. Please try again.'),
  });

  // ── Layout ────────────────────────────────────────────────────────────────
  const subtotal = ticketSubtotal(activeTicket);
  const total = ticketTotal(activeTicket);
  const itemCount = activeTicket.items.reduce((s, i) => s + i.quantity, 0);
  const heldCount = tickets.filter((_, i) => i !== activeIdx && tickets[i]!.items.length > 0).length;

  return (
    <View style={[styles.root, { paddingTop: layoutHandledSafeArea ? 0 : insets.top }]}>
      {/* ── Sync toast ──────────────────────────────────────────────────────── */}
      {!!syncToast && (
        <View style={styles.syncToast}>
          <Feather name="check-circle" size={14} color={WHITE} />
          <Text style={styles.syncToastText}>{syncToast}</Text>
        </View>
      )}


      {/* ── HID scanner feedback banner ───────────────────────────────────── */}
      {!!scannerBanner && (
        <Animated.View style={[styles.scannerBanner, { opacity: scannerBannerOpacity, transform: [{ translateY: scannerBannerSlide }] }, scannerBanner.kind === 'error' && styles.scannerBannerError]}>
          <Feather name={scannerBanner.kind === 'success' ? 'user-check' : 'alert-circle'} size={14} color={WHITE} />
          <Text style={styles.scannerBannerText}>{scannerBanner.message}</Text>
        </Animated.View>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PosHeader
        isOnline={isOnline} pendingCount={pendingCount}
        printStatusMap={printStatusMap} heldCount={heldCount}
        showSearch={showSearch} syncingAll={syncingAll} lastSyncedAt={lastSyncedAt}
        cashEnabled={cashEnabled}
        onOpenHistory={() => setShowHistory(true)}
        onOpenFailedPrints={() => { setHistoryOpenAtFailed(true); setShowHistory(true); }}
        onOpenHold={() => setShowHoldModal(true)}
        onToggleSearch={() => setShowSearch(v => !v)}
        onSync={syncAll}
        onOpenPrinter={() => setShowPrinterStatus(true)}
        onOpenRegister={() => setShowRegisterPin(true)}
      />

      {/* ── Search bar (collapsible) ────────────────────────────────────── */}
      {showSearch && (
        <View style={styles.headerSearchRow}>
          <Feather name="search" size={15} color={MUTED} style={{ marginRight: 8 }} />
          <TextInput style={[styles.searchInput, { flex: 1 }]} placeholder="Search products…" placeholderTextColor={MUTED} value={searchText} onChangeText={setSearchText} returnKeyType="search" autoFocus />
          {searchText.length > 0 && <Pressable onPress={() => setSearchText('')} hitSlop={8}><Feather name="x" size={15} color={MUTED} /></Pressable>}
        </View>
      )}

      {/* ── Narrow screen: tab switcher ─────────────────────────────────── */}
      {!isWide && (
        <View style={styles.paneTabBar}>
          <Pressable onPress={() => setPaneTab('menu')} style={[styles.paneTab, paneTab === 'menu' && styles.paneTabActive]}>
            <Text style={[styles.paneTabText, paneTab === 'menu' && styles.paneTabTextActive]}>Menu</Text>
          </Pressable>
          <Pressable onPress={() => setPaneTab('ticket')} style={[styles.paneTab, paneTab === 'ticket' && styles.paneTabActive]}>
            <Text style={[styles.paneTabText, paneTab === 'ticket' && styles.paneTabTextActive]}>Ticket {itemCount > 0 ? `(${itemCount})` : ''}</Text>
            {itemCount > 0 && <View style={styles.paneTabBadge}><Text style={styles.paneTabBadgeText}>{fmtCents(total)}</Text></View>}
          </Pressable>
        </View>
      )}

      {/* ── Main two-pane ─────────────────────────────────────────────────── */}
      <View style={styles.body}>
        {(isWide || paneTab === 'menu') && (
          <PosProductBrowser
            isWide={isWide}
            orderedCategories={orderedCategories}
            selCategory={selCategory}
            customCatColors={customCatColors}
            getDefaultCatColor={getDefaultCatColor}
            loadingProducts={loadingProducts}
            filteredProducts={filteredProducts}
            productListRef={productListRef}
            loadingDetail={loadingDetail}
            onCategorySelect={setSelCategory}
            onCategoryLongPress={setCatActionCat}
            onProductPress={handleProductTap}
          />
        )}

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
              onCharge={() => setShowPayment(true)}
              onEditItem={(item) => { const cached = detailCache[item.productId]; if (cached) setCustomiseData({ product: cached, editItem: item }); }}
              discountPresets={discountPresets}
              attachCustomerToCart={attachCustomerToCart}
              openCameraScanner={() => { setCustomerModalMode('scan'); setShowCustomerModal(true); }}
              anyModalOpen={anyModalOpen}
            />
          </View>
        )}
      </View>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {customiseData && (
        <CustomiseModal
          data={customiseData}
          onClose={() => setCustomiseData(null)}
          onAdd={(item) => {
            if (customiseData.editItem) {
              setTickets(prev => prev.map((t, i) => i !== activeIdx ? t : { ...t, items: t.items.map(x => x.localId === customiseData.editItem!.localId ? item : x), appliedDiscount: null }));
            } else { addItemToTicket(item); }
            setCustomiseData(null);
            if (!isWide) setPaneTab('ticket');
          }}
        />
      )}

      {showPayment && (
        <PaymentModal
          totalCents={total} subtotalCents={subtotal}
          discount={activeTicket.appliedDiscount}
          cashEnabled={cashEnabled}
          onClose={() => setShowPayment(false)}
          onConfirm={handleChargeConfirm}
          onPrintReceipt={handlePrintReceiptForEftpos}
          loading={createOrderMutation.isPending}
          isOnline={isOnline}
        />
      )}

      {completedOrder && (
        <OrderCompleteModal
          order={completedOrder}
          customerEmail={completedOrder.customerEmail}
          onClose={() => setCompletedOrder(null)}
          onPrintTaxInvoice={() => {
            const store = storeData as any;
            if (!store?.printerIp) { Alert.alert('No Printer', 'Configure a printer IP in POS settings to print.'); return; }
            const fetchBytes = isShopDisplay ? api.shopDisplay.printerBytes : api.director.printerBytes;
            sendTaxInvoicePrint({ orderId: completedOrder.id, customerName: completedOrder.customerName, type: 'pickup', items: completedOrder.ticketItems, totalCents: completedOrder.totalCents, discountCents: completedOrder.discountAmountCents, surchargeCents: completedOrder.surchargeCents, loyaltyPointsEarned: completedOrder.loyaltyResult?.pointsEarned, printerBrand: store.printerBrand ?? 'epson', paymentMethod: completedOrder.paymentMethod }, store.printerIp, store.printerPort ?? 9100, fetchBytes).catch((e: any) => Alert.alert('Print Failed', e?.message ?? 'Could not reach printer.'));
          }}
        />
      )}

      {showCustomerModal && (
        <CustomerModal
          currentCustomer={activeTicket.customer}
          initialMode={customerModalMode}
          recentBalances={recentBalancesRef.current}
          onSelect={(c) => { updateTicket({ customer: c, appliedDiscount: null }); setShowCustomerModal(false); upsertCustomerCache(c).catch(() => {}); }}
          onRemove={() => { updateTicket({ customer: null, appliedDiscount: null }); setShowCustomerModal(false); }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {showHoldModal && (
        <HoldModal tickets={tickets} activeIdx={activeIdx} onResume={(idx) => { setActiveIdx(idx); setShowHoldModal(false); }} onDelete={deleteHeldTicket} onClose={() => setShowHoldModal(false)} />
      )}

      {!!registerData && !cashEnabled && !floatPromptDismissed && (
        <CashFloatPrompt onSave={(amountCents) => { setRegisterFloatMutation.mutate(amountCents, { onSuccess: () => setFloatPromptDismissed(true) }); }} onSkip={() => setFloatPromptDismissed(true)} busy={setRegisterFloatMutation.isPending} />
      )}

      {showRegisterPin && (
        <PosPinModal title="Register" subtitle="Enter your POS PIN to access the register" onClose={() => setShowRegisterPin(false)} onSuccess={() => { setShowRegisterPin(false); setShowRegister(true); }} />
      )}

      <LinklyRecoveryModal
        recoverySession={recoverySession}
        recoveryDone={recoveryDone}
        recoveryText={recoveryText}
        onCancel={() => { recoveryPollRef.current?.cancel(); setRecoverySession(null); setRecoveryDone(null); }}
        onDone={() => { recoveryPollRef.current?.cancel(); setRecoverySession(null); setRecoveryDone(null); }}
      />

      <PrinterStatusModal visible={showPrinterStatus} onClose={() => setShowPrinterStatus(false)} store={storeData as any} lastDrawerSuccessAt={lastDrawerSuccessAt} onOpenDrawer={openDrawerWithTracking} busy={printerDrawerBusy} />

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
          onPrintSummary={async () => { if (!registerSession?.closedAt) return; await printRegisterReport(registerSession); await api.pos.markRegisterSummaryPrinted(registerSession.id); refetchRegister(); }}
          onOpenDrawer={openDrawerWithTracking}
          busy={setRegisterFloatMutation.isPending || cashMovementMutation.isPending || closeRegisterMutation.isPending || updateRegisterSettingsMutation.isPending || printerDrawerBusy}
        />
      )}

      {showZReport && zReportData && (
        <ZReportModal visible={showZReport} report={zReportData} onDone={() => { setShowZReport(false); setZReportData(null); }}
          onPrint={async () => { setZReportPrinting(true); try { await printRegisterReport(zReportData); await api.pos.markRegisterSummaryPrinted(zReportData.id); refetchRegister(); } catch (err: any) { Alert.alert('Print Failed', err?.message ?? 'Could not print Z-Report.'); } finally { setZReportPrinting(false); } }}
          printing={zReportPrinting}
        />
      )}

      {discountPinGate && (
        <SupervisorPinCapture title="Supervisor Required" subtitle="This discount requires manager authorisation" onClose={() => setDiscountPinGate(null)}
          onSuccess={(pin) => { const params = discountPinGate; setDiscountPinGate(null); createOrderMutation.mutate({ ...params, supervisorPin: pin }); }}
        />
      )}

      {registerApprovalPrompt && (
        <SupervisorPinCapture title={registerApprovalPrompt.title} subtitle={registerApprovalPrompt.subtitle} onClose={() => setRegisterApprovalPrompt(null)}
          onSuccess={(pin) => { const prompt = registerApprovalPrompt; setRegisterApprovalPrompt(null); if (prompt.mode === 'movement') { cashMovementMutation.mutate({ ...prompt.payload, supervisorPin: pin }); } else { closeRegisterMutation.mutate({ ...prompt.payload }); } }}
        />
      )}

      {showHistory && (
        <HistoryModal
          onClose={() => { setShowHistory(false); setHistoryOpenAtFailed(false); }}
          storeData={storeData}
          isShopDisplay={isShopDisplay}
          printStatusMap={printStatusMap}
          onUpdatePrintStatus={updatePrintStatus}
          initialFilter={historyOpenAtFailed ? 'failed-print' : undefined}
          onVoidSuccess={(id) => { if (id === lastOrderId) setLastOrderId(null); refetchSummary(); queryClient.invalidateQueries({ queryKey: ['pos-summary'] }); }}
        />
      )}

      {showVoidSheet && (
        <VoidConfirmSheet
          ticket={activeTicket}
          lastOrderId={lastOrderId}
          voidThresholdCents={VOID_PIN_THRESHOLD_CENTS}
          onClose={() => setShowVoidSheet(false)}
          onVoidTicket={(supervisorPin) => {
            const items = activeTicket.items.map(i => ({ name: i.productName, quantity: i.quantity }));
            const totalCents = ticketTotal(activeTicket);
            logTicketVoidMutation.mutate({ items, totalCents, supervisorPin }, { onSuccess: () => { setShowVoidSheet(false); clearTicket(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } });
          }}
          onVoidLastOrder={(supervisorPin) => { if (lastOrderId) { setShowVoidSheet(false); voidOrderMutation.mutate({ id: lastOrderId, supervisorPin }); } }}
        />
      )}

      <CategoryActionSheet
        catSlug={catActionCat}
        onClose={() => setCatActionCat(null)}
        onChangeColor={() => { const cat = catActionCat; setCatActionCat(null); setTimeout(() => setColorPickerCat(cat), 50); }}
        onReorder={() => { setCatActionCat(null); setTimeout(() => setShowReorderModal(true), 50); }}
      />

      <ReorderCategoriesModal visible={showReorderModal} items={orderedCategories} onSave={saveCatOrder} onClose={() => setShowReorderModal(false)} />

      <CategoryColorPicker
        catSlug={colorPickerCat}
        activeColor={colorPickerCat ? (customCatColors[colorPickerCat.toLowerCase()] ?? getDefaultCatColor(colorPickerCat, categories.find(ct => ct.slug === colorPickerCat)?.color)) : undefined}
        onSave={(color) => { if (colorPickerCat) { saveCatColor(colorPickerCat, color); setColorPickerCat(null); } }}
        onClose={() => setColorPickerCat(null)}
      />
    </View>
  );
}

// ── Export (wraps inner screen with OfflineProvider) ──────────────────────────
export default function PosScreen() {
  return (
    <OfflineProvider>
      <PosScreenInner />
    </OfflineProvider>
  );
}
