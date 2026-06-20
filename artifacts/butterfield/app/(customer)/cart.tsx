import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStores } from '@/hooks/useStores';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import SuggestionTile from '@/components/SuggestionTile';
import { api, type ApiProduct, type SavedAddress, type ClaimedReward, type AuthProfile } from '@/lib/api';
import { getSuggestedProductsForCart } from '@/lib/productPairings';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import {
  formatDateChip,
  getRetailDeliveryDates,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';
import {
  getStoreAsapUnavailableReason,
  getStorePickupDates,
  getStorePickupTimeMins,
  isStoreOpenForAsap,
} from '@/lib/storeSchedule';
import PickupTimeWheelPicker from '@/components/PickupTimeWheelPicker';

import { PaymentStepWithStripe } from '@/components/customer/CheckoutPaymentStep';
import { CheckoutDeliveryStep } from '@/components/customer/CheckoutDeliveryStep';
import { CartItemRow } from '@/components/customer/CartItemRow';
import { CheckoutConfirmation } from '@/components/customer/CheckoutConfirmation';
import { useCheckout } from '@/hooks/useCheckout';
const BG       = '#EFF6FF';
const CARD     = '#FFFFFF';
const BLUE     = '#1493FF';
const GREEN    = '#22C55E';
const CHERRY   = '#D0312D';
const TEXT     = '#1C1C1E';
const MUTED    = '#8E8E93';
const BORDER   = '#E5E7EB';
const LIGHT_BLUE = '#E6F0FF';
const LOYALTY_POINT_VALUE_CENTS = 5;

const TABS = [
  { label: 'CART',     icon: 'shopping-bag' },
  { label: 'SHIPPING', icon: 'truck' },
  { label: 'PAYMENT',  icon: 'credit-card' },
] as const;

const DEFAULT_DELIVERY_FEE_CENTS = 1200;
const DEFAULT_DELIVERY_ELIGIBLE_CATEGORIES = new Set(['cookies', 'boxes', 'merch']);

const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;

function estimateStripeFeeCents(amountCents: number) {
  return amountCents > 0 ? Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS) : 0;
}

function calcTotals(subtotalCents: number, step: number, orderType: 'pickup' | 'delivery', paymentMethod: 'card' | 'pay_at_pickup', deliveryFeeCents = DEFAULT_DELIVERY_FEE_CENTS) {
  const deliv     = (step >= 1 && orderType === 'delivery') ? deliveryFeeCents : 0;
  const base      = subtotalCents + deliv;
  const stripeFee = paymentMethod === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(base);
  return { deliv, stripeFee, total: base + stripeFee };
}

function formatPickupMins(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}


interface Confirmation {
  orderId: string;
  orderNumber?: string | null;
  totalCents: number;
  type: string;
  scheduledLabel?: string;
  scheduledDateLabel?: string;
  paymentMethodType?: string;
  isScheduled?: boolean;
  rewardSavingsCents?: number;
  rewardName?: string;
}



export default function CartScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/(customer)/cart" compact />;
  return <CartContent />;
}

function CartContent() {
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, totalPriceCents, totalItems, addItemToCart, updateItemQuantity, removeCartItem, clearCart, cartRestoredFromSession, dismissCartRestoredBanner } = useCart();
  const qc = useQueryClient();
  const openSwipeableRef = useRef<Swipeable | null>(null);
  const routeParams = useLocalSearchParams<{ success?: string }>();

  const { data: allProductsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    staleTime: 5 * 60_000,
  });

  const { data: deliveryConfigRes } = useQuery({
    queryKey: ['delivery-config'],
    queryFn: () => api.delivery.config(),
    staleTime: 5 * 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['delivery-config'] });
    }, [qc])
  );

  const deliveryConfig         = deliveryConfigRes?.data;
  const deliveryFeeCents       = deliveryConfig?.feeCents ?? DEFAULT_DELIVERY_FEE_CENTS;
  const globalDeliveryEnabled  = !!deliveryConfig?.deliveryEnabled;
  const eligibleCategories     = new Set(deliveryConfig?.deliverableCategories ?? []);
  const pickupOnlyIds          = new Set(deliveryConfig?.pickupOnlyProductIds ?? []);

  const cartProductIdsKey = items.map((i) => i.productId).join(',');
  const cartSuggestedProducts = useMemo(() => {
    const allProducts = allProductsData?.data ?? [];
    if (allProducts.length === 0 || items.length === 0) return [];
    const cartProductIds = items.map((i) => i.productId);
    const cartCategories = items.map((i) => i.category ?? '').filter(Boolean);
    return getSuggestedProductsForCart(cartProductIds, cartCategories, allProducts, 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIdsKey, allProductsData]);

  // ── Queries needed before useCheckout ───────────────────────────────────
  const { data: addrData } = useQuery({
    queryKey: ['addresses'],
    queryFn:  () => api.addresses.list(),
    retry: 1,
  });
  const { data: meData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.auth.me(),
    enabled: !!user,
    retry: 1,
  });
  const { data: storesData } = useStores();
  const { data: stripeConfig } = useQuery({
    queryKey: ['stripe-config'],
    queryFn: () => api.payment.config(),
    retry: 1,
    staleTime: Infinity,
  });
  const savedAddresses  = addrData?.data ?? [];
  const defaultAddress  = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  const canPayAtPickup  = Boolean((meData?.profile as any)?.payAtPickupEnabled);
  const stripePublishableKey = stripeConfig?.data?.publishableKey ?? null;
  const stripeMerchantDisplayName = stripeConfig?.data?.merchantDisplayName ?? 'Butterfield Cookies';
  const preferredStoreId = (meData?.profile as AuthProfile | null)?.preferredStoreId ?? null;
  const stores = storesData?.data ?? [];
  const selectedStore = (preferredStoreId ? stores.find((store) => store.id === preferredStoreId) : null) ?? stores[0] ?? null;

  // ── Checkout state and logic ──────────────────────────────────────────────
  const {
    step, setStep,
    orderType, setOrderType,
    selectedDate, setSelectedDate,
    selectedTimeMins, setSelectedTimeMins,
    pickupMode, setPickupMode,
    street, setStreet,
    suburb, setSuburb,
    postcode, setPostcode,
    addrState, setAddrState,
    apt, setApt,
    selectedAddressId, setSelectedAddressId,
    contactName, setContactName,
    contactPhone, setContactPhone,
    contactEmail, setContactEmail,
    notes, setNotes,
    loading, setLoading,
    subtotalCents,
    stripeFeeCents,
    totalCents,
    deliveryEnabled,
    showMixedDeliveryMessage,
    sydNow,
    storeOpen,
    deliveryDates,
    pickupDates,
    validSlots,
    fillFromAddress,
    handleContinue,
  } = useCheckout({
    totalPriceCents,
    items,
    deliveryConfig,
    selectedStore,
    deliveryFeeCents,
    globalDeliveryEnabled,
    eligibleCategories,
    pickupOnlyIds,
    meData,
    user,
  });

  const [confirmation, setConfirmation]       = useState<Confirmation | null>(null);
  const successCardOpacity = useSharedValue(0);
  const successCardScale = useSharedValue(0.92);
  const pointsOpacity = useSharedValue(0);
  const pointsTranslate = useSharedValue(14);
  const characterProgress = useSharedValue(0);

  useEffect(() => {
    if (!confirmation) {
      successCardOpacity.value = 0;
      successCardScale.value = 0.92;
      pointsOpacity.value = 0;
      pointsTranslate.value = 14;
      characterProgress.value = 0;
      return;
    }
    if (routeParams.success !== '1') {
      router.replace('/(customer)/cart?success=1');
    }
    successCardOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    successCardScale.value = withSpring(1, { damping: 14, stiffness: 150 });
    pointsOpacity.value = withDelay(150, withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }));
    pointsTranslate.value = withDelay(150, withSpring(0, { damping: 16, stiffness: 160 }));
    characterProgress.value = withDelay(120, withSpring(1, { damping: 13, stiffness: 120 }));
  }, [confirmation, characterProgress, pointsOpacity, pointsTranslate, routeParams.success, successCardOpacity, successCardScale]);

  const successCardStyle = useAnimatedStyle(() => ({
    opacity: successCardOpacity.value,
    transform: [{ scale: successCardScale.value }],
  }));

  const pointsStyle = useAnimatedStyle(() => ({
    opacity: pointsOpacity.value,
    transform: [{ translateY: pointsTranslate.value }],
  }));

  const characterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(characterProgress.value, [0, 0.12, 1], [0, 1, 1]),
    transform: [
      { translateY: interpolate(characterProgress.value, [0, 1], [220, 0]) },
      { scale: interpolate(characterProgress.value, [0, 1], [0.92, 1.05]) },
    ],
  }));

  const canExitCart = step === 0;

  const edgeBackPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          canExitCart && gestureState.x0 <= 32 && gestureState.dx > 14 && Math.abs(gestureState.dy) < 16,
        onPanResponderRelease: (_, gestureState) => {
          if (!canExitCart) return;
          if (gestureState.x0 <= 32 && gestureState.dx > 72) {
            Haptics.selectionAsync();
            router.back();
          }
        },
      }),
    [canExitCart],
  );

  // Auto-fill default address when delivery tab is opened
  useEffect(() => {
    if (orderType === 'delivery' && defaultAddress && !street) {
      fillFromAddress(defaultAddress);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, defaultAddress]);

  const handlePlaceOrder = async (opts: {
    stripePaymentIntentId?: string;
    paymentMethodType: string;
    discountCode?: string;
    discountCodeId?: string;
    discountAmountCents?: number;
    claimedRewardId?: string;
    loyaltyPointsUsed?: number;
    useFreeCoffeeReward?: boolean;
  }) => {
    setLoading(true);
    try {
      let scheduledForDate: Date | undefined;
      let scheduledLabel: string | undefined;
      let scheduledDateLabel: string | undefined;
      if (orderType === 'pickup') {
        if (pickupMode === 'asap') {
          scheduledLabel = 'Pickup: Within 10 minutes';
        } else if (selectedDate && selectedTimeMins !== null) {
          const d = new Date(selectedDate);
          d.setHours(Math.floor(selectedTimeMins / 60), selectedTimeMins % 60, 0, 0);
          scheduledForDate = d;
          const dateTimePart = `${formatDateChip(sydNow, selectedDate)}, ${formatPickupMins(selectedTimeMins)}`;
          scheduledLabel = `Pickup ${dateTimePart}`;
          scheduledDateLabel = dateTimePart;
        }
      } else if (orderType === 'delivery' && selectedDate) {
        scheduledForDate = selectedDate;
        const datePart = selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
        scheduledLabel = `Delivery on ${datePart}`;
        scheduledDateLabel = datePart;
      }
      const aptPart = apt.trim() ? `${apt.trim()}/` : '';
      const deliveryAddress = orderType === 'delivery'
        ? `${aptPart}${street.trim()}, ${suburb.trim()} ${addrState} ${postcode.trim()}`
        : undefined;
      const order = await api.orders.create({
        items: items.map((i) => ({
          productId:      i.productId,
          productName:    i.productName,
          variantId:      i.variantId,
          variantName:    i.variantName,
          basePriceCents: i.basePriceCents,
          selectedOptions: i.selectedOptions,
          quantity:       i.quantity,
          unitPriceCents: i.unitPriceCents,
          totalCents:     i.unitPriceCents * i.quantity,
          category:       i.category,
        })),
        type:             orderType,
        scheduledFor:     scheduledForDate?.toISOString(),
        notes:            notes.trim() || undefined,
        contactName:      contactName.trim() || undefined,
        contactPhone:     contactPhone.trim() || undefined,
        contactEmail:     contactEmail.trim() || undefined,
        totalCents,
        deliveryAddress,
        deliveryPostcode: orderType === 'delivery' ? postcode.trim() : undefined,
        deliveryState:    orderType === 'delivery' ? 'NSW' : undefined,
        paymentMethod:    opts.paymentMethodType === 'pay_at_pickup' ? 'pay_at_pickup' : 'card',
        stripePaymentIntentId: opts.stripePaymentIntentId,
        loyaltyPointsUsed: opts.loyaltyPointsUsed,
        discountCode:     opts.discountCode,
        discountCodeId:   opts.discountCodeId,
        paymentMethodType: opts.paymentMethodType,
        claimedRewardId:  opts.claimedRewardId,
        storeId: orderType === 'pickup' ? selectedStore?.id : undefined,
        useFreeCoffeeReward: opts.useFreeCoffeeReward || undefined,
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const serverTotal = order.data.totalCents ?? totalCents;
      setConfirmation({ orderId: order.data.id, orderNumber: order.data.orderNumber, totalCents: serverTotal, type: orderType, scheduledLabel, scheduledDateLabel, paymentMethodType: opts.paymentMethodType, isScheduled: (order.data as any).status === 'scheduled', rewardSavingsCents: order.rewardSavingsCents, rewardName: order.rewardName });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getContinueLabel = () => {
    if (loading) return '…';
    if (step === 0) return 'Continue to shipping';
    return 'Continue to payment';
  };

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (confirmation) {
    return <CheckoutConfirmation confirmation={confirmation} clearCart={clearCart} insets={insets} />;
  }

  // ── Empty cart ───────────────────────────────────────────────────────────
  if (items.length === 0 && step !== 2) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 60 }]} {...edgeBackPan.panHandlers}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={[styles.emptyBackBtn, { top: insets.top + 12 }]}
        >
          <Feather name="chevron-left" size={22} color={TEXT} />
        </Pressable>
        <View style={[styles.emptyIconCircle, { backgroundColor: BG }]}>
          <Feather name="shopping-bag" size={36} color={MUTED} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySub}>Add something delicious from the menu</Text>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setStep(2); }}
          style={[styles.continueBtn, { backgroundColor: CHERRY, paddingHorizontal: 28, marginTop: 8 }]}
        >
          <Text style={styles.continueBtnText}>Redeem a free reward</Text>
        </Pressable>
      </View>
    );
  }

  // ── Cart step ────────────────────────────────────────────────────────────
  const renderCartStep = () => (
    <View style={styles.stepWrap}>
      {/* Stale cart restoration banner */}
      {cartRestoredFromSession && (
        <View style={styles.restoredBanner}>
          <Feather name="shopping-bag" size={15} color="#0369A1" style={{ marginTop: 1 }} />
          <Text style={styles.restoredBannerText}>
            You left something behind — your cart has been restored.
          </Text>
          <Pressable onPress={() => { clearCart(); dismissCartRestoredBanner(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Text style={styles.restoredBannerClear}>Clear</Text>
          </Pressable>
          <Pressable onPress={dismissCartRestoredBanner} hitSlop={8}>
            <Feather name="x" size={15} color="#0369A1" />
          </Pressable>
        </View>
      )}
      {items.map((item) => (
        <CartItemRow
          key={item.cartItemId}
          item={item}
          onRemove={() => removeCartItem(item.cartItemId)}
          updateItemQuantity={updateItemQuantity}
          openSwipeableRef={openSwipeableRef}
        />
      ))}

      {/* ── You may also like ─────────────────────────────────────────── */}
      {cartSuggestedProducts.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.sectionLabel, { fontWeight: '700', marginBottom: 10, fontSize: 13, color: '#1C1C1E', letterSpacing: 0 }]}>
            You may also like
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingRight: 4 }}
          >
            {cartSuggestedProducts.map((p) => (
                <SuggestionTile
                  key={p.id}
                  product={p}
                  onPress={() => {
                    qc.prefetchQuery({ queryKey: ['product-detail-route', p.id], queryFn: () => api.products.get(p.id), staleTime: 60_000 });
                    setSelectedProduct(p);
                    router.push({ pathname: '/product', params: { id: p.id } } as any);
                  }}
                  onAddToCart={() => {
                    addItemToCart({
                      productId:       p.id,
                      productName:     p.name,
                      basePriceCents:  (p as any).priceCents ?? p.prices?.[0]?.unit_amount ?? 0,
                      selectedOptions: [],
                      quantity:        1,
                      imageUrl:        p.images?.[0],
                      category:        (p as any).category ?? p.metadata?.category,
                      isCoffee:        false,
                    });
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

      <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Subtotal</Text>
          <Text style={styles.summaryRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Estimated card fee</Text>
          <Text style={styles.summaryRowValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Total</Text>
          <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.shippingNote}>Choose pickup or delivery on the next step.</Text>
    </View>
  );


  // ── Payment step ─────────────────────────────────────────────────────────
  const renderPaymentStep = () => (
    <View style={styles.stepWrap}>
      {items.length === 0 && (
        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#BBF7D0' }}>
          <Feather name="gift" size={18} color="#16A34A" />
          <Text style={{ flex: 1, color: '#15803D', fontSize: 13, fontWeight: '500', lineHeight: 18 }}>
            Select a free reward below — your item will be added automatically at checkout.
          </Text>
        </View>
      )}
      <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <Text style={[styles.paymentHeader, { color: TEXT }]}>Order Summary</Text>
        {items.length === 0 ? (
          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '400' }}>No items yet — select a reward below</Text>
        ) : null}
        {items.map((item) => (
          <View key={item.cartItemId} style={styles.paymentItem}>
            <Text style={[styles.paymentItemName, { color: TEXT }]}>{item.productName} × {item.quantity}</Text>
            <Text style={[styles.paymentItemPrice, { color: MUTED }]}>AUD {((item.unitPriceCents / 100) * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Subtotal</Text>
          <Text style={styles.summaryRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        {orderType === 'delivery' && (
          <>
            <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryRowLabel}>Delivery (Sydney NSW)</Text>
              <Text style={styles.summaryRowValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.orderDetailsCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.orderDetailRow}>
          <Feather name={orderType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={BLUE} />
          <Text style={[styles.orderDetailText, { color: TEXT }]}>
            {orderType === 'delivery'
              ? `Delivery · ${street}, ${suburb} NSW ${postcode}`
              : `In-store Pickup · ${selectedStore?.name ?? 'Your selected store'}`}
          </Text>
        </View>
        {orderType === 'pickup' && pickupMode === 'asap' ? (
          <View style={styles.orderDetailRow}>
            <Feather name="clock" size={14} color={BLUE} />
            <Text style={[styles.orderDetailText, { color: TEXT }]}>ASAP from your selected store</Text>
          </View>
        ) : selectedDate ? (
          <View style={styles.orderDetailRow}>
            <Feather name="calendar" size={14} color={BLUE} />
            <Text style={[styles.orderDetailText, { color: TEXT }]}>
              {orderType === 'pickup' && selectedTimeMins !== null
                ? `${formatDateChip(sydNow, selectedDate)}, ${formatPickupMins(selectedTimeMins)}`
                : selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
        ) : null}
        {contactName && (
          <View style={styles.orderDetailRow}>
            <Feather name="user" size={14} color={BLUE} />
            <Text style={[styles.orderDetailText, { color: TEXT }]}>{contactName}</Text>
          </View>
        )}
      </View>

      {stripePublishableKey ? (
        <StripeProvider publishableKey={stripePublishableKey}>
          <PaymentStepWithStripe
            items={items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, selectedOptions: i.selectedOptions }))}
            orderType={orderType}
            subtotalCents={subtotalCents}
            deliveryFeeCents={deliveryFeeCents}
            canPayAtPickup={canPayAtPickup}
            stripeReady
            onSuccess={handlePlaceOrder}
          />
        </StripeProvider>
      ) : (
        <PaymentStepWithStripe
          items={items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, selectedOptions: i.selectedOptions }))}
          orderType={orderType}
          subtotalCents={subtotalCents}
          deliveryFeeCents={deliveryFeeCents}
          canPayAtPickup={canPayAtPickup}
          stripeReady={false}
          onSuccess={handlePlaceOrder}
        />
      )}
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }} {...edgeBackPan.panHandlers}>
      <StatusBar barStyle="light-content" />
      {/* Fixed header — blue gradient matching main customer portal */}
      <LinearGradient
        colors={['#1493FF', '#3CBBEE']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.checkoutHeader, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.checkoutHeaderTop}>
          {step > 0 ? (
            <Pressable onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.back();
              }}
              style={styles.backBtn}
            >
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
          )}
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.checkoutTitle}>CHECKOUT</Text>
            <Text style={styles.checkoutSub}>{items.length === 0 && step === 2 ? 'Reward checkout' : `${totalItems} item${totalItems !== 1 ? 's' : ''}`}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab, i) => {
            const active = step === i;
            const done   = step > i;
            return (
              <View key={tab.label} style={styles.tabItem}>
                <View style={styles.tabInner}>
                  <Feather name={tab.icon as any} size={13} color={active ? '#fff' : done ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)'} />
                  <Text style={[styles.tabLabel, { color: active ? '#fff' : done ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontWeight: active ? '600' : '400' }]}>
                    {tab.label}
                  </Text>
                </View>
                {active && <View style={[styles.tabUnderline, { backgroundColor: 'rgba(255,255,255,0.9)' }]} />}
              </View>
            );
          })}
        </View>
      </LinearGradient>

      {/* Scrollable content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && renderCartStep()}
          {step === 1 && (
            <CheckoutDeliveryStep
              orderType={orderType}
              setOrderType={setOrderType}
              pickupMode={pickupMode}
              setPickupMode={setPickupMode}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedTimeMins={selectedTimeMins}
              setSelectedTimeMins={setSelectedTimeMins}
              street={street}
              setStreet={setStreet}
              suburb={suburb}
              setSuburb={setSuburb}
              postcode={postcode}
              setPostcode={setPostcode}
              addrState={addrState}
              apt={apt}
              setApt={setApt}
              selectedAddressId={selectedAddressId}
              setSelectedAddressId={setSelectedAddressId}
              contactName={contactName}
              setContactName={setContactName}
              contactPhone={contactPhone}
              setContactPhone={setContactPhone}
              contactEmail={contactEmail}
              setContactEmail={setContactEmail}
              notes={notes}
              setNotes={setNotes}
              subtotalCents={subtotalCents}
              stripeFeeCents={stripeFeeCents}
              totalCents={totalCents}
              deliveryFeeCents={deliveryFeeCents}
              deliveryEnabled={deliveryEnabled}
              showMixedDeliveryMessage={showMixedDeliveryMessage}
              deliveryConfig={deliveryConfig}
              selectedStore={selectedStore}
              storeOpen={storeOpen}
              sydNow={sydNow}
              deliveryDates={deliveryDates}
              pickupDates={pickupDates}
              validSlots={validSlots}
              savedAddresses={savedAddresses}
              fillFromAddress={fillFromAddress}
            />
          )}
          {step === 2 && renderPaymentStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom bar — only for cart (step 0) and shipping (step 1) */}
      {!confirmation && step < 2 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: CARD, borderTopColor: BORDER }]}>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomTotalLabel}>TOTAL</Text>
            <Text style={styles.bottomTotalAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
          </View>
          <Pressable
            onPress={handleContinue}
            disabled={loading}
            style={[styles.continueBtn, { backgroundColor: CHERRY, opacity: loading ? 0.8 : 1 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.continueBtnText}>{getContinueLabel()}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  checkoutHeader:    { paddingBottom: 0 },
  checkoutHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkoutTitle:     { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 1.5 },
  checkoutSub:       { fontSize: 12, fontWeight: '400', marginTop: 1, color: 'rgba(255,255,255,0.75)' },
  // Tab bar
  tabBar:       { flexDirection: 'row' },
  tabItem:      { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabInner:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:     { fontSize: 11, letterSpacing: 0.5 },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  // Content wrapper
  stepWrap:  { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  // Stale cart restored banner
  restoredBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E0F2FE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  restoredBannerText: { flex: 1, fontSize: 13, color: '#0369A1', fontWeight: '400', lineHeight: 18 },
  restoredBannerClear: { fontSize: 13, color: '#0369A1', fontWeight: '700' },
  // Summary card
  summaryCard:      { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:  { fontSize: 13, fontWeight: '400', color: '#8E8E93' },
  summaryRowValue:  { fontSize: 13, fontWeight: '500', color: '#1C1C1E' },
  summaryTotalLabel:{ fontWeight: '700', fontSize: 15, color: '#1C1C1E' },
  summaryTotalValue:{ fontWeight: '700', fontSize: 16, color: '#1C1C1E' },
  summaryDivider:   { height: 1 },
  shippingNote:     { textAlign: 'center', fontSize: 12, fontWeight: '400', color: '#8E8E93', paddingVertical: 4 },
  // Payment step
  paymentHeader:    { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  paymentItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  paymentItemName:  { fontSize: 13, fontWeight: '400', flex: 1 },
  paymentItemPrice: { fontSize: 13, fontWeight: '500' },
  paymentChoiceCard:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  orderDetailsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  orderDetailRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderDetailText:  { flex: 1, fontSize: 13, fontWeight: '400' },
  secureCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  secureText:       { flex: 1, fontSize: 12, fontWeight: '400' },
  // Bottom bar
  bottomBar:       { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  bottomTotal:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomTotalLabel:{ fontSize: 13, fontWeight: '700', color: '#1C1C1E', letterSpacing: 1 },
  bottomTotalAmount:{ fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  continueBtn:     { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Empty
  emptyWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyBackBtn:    { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:      { fontSize: 20, fontWeight: '600', color: '#1C1C1E' },
  emptySub:        { fontSize: 14, fontWeight: '400', color: '#8E8E93' },
  // Saved address chips
  savedAddrChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  savedAddrChipText: { fontSize: 12, fontWeight: '600' },
  savedAddrDot:      { width: 6, height: 6, borderRadius: 3, marginLeft: 2 },
  // State pills (delivery form)
  statePill:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statePillText: { fontSize: 12, fontWeight: '600' },
});
