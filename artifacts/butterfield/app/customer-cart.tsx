import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useScrollStatusBar } from '@/hooks/useScrollStatusBar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { LoggedOutAccountPrompt } from '@/components/LoggedOutAccountPrompt';
import SuggestionTile from '@/components/SuggestionTile';
import { api, type AuthProfile } from '@/lib/api';
import { getSuggestedProductsForCart } from '@/lib/productPairings';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { formatDateChip } from '@/lib/dateUtils';
import { PaymentStepWithStripe } from '@/components/customer/CheckoutPaymentStep';
import { CheckoutDeliveryStep } from '@/components/customer/CheckoutDeliveryStep';
import { CartItemRow } from '@/components/customer/CartItemRow';
import { CheckoutConfirmation } from '@/components/customer/CheckoutConfirmation';
import { useCheckout } from '@/hooks/useCheckout';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const CHERRY = '#D0312D';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const TABS = [
  { label: 'CART',     icon: 'shopping-bag' },
  { label: 'SHIPPING', icon: 'truck' },
  { label: 'PAYMENT',  icon: 'credit-card' },
] as const;

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
  rewardName?: string;
}

export default function CartScreen() {
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/customer-cart" compact />;
  return <CartContent />;
}

function CartContent() {
  const insets     = useSafeAreaInsets();
  const { barStyle, handleScroll, onHeaderLayout } = useScrollStatusBar('light-content');
  const navigation = useNavigation();
  const { user }   = useAuth();
  const { items, totalPriceCents, totalItems, addItemToCart, updateItemQuantity, removeCartItem, clearCart, cartRestoredFromSession, dismissCartRestoredBanner } = useCart();
  const qc = useQueryClient();
  const openSwipeableRef = useRef<Swipeable | null>(null);
  const routeParams = useLocalSearchParams<{ success?: string }>();

  const { data: allProductsData } = useQuery({
    queryKey: ['products'],
    queryFn:  () => api.products.list(),
    staleTime: 5 * 60_000,
  });
  const { data: deliveryConfigRes } = useQuery({
    queryKey: ['delivery-config'],
    queryFn:  () => api.delivery.config(),
    staleTime: 5 * 60_000,
  });

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['delivery-config'] });
  }, [qc]));

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
      all, 2,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIdsKey, allProductsData]);

  const { data: addrData }    = useQuery({ queryKey: ['addresses'],    queryFn: () => api.addresses.list(), retry: 1 });
  const { data: meData }      = useQuery({ queryKey: ['auth-me'],       queryFn: () => api.auth.me(), enabled: !!user, retry: 1 });
  const { data: storesData }  = useStores();
  const { data: stripeConfig } = useQuery({ queryKey: ['stripe-config'], queryFn: () => api.payment.config(), retry: 1, staleTime: Infinity });

  const savedAddresses         = addrData?.data ?? [];
  const defaultAddress         = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  const canPayAtPickup         = Boolean((meData?.profile as any)?.payAtPickupEnabled);
  const stripePublishableKey   = stripeConfig?.data?.publishableKey ?? null;
  const preferredStoreId       = (meData?.profile as AuthProfile | null)?.preferredStoreId ?? null;
  const stores                 = storesData?.data ?? [];
  const selectedStore          = (preferredStoreId ? stores.find((s) => s.id === preferredStoreId) : null) ?? stores[0] ?? null;

  const checkout = useCheckout({
    totalPriceCents, items, deliveryConfig, selectedStore,
    deliveryFeeCents, globalDeliveryEnabled, eligibleCategories, pickupOnlyIds, meData, user,
  });
  const { step, setStep, orderType, selectedDate, selectedTimeMins, pickupMode, street, suburb, addrState, postcode, contactName, loading, setLoading, subtotalCents, stripeFeeCents, totalCents, deliveryEnabled, sydNow, fillFromAddress, handleContinue } = checkout;

  // Disable native swipe-back on steps 1 & 2 so the back button steps through checkout.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: step === 0 });
  }, [navigation, step]);

  // Auto-fill default address when switching to delivery.
  useEffect(() => {
    if (orderType === 'delivery' && defaultAddress && !street) fillFromAddress(defaultAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, defaultAddress]);

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Replace URL with ?success=1 after order so a hard-refresh doesn't re-trigger.
  useEffect(() => {
    if (confirmation && routeParams.success !== '1') router.replace('/customer-cart?success=1');
  }, [confirmation, routeParams.success]);

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
          scheduledForDate  = d;
          const part        = `${formatDateChip(sydNow, selectedDate)}, ${formatPickupMins(selectedTimeMins)}`;
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
        type:                  orderType,
        scheduledFor:          scheduledForDate?.toISOString(),
        notes:                 checkout.notes.trim() || undefined,
        contactName:           checkout.contactName.trim() || undefined,
        contactPhone:          checkout.contactPhone.trim() || undefined,
        contactEmail:          checkout.contactEmail.trim() || undefined,
        totalCents,
        deliveryAddress,
        deliveryPostcode:      orderType === 'delivery' ? postcode.trim() : undefined,
        // Fall back to 'NSW' when the saved address has no state (e.g. legacy addresses).
        deliveryState:         orderType === 'delivery' ? (addrState || 'NSW') : undefined,
        paymentMethod:         opts.paymentMethodType === 'pay_at_pickup' ? 'pay_at_pickup' : 'card',
        stripePaymentIntentId: opts.stripePaymentIntentId,
        loyaltyPointsUsed:     opts.loyaltyPointsUsed,
        discountCode:          opts.discountCode,
        discountCodeId:        opts.discountCodeId,
        paymentMethodType:     opts.paymentMethodType,
        claimedRewardId:       opts.claimedRewardId,
        storeId:               orderType === 'pickup' ? selectedStore?.id : undefined,
        useFreeCoffeeReward:   opts.useFreeCoffeeReward || undefined,
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmation({
        orderId:           order.data.id,
        orderNumber:       order.data.orderNumber,
        totalCents:        order.data.totalCents ?? totalCents,
        type:              orderType,
        scheduledLabel,
        scheduledDateLabel,
        paymentMethodType: opts.paymentMethodType,
        isScheduled:       (order.data as any).status === 'scheduled',
        rewardSavingsCents: order.rewardSavingsCents,
        rewardName:        order.rewardName,
      });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmation) {
    return <CheckoutConfirmation confirmation={confirmation} clearCart={clearCart} insets={insets} />;
  }

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (items.length === 0 && step !== 2) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 60 }]}>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.back(); }} style={[styles.emptyBackBtn, { top: insets.top + 12 }]}>
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

  // ── Cart items step ───────────────────────────────────────────────────────
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

      {items.map((item) => (
        <CartItemRow
          key={item.cartItemId}
          item={item}
          onRemove={() => removeCartItem(item.cartItemId)}
          updateItemQuantity={updateItemQuantity}
          openSwipeableRef={openSwipeableRef}
        />
      ))}

      {cartSuggestedProducts.length > 0 && (
        <View style={{ marginBottom: 16 }}>
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
                  category:        (p as any).category ?? p.metadata?.category,
                  isCoffee:        false,
                })}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Estimated card fee</Text>
          <Text style={styles.summaryValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, styles.totalLabel]}>Total</Text>
          <Text style={[styles.summaryValue, styles.totalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>
      <Text style={styles.shippingNote}>Choose pickup or delivery on the next step.</Text>
    </View>
  );

  // ── Payment step ──────────────────────────────────────────────────────────
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
        {items.length === 0
          ? <Text style={{ color: MUTED, fontSize: 13 }}>No items yet — select a reward below</Text>
          : items.map((item) => (
              <View key={item.cartItemId} style={styles.paymentItem}>
                <Text style={[styles.paymentItemName, { color: TEXT }]}>{item.productName} × {item.quantity}</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: MUTED }}>AUD {((item.unitPriceCents / 100) * item.quantity).toFixed(2)}</Text>
              </View>
            ))
        }
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        {orderType === 'delivery' && (
          <>
            <View style={[styles.divider, { backgroundColor: BORDER }]} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery (Sydney NSW)</Text>
              <Text style={styles.summaryValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.orderDetailsCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.detailRow}>
          <Feather name={orderType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={BLUE} />
          <Text style={[styles.detailText, { color: TEXT }]}>
            {orderType === 'delivery'
              ? `Delivery · ${street}, ${suburb} NSW ${postcode}`
              : `In-store Pickup · ${selectedStore?.name ?? 'Your selected store'}`}
          </Text>
        </View>
        {orderType === 'pickup' && pickupMode === 'asap' ? (
          <View style={styles.detailRow}>
            <Feather name="clock" size={14} color={BLUE} />
            <Text style={[styles.detailText, { color: TEXT }]}>ASAP from your selected store</Text>
          </View>
        ) : selectedDate ? (
          <View style={styles.detailRow}>
            <Feather name="calendar" size={14} color={BLUE} />
            <Text style={[styles.detailText, { color: TEXT }]}>
              {orderType === 'pickup' && selectedTimeMins !== null
                ? `${formatDateChip(sydNow, selectedDate)}, ${formatPickupMins(selectedTimeMins)}`
                : selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
        ) : null}
        {contactName ? (
          <View style={styles.detailRow}>
            <Feather name="user" size={14} color={BLUE} />
            <Text style={[styles.detailText, { color: TEXT }]}>{contactName}</Text>
          </View>
        ) : null}
      </View>

      {stripePublishableKey ? (
        <StripeProvider publishableKey={stripePublishableKey}>
          <PaymentStepWithStripe
            items={items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, selectedOptions: i.selectedOptions }))}
            orderType={orderType} subtotalCents={subtotalCents} deliveryFeeCents={deliveryFeeCents}
            canPayAtPickup={canPayAtPickup} stripeReady onSuccess={handlePlaceOrder}
          />
        </StripeProvider>
      ) : (
        <PaymentStepWithStripe
          items={items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, selectedOptions: i.selectedOptions }))}
          orderType={orderType} subtotalCents={subtotalCents} deliveryFeeCents={deliveryFeeCents}
          canPayAtPickup={canPayAtPickup} stripeReady={false} onSuccess={handlePlaceOrder}
        />
      )}
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />

      <View onLayout={onHeaderLayout}>
      <LinearGradient colors={['#1493FF', '#3CBBEE']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={step > 0 ? () => setStep((s) => s - 1) : () => { Haptics.selectionAsync(); router.back(); }} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>CHECKOUT</Text>
            <Text style={styles.headerSub}>{items.length === 0 && step === 2 ? 'Reward checkout' : `${totalItems} item${totalItems !== 1 ? 's' : ''}`}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab, i) => {
            const active = step === i;
            const done   = step > i;
            const color  = active ? '#fff' : done ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)';
            return (
              <View key={tab.label} style={styles.tabItem}>
                <View style={styles.tabInner}>
                  <Feather name={tab.icon as any} size={13} color={color} />
                  <Text style={[styles.tabLabel, { color, fontWeight: active ? '600' : '400' }]}>{tab.label}</Text>
                </View>
                {active && <View style={styles.tabUnderline} />}
              </View>
            );
          })}
        </View>
      </LinearGradient>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          onScroll={handleScroll} scrollEventThrottle={16}>
          {step === 0 && renderCartStep()}
          {step === 1 && (
            <CheckoutDeliveryStep
              orderType={checkout.orderType}         setOrderType={checkout.setOrderType}
              pickupMode={checkout.pickupMode}       setPickupMode={checkout.setPickupMode}
              selectedDate={checkout.selectedDate}   setSelectedDate={checkout.setSelectedDate}
              selectedTimeMins={checkout.selectedTimeMins} setSelectedTimeMins={checkout.setSelectedTimeMins}
              street={checkout.street}               setStreet={checkout.setStreet}
              suburb={checkout.suburb}               setSuburb={checkout.setSuburb}
              postcode={checkout.postcode}           setPostcode={checkout.setPostcode}
              addrState={checkout.addrState}
              apt={checkout.apt}                     setApt={checkout.setApt}
              selectedAddressId={checkout.selectedAddressId} setSelectedAddressId={checkout.setSelectedAddressId}
              contactName={checkout.contactName}     setContactName={checkout.setContactName}
              contactPhone={checkout.contactPhone}   setContactPhone={checkout.setContactPhone}
              contactEmail={checkout.contactEmail}   setContactEmail={checkout.setContactEmail}
              notes={checkout.notes}                 setNotes={checkout.setNotes}
              subtotalCents={subtotalCents}          stripeFeeCents={stripeFeeCents}
              totalCents={totalCents}                deliveryFeeCents={deliveryFeeCents}
              deliveryEnabled={checkout.deliveryEnabled}
              showMixedDeliveryMessage={checkout.showMixedDeliveryMessage}
              deliveryConfig={deliveryConfig}        selectedStore={selectedStore}
              storeOpen={checkout.storeOpen}         sydNow={checkout.sydNow}
              deliveryDates={checkout.deliveryDates} pickupDates={checkout.pickupDates}
              validSlots={checkout.validSlots}
              savedAddresses={savedAddresses}        fillFromAddress={fillFromAddress}
            />
          )}
          {step === 2 && renderPaymentStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {step < 2 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: CARD, borderTopColor: BORDER }]}>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomLabel}>TOTAL</Text>
            <Text style={styles.bottomAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
          </View>
          <Pressable onPress={handleContinue} disabled={loading}
            style={[styles.continueBtn, { backgroundColor: CHERRY, opacity: loading ? 0.8 : 1 }]}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.continueBtnText}>{step === 0 ? 'Continue to shipping' : 'Continue to payment'}</Text>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header:      { paddingBottom: 0 },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 1.5 },
  headerSub:   { fontSize: 12, fontWeight: '400', marginTop: 1, color: 'rgba(255,255,255,0.75)' },
  // Step tab bar
  tabBar:      { flexDirection: 'row' },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabInner:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:    { fontSize: 11, letterSpacing: 0.5 },
  tabUnderline:{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  // Step content
  stepWrap:    { padding: 16, gap: 12 },
  suggestLabel:{ fontWeight: '700', marginBottom: 10, fontSize: 13, color: '#1C1C1E' },
  // Cart-restored banner
  restoredBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E0F2FE', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  restoredBannerText: { flex: 1, fontSize: 13, color: '#0369A1', lineHeight: 18 },
  restoredBannerClear:{ fontSize: 13, color: '#0369A1', fontWeight: '700' },
  // Shared summary
  summaryCard:  { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: '#8E8E93' },
  summaryValue: { fontSize: 13, fontWeight: '500', color: '#1C1C1E' },
  totalLabel:   { fontWeight: '700', fontSize: 15, color: '#1C1C1E' },
  totalValue:   { fontWeight: '700', fontSize: 16, color: '#1C1C1E' },
  divider:      { height: 1 },
  shippingNote: { textAlign: 'center', fontSize: 12, color: '#8E8E93', paddingVertical: 4 },
  // Payment step
  paymentHeader:  { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  paymentItem:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  paymentItemName:{ fontSize: 13, flex: 1 },
  orderDetailsCard:{ borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailText:     { flex: 1, fontSize: 13 },
  // Bottom bar
  bottomBar:    { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  bottomTotal:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomLabel:  { fontSize: 13, fontWeight: '700', color: '#1C1C1E', letterSpacing: 1 },
  bottomAmount: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  continueBtn:  { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Empty state
  emptyWrap:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyBackBtn:   { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyIconCircle:{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:     { fontSize: 20, fontWeight: '600', color: '#1C1C1E' },
  emptySub:       { fontSize: 14, color: '#8E8E93' },
});
