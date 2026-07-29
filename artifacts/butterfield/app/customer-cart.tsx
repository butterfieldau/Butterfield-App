import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatformPay } from '@stripe/stripe-react-native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStores } from '@/hooks/useStores';
import { useNearbyStore } from '@/hooks/useNearbyStore';
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import SuggestionTile from '@/components/SuggestionTile';
import { api, type AuthProfile } from '@/lib/api';
import { getSuggestedProductsForCart, getProductCategory } from '@/lib/productPairings';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { formatDateChip } from '@/lib/dateUtils';
import { CheckoutCombinedStep } from '@/components/customer/CheckoutCombinedStep';
import { CartItemRow } from '@/components/customer/CartItemRow';
import { CheckoutConfirmation } from '@/components/customer/CheckoutConfirmation';
import { useCheckout } from '@/hooks/useCheckout';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const CHERRY = '#D20001';
const TEXT   = '#111111';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';

const DEFAULT_DELIVERY_FEE_CENTS = 1200;

function formatPickupMins(totalMins: number): string {
  const h    = Math.floor(totalMins / 60);
  const m    = totalMins % 60;
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
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
  freeCoffeeDiscountCents?: number;
  rewardName?: string;
  tableNumber?: string;
  storeName?: string;
}

export default function CartScreen() {
  const { user } = useAuth();
  const { clearCart } = useCart();
  const insets = useSafeAreaInsets();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  if (confirmation) {
    return <CheckoutConfirmation confirmation={confirmation} clearCart={clearCart} insets={insets} />;
  }
  if (!user) return <LoggedOutAccountPrompt redirectTo="/(customer)" compact />;
  return <CartContent onConfirm={setConfirmation} />;
}

function CartContent({ onConfirm }: { onConfirm: (c: Confirmation) => void }) {
  const insets     = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user }   = useAuth();
  const { isPlatformPaySupported } = usePlatformPay();
  const [applePaySupported, setApplePaySupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    isPlatformPaySupported().then((ok) => {
      if (mounted) setApplePaySupported(ok);
    });
    return () => { mounted = false; };
  }, []);

  const { items, totalPriceCents, totalItems, addItemToCart, updateItemQuantity, removeCartItem, clearCart, cartRestoredFromSession, dismissCartRestoredBanner } = useCart();
  const qc = useQueryClient();
  const openSwipeableRef = useRef<Swipeable | null>(null);

  const { data: allProductsData } = useQuery({ queryKey: ['products'], queryFn: () => api.products.list(), staleTime: 5 * 60_000 });
  const { data: deliveryConfigRes } = useQuery({ queryKey: ['delivery-config'], queryFn: () => api.delivery.config(), staleTime: 5 * 60_000 });
  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ['delivery-config'] }); }, [qc]));

  const deliveryConfig        = deliveryConfigRes?.data;
  const deliveryFeeCents      = deliveryConfig?.feeCents ?? DEFAULT_DELIVERY_FEE_CENTS;
  const globalDeliveryEnabled = !!deliveryConfig?.deliveryEnabled;
  const eligibleCategories    = new Set(deliveryConfig?.deliverableCategories ?? []);
  const pickupOnlyIds         = new Set(deliveryConfig?.pickupOnlyProductIds ?? []);

  const cartProductIdsKey = items.map((i) => i.productId).join(',');
  const cartSuggestedProducts = useMemo(() => {
    const all = allProductsData?.data ?? [];
    if (all.length === 0 || items.length === 0) return [];
    return getSuggestedProductsForCart(
      items.map((i) => i.productId),
      items.map((i) => i.category ?? '').filter(Boolean),
      all, 4,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIdsKey, allProductsData]);

  const { data: addrData }     = useQuery({ queryKey: ['addresses'],    queryFn: () => api.addresses.list(), retry: 1 });
  const { data: meData }       = useQuery({ queryKey: ['auth-me'],       queryFn: () => api.auth.me(), enabled: !!user, retry: 1 });
  const { data: storesData }   = useStores();
  const { data: stripeConfig } = useQuery({ queryKey: ['stripe-config'], queryFn: () => api.payment.config(), retry: 1, staleTime: Infinity });

  const savedAddresses       = addrData?.data ?? [];
  const defaultAddress       = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  const canPayAtPickup       = Boolean((meData?.profile as any)?.payAtPickupEnabled);
  const stripePublishableKey = stripeConfig?.data?.publishableKey ?? null;
  const preferredStoreId     = (meData?.profile as AuthProfile | null)?.preferredStoreId ?? null;
  const stores               = storesData?.data ?? [];
  const selectedStore        = (preferredStoreId ? stores.find((s) => s.id === preferredStoreId) : null) ?? stores[0] ?? null;

  const { nearbyStore } = useNearbyStore();

  const checkout = useCheckout({
    totalPriceCents, items, deliveryConfig, selectedStore,
    deliveryFeeCents, globalDeliveryEnabled, eligibleCategories, pickupOnlyIds, meData, user,
    nearbyStore,
  });
  const { step, setStep, orderType, tableNumber, selectedDate, selectedTimeMins, pickupMode, street, suburb, addrState, postcode, loading, setLoading, subtotalCents, stripeFeeCents, totalCents, deliveryEnabled, sydNow, fillFromAddress, handleContinue } = checkout;

  // Disable native swipe-back on step 1
  useEffect(() => { navigation.setOptions({ gestureEnabled: step === 0 }); }, [navigation, step]);

  // Auto-fill default address when switching to delivery
  useEffect(() => {
    if (orderType === 'delivery' && defaultAddress && !street) fillFromAddress(defaultAddress);
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
          scheduledForDate   = d;
          const part         = `${formatDateChip(sydNow, selectedDate)}, ${formatPickupMins(selectedTimeMins)}`;
          scheduledLabel     = `Pickup ${part}`;
          scheduledDateLabel = part;
        }
      } else if (orderType === 'delivery' && selectedDate) {
        scheduledForDate   = selectedDate;
        const datePart     = selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
        scheduledLabel     = `Delivery on ${datePart}`;
        scheduledDateLabel = datePart;
      }
      const aptPart = checkout.apt.trim() ? `${checkout.apt.trim()}/` : '';
      const deliveryAddress = orderType === 'delivery'
        ? `${aptPart}${street.trim()}, ${suburb.trim()} ${addrState} ${postcode.trim()}`
        : undefined;
      const order = await api.orders.create({
        items: items.map((i) => ({
          productId:       i.productId,
          productName:     i.productName,
          variantId:       i.variantId,
          variantName:     i.variantName,
          basePriceCents:  i.basePriceCents,
          selectedOptions: i.selectedOptions,
          quantity:        i.quantity,
          unitPriceCents:  i.unitPriceCents,
          totalCents:      i.unitPriceCents * i.quantity,
          category:        i.category,
        })),
        type:                  orderType === 'table' ? 'table' : orderType,
        scheduledFor:          orderType === 'table' ? undefined : scheduledForDate?.toISOString(),
        notes:                 checkout.notes.trim() || undefined,
        contactName:           checkout.contactName.trim() || undefined,
        contactPhone:          checkout.contactPhone.trim() || undefined,
        contactEmail:          checkout.contactEmail.trim() || undefined,
        totalCents,
        deliveryAddress:       orderType === 'delivery' ? deliveryAddress : undefined,
        deliveryPostcode:      orderType === 'delivery' ? postcode.trim() : undefined,
        deliveryState:         orderType === 'delivery' ? (addrState || 'NSW') : undefined,
        paymentMethod:         opts.paymentMethodType === 'pay_at_pickup' ? 'pay_at_pickup' : 'card',
        stripePaymentIntentId: opts.stripePaymentIntentId,
        loyaltyPointsUsed:     opts.loyaltyPointsUsed,
        discountCode:          opts.discountCode,
        discountCodeId:        opts.discountCodeId,
        paymentMethodType:     opts.paymentMethodType,
        claimedRewardId:       opts.claimedRewardId,
        storeId:               orderType === 'pickup'
          ? selectedStore?.id
          : orderType === 'table'
            ? nearbyStore?.id
            : undefined,
        useFreeCoffeeReward:   opts.useFreeCoffeeReward || undefined,
        ...(orderType === 'table' ? { tableNumber } : {}),
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirm({
        orderId:                 order.data.id,
        orderNumber:             order.data.orderNumber,
        totalCents:              order.data.totalCents ?? totalCents,
        type:                    orderType,
        scheduledLabel,
        scheduledDateLabel,
        paymentMethodType:       opts.paymentMethodType,
        isScheduled:             (order.data as any).status === 'scheduled',
        rewardSavingsCents:      order.rewardSavingsCents,
        freeCoffeeDiscountCents: order.freeCoffeeDiscountCents,
        rewardName:              order.rewardName,
        tableNumber:             orderType === 'table' ? tableNumber : undefined,
        storeName:               orderType === 'table' ? nearbyStore?.name : undefined,
      });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (items.length === 0 && step === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 60, backgroundColor: BG }]}>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.back(); }} style={[styles.emptyBackBtn, { top: insets.top + 12 }]}>
          <Feather name="chevron-left" size={22} color={TEXT} />
        </Pressable>
        <View style={[styles.emptyIconCircle, { backgroundColor: CARD }]}>
          <Feather name="shopping-bag" size={36} color={MUTED} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySub}>Add something delicious from the menu</Text>
      </View>
    );
  }

  // ── Cart step ─────────────────────────────────────────────────────────────
  const renderCartStep = () => (
    <View style={styles.stepWrap}>
      {cartRestoredFromSession && (
        <View style={styles.restoredBanner}>
          <Feather name="shopping-bag" size={15} color="#0369A1" style={{ marginTop: 1 }} />
          <Text style={styles.restoredBannerText}>You left something behind — your cart has been restored.</Text>
          <Pressable onPress={() => { clearCart(); dismissCartRestoredBanner(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <Text style={styles.restoredBannerClear}>Clear</Text>
          </Pressable>
          <Pressable onPress={dismissCartRestoredBanner} hitSlop={8}>
            <Feather name="x" size={15} color="#0369A1" />
          </Pressable>
        </View>
      )}

      {/* Order items section */}
      <Text style={styles.sectionLabel}>YOUR ORDER</Text>
      <View style={styles.itemsCard}>
        {items.map((item, idx) => (
          <CartItemRow
            key={item.cartItemId}
            item={item}
            onRemove={() => removeCartItem(item.cartItemId)}
            updateItemQuantity={updateItemQuantity}
            openSwipeableRef={openSwipeableRef}
            showDivider={idx > 0}
          />
        ))}
      </View>

      {cartSuggestedProducts.length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={styles.suggestLabel}>You may also like</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
            {cartSuggestedProducts.map((p) => (
              <SuggestionTile
                key={p.id}
                product={p}
                onPress={() => {
                  qc.prefetchQuery({ queryKey: ['product-detail-route', p.id], queryFn: () => api.products.get(p.id), staleTime: 60_000 });
                  setSelectedProduct(p);
                  router.push({ pathname: '/product', params: { id: p.id } } as any);
                }}
                onAddToCart={() => addItemToCart({
                  productId:       p.id,
                  productName:     p.name,
                  basePriceCents:  (p as any).priceCents ?? p.prices?.[0]?.unit_amount ?? 0,
                  selectedOptions: [],
                  quantity:        1,
                  imageUrl:        p.images?.[0],
                  category:        getProductCategory(p),
                  isCoffee:        false,
                })}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Totals */}
      <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Estimated card fee</Text>
          <Text style={styles.summaryValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, styles.totalLabel]}>Total</Text>
          <Text style={[styles.summaryValue, styles.totalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>
      <Text style={styles.shippingNote}>Choose pickup or delivery on the next step.</Text>
    </View>
  );

  const checkoutStepProps = {
    items:              items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, selectedOptions: i.selectedOptions })),
    orderType:          checkout.orderType,          setOrderType: checkout.setOrderType,
    tableNumber:        checkout.tableNumber,        setTableNumber: checkout.setTableNumber,
    nearbyStore:        nearbyStore ?? null,
    pickupMode:         checkout.pickupMode,         setPickupMode: checkout.setPickupMode,
    selectedDate:       checkout.selectedDate,       setSelectedDate: checkout.setSelectedDate,
    selectedTimeMins:   checkout.selectedTimeMins,   setSelectedTimeMins: checkout.setSelectedTimeMins,
    street:             checkout.street,             setStreet: checkout.setStreet,
    suburb:             checkout.suburb,             setSuburb: checkout.setSuburb,
    postcode:           checkout.postcode,           setPostcode: checkout.setPostcode,
    addrState:          checkout.addrState,
    apt:                checkout.apt,                setApt: checkout.setApt,
    selectedAddressId:  checkout.selectedAddressId,  setSelectedAddressId: checkout.setSelectedAddressId,
    contactName:        checkout.contactName,        setContactName: checkout.setContactName,
    contactPhone:       checkout.contactPhone,       setContactPhone: checkout.setContactPhone,
    contactEmail:       checkout.contactEmail,       setContactEmail: checkout.setContactEmail,
    notes:              checkout.notes,              setNotes: checkout.setNotes,
    subtotalCents,
    deliveryFeeCents,
    deliveryEnabled:    checkout.deliveryEnabled,
    showMixedDeliveryMessage: checkout.showMixedDeliveryMessage,
    selectedStore,
    storeOpen:          checkout.storeOpen,
    sydNow:             checkout.sydNow,
    deliveryDates:      checkout.deliveryDates,
    pickupDates:        checkout.pickupDates,
    validSlots:         checkout.validSlots,
    savedAddresses,
    fillFromAddress,
    canPayAtPickup,
    stripeReady:        !!stripePublishableKey,
    applePaySupported,
    onSuccess:          handlePlaceOrder,
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── WHITE HEADER ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={step > 0 ? () => setStep((s) => s - 1) : () => { Haptics.selectionAsync(); router.back(); }} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={BLUE} />
            <Text style={styles.backLabel}>{step > 0 ? 'Cart' : 'Menu'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 72 }} />
        </View>

        {/* Progress bars */}
        <View style={styles.progressRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? BLUE : BORDER }]} />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ paddingBottom: step === 0 ? 160 : 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && renderCartStep()}

          {step === 1 && (
            stripePublishableKey ? (
              <StripeProvider publishableKey={stripePublishableKey} merchantIdentifier="merchant.au.com.butterfieldcookies.app">
                <CheckoutCombinedStep {...checkoutStepProps} stripeReady />
              </StripeProvider>
            ) : (
              <CheckoutCombinedStep {...checkoutStepProps} stripeReady={false} />
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom bar — only shown on cart step */}
      {step === 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.bottomTotal}>
            <View>
              <Text style={styles.bottomQty}>{totalItems} item{totalItems !== 1 ? 's' : ''}</Text>
              <Text style={styles.bottomAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
            </View>
            <Pressable onPress={handleContinue} disabled={loading}
              style={[styles.continueBtn, { opacity: loading ? 0.8 : 1 }]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.continueBtnText}>Continue to checkout →</Text>
              }
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header:        { borderBottomWidth: 1, paddingBottom: 0 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 2, width: 72 },
  backLabel:     { fontSize: 17, color: BLUE },
  headerTitle:   { fontSize: 20, fontWeight: '700', color: TEXT },
  progressRow:   { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  progressBar:   { flex: 1, height: 3, borderRadius: 2 },
  // Cart step
  stepWrap:      { padding: 16, gap: 12 },
  sectionLabel:  { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  itemsCard:     { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  suggestLabel:  { fontWeight: '700', marginBottom: 10, fontSize: 13, color: TEXT },
  // Summary card
  summaryCard:  { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 10 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: MUTED },
  summaryValue: { fontSize: 13, fontWeight: '500', color: TEXT },
  totalLabel:   { fontWeight: '700', fontSize: 15, color: TEXT },
  totalValue:   { fontWeight: '700', fontSize: 16, color: TEXT },
  divider:      { height: 1, backgroundColor: BORDER },
  shippingNote: { textAlign: 'center', fontSize: 12, color: MUTED, paddingVertical: 4 },
  // Cart-restored banner
  restoredBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E0F2FE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  restoredBannerText: { flex: 1, fontSize: 13, color: '#0369A1', lineHeight: 18 },
  restoredBannerClear:{ fontSize: 13, color: '#0369A1', fontWeight: '700' },
  // Bottom bar
  bottomBar:    { borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 14, backgroundColor: CARD, gap: 10 },
  bottomTotal:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomQty:    { fontSize: 12, color: MUTED, fontWeight: '500' },
  bottomAmount: { fontSize: 18, fontWeight: '700', color: TEXT },
  continueBtn:  { height: 50, paddingHorizontal: 24, borderRadius: 999, backgroundColor: CHERRY, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Empty state
  emptyWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyBackBtn:   { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyIconCircle:{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 20, fontWeight: '600', color: TEXT },
  emptySub:       { fontSize: 14, color: MUTED },
});
