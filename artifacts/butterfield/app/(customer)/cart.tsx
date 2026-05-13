import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StripeProvider, usePaymentSheet } from '@stripe/stripe-react-native';
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
import { api, type SavedAddress } from '@/lib/api';
import { ButterfieldCharacter } from '@/components/ButterfieldCharacter';
import {
  formatDateChip,
  formatTime,
  getDeliveryDates,
  getPickupDates,
  getPickupTimeMins,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';
import { getPalette } from '@/constants/categoryColors';

const BG       = '#F5F6FA';
const CARD     = '#FFFFFF';
const BLUE     = '#40C0F2';
const GREEN    = '#22C55E';
const CHERRY   = '#D0312D';
const TEXT     = '#1C1C1E';
const MUTED    = '#8E8E93';
const BORDER   = '#E5E7EB';
const LIGHT_BLUE = '#E6F0FF';

const TABS = [
  { label: 'CART',     icon: 'shopping-bag' },
  { label: 'SHIPPING', icon: 'truck' },
  { label: 'PAYMENT',  icon: 'credit-card' },
] as const;

const DELIVERY_FEE_CENTS = 1200;
const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;

function estimateStripeFeeCents(amountCents: number) {
  return amountCents > 0 ? Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS) : 0;
}

function calcTotals(subtotalCents: number, step: number, orderType: 'pickup' | 'delivery', paymentMethod: 'card' | 'pay_at_pickup') {
  const deliv     = (step >= 1 && orderType === 'delivery') ? DELIVERY_FEE_CENTS : 0;
  const base      = subtotalCents + deliv;
  const stripeFee = paymentMethod === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(base);
  return { deliv, stripeFee, total: base + stripeFee };
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>;
}

function StripeCheckoutButton({
  items,
  orderType,
  merchantDisplayName,
  onSuccess,
}: {
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    selectedOptions?: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>;
  }>;
  orderType: 'pickup' | 'delivery';
  merchantDisplayName: string;
  onSuccess: (paymentIntentId: string) => Promise<void>;
}) {
  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();
  const [busy, setBusy] = useState(false);

  const payNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const intent = await api.payment.createIntent({
        items,
        orderType,
        paymentMethod: 'card',
      });
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intent.clientSecret,
        merchantDisplayName,
        allowsDelayedPaymentMethods: true,
      } as any);
      if (initError) throw new Error(initError.message);
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) throw new Error(presentError.message);
      await onSuccess(intent.paymentIntentId);
    } catch (e: any) {
      Alert.alert('Stripe payment failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={payNow}
      disabled={busy}
      style={[styles.continueBtn, { backgroundColor: CHERRY, opacity: busy ? 0.8 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.continueBtnText}>Pay with Stripe</Text>
      )}
    </Pressable>
  );
}

interface Confirmation {
  orderId: string;
  totalCents: number;
  type: string;
  scheduledLabel?: string;
}

type ConfettiPiece = {
  id: number;
  left: number;
  top: number;
  dx: number;
  dy: number;
  delay: number;
  size: number;
  rotate: number;
  color: string;
  shape: 'circle' | 'square' | 'bar';
};

function ConfettiPieceView({ piece }: { piece: ConfettiPiece }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [piece.delay, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: piece.dx * p },
        { translateY: piece.dy * p },
        { rotate: `${piece.rotate * p}deg` },
        { scale: interpolate(p, [0, 0.15, 1], [0.25, 1.05, 0.85]) },
      ],
    };
  });

  const shapeStyle =
    piece.shape === 'circle'
      ? { borderRadius: piece.size / 2 }
      : piece.shape === 'square'
        ? { borderRadius: 3 }
        : { borderRadius: 999 };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: piece.left,
          top: piece.top,
          width: piece.size,
          height: piece.shape === 'bar' ? Math.max(6, Math.round(piece.size * 0.55)) : piece.size,
          backgroundColor: piece.color,
        },
        shapeStyle,
        style,
      ]}
    />
  );
}

export default function CartScreen() {
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, totalPriceCents, totalItems, updateItemQuantity, removeCartItem, clearCart } = useCart();
  const qc = useQueryClient();

  const [step, setStep]                       = useState(0);
  const [orderType, setOrderType]             = useState<'pickup' | 'delivery'>('pickup');
  const [selectedDate, setSelectedDate]       = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);
  const [street, setStreet]                   = useState('');
  const [suburb, setSuburb]                   = useState('');
  const [postcode, setPostcode]               = useState('');
  const [addrState, setAddrState]             = useState('NSW');
  const [apt, setApt]                         = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [contactName, setContactName]         = useState('');
  const [contactPhone, setContactPhone]       = useState('');
  const [contactEmail, setContactEmail]       = useState('');
  const [notes, setNotes]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [confirmation, setConfirmation]       = useState<Confirmation | null>(null);
  const [paymentMethod, setPaymentMethod]     = useState<'card' | 'pay_at_pickup'>('card');
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
    successCardOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    successCardScale.value = withSpring(1, { damping: 14, stiffness: 150 });
    pointsOpacity.value = withDelay(150, withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }));
    pointsTranslate.value = withDelay(150, withSpring(0, { damping: 16, stiffness: 160 }));
    characterProgress.value = withDelay(120, withSpring(1, { damping: 13, stiffness: 120 }));
  }, [confirmation, characterProgress, pointsOpacity, pointsTranslate, successCardOpacity, successCardScale]);

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

  const celebrationPieces = useMemo<ConfettiPiece[]>(() => {
    if (!confirmation) return [];
    const colors = ['#FF7A59', '#FFD166', '#7DD3FC', '#A78BFA', '#34D399', '#FB7185'];
    const seed = confirmation.orderId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 36; i += 1) {
      const mix = seed + i * 37;
      pieces.push({
        id: i,
        left: 16 + ((mix * 13) % 88),
        top: 8 + ((mix * 17) % 42),
        dx: ((mix % 11) - 5) * 20 + (i % 2 === 0 ? 34 : -24),
        dy: 180 + ((mix % 7) * 10),
        delay: (i % 8) * 30,
        size: 7 + (mix % 6),
        rotate: (mix % 2 === 0 ? 1 : -1) * (240 + (mix % 7) * 30),
        color: colors[mix % colors.length],
        shape: i % 3 === 0 ? 'bar' : i % 3 === 1 ? 'square' : 'circle',
      });
    }
    return pieces;
  }, [confirmation]);

  // Load saved addresses
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

  // Helper: fill delivery form from a saved address
  const fillFromAddress = (addr: SavedAddress) => {
    setStreet(addr.street);
    setApt(addr.apt ?? '');
    setSuburb(addr.suburb);
    setPostcode(addr.postcode);
    setAddrState(addr.state);
    setSelectedAddressId(addr.id);
  };

  // Pre-fill contact from auth user + pre-fill default address when switching to delivery
  useEffect(() => {
    if (user) {
      if (!contactName)  setContactName(user.name ?? '');
      if (!contactEmail) setContactEmail(user.email ?? '');
      if (!contactPhone && (user as any).phone) setContactPhone((user as any).phone);
    }
  }, [user]);

  // Auto-fill default address when delivery tab is opened
  useEffect(() => {
    if (orderType === 'delivery' && defaultAddress && !street) {
      fillFromAddress(defaultAddress);
    }
  }, [orderType, defaultAddress]);

  useEffect(() => {
    if (orderType !== 'pickup' || !canPayAtPickup) {
      setPaymentMethod('card');
    }
  }, [orderType, canPayAtPickup]);

  const effectivePaymentMethod: 'card' | 'pay_at_pickup' =
    orderType === 'pickup' && canPayAtPickup && paymentMethod === 'pay_at_pickup'
      ? 'pay_at_pickup'
      : 'card';

  const subtotalCents = totalPriceCents;
  const { stripeFee: stripeFeeCents, total: totalCents } = calcTotals(subtotalCents, step, orderType, effectivePaymentMethod);

  const sydNow        = getSydneyNow();
  const deliveryDates = getDeliveryDates();
  const pickupDates   = getPickupDates();
  const pickupTimes   = selectedDate ? getPickupTimeMins(selectedDate, sydNow) : [];

  // Build 2-column pairs for date grid
  const deliveryPairs: (typeof deliveryDates[0] | null)[][] = [];
  for (let i = 0; i < deliveryDates.length; i += 2) {
    deliveryPairs.push([deliveryDates[i], deliveryDates[i + 1] ?? null]);
  }
  const pickupPairs: (Date | null)[][] = [];
  for (let i = 0; i < pickupDates.length; i += 2) {
    pickupPairs.push([pickupDates[i], pickupDates[i + 1] ?? null]);
  }

  const handleContinue = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      if (orderType === 'pickup') {
        if (!selectedDate || selectedTimeMins === null) {
          Alert.alert('Select pickup time', 'Please choose a date and time for your pickup.');
          return;
        }
      } else {
        if (!selectedDate) {
          Alert.alert('Select delivery date', 'Please choose a delivery date.');
          return;
        }
        if (!street.trim() || !suburb.trim() || !postcode.trim()) {
          Alert.alert('Delivery address required', 'Please enter your full delivery address.');
          return;
        }
        const pc = parseInt(postcode.trim(), 10);
        if (addrState !== 'NSW' || isNaN(pc) || pc < 2000 || pc > 2999) {
          Alert.alert(
            'Sydney deliveries only',
            'We currently deliver within Sydney (NSW postcodes 2000–2999) only. Please choose pickup or update your address.'
          );
          return;
        }
        if (!contactName.trim()) {
          Alert.alert('Your details required', 'Please enter your full name.');
          return;
        }
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      await handlePlaceOrder();
    }
  };

  const handlePlaceOrder = async (stripePaymentIntentId?: string) => {
    setLoading(true);
    try {
      let scheduledForDate: Date | undefined;
      let scheduledLabel: string | undefined;
      if (orderType === 'pickup' && selectedDate && selectedTimeMins !== null) {
        const d = new Date(selectedDate);
        d.setHours(Math.floor(selectedTimeMins / 60), selectedTimeMins % 60, 0, 0);
        scheduledForDate = d;
        scheduledLabel = `Pickup ${formatDateChip(sydNow, selectedDate)} at ${formatTime(selectedTimeMins)}`;
      } else if (orderType === 'delivery' && selectedDate) {
        scheduledForDate = selectedDate;
        scheduledLabel = `Delivery on ${selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}`;
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
        })),
        type:             orderType,
        scheduledFor:     scheduledForDate?.toISOString(),
        notes:            [notes.trim(), contactName.trim(), contactPhone.trim()].filter(Boolean).join(' | ') || undefined,
        totalCents,
        deliveryAddress,
        deliveryPostcode: orderType === 'delivery' ? postcode.trim() : undefined,
        deliveryState:    orderType === 'delivery' ? 'NSW' : undefined,
        paymentMethod:    effectivePaymentMethod,
        stripePaymentIntentId,
      });
      clearCart();
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['loyalty-profile'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmation({ orderId: order.data.id, totalCents, type: orderType, scheduledLabel });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getContinueLabel = () => {
    if (loading) return '…';
    if (step === 0) return 'Continue to shipping';
    if (step === 1) return 'Continue to payment';
    return 'Place Order';
  };

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (confirmation) {
    const earnedPoints = Math.max(0, Math.floor(confirmation.totalCents / 100));
    return (
      <LinearGradient colors={['#63b9e9', '#14b3ff']} style={[styles.successWrap, { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.confettiLayer} pointerEvents="none">
          {celebrationPieces.map((piece) => (
            <ConfettiPieceView key={piece.id} piece={piece} />
          ))}
        </View>
        <Animated.View style={[styles.characterStage, characterStyle]} pointerEvents="none">
          <View style={styles.characterFrame}>
            <ButterfieldCharacter />
          </View>
        </Animated.View>
        <Animated.View style={[styles.successCard, successCardStyle]}>
          <LinearGradient colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.18)']} style={styles.successGlow}>
            <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={styles.successIcon}>
              <Feather name="check" size={36} color="#fff" />
            </LinearGradient>
            <Text style={styles.successTitle}>Thanks, your order is in!</Text>
            <Text style={styles.successId}>#{confirmation.orderId.slice(0, 8).toUpperCase()}</Text>
            <Animated.View style={[styles.successPointsBox, pointsStyle]}>
              <View style={styles.successPointsBadge}>
                <Feather name="star" size={16} color="#7A4B00" />
              </View>
              <View style={styles.successPointsCopy}>
                <Text style={styles.successPointsLabel}>You just earned</Text>
                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.successPointsNumber}>+{earnedPoints}</Text>
                <Text style={styles.successPointsSuffix}>points from this order</Text>
              </View>
            </Animated.View>
            <View style={[styles.successInfoBox, { backgroundColor: 'rgba(255,248,231,0.92)', borderColor: '#F0A030' }]}>
              <Feather name="alert-circle" size={16} color="#D97706" />
              <Text style={styles.successInfoText}>
                {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup'
                  ? 'Your order will be paid at pickup. Please wait for your notification before coming in.'
                  : 'Your order is not ready until you receive confirmation. Please wait for your notification before coming in.'}
              </Text>
            </View>
            {confirmation.scheduledLabel && (
              <View style={[styles.slotBox, { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.62)' }]}>
                <Feather name="clock" size={14} color="#0E6FA1" />
                <Text style={[styles.slotText, { color: '#0E3957' }]}>{confirmation.scheduledLabel}</Text>
              </View>
            )}
            <Text style={[styles.successTotal, { color: 'rgba(255,255,255,0.92)' }]}>
              {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup' ? 'Total due at pickup' : 'Total paid'}: AUD {(confirmation.totalCents / 100).toFixed(2)}
            </Text>
            <Pressable onPress={() => { router.push('/orders'); }} style={styles.trackBtn}>
              <Text style={styles.trackBtnText}>Go to My Orders</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </LinearGradient>
    );
  }

  // ── Empty cart ───────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <View style={[styles.emptyWrap, { paddingTop: insets.top + 60 }]}>
        <View style={[styles.emptyIconCircle, { backgroundColor: BG }]}>
          <Feather name="shopping-bag" size={36} color={MUTED} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySub}>Add something delicious from the menu</Text>
      </View>
    );
  }

  const showNativeTabBar = isLiquidGlassAvailable();

  // ── Cart step ────────────────────────────────────────────────────────────
  const renderCartStep = () => (
    <View style={styles.stepWrap}>
      {items.map((item) => {
        const palette  = getPalette(item.category ?? 'default');
        const imageUrl = item.imageUrl ?? null;
        const optionLines = (item.selectedOptions ?? [])
          .filter(o => o.optionName && o.optionName !== 'No Sugar' && o.optionName !== 'No Honey' &&
                       o.optionName !== 'No Syrup' && o.optionName !== 'Regular Coffee' &&
                       o.optionName !== 'Regular' && o.optionName !== 'Normal' && o.optionName !== 'Full Cream')
          .concat(item.selectedOptions.filter(o => o.textValue));
        return (
          <View key={item.cartItemId} style={[styles.itemCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.itemThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.itemThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 28 }}>{palette.emoji}</Text>
              </View>
            )}
            <Pressable
              onPress={() => { removeCartItem(item.cartItemId); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={styles.removeBtn}
            >
              <Feather name="x" size={12} color={MUTED} />
            </Pressable>
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>
                {item.productName}{item.variantName ? ` · ${item.variantName}` : ''}
              </Text>
              {optionLines.length > 0 && (
                <Text style={[styles.itemOpts, { fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>
                  {optionLines.map(o => o.textValue ?? o.optionName).join(', ')}
                </Text>
              )}
              <Text style={styles.itemPrice}>AUD {((item.unitPriceCents * item.quantity) / 100).toFixed(2)}</Text>
              <View style={styles.qtyRow}>
                <Pressable onPress={() => { updateItemQuantity(item.cartItemId, item.quantity - 1); Haptics.selectionAsync(); }} style={styles.qtyBtn}>
                  <Text style={styles.qtyBtnText}>–</Text>
                </Pressable>
                <Text style={styles.qtyLabel}>QTY: {item.quantity}</Text>
                <Pressable onPress={() => { updateItemQuantity(item.cartItemId, item.quantity + 1); Haptics.selectionAsync(); }} style={styles.qtyBtn}>
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
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>
            {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup' ? 'Pay at pickup' : 'Stripe card fee'}
          </Text>
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

  // ── Shipping step ────────────────────────────────────────────────────────
  const renderShippingStep = () => (
    <View style={styles.stepWrap}>
      <SectionLabel title="HOW WOULD YOU LIKE TO RECEIVE YOUR ORDER?" />

      <View style={styles.orderTypeRow}>
        {[
          { id: 'pickup',   label: 'Pickup',   sub: 'In-store, free',      icon: 'shopping-bag' as const },
          { id: 'delivery', label: 'Delivery', sub: 'AUD 12.00 flat',      icon: 'truck' as const },
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
                <Text style={[styles.orderTypeLabel, { color: active ? TEXT : TEXT }]}>{t.label}</Text>
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
            <Text style={styles.deliveryInfoTitle}>Flat AU$12, NSW only</Text>
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
        <>
          {deliveryPairs.map((pair, ri) => (
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
          ))}
        </>
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
                    <Text style={[styles.dateDayName, { color: BLUE }]}>{lbl === 'Today' ? 'TODAY' : lbl === 'Tomorrow' ? 'TOMORROW' : dayFull}</Text>
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
                  <Text style={[styles.noSlots, { color: MUTED }]}>No slots available — choose another day</Text>
                ) : pickupTimes.map((mins) => {
                  const lbl        = formatTime(mins);
                  const isSelected = selectedTimeMins === mins;
                  return (
                    <Pressable
                      key={mins}
                      onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                      style={[styles.timePill, {
                        backgroundColor: isSelected ? BLUE : CARD,
                        borderColor:     isSelected ? BLUE : BORDER,
                      }]}
                    >
                      <Text style={[styles.timePillText, { color: isSelected ? '#fff' : TEXT }]}>{lbl}</Text>
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
          <SectionLabel title="DELIVERY ADDRESS" />

          {/* Saved address chips */}
          {savedAddresses.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
              {savedAddresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <Pressable
                    key={addr.id}
                    onPress={() => { fillFromAddress(addr); Haptics.selectionAsync(); }}
                    style={[styles.savedAddrChip, {
                      backgroundColor: isSelected ? LIGHT_BLUE : CARD,
                      borderColor:     isSelected ? BLUE : BORDER,
                      borderWidth:     isSelected ? 1.5 : 1,
                    }]}
                  >
                    <Feather name={addr.label.toLowerCase() === 'home' ? 'home' : addr.label.toLowerCase() === 'work' ? 'briefcase' : 'map-pin'} size={12} color={isSelected ? BLUE : MUTED} />
                    <Text style={[styles.savedAddrChipText, { color: isSelected ? BLUE : TEXT }]}>{addr.label}</Text>
                    {addr.isDefault && <View style={[styles.savedAddrDot, { backgroundColor: BLUE }]} />}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => router.push('/addresses')}
                style={[styles.savedAddrChip, { backgroundColor: CARD, borderColor: BORDER }]}
              >
                <Feather name="plus" size={12} color={MUTED} />
                <Text style={[styles.savedAddrChipText, { color: MUTED }]}>Manage</Text>
              </Pressable>
            </ScrollView>
          )}

          <View style={[styles.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Text style={styles.formFieldLabel}>Street address</Text>
            <TextInput
              style={[styles.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder="e.g. 21 Villiers Street"
              placeholderTextColor={MUTED}
              value={street}
              onChangeText={(v) => { setStreet(v); setSelectedAddressId(null); }}
              autoCapitalize="words"
            />
            <Text style={styles.formFieldLabel}>Apt / unit (optional)</Text>
            <TextInput
              style={[styles.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder="Unit 4"
              placeholderTextColor={MUTED}
              value={apt}
              onChangeText={(v) => { setApt(v); setSelectedAddressId(null); }}
              autoCapitalize="words"
            />
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formFieldLabel}>Suburb</Text>
                <TextInput
                  style={[styles.formInput, { color: TEXT, borderColor: BORDER }]}
                  placeholder="Merrylands"
                  placeholderTextColor={MUTED}
                  value={suburb}
                  onChangeText={(v) => { setSuburb(v); setSelectedAddressId(null); }}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ width: 110 }}>
                <Text style={styles.formFieldLabel}>Postcode</Text>
                <TextInput
                  style={[styles.formInput, { color: TEXT, borderColor: BORDER }]}
                  placeholder="2160"
                  placeholderTextColor={MUTED}
                  value={postcode}
                  onChangeText={(v) => { setPostcode(v); setSelectedAddressId(null); }}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
            <Text style={styles.formFieldLabel}>State</Text>
            <View style={[styles.statePill, { backgroundColor: LIGHT_BLUE, borderColor: BLUE, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Feather name="map-pin" size={12} color={BLUE} />
              <Text style={[styles.statePillText, { color: BLUE }]}>NSW — Sydney deliveries only</Text>
            </View>
          </View>
        </>
      )}

      <SectionLabel title="YOUR DETAILS" />
      <View style={[styles.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        {[
          { label: 'Full name',        value: contactName,  setter: setContactName,  placeholder: 'Omar Ismail',             keyboard: 'default' as const,  autoCapitalize: 'words' as const },
          { label: 'Mobile number',    value: contactPhone, setter: setContactPhone, placeholder: '04XX XXX XXX',            keyboard: 'phone-pad' as const, autoCapitalize: 'none' as const  },
          { label: 'Email',            value: contactEmail, setter: setContactEmail, placeholder: 'you@email.com',           keyboard: 'email-address' as const, autoCapitalize: 'none' as const },
        ].map((f) => (
          <View key={f.label} style={styles.formFieldWrap}>
            <Text style={styles.formFieldLabel}>{f.label}</Text>
            <TextInput
              style={[styles.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder={f.placeholder}
              placeholderTextColor={MUTED}
              value={f.value}
              onChangeText={f.setter}
              keyboardType={f.keyboard}
              autoCapitalize={f.autoCapitalize}
            />
          </View>
        ))}
        <Text style={styles.formFieldLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.formInput, styles.notesInput, { color: TEXT, borderColor: BORDER }]}
          placeholder="Allergies, gate code, gift wrap, etc."
          placeholderTextColor={MUTED}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>Subtotal</Text>
          <Text style={styles.summaryRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        {orderType === 'delivery' && (
          <>
            <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryRowLabel}>Delivery (Sydney NSW)</Text>
              <Text style={styles.summaryRowValue}>AUD {(DELIVERY_FEE_CENTS / 100).toFixed(2)}</Text>
            </View>
          </>
        )}
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>
            {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup' ? 'Pay at pickup' : 'Stripe card fee'}
          </Text>
          <Text style={styles.summaryRowValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Total</Text>
          <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );

  // ── Payment step ─────────────────────────────────────────────────────────
  const renderPaymentStep = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <Text style={[styles.paymentHeader, { color: TEXT }]}>Order Summary</Text>
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
              <Text style={styles.summaryRowValue}>AUD {(DELIVERY_FEE_CENTS / 100).toFixed(2)}</Text>
            </View>
          </>
        )}
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryRowLabel}>
            {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup' ? 'Pay at pickup' : 'Stripe card fee'}
          </Text>
          <Text style={styles.summaryRowValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryRowLabel, styles.summaryTotalLabel]}>Total</Text>
          <Text style={[styles.summaryRowValue, styles.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>

      {orderType === 'pickup' && canPayAtPickup && (
        <View style={[styles.paymentChoiceCard, { backgroundColor: CARD, borderColor: BORDER }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: TEXT }}>Payment choice</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, lineHeight: 17 }}>
              This customer can pay now by card or pay at pickup.
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: effectivePaymentMethod === 'pay_at_pickup' ? GREEN : BLUE }}>
              {effectivePaymentMethod === 'pay_at_pickup' ? 'Pay at pickup' : 'Pay by card'}
            </Text>
            <Switch
              value={effectivePaymentMethod === 'pay_at_pickup'}
              onValueChange={(v) => setPaymentMethod(v ? 'pay_at_pickup' : 'card')}
              trackColor={{ false: BORDER, true: '#BBF7D0' }}
              thumbColor={effectivePaymentMethod === 'pay_at_pickup' ? GREEN : '#9CA3AF'}
            />
          </View>
        </View>
      )}

      <View style={[styles.orderDetailsCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.orderDetailRow}>
          <Feather name={orderType === 'delivery' ? 'truck' : 'map-pin'} size={14} color={BLUE} />
          <Text style={[styles.orderDetailText, { color: TEXT }]}>
            {orderType === 'delivery'
              ? `Delivery · ${street}, ${suburb} NSW ${postcode}`
              : 'In-store Pickup · Butterfield Merrylands'}
          </Text>
        </View>
        {selectedDate && (
          <View style={styles.orderDetailRow}>
            <Feather name="calendar" size={14} color={BLUE} />
            <Text style={[styles.orderDetailText, { color: TEXT }]}>
              {orderType === 'pickup' && selectedTimeMins !== null
                ? `${formatDateChip(sydNow, selectedDate)} at ${formatTime(selectedTimeMins)}`
                : selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
        )}
        {contactName && (
          <View style={styles.orderDetailRow}>
            <Feather name="user" size={14} color={BLUE} />
            <Text style={[styles.orderDetailText, { color: TEXT }]}>{contactName}</Text>
          </View>
        )}
      </View>

      <View style={[styles.secureCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
        <Feather name="lock" size={14} color="#22C55E" />
        <Text style={[styles.secureText, { color: '#166534' }]}>
          {orderType === 'pickup' && canPayAtPickup && effectivePaymentMethod === 'pay_at_pickup'
            ? 'Your order will be paid at pickup.'
            : 'Your order is securely processed with Stripe card checkout.'}
        </Text>
      </View>
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: CARD }}>

      {/* Fixed header */}
      <View style={[styles.checkoutHeader, { paddingTop: insets.top + 12, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <View style={styles.checkoutHeaderTop}>
          {step > 0 ? (
            <Pressable onPress={() => setStep((s) => s - 1)} style={styles.backBtn}>
              <Feather name="chevron-left" size={22} color={TEXT} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.checkoutTitle}>CHECKOUT</Text>
            <Text style={[styles.checkoutSub, { color: MUTED }]}>{totalItems} item{totalItems !== 1 ? 's' : ''}</Text>
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
                  <Feather name={tab.icon as any} size={13} color={active ? BLUE : done ? BLUE : MUTED} />
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

      {/* Scrollable content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && renderCartStep()}
          {step === 1 && renderShippingStep()}
          {step === 2 && renderPaymentStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 + (showNativeTabBar ? 49 : 0), backgroundColor: CARD, borderTopColor: BORDER }]}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>TOTAL</Text>
          <Text style={styles.bottomTotalAmount}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
        {step === 2 && effectivePaymentMethod === 'card' ? (
          stripePublishableKey ? (
          <StripeProvider publishableKey={stripePublishableKey}>
            <StripeCheckoutButton
              items={items.map((i) => ({
                productId: i.productId,
                variantId: i.variantId ?? null,
                quantity: i.quantity,
                selectedOptions: i.selectedOptions,
              }))}
              orderType={orderType}
              merchantDisplayName={stripeMerchantDisplayName}
              onSuccess={handlePlaceOrder}
            />
            </StripeProvider>
          ) : (
            <View style={[styles.continueBtn, { backgroundColor: '#9CA3AF', opacity: 0.9, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={styles.continueBtnText}>Stripe not configured</Text>
            </View>
          )
        ) : (
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
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  checkoutHeader:    { borderBottomWidth: 1, paddingBottom: 0 },
  checkoutHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn:           { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkoutTitle:     { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#1C1C1E', letterSpacing: 1.5 },
  checkoutSub:       { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  // Tab bar
  tabBar:       { flexDirection: 'row' },
  tabItem:      { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabInner:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel:     { fontSize: 11, letterSpacing: 0.5 },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5, borderRadius: 2 },
  // Content wrapper
  stepWrap:  { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#8E8E93', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  // Item cards
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, height: 90 },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#F5F6FA', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  itemOpts:   { fontSize: 12, color: '#8E8E93', lineHeight: 16 },
  itemPrice:  { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  qtyBtn:     { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },
  qtyBtnText: { fontSize: 16, color: '#1C1C1E', fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  qtyLabel:   { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  // Summary card
  summaryCard:      { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:  { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  summaryRowValue:  { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  summaryTotalLabel:{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#1C1C1E' },
  summaryTotalValue:{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#1C1C1E' },
  summaryDivider:   { height: 1 },
  shippingNote:     { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', paddingVertical: 4 },
  // Order type
  orderTypeRow: { flexDirection: 'row', gap: 10 },
  orderTypeCard:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  orderTypeIcon:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  orderTypeSub:   { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  // Delivery info card
  deliveryInfoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  deliveryInfoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deliveryInfoTag:  { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  deliveryInfoTitle:{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#1C1C1E', marginTop: 2 },
  deliveryInfoSub:  { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2 },
  // Choose date header
  chooseDateHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chooseDateTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  // Date grid (2-column)
  dateGrid: { flexDirection: 'row', gap: 10 },
  dateCard: { flex: 1, borderRadius: 14, padding: 14, gap: 3, alignItems: 'flex-start' },
  dateDayName:  { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  dateDayNum:   { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  dateTimeRange:{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  // Pickup times
  pickupTimeLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E', marginTop: 4 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timePill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  timePillText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  noSlots: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 8 },
  // Forms
  formCard:       { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  formFieldWrap:  { gap: 4 },
  formFieldLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#8E8E93' },
  formInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: '#F5F6FA' },
  formRow:        { flexDirection: 'row', gap: 10 },
  formNote:       { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  notesInput:     { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  // Payment step
  paymentHeader:    { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  paymentItem:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  paymentItemName:  { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  paymentItemPrice: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  paymentChoiceCard:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  orderDetailsCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  orderDetailRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderDetailText:  { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  secureCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  secureText:       { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  // Bottom bar
  bottomBar:       { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  bottomTotal:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomTotalLabel:{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#1C1C1E', letterSpacing: 1 },
  bottomTotalAmount:{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  continueBtn:     { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  // Success
  successWrap:    { flex: 1, alignItems: 'center', paddingHorizontal: 32, gap: 16, overflow: 'visible' },
  successCard:    { width: '100%', alignItems: 'center', gap: 16, zIndex: 2 },
  successGlow:    {
    width: '100%',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#0E4C6B',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    overflow: 'hidden',
  },
  successIcon:    { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  successTitle:   { fontSize: 28, fontFamily: 'Inter_800ExtraBold', color: '#083B57', textAlign: 'center', letterSpacing: -0.3 },
  successId:      { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: 'rgba(8,59,87,0.72)', letterSpacing: 0.8 },
  confettiLayer:  { ...StyleSheet.absoluteFillObject, overflow: 'visible' },
  characterStage: { position: 'absolute', left: -56, right: -56, bottom: -18, height: 420, justifyContent: 'flex-end', alignItems: 'center' },
  characterFrame: { width: '112%', maxWidth: 560, aspectRatio: 4256.5 / 3401.6 },
  successPointsBox: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', backgroundColor: '#FFF4D9', borderColor: '#F1C86A', borderWidth: 1.5, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 16 },
  successPointsBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFE7A6', alignItems: 'center', justifyContent: 'center' },
  successPointsCopy: { flex: 1, gap: 2 },
  successPointsLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, color: '#8A5B00', textTransform: 'uppercase' },
  successPointsNumber: { fontSize: 50, lineHeight: 52, fontFamily: 'Inter_800ExtraBold', color: '#7A4B00', includeFontPadding: false, textAlignVertical: 'center' },
  successPointsSuffix: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#5B3A00' },
  successInfoBox: { flexDirection: 'row', gap: 10, padding: 16, borderWidth: 1.5, borderRadius: 12, alignSelf: 'stretch', alignItems: 'flex-start' },
  successInfoText:{ flex: 1, color: '#92400E', fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 20 },
  slotBox:        { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, alignSelf: 'stretch', justifyContent: 'center' },
  slotText:       { fontSize: 14, fontFamily: 'Inter_500Medium' },
  successTotal:   { fontSize: 15, fontFamily: 'Inter_400Regular' },
  trackBtn:       { backgroundColor: '#40C0F2', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center' },
  trackBtnText:   { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  // Empty
  emptyWrap:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:      { fontSize: 20, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  emptySub:        { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  // Saved address chips
  savedAddrChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  savedAddrChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  savedAddrDot:      { width: 6, height: 6, borderRadius: 3, marginLeft: 2 },
  // State pills (delivery form)
  statePill:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  statePillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
