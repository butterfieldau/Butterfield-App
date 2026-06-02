import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CardField, StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { getPalette } from '@/constants/categoryColors';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import { api, type ApiProduct } from '@/lib/api';
import {
  formatDateChip, formatTime, getDeliveryDates, getPickupDates,
  getPickupTimeMins, getSydneyNow, isSameDay,
} from '@/lib/dateUtils';

export const WS_CART_KEY          = '@ws_cart_v2';
export const WS_OPEN_CHECKOUT_KEY = '@ws_open_checkout';

const BG         = '#EFF6FF';
const CARD       = '#FFFFFF';
const LIGHT_BLUE = '#EBF8FF';
const BLUE       = '#1493FF';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const RED        = '#EF4444';
const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

const CHECKOUT_TABS = [
  { label: 'CART',     icon: 'shopping-bag' },
  { label: 'SHIPPING', icon: 'truck'         },
  { label: 'ORDER',    icon: 'file-text'     },
] as const;

interface PricingContext {
  tierId: string | null;
  tierName: string | null;
  qtyBreaks: Array<{ id: string; productId: string; minQty: number; unitPriceCents: number }>;
  customPrices: Array<{ id: string; productId: string; unitPriceCents: number | null }>;
}
function computePriceInfo(
  productId: string, qty: number, baseCents: number, ctx: PricingContext | null,
): { unitCents: number; isCustom: boolean; isQtyBreak: boolean } {
  if (!ctx || !baseCents) return { unitCents: baseCents, isCustom: false, isQtyBreak: false };
  const custom = ctx.customPrices.find((cp) => cp.productId === productId && cp.unitPriceCents);
  if (custom?.unitPriceCents) return { unitCents: custom.unitPriceCents, isCustom: true, isQtyBreak: false };
  const applicable = [...(ctx.qtyBreaks ?? [])]
    .filter((qb) => qb.productId === productId && qb.unitPriceCents && qty >= qb.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (applicable?.unitPriceCents) return { unitCents: applicable.unitPriceCents, isCustom: false, isQtyBreak: true };
  return { unitCents: baseCents, isCustom: false, isQtyBreak: false };
}
function baseCentsFor(p: ApiProduct): number {
  return (p as any).unitPriceCents ?? (p.prices?.[0]?.unit_amount ?? 0);
}
interface CartEntry { product: ApiProduct; quantity: number }

function estimateStripeFeeCents(amountCents: number) {
  return amountCents > 0 ? Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS) : 0;
}

function WholesaleCartScreenInner({ stripeReady }: { stripeReady: boolean }) {
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const { width: SCREEN_W } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const { createPaymentMethod, confirmPayment, handleNextAction } = useStripe();

  const [cart, setCart]       = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCheckout, setShowCheckout]         = useState(false);
  const [checkoutStep, setCheckoutStep]         = useState(0);
  const [orderType, setOrderType]               = useState<'pickup' | 'delivery'>('delivery');
  const [selectedDate, setSelectedDate]         = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);
  const [street, setStreet]                     = useState('');
  const [suburb, setSuburb]                     = useState('');
  const [postcode, setPostcode]                 = useState('');
  const [contactName, setContactName]           = useState('');
  const [contactPhone, setContactPhone]         = useState('');
  const [contactEmail, setContactEmail]         = useState('');
  const [poRef, setPoRef]                       = useState('');
  const [notes, setNotes]                       = useState('');
  const [submitting, setSubmitting]             = useState(false);

  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), staleTime: 60_000,
  });
  const account          = accountData?.data ?? null;
  const deliveryFeeCents = account?.deliveryFeeCents ?? 0;
  const minOrderCents: number = (account?.minOrderCents ?? 0) > 0
    ? (account?.minOrderCents ?? 0)
    : (account?.tier?.minOrderCents ?? 0);

  const { data: pricingData } = useQuery({
    queryKey: ['wholesale-pricing-context'], queryFn: () => api.wholesale.pricingContext(),
    staleTime: 60_000, retry: false,
  });
  const pricingCtx = (pricingData?.data ?? null) as PricingContext | null;
  const { data: savedMethodsData } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.payment.methods(),
    enabled: stripeReady,
    staleTime: 60_000,
  });
  const savedPaymentMethods = savedMethodsData?.data ?? [];
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [saveCardForNextTime, setSaveCardForNextTime] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([
      AsyncStorage.getItem(WS_CART_KEY),
      AsyncStorage.getItem(WS_OPEN_CHECKOUT_KEY),
    ]).then(([cartVal, openCheckout]) => {
      let parsed: CartEntry[] = [];
      try { parsed = cartVal ? JSON.parse(cartVal) : []; } catch {}
      setCart(parsed);
      if (openCheckout && parsed.length > 0) {
        AsyncStorage.removeItem(WS_OPEN_CHECKOUT_KEY);
        setCheckoutStep(0);
        setShowCheckout(true);
      }
      setLoading(false);
    });
  }, []));

  const saveCart = useCallback(async (next: CartEntry[]) => {
    setCart(next);
    await AsyncStorage.setItem(WS_CART_KEY, JSON.stringify(next));
  }, []);

  const updateQty = (id: string, qty: number) => {
    Haptics.selectionAsync();
    saveCart(qty <= 0 ? cart.filter(e => e.product.id !== id) : cart.map(e => e.product.id === id ? { ...e, quantity: qty } : e));
  };
  const removeItem = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveCart(cart.filter(e => e.product.id !== id));
  };

  const subtotalCents = cart.reduce((s, e) => {
    const bc = baseCentsFor(e.product);
    return s + computePriceInfo(e.product.id, e.quantity, bc, pricingCtx).unitCents * e.quantity;
  }, 0);
  const totalQty   = cart.reduce((s, e) => s + e.quantity, 0);
  const belowMin   = minOrderCents > 0 && subtotalCents < minOrderCents;
  const isNetAccount = Boolean(account?.creditEnabled) && (account?.paymentTerms ?? 'pay_on_order') !== 'pay_on_order';
  const baseTotalCents = subtotalCents + (orderType === 'delivery' ? deliveryFeeCents : 0);
  const stripeFeeCents = isNetAccount ? 0 : estimateStripeFeeCents(baseTotalCents);
  const totalCents = baseTotalCents + stripeFeeCents;

  const sydNow        = getSydneyNow();
  const deliveryDates = getDeliveryDates();
  const pickupDates   = getPickupDates();
  const pickupTimes   = selectedDate ? getPickupTimeMins(selectedDate, sydNow) : [];
  const deliveryPairs: (typeof deliveryDates[0] | null)[][] = [];
  for (let i = 0; i < deliveryDates.length; i += 2) deliveryPairs.push([deliveryDates[i], deliveryDates[i + 1] ?? null]);
  const pickupPairs: (Date | null)[][] = [];
  for (let i = 0; i < pickupDates.length; i += 2) pickupPairs.push([pickupDates[i], pickupDates[i + 1] ?? null]);

  const goToStep = useCallback((step: number) => {
    pagerRef.current?.scrollTo({ x: step * SCREEN_W, animated: true });
    setCheckoutStep(step);
  }, [SCREEN_W]);

  const handleProceedToCheckout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCheckoutStep(0);
    setShowCheckout(true);
  };
  const handleCloseCheckout = () => {
    if (checkoutStep > 0) { goToStep(checkoutStep - 1); return; }
    setShowCheckout(false);
  };

  const handleContinue = async () => {
    if (checkoutStep === 0) {
      if (cart.length === 0) { Alert.alert('Cart is empty'); return; }
      if (minOrderCents > 0 && subtotalCents < minOrderCents) {
        Alert.alert('Minimum order', `Minimum wholesale order is AUD ${(minOrderCents / 100).toFixed(2)}.`); return;
      }
      goToStep(1); return;
    }
    if (checkoutStep === 1) {
      if (orderType === 'pickup') {
        if (!selectedDate || selectedTimeMins === null) { Alert.alert('Select pickup time', 'Please choose a date and time.'); return; }
      } else {
        if (!selectedDate) { Alert.alert('Select delivery date', 'Please choose a delivery date.'); return; }
      }
      goToStep(2); return;
    }
    if (checkoutStep === 2) await handlePlaceOrder();
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
        ? `${street.trim()}, ${suburb.trim()} NSW ${postcode.trim()}` : undefined;
      let stripePaymentIntentId: string | undefined;
      let paymentMethodType = isNetAccount ? 'net_terms' : 'credit_card';

      if (!isNetAccount) {
        if (!stripeReady) {
          throw new Error('Payment processing is not available right now.');
        }

        if (selectedSavedPaymentMethodId && !showAddCardForm) {
          const savedPayment = await api.wholesale.confirmSavedMethod({
            items: cart.map((e) => ({ productId: e.product.id, qty: e.quantity })),
            deliveryType: orderType,
            paymentMethodId: selectedSavedPaymentMethodId,
          });
          if (savedPayment.requiresAction && savedPayment.clientSecret && savedPayment.paymentIntentId) {
            const { error } = await handleNextAction(savedPayment.clientSecret);
            if (error) throw new Error(error.message);
            const finalized = await api.wholesale.confirmIntent(savedPayment.paymentIntentId);
            if (!finalized.success) {
              throw new Error('We could not finalize that saved-card payment. Please try again.');
            }
          } else if (!savedPayment.success) {
            throw new Error('We could not charge that saved card. Please try another card.');
          }
          stripePaymentIntentId = savedPayment.paymentIntentId ?? undefined;
          paymentMethodType = 'saved_card';
        } else {
          if (saveCardForNextTime) {
            const { paymentMethod, error: paymentMethodError } = await createPaymentMethod({
              paymentMethodType: 'Card',
            });
            if (paymentMethodError) throw new Error(paymentMethodError.message);
            if (!paymentMethod?.id) throw new Error('We could not save that card. Please try again.');

            await api.wholesale.addCard({
              paymentMethodId: paymentMethod.id,
              isDefault: savedPaymentMethods.length === 0,
            });
            await qc.invalidateQueries({ queryKey: ['payment-methods'] });
            await qc.invalidateQueries({ queryKey: ['wholesale-cards'] });

            const savedPayment = await api.wholesale.confirmSavedMethod({
              items: cart.map((e) => ({ productId: e.product.id, qty: e.quantity })),
              deliveryType: orderType,
              paymentMethodId: paymentMethod.id,
            });
            if (savedPayment.requiresAction && savedPayment.clientSecret && savedPayment.paymentIntentId) {
              const { error } = await handleNextAction(savedPayment.clientSecret);
              if (error) throw new Error(error.message);
              const finalized = await api.wholesale.confirmIntent(savedPayment.paymentIntentId);
              if (!finalized.success) {
                throw new Error('We could not finalize your saved wholesale card. Please try again.');
              }
            } else if (!savedPayment.success) {
              throw new Error('We could not charge that card. Please try again.');
            }
            stripePaymentIntentId = savedPayment.paymentIntentId ?? undefined;
            paymentMethodType = 'saved_card';
          } else {
            const intent = await api.wholesale.createPaymentIntent({
              items: cart.map((e) => ({ productId: e.product.id, qty: e.quantity })),
              deliveryType: orderType,
              savePaymentMethod: false,
            });
            if (!intent.clientSecret) throw new Error('We could not prepare that payment.');
            const { error, paymentIntent } = await confirmPayment(intent.clientSecret, {
              paymentMethodType: 'Card',
            });
            if (error) throw new Error(error.message);
            if (!paymentIntent || paymentIntent.status !== 'Succeeded') {
              throw new Error('We could not complete your payment. Please try again.');
            }
            stripePaymentIntentId = paymentIntent.id;
            paymentMethodType = 'credit_card';
          }
        }
      }

      await api.wholesale.createOrder({
        items: cart.map(e => ({ productId: e.product.id, qty: e.quantity })),
        poReference:   poRef.trim() || undefined,
        notes:         [notes.trim(), contactName.trim(), contactPhone.trim()].filter(Boolean).join(' | ') || undefined,
        deliveryType:  orderType,
        scheduledDate: scheduledForDate?.toISOString(),
        deliveryAddress,
        stripePaymentIntentId,
        paymentMethodType,
      });
      qc.invalidateQueries({ queryKey: ['wholesale-orders'] });
      await saveCart([]);
      setPoRef(''); setNotes(''); setSelectedDate(null); setSelectedTimeMins(null);
      setStreet(''); setSuburb(''); setPostcode('');
      setShowCheckout(false); setCheckoutStep(0);
      Alert.alert(
        'Order Submitted!',
        isNetAccount
          ? 'Your order has been placed on account and will appear on your monthly statement.'
          : 'Your wholesale order has been paid and submitted successfully.',
      );
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSubmitting(false); }
  };

  const continueLabel = () => {
    if (submitting) return '…';
    if (checkoutStep === 0) return 'Continue to Shipping';
    if (checkoutStep === 1) return 'Continue to Order';
    return isNetAccount ? 'Place Order on Account' : 'Pay & Place Order';
  };

  useEffect(() => {
    if (savedPaymentMethods.length === 0) {
      setSelectedSavedPaymentMethodId(null);
      setShowAddCardForm(true);
      return;
    }
    if (!selectedSavedPaymentMethodId) {
      setSelectedSavedPaymentMethodId(
        savedPaymentMethods.find((savedMethod) => savedMethod.isDefault)?.id ?? savedPaymentMethods[0]?.id ?? null,
      );
    }
  }, [savedPaymentMethods, selectedSavedPaymentMethodId]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── PAGE HEADER ────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Cart</Text>
        {totalQty > 0 && <Text style={{ color: MUTED, fontWeight: '400', fontSize: 15 }}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : cart.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <View style={s.emptyIcon}><Feather name="shopping-cart" size={32} color={BLUE} /></View>
          <Text style={s.emptyTitle}>Cart is empty</Text>
          <Text style={s.emptySub}>Browse the catalog to add wholesale products to your order</Text>
          <Pressable onPress={() => router.navigate('/(wholesale)/catalog')} style={s.browseBtn}>
            <Text style={s.browseBtnText}>Browse Catalog</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cart}
          keyExtractor={e => e.product.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, gap: 10, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry }) => {
            const bc        = baseCentsFor(entry.product);
            const priceInfo = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx);
            const lineTotal = priceInfo.unitCents * entry.quantity;
            const imgUri    = (entry.product as any).images?.[0] ?? (entry.product as any).imageUrl;
            return (
              <View style={s.card}>
                {imgUri ? (
                  <Image source={{ uri: imgUri }} style={s.thumb} contentFit="cover" />
                ) : (
                  <View style={[s.thumb, { backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }]}>
                    <Feather name="package" size={24} color={BLUE} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Text style={s.productName} numberOfLines={2}>{entry.product.name}</Text>
                    <Pressable onPress={() => removeItem(entry.product.id)} hitSlop={10}>
                      <Feather name="x" size={15} color={MUTED} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.lineTotal}>AUD {(lineTotal / 100).toFixed(2)}</Text>
                    {priceInfo.isCustom  && <View style={s.priceBadge}><Text style={s.priceBadgeText}>Custom</Text></View>}
                    {priceInfo.isQtyBreak && <View style={s.priceBadge}><Text style={s.priceBadgeText}>Qty price</Text></View>}
                  </View>
                  <Text style={s.unitPrice}>AUD {(priceInfo.unitCents / 100).toFixed(2)} / unit</Text>
                  <View style={s.qtyRow}>
                    <Pressable onPress={() => updateQty(entry.product.id, entry.quantity - 1)} style={s.qtyBtn}>
                      <Feather name="minus" size={14} color={TEXT} />
                    </Pressable>
                    <Text style={s.qtyNum}>{entry.quantity}</Text>
                    <Pressable onPress={() => updateQty(entry.product.id, entry.quantity + 1)} style={s.qtyBtn}>
                      <Feather name="plus" size={14} color={TEXT} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={{ gap: 10, marginTop: 4 }}>
              <View style={s.summaryCard}>
                <View style={s.sumRow}>
                  <Text style={s.sumLabel}>Subtotal ({cart.length} product{cart.length !== 1 ? 's' : ''})</Text>
                  <Text style={s.sumValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
                </View>
                {orderType === 'delivery' && deliveryFeeCents > 0 && (
                  <>
                    <View style={s.sumDivider} />
                    <View style={s.sumRow}>
                      <Text style={s.sumLabel}>Delivery fee</Text>
                      <Text style={s.sumValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
                    </View>
                  </>
                )}
                {!isNetAccount && stripeFeeCents > 0 && (
                  <>
                    <View style={s.sumDivider} />
                    <View style={s.sumRow}>
                      <Text style={s.sumLabel}>Card processing fee</Text>
                      <Text style={s.sumValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
                    </View>
                  </>
                )}
                <View style={s.sumDivider} />
                <View style={s.sumRow}>
                  <Text style={[s.sumLabel, { fontWeight: '700', color: TEXT, fontSize: 15 }]}>Order Total</Text>
                  <Text style={[s.sumValue, { fontWeight: '700', fontSize: 16, color: BLUE }]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                </View>
                {belowMin && (
                  <Text style={{ color: RED, fontSize: 12, fontWeight: '400', marginTop: 4 }}>
                    Minimum order is AUD {(minOrderCents / 100).toFixed(2)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={handleProceedToCheckout}
                disabled={belowMin}
                style={[s.checkoutBtn, { backgroundColor: belowMin ? '#C7C7CC' : BLUE }]}
              >
                <Feather name="shopping-bag" size={16} color="#fff" />
                <Text style={s.checkoutBtnText}>Proceed to Checkout</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {/* ── CHECKOUT MODAL (covers entire screen including tab bar) ─────────── */}
      <Modal
        visible={showCheckout}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseCheckout}
      >
        <View style={{ flex: 1, backgroundColor: CARD }}>
          {/* Header */}
          <View style={[cs.header, { borderBottomColor: BORDER }]}>
            <View style={cs.headerTop}>
              <Pressable onPress={handleCloseCheckout} style={cs.backBtn}>
                <Feather name={checkoutStep > 0 ? 'chevron-left' : 'x'} size={checkoutStep > 0 ? 22 : 20} color={TEXT} />
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <Text style={cs.title}>CHECKOUT</Text>
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '400', marginTop: 1 }}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
            <View style={cs.tabs}>
              {CHECKOUT_TABS.map((tab, i) => {
                const active = checkoutStep === i;
                const done   = checkoutStep > i;
                return (
                  <Pressable key={tab.label} style={cs.tabItem} onPress={() => { if (i <= checkoutStep) goToStep(i); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Feather name={tab.icon as any} size={13} color={active || done ? BLUE : MUTED} />
                      <Text style={{ fontSize: 11, letterSpacing: 0.5, color: active ? TEXT : done ? BLUE : MUTED, fontWeight: active ? '600' : '400' }}>
                        {tab.label}
                      </Text>
                    </View>
                    {active && <View style={[cs.tabLine, { backgroundColor: BLUE }]} />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              ref={pagerRef}
              horizontal pagingEnabled scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onMomentumScrollEnd={(e) => {
                const newStep = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                if (newStep !== checkoutStep) setCheckoutStep(newStep);
              }}
              style={{ flex: 1 }}
            >
              {/* ── PAGE 0: CART ────────────────────────────────────────────── */}
              <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {cart.map((entry) => {
                  const bc       = baseCentsFor(entry.product);
                  const wsPrice  = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx).unitCents / 100;
                  const palette  = getPalette(entry.product.metadata?.category);
                  const imageUrl = (entry.product as any).images?.[0];
                  return (
                    <View key={entry.product.id} style={cs.itemCard}>
                      {imageUrl ? <Image source={{ uri: imageUrl }} style={cs.itemThumb} contentFit="cover" /> : (
                        <View style={[cs.itemThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ fontSize: 28 }}>{palette.emoji}</Text>
                        </View>
                      )}
                      <Pressable onPress={() => removeItem(entry.product.id)} style={cs.removeBtn}>
                        <Feather name="x" size={12} color={MUTED} />
                      </Pressable>
                      <View style={cs.itemBody}>
                        <Text style={cs.itemName}>{entry.product.name}</Text>
                        <Text style={cs.itemPrice}>AUD {(wsPrice * entry.quantity).toFixed(2)}</Text>
                        <View style={cs.itemQtyRow}>
                          <Pressable onPress={() => updateQty(entry.product.id, entry.quantity - 1)} style={cs.itemQtyBtn}>
                            <Text style={cs.itemQtyBtnText}>–</Text>
                          </Pressable>
                          <Text style={cs.itemQtyLabel}>QTY: {entry.quantity}</Text>
                          <Pressable onPress={() => updateQty(entry.product.id, entry.quantity + 1)} style={cs.itemQtyBtn}>
                            <Text style={cs.itemQtyBtnText}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
                <View style={cs.summaryCard}>
                  <View style={cs.sumRow}>
                    <Text style={cs.sumLabel}>Subtotal</Text>
                    <Text style={cs.sumValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
                  </View>
                  {orderType === 'delivery' && deliveryFeeCents > 0 && (
                    <><View style={cs.sumDivider} /><View style={cs.sumRow}><Text style={cs.sumLabel}>Delivery fee</Text><Text style={cs.sumValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text></View></>
                  )}
                  {!isNetAccount && stripeFeeCents > 0 && (
                    <><View style={cs.sumDivider} /><View style={cs.sumRow}><Text style={cs.sumLabel}>Card processing fee</Text><Text style={cs.sumValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text></View></>
                  )}
                  <View style={cs.sumDivider} />
                  <View style={cs.sumRow}>
                    <Text style={[cs.sumLabel, { fontWeight: '700', fontSize: 15, color: TEXT }]}>Order Total</Text>
                    <Text style={[cs.sumValue, { fontWeight: '700', fontSize: 16, color: TEXT }]}>AUD {(totalCents / 100).toFixed(2)}</Text>
                  </View>
                  {minOrderCents > 0 && subtotalCents < minOrderCents && (
                    <Text style={{ color: RED, fontSize: 12, fontWeight: '400', marginTop: 4 }}>Minimum wholesale order is AUD {(minOrderCents / 100).toFixed(2)}</Text>
                  )}
                </View>
                <Text style={{ textAlign: 'center', fontSize: 12, fontWeight: '400', color: MUTED }}>Choose pickup or delivery on the next step.</Text>
              </ScrollView>

              {/* ── PAGE 1: SHIPPING ────────────────────────────────────────── */}
              <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={cs.secLabel}>HOW WOULD YOU LIKE TO RECEIVE YOUR ORDER?</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {([
                    { id: 'delivery', label: 'Delivery', sub: deliveryFeeCents > 0 ? `AUD ${(deliveryFeeCents / 100).toFixed(2)}` : 'Free delivery', icon: 'truck' as const },
                    { id: 'pickup',   label: 'Pickup',   sub: 'In-store, free', icon: 'shopping-bag' as const },
                  ] as const).map((t) => {
                    const active = orderType === t.id;
                    return (
                      <Pressable key={t.id} onPress={() => { setOrderType(t.id); setSelectedDate(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                        style={[cs.typeCard, { backgroundColor: active ? LIGHT_BLUE : CARD, borderColor: active ? BLUE : BORDER, borderWidth: active ? 2 : 1 }]}>
                        <View style={[cs.typeIcon, { backgroundColor: active ? BLUE : BG }]}>
                          <Feather name={t.icon} size={18} color={active ? '#fff' : MUTED} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>{t.label}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '400', marginTop: 2, color: active ? BLUE : MUTED }}>{t.sub}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {orderType === 'delivery' && (
                  <View style={[cs.infoCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
                    <View style={[cs.infoIcon, { backgroundColor: BLUE }]}><Feather name="truck" size={16} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: BLUE }}>SYDNEY DELIVERY</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT, marginTop: 2 }}>Invoiced on dispatch</Text>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED, marginTop: 2 }}>Mondays &amp; Thursdays, 8am – 5pm. Order by 6pm the day before.</Text>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Feather name="calendar" size={18} color={TEXT} />
                  <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{orderType === 'delivery' ? 'Choose a delivery date' : 'Choose a pickup date'}</Text>
                </View>
                {orderType === 'delivery' ? deliveryPairs.map((pair, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                    {pair.map((slot, ci) => {
                      if (!slot) return <View key={ci} style={{ flex: 1 }} />;
                      const isSel  = selectedDate ? isSameDay(selectedDate, slot.date) : false;
                      const dayName = slot.date.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                      const dayDate = slot.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                      return (
                        <Pressable key={ci} onPress={() => { if (slot.available) { setSelectedDate(slot.date); Haptics.selectionAsync(); } }} disabled={!slot.available}
                          style={[cs.dateCard, { backgroundColor: isSel ? LIGHT_BLUE : CARD, borderColor: isSel ? BLUE : BORDER, borderWidth: isSel ? 2 : 1, opacity: slot.available ? 1 : 0.4 }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: BLUE }}>{dayName}</Text>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{dayDate}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>8am – 5pm</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )) : (
                  <>
                    {pickupPairs.map((pair, ri) => (
                      <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                        {pair.map((d, ci) => {
                          if (!d) return <View key={ci} style={{ flex: 1 }} />;
                          const isSel  = selectedDate ? isSameDay(selectedDate, d) : false;
                          const lbl    = formatDateChip(sydNow, d);
                          const dayFull = d.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                          const dayDate = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                          return (
                            <Pressable key={ci} onPress={() => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                              style={[cs.dateCard, { backgroundColor: isSel ? LIGHT_BLUE : CARD, borderColor: isSel ? BLUE : BORDER, borderWidth: isSel ? 2 : 1 }]}>
                              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: BLUE }}>{lbl === 'Today' ? 'TODAY' : lbl === 'Tomorrow' ? 'TOMORROW' : dayFull}</Text>
                              <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{dayDate}</Text>
                              <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>10am – 7pm</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                    {selectedDate && (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT, marginTop: 4 }}>Select a time</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {pickupTimes.length === 0
                            ? <Text style={{ color: MUTED, fontSize: 13 }}>No slots available</Text>
                            : pickupTimes.map((mins) => {
                              const isSel = selectedTimeMins === mins;
                              return (
                                <Pressable key={mins} onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                                  style={[cs.timePill, { backgroundColor: isSel ? BLUE : CARD, borderColor: isSel ? BLUE : BORDER }]}>
                                  <Text style={{ fontSize: 13, fontWeight: '500', color: isSel ? '#fff' : TEXT }}>{formatTime(mins)}</Text>
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
                    <Text style={cs.secLabel}>DELIVERY ADDRESS</Text>
                    <View style={cs.formCard}>
                      <AddressSearchInput
                        currentValue={street ? `${street}${suburb ? `, ${suburb}` : ''}` : undefined}
                        placeholder="Search delivery address…"
                        onSelect={(r) => {
                          setStreet(r.street);
                          setSuburb(r.suburb);
                          setPostcode(r.postcode);
                        }}
                      />
                      <Text style={cs.fieldLabel}>Street address</Text>
                      <TextInput style={cs.input} placeholder="Street address" placeholderTextColor={MUTED} value={street} onChangeText={setStreet} autoCapitalize="words" />
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}><Text style={cs.fieldLabel}>Suburb</Text><TextInput style={cs.input} placeholder="Suburb" placeholderTextColor={MUTED} value={suburb} onChangeText={setSuburb} autoCapitalize="words" /></View>
                        <View style={{ width: 110 }}><Text style={cs.fieldLabel}>Postcode</Text><TextInput style={cs.input} placeholder="2160" placeholderTextColor={MUTED} value={postcode} onChangeText={setPostcode} keyboardType="number-pad" maxLength={4} /></View>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>We currently only deliver in Sydney NSW.</Text>
                    </View>
                  </>
                )}
                <Text style={cs.secLabel}>YOUR DETAILS</Text>
                <View style={cs.formCard}>
                  {([
                    { label: 'Full name',     value: contactName,  setter: setContactName,  placeholder: 'Contact name',    keyboard: 'default' as const,       cap: 'words' as const },
                    { label: 'Mobile number', value: contactPhone, setter: setContactPhone, placeholder: '04XX XXX XXX',   keyboard: 'phone-pad' as const,     cap: 'none' as const  },
                    { label: 'Email',         value: contactEmail, setter: setContactEmail, placeholder: 'you@company.com', keyboard: 'email-address' as const, cap: 'none' as const  },
                  ]).map((f) => (
                    <View key={f.label} style={{ gap: 4 }}>
                      <Text style={cs.fieldLabel}>{f.label}</Text>
                      <TextInput style={cs.input} placeholder={f.placeholder} placeholderTextColor={MUTED} value={f.value} onChangeText={f.setter} keyboardType={f.keyboard} autoCapitalize={f.cap} />
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* ── PAGE 2: ORDER ───────────────────────────────────────────── */}
              <ScrollView style={{ width: SCREEN_W, backgroundColor: BG }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 4, color: TEXT }}>Order Summary</Text>
                {cart.map((entry) => {
                  const bc = baseCentsFor(entry.product);
                  const wsPrice = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx).unitCents / 100;
                  return (
                    <View key={entry.product.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '400', flex: 1, color: TEXT }}>{entry.product.name} × {entry.quantity}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>AUD {(wsPrice * entry.quantity).toFixed(2)}</Text>
                    </View>
                  );
                })}
                <View style={{ gap: 4 }}>
                  <Text style={cs.fieldLabel}>PO Reference (optional)</Text>
                  <TextInput style={cs.input} placeholder="e.g. PO-2024-001" placeholderTextColor={MUTED} value={poRef} onChangeText={setPoRef} />
                  <Text style={cs.fieldLabel}>Notes (optional)</Text>
                  <TextInput style={[cs.input, { height: 80, textAlignVertical: 'top', paddingTop: 12 }]} placeholder="Delivery instructions, special requests..." placeholderTextColor={MUTED} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
                </View>
                <View style={cs.formCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Feather name={orderType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={BLUE} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: TEXT }}>
                      {orderType === 'delivery' ? `Delivery${street ? ` · ${street}, ${suburb} NSW` : ''}` : 'In-store Pickup'}
                    </Text>
                  </View>
                  {selectedDate && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <Feather name="calendar" size={14} color={BLUE} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: TEXT }}>
                        {selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                        {orderType === 'pickup' && selectedTimeMins !== null ? ` at ${formatTime(selectedTimeMins)}` : ''}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[cs.formCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Feather name="file-text" size={14} color="#22C55E" />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '400', color: '#166534' }}>
                      {isNetAccount
                        ? 'This account can place wholesale orders on statement terms. The balance will be settled through your invoice cycle.'
                        : `Pay now to confirm this wholesale order immediately. Saved cards stay available for faster checkout next time. Card payments include a processing fee of AUD ${(stripeFeeCents / 100).toFixed(2)}.`}
                    </Text>
                  </View>
                </View>
                <Text style={cs.secLabel}>PAYMENT METHOD</Text>
                {isNetAccount ? (
                  <View style={cs.formCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Feather name="file-text" size={16} color={BLUE} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: TEXT }}>Net account</Text>
                        <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {account?.paymentTerms ? `${account.paymentTerms} terms` : 'Monthly statement'} · no card required for this order
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={cs.formCard}>
                    {savedPaymentMethods.length > 0 && (
                      <View style={{ gap: 8 }}>
                        {savedPaymentMethods.map((savedMethod) => {
                          const selected = selectedSavedPaymentMethodId === savedMethod.id && !showAddCardForm;
                          return (
                            <Pressable
                              key={savedMethod.id}
                              onPress={() => {
                                setSelectedSavedPaymentMethodId(savedMethod.id);
                                setShowAddCardForm(false);
                              }}
                              style={[
                                cs.savedMethodRow,
                                selected
                                  ? { borderColor: BLUE, backgroundColor: LIGHT_BLUE }
                                  : { borderColor: BORDER, backgroundColor: CARD },
                              ]}
                            >
                              <View style={cs.savedMethodIcon}>
                                <Feather name="credit-card" size={18} color={selected ? BLUE : MUTED} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={cs.savedMethodHeader}>
                                  <Text style={[cs.savedMethodBrand, selected && { color: BLUE }]}>
                                    {(savedMethod.brand ?? savedMethod.cardBrand).toUpperCase()} ending in {savedMethod.last4}
                                  </Text>
                                  {savedMethod.isDefault && (
                                    <View style={cs.defaultBadge}>
                                      <Text style={cs.defaultBadgeText}>Default</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={cs.savedMethodMeta}>
                                  Expires {`${String(savedMethod.expMonth ?? '').padStart(2, '0')}/${String(savedMethod.expYear ?? '').slice(-2)}`}
                                </Text>
                              </View>
                              <View style={[cs.radioOuter, selected ? { borderColor: BLUE } : { borderColor: BORDER }]}>
                                {selected && <View style={[cs.radioInner, { backgroundColor: BLUE }]} />}
                              </View>
                            </Pressable>
                          );
                        })}
                        <Pressable
                          onPress={() => {
                            setShowAddCardForm((current) => {
                              const next = !current;
                              if (next) setSelectedSavedPaymentMethodId(null);
                              else setSelectedSavedPaymentMethodId(
                                savedPaymentMethods.find((savedMethod) => savedMethod.isDefault)?.id ?? savedPaymentMethods[0]?.id ?? null,
                              );
                              return next;
                            });
                          }}
                          style={cs.addCardToggle}
                        >
                          <Feather name={showAddCardForm ? 'check-circle' : 'plus-circle'} size={16} color={BLUE} />
                          <Text style={cs.addCardToggleText}>
                            {showAddCardForm ? 'Use saved card instead' : 'Use a different card'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                    {(showAddCardForm || savedPaymentMethods.length === 0) && (
                      <>
                        <CardField
                          postalCodeEnabled={false}
                          style={{ height: 50, width: '100%' }}
                          cardStyle={{ backgroundColor: '#FFFFFF', textColor: TEXT, borderWidth: 0 }}
                          placeholders={{ number: '1234 1234 1234 1234' }}
                        />
                        <View style={cs.saveCardRowCompact}>
                          <View style={{ flex: 1 }}>
                            <Text style={cs.saveCardLabel}>Remember card for next time</Text>
                            <Text style={cs.saveCardSub}>
                              Stored securely by Stripe for quicker wholesale checkout next time.
                            </Text>
                          </View>
                          <Switch
                            value={saveCardForNextTime}
                            onValueChange={setSaveCardForNextTime}
                            trackColor={{ false: '#D1D5DB', true: '#BFDBFE' }}
                            thumbColor={saveCardForNextTime ? BLUE : '#FFFFFF'}
                          />
                        </View>
                      </>
                    )}
                  </View>
                )}
              </ScrollView>
            </ScrollView>

            {/* Bottom bar */}
            <View style={[cs.bottomBar, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
              {!isNetAccount && stripeFeeCents > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: MUTED }}>Card processing fee</Text>
                  <Text style={{ fontSize: 12, color: MUTED }}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: TEXT, letterSpacing: 1 }}>TOTAL</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT }}>AUD {(totalCents / 100).toFixed(2)}</Text>
              </View>
              <Pressable
                onPress={handleContinue}
                disabled={submitting || (checkoutStep === 0 && belowMin)}
                style={[cs.continueBtn, {
                  backgroundColor: (checkoutStep === 0 && belowMin) ? '#C7C7CC' : BLUE,
                  opacity: submitting ? 0.8 : 1,
                }]}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{continueLabel()}</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

export default function WholesaleCartScreen() {
  const { data: stripeConfigData } = useQuery({
    queryKey: ['stripe-config'],
    queryFn: () => api.payment.config(),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const stripePublishableKey = stripeConfigData?.data?.publishableKey ?? null;

  if (stripePublishableKey) {
    return (
      <StripeProvider publishableKey={stripePublishableKey}>
        <WholesaleCartScreenInner stripeReady />
      </StripeProvider>
    );
  }

  return <WholesaleCartScreenInner stripeReady={false} />;
}

const s = StyleSheet.create({
  card:           { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, ...GLASS_SHADOW },
  thumb:          { width: 72, height: 72, borderRadius: 10, flexShrink: 0 },
  productName:    { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT, lineHeight: 19 },
  lineTotal:      { fontSize: 15, fontWeight: '700', color: TEXT },
  unitPrice:      { fontSize: 11, fontWeight: '400', color: MUTED },
  qtyRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  qtyBtn:         { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  qtyNum:         { fontSize: 15, fontWeight: '700', color: TEXT, minWidth: 28, textAlign: 'center' },
  priceBadge:     { backgroundColor: '#EBF8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priceBadgeText: { fontSize: 10, fontWeight: '600', color: BLUE },
  summaryCard:    { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, padding: 16, gap: 10, ...GLASS_SHADOW },
  sumRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:       { fontSize: 13, fontWeight: '400', color: MUTED },
  sumValue:       { fontSize: 14, fontWeight: '600', color: TEXT },
  sumDivider:     { height: 1, backgroundColor: BORDER },
  checkoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 27, ...GLASS_SHADOW },
  checkoutBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyIcon:      { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 20, fontWeight: '700', color: TEXT },
  emptySub:       { fontSize: 14, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 20 },
  browseBtn:      { backgroundColor: BLUE, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 4 },
  browseBtnText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const cs = StyleSheet.create({
  header:     { borderBottomWidth: 1, paddingBottom: 0 },
  headerTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: 17, fontWeight: '700', color: TEXT, letterSpacing: 1.5 },
  tabs:       { flexDirection: 'row' },
  tabItem:    { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
  tabLine:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  secLabel:   { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, height: 90 },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER, zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontWeight: '600', color: TEXT },
  itemPrice:  { fontSize: 14, fontWeight: '500', color: TEXT },
  itemQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  itemQtyBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  itemQtyBtnText: { fontSize: 18, color: TEXT, fontWeight: '400', lineHeight: 22 },
  itemQtyLabel: { fontSize: 14, fontWeight: '700', color: TEXT, minWidth: 24, textAlign: 'center' },
  summaryCard:  { borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 16, gap: 10 },
  sumRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:     { fontSize: 13, fontWeight: '400', color: MUTED },
  sumValue:     { fontSize: 13, fontWeight: '500', color: TEXT },
  sumDivider:   { height: 1, backgroundColor: BORDER },
  typeCard:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  typeIcon:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  infoIcon:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dateCard:     { flex: 1, borderRadius: 14, padding: 14, gap: 3 },
  timePill:     { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  formCard:     { borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 16, gap: 10 },
  fieldLabel:   { fontSize: 13, fontWeight: '500', color: MUTED },
  input:        { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: BG, color: TEXT },
  savedMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  savedMethodIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  savedMethodHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  savedMethodBrand: { fontSize: 13, fontWeight: '700', color: TEXT },
  savedMethodMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
  defaultBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  defaultBadgeText: { color: BLUE, fontSize: 10, fontWeight: '700' },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  addCardToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  addCardToggleText: { color: BLUE, fontWeight: '600', fontSize: 13 },
  saveCardRowCompact: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  saveCardLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  saveCardSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  bottomBar:    { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  continueBtn:  { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
