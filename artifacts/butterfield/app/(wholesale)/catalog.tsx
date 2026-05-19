import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import { WS_REORDER_KEY } from './orders';
import { WS_CART_KEY, WS_OPEN_CHECKOUT_KEY } from './cart';
import {
  formatDateChip,
  formatTime,
  getDeliveryDates,
  getPickupDates,
  getPickupTimeMins,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';

const BG         = '#F5F6FA';
const CARD       = '#FFFFFF';
const BLUE       = '#1493FF';
const LIGHT_BLUE = '#EBF8FF';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const CHECKOUT_TABS = [
  { label: 'CART',    icon: 'shopping-bag' },
  { label: 'SHIPPING',icon: 'truck' },
  { label: 'ORDER',   icon: 'file-text' },
] as const;
function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}
interface PricingContext {
  tierId: string | null;
  tierName: string | null;
  qtyBreaks: Array<{ id: string; productId: string; minQty: number; unitPriceCents: number }>;
  customPrices: Array<{ id: string; productId: string; unitPriceCents: number | null }>;
}
function computePriceInfo(
  productId: string,
  qty: number,
  baseCents: number,
  ctx: PricingContext | null,
): { unitCents: number; isCustom: boolean; isQtyBreak: boolean; activeBreakMinQty: number | null } {
  if (!ctx || !baseCents) return { unitCents: baseCents, isCustom: false, isQtyBreak: false, activeBreakMinQty: null };
  const custom = ctx.customPrices.find((cp) => cp.productId === productId && cp.unitPriceCents);
  if (custom?.unitPriceCents) return { unitCents: custom.unitPriceCents, isCustom: true, isQtyBreak: false, activeBreakMinQty: null };
  const applicable = [...(ctx.qtyBreaks ?? [])]
    .filter((qb) => qb.productId === productId && qb.unitPriceCents && qty >= qb.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (applicable?.unitPriceCents) return { unitCents: applicable.unitPriceCents, isCustom: false, isQtyBreak: true, activeBreakMinQty: applicable.minQty };
  return { unitCents: baseCents, isCustom: false, isQtyBreak: false, activeBreakMinQty: null };
}
interface CartEntry { product: ApiProduct; quantity: number }
function CompactProductRow({ product, cartEntry, onAdd, pricingCtx }: {
  product: ApiProduct;
  cartEntry?: CartEntry;
  onAdd: (product: ApiProduct, qty: number) => void;
  pricingCtx: PricingContext | null;
}) {
  const defaultQty  = String((product as any).minOrderQty ?? 12);
  const [qty, setQty]  = useState(defaultQty);
  const [added, setAdded] = useState(false);
  const addedTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseCents   = (product as any).unitPriceCents ?? (product.prices?.[0]?.unit_amount ?? 0);
  const parsedQty   = Math.max(1, parseInt(qty) || 1);
  const priceInfo   = computePriceInfo(product.id, parsedQty, baseCents, pricingCtx);
  const palette     = getPalette(product.metadata?.category);
  const imageUrl    = (product as any).images?.[0];
  const inCart      = !!cartEntry;
  const productBreaks = pricingCtx
    ? [...(pricingCtx.qtyBreaks ?? [])].filter((qb) => qb.productId === product.id).sort((a, b) => a.minQty - b.minQty)
    : [];
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  const increment = () => { const n = parsedQty + 1; setQty(String(n)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const decrement = () => { const n = Math.max(1, parsedQty - 1); setQty(String(n)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const handleAdd = () => {
    onAdd(product, parsedQty);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQty(defaultQty);
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 2000);
  };
  return (
    <View style={styles.compactRow}>
      {/* Thumbnail */}
      <View style={styles.compactThumbWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.compactThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.compactThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>{palette.emoji}</Text>
          </View>
        )}
        {inCart && (
          <View style={styles.inCartBadge}>
            <Text style={styles.inCartBadgeText}>{cartEntry!.quantity}</Text>
          </View>
        )}
      </View>
      {/* Name + price info */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.compactName} numberOfLines={1}>{product.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.compactPrice}>${(priceInfo.unitCents / 100).toFixed(2)}</Text>
          {priceInfo.isCustom && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>Custom</Text>
            </View>
          )}
          {priceInfo.isQtyBreak && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{priceInfo.activeBreakMinQty}+ price</Text>
            </View>
          )}
        </View>
        {productBreaks.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2 }}>
            {productBreaks.map((qb) => (
              <Text key={qb.id} style={[styles.breakTag, { color: parsedQty >= qb.minQty ? BLUE : MUTED }]}>
                {qb.minQty}+ ${(qb.unitPriceCents / 100).toFixed(2)}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>
      {/* Qty stepper + Add */}
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={styles.stepperRow}>
          <Pressable onPress={decrement} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.stepQty}
            value={qty}
            onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            selectTextOnFocus
          />
          <Pressable onPress={increment} style={styles.stepBtn}>
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={handleAdd}
          style={[styles.addBtn, { backgroundColor: added ? '#22C55E' : BLUE }]}
        >
          <Feather name={added ? 'check' : 'plus'} size={11} color="#fff" />
          <Text style={styles.addBtnText}>{added ? 'Added' : 'Add'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
export default function WholesaleCatalog() {
  const insets = useSafeAreaInsets();
  const qc     = useQueryClient();
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('All');
  const [cart, setCart]           = useState<CartEntry[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const { width: SCREEN_W } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const goToStep = useCallback((step: number) => {
    pagerRef.current?.scrollTo({ x: step * SCREEN_W, animated: true });
    setCheckoutStep(step);
  }, [SCREEN_W]);
  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), staleTime: 60_000 });
  const account = accountData?.data ?? null;
  const deliveryFeeCents: number = account?.deliveryFeeCents ?? 0;
  // Effective minimum order — account-level override takes priority over tier default
  const minOrderCents: number = (account?.minOrderCents ?? 0) > 0
    ? (account?.minOrderCents ?? 0)
    : (account?.tier?.minOrderCents ?? 0);
  // Shipping
  const [orderType, setOrderType]           = useState<'pickup' | 'delivery'>('delivery');
  const [selectedDate, setSelectedDate]     = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);
  const [street, setStreet]                 = useState('');
  const [suburb, setSuburb]                 = useState('');
  const [postcode, setPostcode]             = useState('');
  const [contactName, setContactName]       = useState('');
  const [contactPhone, setContactPhone]     = useState('');
  const [contactEmail, setContactEmail]     = useState('');
  // Order
  const [poRef, setPoRef]     = useState('');
  const [notes, setNotes]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['wholesale-products'], queryFn: () => api.wholesale.catalog(), retry: 1 });
  const products = data?.data ?? [];
  const { data: pricingData } = useQuery({
    queryKey: ['wholesale-pricing-context'],
    queryFn:  () => api.wholesale.pricingContext(),
    staleTime: 60_000,
    retry: false,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  // ── Reorder detection ──────────────────────────────────────────────────
  const [pendingReorder, setPendingReorder] = useState<{ productId: string; qty: number; productName: string }[] | null>(null);
  const reorderProcessed = useRef(false);
  // Re-check AsyncStorage on every focus so reorder and cart-tab checkout work
  // even when the catalog tab is already mounted (tabs don't unmount on switch).
  useFocusEffect(
    useCallback(() => {
      // Reorder from orders tab
      AsyncStorage.getItem(WS_REORDER_KEY).then((val) => {
        if (val) {
          reorderProcessed.current = false;
          setPendingReorder(JSON.parse(val));
          AsyncStorage.removeItem(WS_REORDER_KEY);
        }
      });
      // Open checkout requested by cart tab
      AsyncStorage.getItem(WS_OPEN_CHECKOUT_KEY).then((val) => {
        if (val) {
          AsyncStorage.removeItem(WS_OPEN_CHECKOUT_KEY);
          // Restore cart from AsyncStorage if local cart is empty
          AsyncStorage.getItem(WS_CART_KEY).then((cartVal) => {
            if (cartVal) {
              try {
                const saved: CartEntry[] = JSON.parse(cartVal);
                if (saved.length > 0) setCart(saved);
              } catch {}
            }
            setCheckoutStep(0);
            setShowCheckout(true);
          });
        }
      });
    }, [])
  );
  // Persist cart to AsyncStorage whenever it changes (shared with cart tab)
  useEffect(() => {
    AsyncStorage.setItem(WS_CART_KEY, JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (!pendingReorder || products.length === 0 || reorderProcessed.current) return;
    reorderProcessed.current = true;
    const newCart: CartEntry[] = [];
    const notFound: string[] = [];
    for (const item of pendingReorder) {
      const product = products.find((p) => p.id === item.productId);
      if (product) {
        newCart.push({ product, quantity: item.qty });
      } else if (item.productName) {
        notFound.push(item.productName);
      }
    }
    if (newCart.length > 0) {
      setCart(newCart);
      setCheckoutStep(0);
      setShowCheckout(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg = notFound.length > 0
        ? `${newCart.length} item${newCart.length !== 1 ? 's' : ''} added to cart.\n\nNote: ${notFound.join(', ')} ${notFound.length === 1 ? 'is' : 'are'} no longer available.`
        : `${newCart.length} item${newCart.length !== 1 ? 's' : ''} added to your cart. Review and place your order below.`;
      Alert.alert('Cart Ready', msg);
    } else {
      Alert.alert('Products Unavailable', 'None of the products from that order are currently available.');
    }
    setPendingReorder(null);
  }, [pendingReorder, products]);
  // ──────────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.metadata?.category) cats.add(p.metadata.category); });
    return ['All', ...Array.from(cats).sort()];
  }, [products]);
  const filtered = useMemo(() => products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || p.metadata?.category === category;
    return matchSearch && matchCat;
  }), [products, search, category]);
  const addToCart = (product: ApiProduct, qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev) => {
      const existing = prev.find((e) => e.product.id === product.id);
      if (existing) return prev.map((e) => e.product.id === product.id ? { ...e, quantity: e.quantity + qty } : e);
      return [...prev, { product, quantity: qty }];
    });
  };
  const removeFromCart  = (productId: string) => setCart((prev) => prev.filter((e) => e.product.id !== productId));
  const updateCartQty   = (productId: string, qty: number) => {
    if (qty <= 0) removeFromCart(productId);
    else setCart((prev) => prev.map((e) => e.product.id === productId ? { ...e, quantity: qty } : e));
  };
  const pricingCtx = (pricingData?.data ?? null) as PricingContext | null;
  const subtotalCents = cart.reduce((sum, e) => {
    const bc = (e.product as any).unitPriceCents ?? (e.product.prices?.[0]?.unit_amount ?? 0);
    return sum + computePriceInfo(e.product.id, e.quantity, bc, pricingCtx).unitCents * e.quantity;
  }, 0);
  const totalCents    = subtotalCents + (orderType === 'delivery' ? deliveryFeeCents : 0);
  const totalQty      = cart.reduce((s, e) => s + e.quantity, 0);
  const sydNow        = getSydneyNow();
  const deliveryDates = getDeliveryDates();
  const pickupDates   = getPickupDates();
  const pickupTimes   = selectedDate ? getPickupTimeMins(selectedDate, sydNow) : [];
  const deliveryPairs: (typeof deliveryDates[0] | null)[][] = [];
  for (let i = 0; i < deliveryDates.length; i += 2) {
    deliveryPairs.push([deliveryDates[i], deliveryDates[i + 1] ?? null]);
  }
  const pickupPairs: (Date | null)[][] = [];
  for (let i = 0; i < pickupDates.length; i += 2) {
    pickupPairs.push([pickupDates[i], pickupDates[i + 1] ?? null]);
  }
  const handleOpenCheckout = () => {
    setCheckoutStep(0);
    setShowCheckout(true);
  };
  const handleContinue = async () => {
    if (checkoutStep === 0) {
      if (cart.length === 0) { Alert.alert('Cart is empty'); return; }
      if (minOrderCents > 0 && subtotalCents < minOrderCents) { Alert.alert('Minimum order', `Minimum wholesale order is AUD ${(minOrderCents / 100).toFixed(2)}.`); return; }
      goToStep(1);
      return;
    }
    if (checkoutStep === 1) {
      if (orderType === 'pickup') {
        if (!selectedDate || selectedTimeMins === null) { Alert.alert('Select pickup time', 'Please choose a date and time for your pickup.'); return; }
      } else {
        if (!selectedDate) { Alert.alert('Select delivery date', 'Please choose a delivery date.'); return; }
      }
      goToStep(2);
    }
    if (checkoutStep === 2) {
      await handlePlaceOrder();
    }
  };
  const handlePlaceOrder = async () => {
    setSubmitting(true);
    try {
      let scheduledForDate: Date | undefined;
      if (orderType === 'pickup' && selectedDate && selectedTimeMins !== null) {
        const d = new Date(selectedDate);
        d.setHours(Math.floor(selectedTimeMins / 60), selectedTimeMins % 60, 0, 0);
        scheduledForDate = d;
      } else if (orderType === 'delivery' && selectedDate) {
        scheduledForDate = selectedDate;
      }
      const deliveryAddress = orderType === 'delivery' && street.trim()
        ? `${street.trim()}, ${suburb.trim()} NSW ${postcode.trim()}`
        : undefined;
      await api.wholesale.createOrder({
        items: cart.map((e) => ({
          productId: e.product.id,
          qty:       e.quantity,
        })),
        poReference:   poRef.trim() || undefined,
        notes:         [notes.trim(), contactName.trim(), contactPhone.trim()].filter(Boolean).join(' | ') || undefined,
        deliveryType:  orderType,
        scheduledDate: scheduledForDate?.toISOString(),
        deliveryAddress,
      });
      qc.invalidateQueries({ queryKey: ['wholesale-orders'] });
      setCart([]); setPoRef(''); setNotes('');
      setSelectedDate(null); setSelectedTimeMins(null);
      setStreet(''); setSuburb(''); setPostcode('');
      setShowCheckout(false); setCheckoutStep(0);
      Alert.alert(
        'Order Submitted!',
        'Thank you, your order has been submitted. Our team will confirm availability and send your invoice shortly.',
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSubmitting(false); }
  };
  const getContinueLabel = () => {
    if (submitting) return '…';
    if (checkoutStep === 0) return 'Continue to shipping';
    if (checkoutStep === 1) return 'Continue to order';
    return 'Place Order';
  };
  // ── Checkout overlay ─────────────────────────────────────────────────────
  if (showCheckout) {
    return (
      <View style={{ flex: 1, backgroundColor: CARD }}>
        {/* Header */}
        <View style={[styles.checkoutHeader, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
          <View style={styles.checkoutHeaderTop}>
            {checkoutStep > 0 ? (
              <Pressable onPress={() => goToStep(checkoutStep - 1)} style={styles.backBtn}>
                <Feather name="chevron-left" size={22} color={TEXT} />
              </Pressable>
            ) : (
              <Pressable onPress={() => setShowCheckout(false)} style={styles.backBtn}>
                <Feather name="x" size={20} color={TEXT} />
              </Pressable>
            )}
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.checkoutTitle}>CHECKOUT</Text>
              <Text style={[styles.checkoutSub, { color: MUTED }]}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
          <View style={styles.tabBar}>
            {CHECKOUT_TABS.map((tab, i) => {
              const active = checkoutStep === i;
              const done   = checkoutStep > i;
              return (
                <Pressable key={tab.label} style={styles.tabItem} onPress={() => { if (i <= checkoutStep) goToStep(i); }}>
                  <View style={styles.tabInner}>
                    <Feather name={tab.icon as any} size={13} color={active || done ? BLUE : MUTED} />
                    <Text style={[styles.tabLabel, { color: active ? TEXT : done ? BLUE : MUTED, fontWeight: active ? '600' : '400' }]}>
                      {tab.label}
                    </Text>
                  </View>
                  {active && <View style={[styles.tabUnderline, { backgroundColor: BLUE }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Horizontal pager — swipe left/right between CART · SHIPPING · ORDER */}
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onMomentumScrollEnd={(e) => {
              const newStep = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              if (newStep !== checkoutStep) setCheckoutStep(newStep);
            }}
            style={{ flex: 1 }}
          >
            {/* ── PAGE 0: CART ── */}
            <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cart.map((entry) => {
                const bc = (entry.product as any).unitPriceCents ?? (entry.product.prices?.[0]?.unit_amount ?? 0);
                const wsPrice = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx).unitCents / 100;
                const palette  = getPalette(entry.product.metadata?.category);
                const imageUrl = (entry.product as any).images?.[0];
                return (
                  <View key={entry.product.id} style={[styles.itemCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.itemThumb} resizeMode="cover" />
                    ) : (
                      <View style={[styles.itemThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 28 }}>{palette.emoji}</Text>
                      </View>
                    )}
                    <Pressable onPress={() => removeFromCart(entry.product.id)} style={styles.removeBtn}>
                      <Feather name="x" size={12} color={MUTED} />
                    </Pressable>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemName}>{entry.product.name}</Text>
                      <Text style={styles.itemPrice}>AUD {(wsPrice * entry.quantity).toFixed(2)}</Text>
                      <View style={styles.qtyRow}>
                        <Pressable onPress={() => updateCartQty(entry.product.id, entry.quantity - 1)} style={styles.qtyBtn}>
                          <Text style={styles.qtyBtnText}>–</Text>
                        </Pressable>
                        <Text style={styles.qtyLabel}>QTY: {entry.quantity}</Text>
                        <Pressable onPress={() => updateCartQty(entry.product.id, entry.quantity + 1)} style={styles.qtyBtn}>
                          <Text style={styles.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowLabel}>Subtotal</Text>
                  <Text style={styles.summaryRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
                </View>
                {orderType === 'delivery' && deliveryFeeCents > 0 && (
                  <>
                    <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryRowLabel}>Delivery fee</Text>
                      <Text style={styles.summaryRowValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
                    </View>
                  </>
                )}
                <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Order Total</Text>
                  <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                </View>
                {minOrderCents > 0 && subtotalCents < minOrderCents && (
                  <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '400', marginTop: 4 }}>
                    Minimum wholesale order is AUD {(minOrderCents / 100).toFixed(2)}
                  </Text>
                )}
              </View>
              <Text style={styles.shippingNote}>Choose pickup or delivery on the next step.</Text>
            </ScrollView>
            {/* ── PAGE 1: SHIPPING ── */}
            <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>HOW WOULD YOU LIKE TO RECEIVE YOUR ORDER?</Text>
              <View style={styles.orderTypeRow}>
                {[
                  { id: 'delivery', label: 'Delivery', sub: deliveryFeeCents > 0 ? `AUD ${(deliveryFeeCents / 100).toFixed(2)}` : 'Free delivery', icon: 'truck' as const },
                  { id: 'pickup',   label: 'Pickup',   sub: 'In-store, free',      icon: 'shopping-bag' as const },
                ].map((t) => {
                  const active = orderType === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => { setOrderType(t.id as any); setSelectedDate(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                      style={[styles.orderTypeCard, {
                        backgroundColor: active ? LIGHT_BLUE : CARD,
                        borderColor:     active ? BLUE : BORDER,
                        borderWidth:     active ? 2 : 1,
                      }]}
                    >
                      <View style={[styles.orderTypeIcon, { backgroundColor: active ? BLUE : BG }]}>
                        <Feather name={t.icon} size={18} color={active ? '#fff' : MUTED} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orderTypeLabel}>{t.label}</Text>
                        <Text style={[styles.orderTypeSub, { color: active ? BLUE : MUTED }]}>{t.sub}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {orderType === 'delivery' && (
                <View style={[styles.deliveryInfoCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
                  <View style={[styles.deliveryInfoIcon, { backgroundColor: BLUE }]}>
                    <Feather name="truck" size={16} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deliveryInfoTag, { color: BLUE }]}>SYDNEY DELIVERY</Text>
                    <Text style={styles.deliveryInfoTitle}>Invoiced on dispatch</Text>
                    <Text style={styles.deliveryInfoSub}>Mondays &amp; Thursdays, 8am – 5pm. 24 hours notice required.</Text>
                  </View>
                </View>
              )}
              <View style={styles.chooseDateHeader}>
                <Feather name="calendar" size={18} color={TEXT} />
                <Text style={styles.chooseDateTitle}>
                  {orderType === 'delivery' ? 'Choose a delivery date' : 'Choose a pickup date'}
                </Text>
              </View>
              {orderType === 'delivery' ? (
                deliveryPairs.map((pair, ri) => (
                  <View key={ri} style={styles.dateGrid}>
                    {pair.map((slot, ci) => {
                      if (!slot) return <View key={ci} style={{ flex: 1 }} />;
                      const isSelected = selectedDate ? isSameDay(selectedDate, slot.date) : false;
                      const dayName    = slot.date.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                      const dayDate    = slot.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                      return (
                        <Pressable
                          key={ci}
                          onPress={() => { if (slot.available) { setSelectedDate(slot.date); Haptics.selectionAsync(); } }}
                          disabled={!slot.available}
                          style={[styles.dateCard, {
                            backgroundColor: isSelected ? LIGHT_BLUE : CARD,
                            borderColor:     isSelected ? BLUE : BORDER,
                            borderWidth:     isSelected ? 2 : 1,
                            opacity:         slot.available ? 1 : 0.4,
                          }]}
                        >
                          <Text style={[styles.dateDayName, { color: BLUE }]}>{dayName}</Text>
                          <Text style={styles.dateDayNum}>{dayDate}</Text>
                          <Text style={styles.dateTimeRange}>8am – 5pm</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              ) : (
                <>
                  {pickupPairs.map((pair, ri) => (
                    <View key={ri} style={styles.dateGrid}>
                      {pair.map((d, ci) => {
                        if (!d) return <View key={ci} style={{ flex: 1 }} />;
                        const isSelected = selectedDate ? isSameDay(selectedDate, d) : false;
                        const lbl        = formatDateChip(sydNow, d);
                        const dayFull    = d.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                        const dayDate    = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                        return (
                          <Pressable
                            key={ci}
                            onPress={() => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                            style={[styles.dateCard, {
                              backgroundColor: isSelected ? LIGHT_BLUE : CARD,
                              borderColor:     isSelected ? BLUE : BORDER,
                              borderWidth:     isSelected ? 2 : 1,
                            }]}
                          >
                            <Text style={[styles.dateDayName, { color: BLUE }]}>
                              {lbl === 'Today' ? 'TODAY' : lbl === 'Tomorrow' ? 'TOMORROW' : dayFull}
                            </Text>
                            <Text style={styles.dateDayNum}>{dayDate}</Text>
                            <Text style={styles.dateTimeRange}>10am – 7pm</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {selectedDate && (
                    <>
                      <Text style={styles.pickupTimeLabel}>Select a time</Text>
                      <View style={styles.timeGrid}>
                        {pickupTimes.length === 0 ? (
                          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '400' }}>No slots available</Text>
                        ) : pickupTimes.map((mins) => {
                          const lbl = formatTime(mins);
                          const isSel = selectedTimeMins === mins;
                          return (
                            <Pressable key={mins} onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                              style={[styles.timePill, { backgroundColor: isSel ? BLUE : CARD, borderColor: isSel ? BLUE : BORDER }]}>
                              <Text style={[styles.timePillText, { color: isSel ? '#fff' : TEXT }]}>{lbl}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              )}
              {orderType === 'delivery' && (
                <>
                  <Text style={styles.sectionLabel}>DELIVERY ADDRESS</Text>
                  <View style={[styles.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                    <Text style={styles.formFieldLabel}>Street address</Text>
                    <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder="Street address" placeholderTextColor={MUTED} value={street} onChangeText={setStreet} autoCapitalize="words" />
                    <View style={styles.formRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formFieldLabel}>Suburb</Text>
                        <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder="Suburb" placeholderTextColor={MUTED} value={suburb} onChangeText={setSuburb} autoCapitalize="words" />
                      </View>
                      <View style={{ width: 110 }}>
                        <Text style={styles.formFieldLabel}>Postcode</Text>
                        <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder="2160" placeholderTextColor={MUTED} value={postcode} onChangeText={setPostcode} keyboardType="number-pad" maxLength={4} />
                      </View>
                    </View>
                    <Text style={[styles.formNote, { color: MUTED }]}>We currently only deliver in Sydney NSW.</Text>
                  </View>
                </>
              )}
              <Text style={styles.sectionLabel}>YOUR DETAILS</Text>
              <View style={[styles.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                {[
                  { label: 'Full name',     value: contactName,  setter: setContactName,  placeholder: 'Contact name',    keyboard: 'default' as const,       autoCapitalize: 'words' as const },
                  { label: 'Mobile number', value: contactPhone, setter: setContactPhone, placeholder: '04XX XXX XXX',   keyboard: 'phone-pad' as const,     autoCapitalize: 'none' as const  },
                  { label: 'Email',         value: contactEmail, setter: setContactEmail, placeholder: 'you@company.com', keyboard: 'email-address' as const, autoCapitalize: 'none' as const  },
                ].map((f) => (
                  <View key={f.label} style={styles.formFieldWrap}>
                    <Text style={styles.formFieldLabel}>{f.label}</Text>
                    <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder={f.placeholder} placeholderTextColor={MUTED} value={f.value} onChangeText={f.setter} keyboardType={f.keyboard} autoCapitalize={f.autoCapitalize} />
                  </View>
                ))}
              </View>
              {orderType === 'delivery' && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryRowLabel}>Delivery fee</Text>
                  <Text style={styles.summaryRowValue}>
                    {deliveryFeeCents > 0 ? `AUD ${(deliveryFeeCents / 100).toFixed(2)}` : 'Free'}
                  </Text>
                </View>
              )}
            </ScrollView>
            {/* ── PAGE 2: ORDER ── */}
            <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.paymentHeader, { color: TEXT }]}>Order Summary</Text>
              {cart.map((entry) => {
                const bc = (entry.product as any).unitPriceCents ?? (entry.product.prices?.[0]?.unit_amount ?? 0);
                const wsPrice = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx).unitCents / 100;
                return (
                  <View key={entry.product.id} style={styles.paymentItem}>
                    <Text style={[styles.paymentItemName, { color: TEXT }]}>{entry.product.name} × {entry.quantity}</Text>
                    <Text style={[styles.paymentItemPrice, { color: MUTED }]}>AUD {(wsPrice * entry.quantity).toFixed(2)}</Text>
                  </View>
                );
              })}
              <View style={styles.formFieldWrap}>
                <Text style={styles.formFieldLabel}>PO Reference (optional)</Text>
                <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder="e.g. PO-2024-001" placeholderTextColor={MUTED} value={poRef} onChangeText={setPoRef} />
                <Text style={styles.formFieldLabel}>Notes (optional)</Text>
                <TextInput style={[styles.formInput, styles.notesInput, { color: TEXT, borderColor: BORDER }]} placeholder="Delivery instructions, special requests..." placeholderTextColor={MUTED} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
              </View>
              <View style={[styles.orderDetailsCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                <View style={styles.orderDetailRow}>
                  <Feather name={orderType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={BLUE} />
                  <Text style={[styles.orderDetailText, { color: TEXT }]}>
                    {orderType === 'delivery' ? `Delivery${street ? ` · ${street}, ${suburb} NSW` : ''}` : 'In-store Pickup'}
                  </Text>
                </View>
                {selectedDate && (
                  <View style={styles.orderDetailRow}>
                    <Feather name="calendar" size={14} color={BLUE} />
                    <Text style={[styles.orderDetailText, { color: TEXT }]}>
                      {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                      {orderType === 'pickup' && selectedTimeMins !== null ? ` at ${formatTime(selectedTimeMins)}` : ''}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.secureCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                <Feather name="file-text" size={14} color="#22C55E" />
                <Text style={[styles.secureText, { color: '#166534' }]}>
                  Your order will be confirmed within 1 business day. An invoice will be issued on approval.
                </Text>
              </View>
            </ScrollView>
          </ScrollView>
        </KeyboardAvoidingView>
        {/* Sticky bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: 16, backgroundColor: CARD, borderTopColor: BORDER }]}>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomTotalLabel}>TOTAL</Text>
            <Text style={styles.bottomTotalAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
          </View>
          <Pressable onPress={handleContinue} disabled={submitting || (checkoutStep === 0 && minOrderCents > 0 && subtotalCents < minOrderCents)}
            style={[styles.continueBtn, { backgroundColor: (checkoutStep === 0 && minOrderCents > 0 && subtotalCents < minOrderCents) ? '#C7C7CC' : BLUE, opacity: submitting ? 0.8 : 1 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueBtnText}>{getContinueLabel()}</Text>}
          </Pressable>
        </View>
      </View>
    );
  }
  // ── Catalog list ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#1A2B4A', '#253B5E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.catalogHeader, { paddingTop: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>Wholesale Catalog</Text>
          {cart.length > 0 && (
            <Pressable onPress={handleOpenCheckout} style={[styles.cartBtn, { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12 }]}>
              <Feather name="shopping-cart" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{totalQty}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.searchBar, { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 }]}>
          <Feather name="search" size={14} color="rgba(255,255,255,0.8)" />
          <TextInput style={{ flex: 1, color: '#fff', fontWeight: '400', fontSize: 14 }} placeholder="Search products..." placeholderTextColor="rgba(255,255,255,0.6)" value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x" size={14} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'flex-start' }}>
          {categories.map((cat) => {
            const active = category === cat;
            const label = cat === 'All' ? 'All Products' : cat.charAt(0).toUpperCase() + cat.slice(1);
            return (
              <Pressable
                key={cat}
                onPress={() => { setCategory(cat); Haptics.selectionAsync(); }}
                style={[styles.tierTag, {
                  backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.18)',
                  borderRadius: 20, borderWidth: 1,
                  borderColor: active ? '#fff' : 'rgba(255,255,255,0.3)',
                }]}
              >
                <Text style={{ color: active ? BLUE : '#fff', fontWeight: '600', fontSize: 11 }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {pricingCtx?.tierName && (
          <View style={[styles.tierTag, { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 11 }}>{pricingCtx.tierName}</Text>
          </View>
        )}
      </LinearGradient>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: cart.length > 0 ? 110 : 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Feather name="package" size={32} color={BORDER} />
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 14 }}>No products available</Text>
            </View>
          }
          renderItem={({ item: product }) => (
            <CompactProductRow product={product} cartEntry={cart.find((e) => e.product.id === product.id)} onAdd={addToCart} pricingCtx={pricingCtx} />
          )}
        />
      )}
      {cart.length > 0 && (
        <View style={styles.floatingCartOuter}>
          <Pressable onPress={handleOpenCheckout}>
            <LinearGradient colors={['#1493FF', '#3CBBEE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.floatingCartInner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.floatingCartBadge}>
                  <Text style={{ color: BLUE, fontWeight: '700', fontSize: 12 }}>{totalQty}</Text>
                </View>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {cart.length} item{cart.length !== 1 ? 's' : ''} · View Cart
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>${(subtotalCents / 100).toFixed(2)}</Text>
                <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.85)" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  // Catalog
  catalogHeader:  { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  searchBar:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  cartBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tierTag:        { paddingHorizontal: 10, paddingVertical: 6, gap: 2, alignItems: 'center' },
  // Compact product row
  compactRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: BORDER },
  compactThumbWrap: { position: 'relative' },
  compactThumb:     { width: 56, height: 56, borderRadius: 10 },
  inCartBadge:      { position: 'absolute', top: -5, right: -5, backgroundColor: '#22C55E', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: CARD },
  inCartBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '700' },
  compactName:      { fontSize: 14, fontWeight: '600', color: TEXT },
  compactPrice:     { fontSize: 14, fontWeight: '700', color: BLUE },
  compactStrike:    { fontSize: 11, fontWeight: '400', color: MUTED, textDecorationLine: 'line-through' },
  discountBadge:    { backgroundColor: `${BLUE}18`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  discountBadgeText:{ fontSize: 10, fontWeight: '700', color: BLUE },
  breakTag:         { fontSize: 10, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: `${BLUE}12` },
  stepperRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, overflow: 'hidden', height: 34 },
  stepBtn:          { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepBtnText:      { fontSize: 18, color: TEXT, fontWeight: '400', lineHeight: 22 },
  stepQty:          { width: 36, height: 34, textAlign: 'center', fontSize: 13, fontWeight: '700', color: TEXT },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 10, justifyContent: 'center' },
  addBtnText:       { color: '#fff', fontSize: 13, fontWeight: '700' },
  floatingCartOuter:{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER },
  floatingCartInner:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 54, borderRadius: 27, shadowColor: '#1493FF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 6 },
  floatingCartBadge:{ backgroundColor: '#fff', borderRadius: 8, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  // Checkout header
  checkoutHeader:    { borderBottomWidth: 1, paddingBottom: 0 },
  checkoutHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkoutTitle:     { fontSize: 17, fontWeight: '700', color: TEXT, letterSpacing: 1.5 },
  checkoutSub:       { fontSize: 12, fontWeight: '400', marginTop: 1 },
  // Tabs
  tabBar:      { flexDirection: 'row' },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
  tabInner:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:    { fontSize: 11, letterSpacing: 0.5 },
  tabUnderline:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  // Section
  sectionLabel: { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  // Cart items
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, height: 90 },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER, zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontWeight: '600', color: TEXT },
  itemPrice:  { fontSize: 14, fontWeight: '500', color: TEXT },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  qtyBtn:     { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  qtyBtnText: { fontSize: 18, color: TEXT, fontWeight: '400', lineHeight: 22 },
  qtyLabel:   { fontSize: 14, fontWeight: '700', color: TEXT, minWidth: 24, textAlign: 'center' },
  // Summary
  summaryCard:       { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:   { fontSize: 13, fontWeight: '400', color: MUTED },
  summaryRowValue:   { fontSize: 13, fontWeight: '500', color: TEXT },
  summaryTotalLabel: { fontWeight: '700', fontSize: 15, color: TEXT },
  summaryTotalValue: { fontWeight: '700', fontSize: 16, color: TEXT },
  summaryDivider:    { height: 1 },
  shippingNote:      { textAlign: 'center', fontSize: 12, fontWeight: '400', color: MUTED },
  // Order type
  orderTypeRow:   { flexDirection: 'row', gap: 10 },
  orderTypeCard:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  orderTypeIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
  orderTypeSub:   { fontSize: 12, fontWeight: '400', marginTop: 2 },
  // Delivery info
  deliveryInfoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  deliveryInfoIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deliveryInfoTag:   { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  deliveryInfoTitle: { fontSize: 15, fontWeight: '700', color: TEXT, marginTop: 2 },
  deliveryInfoSub:   { fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 },
  // Date grid
  chooseDateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chooseDateTitle:  { fontSize: 16, fontWeight: '700', color: TEXT },
  dateGrid:         { flexDirection: 'row', gap: 10 },
  dateCard:         { flex: 1, borderRadius: 14, padding: 14, gap: 3 },
  dateDayName:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  dateDayNum:       { fontSize: 16, fontWeight: '700', color: TEXT },
  dateTimeRange:    { fontSize: 12, fontWeight: '400', color: MUTED },
  // Time slots
  pickupTimeLabel: { fontSize: 14, fontWeight: '600', color: TEXT, marginTop: 4 },
  timeGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timePill:        { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  timePillText:    { fontSize: 13, fontWeight: '500' },
  // Forms
  formCard:       { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  formFieldWrap:  { gap: 4 },
  formFieldLabel: { fontSize: 13, fontWeight: '500', color: MUTED },
  formInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: BG },
  formRow:        { flexDirection: 'row', gap: 10 },
  formNote:       { fontSize: 12, fontWeight: '400', marginTop: 2 },
  notesInput:     { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  // Order step
  paymentHeader:    { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  paymentItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  paymentItemName:  { fontSize: 13, fontWeight: '400', flex: 1 },
  paymentItemPrice: { fontSize: 13, fontWeight: '500' },
  orderDetailsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  orderDetailRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderDetailText:  { flex: 1, fontSize: 13, fontWeight: '400' },
  secureCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  secureText:       { flex: 1, fontSize: 12, fontWeight: '400' },
  // Bottom bar
  bottomBar:        { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  bottomTotal:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomTotalLabel: { fontSize: 13, fontWeight: '700', color: TEXT, letterSpacing: 1 },
  bottomTotalAmount:{ fontSize: 20, fontWeight: '700', color: TEXT },
  continueBtn:      { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  continueBtnText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});
