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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import { WS_REORDER_KEY } from './orders';
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
const BLUE       = '#40C0F2';
const LIGHT_BLUE = '#EBF8FF';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';

const WHOLESALE_TIERS = [
  { minQty: 1,  label: 'Retail',      discount: 0    },
  { minQty: 10, label: 'Trade (10+)', discount: 0.10 },
  { minQty: 25, label: 'Bulk (25+)',  discount: 0.20 },
  { minQty: 50, label: 'Volume (50+)',discount: 0.30 },
];

const CHECKOUT_TABS = [
  { label: 'CART',    icon: 'shopping-bag' },
  { label: 'SHIPPING',icon: 'truck' },
  { label: 'ORDER',   icon: 'file-text' },
] as const;

function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}
function getWholesalePrice(basePrice: number, qty: number): number {
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => qty >= t.minQty);
  return basePrice * (1 - (tier?.discount ?? 0));
}

interface CartEntry { product: ApiProduct; quantity: number }

function ProductRow({ product, cartEntry, onAdd }: {
  product: ApiProduct;
  cartEntry?: CartEntry;
  onAdd: (product: ApiProduct, qty: number) => void;
}) {
  const [qty, setQty]  = useState('12');
  const basePrice      = getPrice(product);
  const parsedQty      = parseInt(qty) || 1;
  const wsPrice        = getWholesalePrice(basePrice, parsedQty);
  const tier           = [...WHOLESALE_TIERS].reverse().find((t) => parsedQty >= t.minQty);
  const palette        = getPalette(product.metadata?.category);
  const imageUrl       = (product as any).images?.[0];

  return (
    <View style={[styles.productCard, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.productThumbLg} resizeMode="cover" />
      ) : (
        <View style={[styles.productThumbLg, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }]}>
          <Text style={{ fontSize: 36 }}>{palette.emoji}</Text>
          {cartEntry && (
            <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 11 }}>In cart: {cartEntry.quantity}</Text>
            </View>
          )}
        </View>
      )}
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{product.name}</Text>
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }} numberOfLines={2}>{product.description}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 16 }}>${wsPrice.toFixed(2)}</Text>
            {tier && tier.discount > 0 && (
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 10, textDecorationLine: 'line-through' }}>${basePrice.toFixed(2)}</Text>
            )}
          </View>
        </View>
        {tier && (
          <View style={{ backgroundColor: `${BLUE}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
            <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}{tier.discount > 0 ? ` −${tier.discount * 100}%` : ''}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flex: 1, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }}>Qty:</Text>
            <TextInput
              style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 16, flex: 1 }}
              value={qty}
              onChangeText={setQty}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>
          <Pressable onPress={() => onAdd(product, parsedQty)} style={{ backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>Add</Text>
          </Pressable>
        </View>
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

  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-products'], queryFn: () => api.wholesale.catalog(), retry: 1 });
  const products = data?.data ?? [];

  // ── Reorder detection ──────────────────────────────────────────────────
  const [pendingReorder, setPendingReorder] = useState<{ productId: string; qty: number; productName: string }[] | null>(null);
  const reorderProcessed = useRef(false);

  // Re-check AsyncStorage on every focus so reorder works even when the
  // catalog tab is already mounted (tabs don't unmount on tab switches).
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(WS_REORDER_KEY).then((val) => {
        if (val) {
          reorderProcessed.current = false; // allow the second effect to re-run
          setPendingReorder(JSON.parse(val));
          AsyncStorage.removeItem(WS_REORDER_KEY);
        }
      });
    }, []),
  );

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

  const totalCents = cart.reduce((sum, e) => sum + Math.round(getWholesalePrice(getPrice(e.product), e.quantity) * e.quantity * 100), 0);
  const totalQty   = cart.reduce((s, e) => s + e.quantity, 0);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCheckoutStep(0);
    setShowCheckout(true);
  };

  const handleContinue = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (checkoutStep === 0) {
      if (cart.length === 0) { Alert.alert('Cart is empty'); return; }
      if (totalCents < 5000) { Alert.alert('Minimum order', 'Minimum wholesale order is AUD 50.'); return; }
      setCheckoutStep(1);
      return;
    }
    if (checkoutStep === 1) {
      if (orderType === 'pickup') {
        if (!selectedDate || selectedTimeMins === null) { Alert.alert('Select pickup time', 'Please choose a date and time for your pickup.'); return; }
      } else {
        if (!selectedDate) { Alert.alert('Select delivery date', 'Please choose a delivery date.'); return; }
      }
      setCheckoutStep(2);
      return;
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
        totalCents,
        deliveryType:  orderType,
        scheduledDate: scheduledForDate?.toISOString(),
        deliveryAddress,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
              <Pressable onPress={() => setCheckoutStep((s) => s - 1)} style={styles.backBtn}>
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
                <View key={tab.label} style={styles.tabItem}>
                  <View style={styles.tabInner}>
                    <Feather name={tab.icon as any} size={13} color={active || done ? BLUE : MUTED} />
                    <Text style={[styles.tabLabel, { color: active ? TEXT : done ? BLUE : MUTED, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                      {tab.label}
                    </Text>
                  </View>
                  {active && <View style={[styles.tabUnderline, { backgroundColor: BLUE }]} />}
                </View>
              );
            })}
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 160 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── CART STEP ── */}
            {checkoutStep === 0 && (
              <>
                {cart.map((entry) => {
                  const wsPrice  = getWholesalePrice(getPrice(entry.product), entry.quantity);
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
                    <Text style={styles.summaryRowValue}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Order Total</Text>
                    <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                  {totalCents < 5000 && (
                    <Text style={{ color: '#EF4444', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                      Minimum wholesale order is AUD 50.00
                    </Text>
                  )}
                </View>
                <Text style={styles.shippingNote}>Choose pickup or delivery on the next step.</Text>
              </>
            )}

            {/* ── SHIPPING STEP ── */}
            {checkoutStep === 1 && (
              <>
                <Text style={styles.sectionLabel}>HOW WOULD YOU LIKE TO RECEIVE YOUR ORDER?</Text>

                <View style={styles.orderTypeRow}>
                  {[
                    { id: 'delivery', label: 'Delivery', sub: 'AUD 0.00 (invoiced)', icon: 'truck' as const },
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
                        <View>
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
                            <Text style={{ color: MUTED, fontSize: 13, fontFamily: 'Inter_400Regular' }}>No slots available</Text>
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

                <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryRowLabel}>Subtotal</Text>
                    <Text style={styles.summaryRowValue}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Order Total</Text>
                    <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                </View>
              </>
            )}

            {/* ── ORDER STEP ── */}
            {checkoutStep === 2 && (
              <>
                <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <Text style={[styles.paymentHeader, { color: TEXT }]}>Order Summary</Text>
                  {cart.map((entry) => {
                    const wsPrice = getWholesalePrice(getPrice(entry.product), entry.quantity);
                    return (
                      <View key={entry.product.id} style={styles.paymentItem}>
                        <Text style={[styles.paymentItemName, { color: TEXT }]}>{entry.product.name} × {entry.quantity}</Text>
                        <Text style={[styles.paymentItemPrice, { color: MUTED }]}>AUD {(wsPrice * entry.quantity).toFixed(2)}</Text>
                      </View>
                    );
                  })}
                  <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Order Total</Text>
                    <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                </View>

                <View style={[styles.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
                  <View style={styles.formFieldWrap}>
                    <Text style={styles.formFieldLabel}>PO Reference (optional)</Text>
                    <TextInput style={[styles.formInput, { color: TEXT, borderColor: BORDER }]} placeholder="e.g. PO-2024-001" placeholderTextColor={MUTED} value={poRef} onChangeText={setPoRef} />
                  </View>
                  <View style={styles.formFieldWrap}>
                    <Text style={styles.formFieldLabel}>Notes (optional)</Text>
                    <TextInput style={[styles.formInput, styles.notesInput, { color: TEXT, borderColor: BORDER }]} placeholder="Delivery instructions, special requests..." placeholderTextColor={MUTED} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
                  </View>
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
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Sticky bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: CARD, borderTopColor: BORDER }]}>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomTotalLabel}>TOTAL</Text>
            <Text style={styles.bottomTotalAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
          </View>
          <Pressable onPress={handleContinue} disabled={submitting || (checkoutStep === 0 && totalCents < 5000)}
            style={[styles.continueBtn, { backgroundColor: (checkoutStep === 0 && totalCents < 5000) ? '#C7C7CC' : BLUE, opacity: submitting ? 0.8 : 1 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueBtnText}>{getContinueLabel()}</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Catalog list ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.catalogHeader, { paddingTop: insets.top + 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 26, fontFamily: 'Inter_700Bold' }}>Wholesale Catalog</Text>
          {cart.length > 0 && (
            <Pressable onPress={handleOpenCheckout} style={[styles.cartBtn, { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12 }]}>
              <Feather name="shopping-cart" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{totalQty}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.searchBar, { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 }]}>
          <Feather name="search" size={14} color="rgba(255,255,255,0.8)" />
          <TextInput style={{ flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 }} placeholder="Search products..." placeholderTextColor="rgba(255,255,255,0.6)" value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x" size={14} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
                <Text style={{ color: active ? BLUE : '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WHOLESALE_TIERS.map((tier) => (
            <View key={tier.label} style={[styles.tierTag, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}</Text>
              {tier.discount > 0 && <Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', fontSize: 10 }}>−{tier.discount * 100}%</Text>}
            </View>
          ))}
        </ScrollView>
      </LinearGradient>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: cart.length > 0 ? 110 : 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Feather name="package" size={32} color={BORDER} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14 }}>No products available</Text>
            </View>
          }
          renderItem={({ item: product }) => (
            <ProductRow product={product} cartEntry={cart.find((e) => e.product.id === product.id)} onAdd={addToCart} />
          )}
        />
      )}

      {cart.length > 0 && (
        <Pressable onPress={handleOpenCheckout} style={[styles.floatingCart, { paddingBottom: insets.bottom + 10 }]}>
          <LinearGradient colors={['#40C0F2', '#2398D8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.floatingCartInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.floatingCartBadge}>
                <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }}>{totalQty}</Text>
              </View>
              <View>
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>View Cart</Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>{cart.length} line item{cart.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17 }}>${(totalCents / 100).toFixed(2)}</Text>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.85)" />
            </View>
          </LinearGradient>
        </Pressable>
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
  productCard:    { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  productThumbLg: { height: 120, borderRadius: 12 },
  floatingCart:   { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(245,246,250,0.95)', borderTopWidth: 1, borderTopColor: BORDER },
  floatingCartInner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 18, shadowColor: '#40C0F2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  floatingCartBadge:  { backgroundColor: '#fff', borderRadius: 10, minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  // Checkout header
  checkoutHeader:    { borderBottomWidth: 1, paddingBottom: 0 },
  checkoutHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkoutTitle:     { fontSize: 17, fontFamily: 'Inter_700Bold', color: TEXT, letterSpacing: 1.5 },
  checkoutSub:       { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  // Tabs
  tabBar:      { flexDirection: 'row' },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
  tabInner:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:    { fontSize: 11, letterSpacing: 0.5 },
  tabUnderline:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  // Section
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  // Cart items
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, height: 90 },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER, zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: TEXT },
  itemPrice:  { fontSize: 14, fontFamily: 'Inter_500Medium', color: TEXT },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  qtyBtn:     { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  qtyBtnText: { fontSize: 16, color: TEXT, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  qtyLabel:   { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: TEXT },
  // Summary
  summaryCard:       { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: MUTED },
  summaryRowValue:   { fontSize: 13, fontFamily: 'Inter_500Medium', color: TEXT },
  summaryTotalLabel: { fontFamily: 'Inter_700Bold', fontSize: 15, color: TEXT },
  summaryTotalValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: TEXT },
  summaryDivider:    { height: 1 },
  shippingNote:      { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED },
  // Order type
  orderTypeRow:   { flexDirection: 'row', gap: 10 },
  orderTypeCard:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  orderTypeIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT },
  orderTypeSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  // Delivery info
  deliveryInfoCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  deliveryInfoIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deliveryInfoTag:   { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  deliveryInfoTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT, marginTop: 2 },
  deliveryInfoSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 2 },
  // Date grid
  chooseDateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chooseDateTitle:  { fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT },
  dateGrid:         { flexDirection: 'row', gap: 10 },
  dateCard:         { flex: 1, borderRadius: 14, padding: 14, gap: 3 },
  dateDayName:      { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  dateDayNum:       { fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT },
  dateTimeRange:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED },
  // Time slots
  pickupTimeLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: TEXT, marginTop: 4 },
  timeGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timePill:        { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  timePillText:    { fontSize: 13, fontFamily: 'Inter_500Medium' },
  // Forms
  formCard:       { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  formFieldWrap:  { gap: 4 },
  formFieldLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: MUTED },
  formInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: BG },
  formRow:        { flexDirection: 'row', gap: 10 },
  formNote:       { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  notesInput:     { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  // Order step
  paymentHeader:    { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  paymentItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  paymentItemName:  { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  paymentItemPrice: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  orderDetailsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  orderDetailRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderDetailText:  { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  secureCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  secureText:       { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  // Bottom bar
  bottomBar:        { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  bottomTotal:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomTotalLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: TEXT, letterSpacing: 1 },
  bottomTotalAmount:{ fontSize: 20, fontFamily: 'Inter_700Bold', color: TEXT },
  continueBtn:      { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  continueBtnText:  { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
