import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  PanResponder,
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
import { CardField, StripeProvider, useStripe, usePlatformPay, PlatformPay } from '@stripe/stripe-react-native';
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
  getDeliveryDates,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';
import { getPalette } from '@/constants/categoryColors';
import {
  getStoreAsapUnavailableReason,
  getStorePickupDates,
  isStoreOpenForAsap,
} from '@/lib/storeSchedule';

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

const DELIVERY_FEE_CENTS = 1200;

const PICKUP_WINDOWS = [
  { label: '9am – 12pm',  startMins: 9  * 60 },
  { label: '12pm – 3pm',  startMins: 12 * 60 },
  { label: '5pm – 7pm',   startMins: 17 * 60 },
  { label: '7pm – 9pm',   startMins: 19 * 60 },
];
const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;
const DELIVERY_ELIGIBLE_CATEGORIES = new Set(['cookies', 'boxes', 'merch']);

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

type PayMethod = 'credit_card' | 'apple_pay' | 'google_pay' | 'pay_at_pickup';

interface ValidatedDiscount {
  id: string;
  code: string;
  discountAmountCents: number;
  discountType: string;
  description: string | null;
}

function PaymentMethodRow({
  method,
  selected,
  label,
  subtitle,
  icon,
  onPress,
  disabled,
}: {
  method: PayMethod;
  selected: boolean;
  label: string;
  subtitle?: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        psStyles.methodRow,
        selected ? { borderColor: BLUE, backgroundColor: LIGHT_BLUE } : { borderColor: BORDER, backgroundColor: CARD },
        disabled ? { opacity: 0.45 } : {},
      ]}
    >
      <Feather name={icon as any} size={20} color={selected ? BLUE : MUTED} />
      <View style={{ flex: 1 }}>
        <Text style={[psStyles.methodLabel, { color: selected ? BLUE : TEXT }]}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      <View style={[psStyles.radioOuter, selected ? { borderColor: BLUE } : { borderColor: BORDER }]}>
        {selected && <View style={[psStyles.radioInner, { backgroundColor: BLUE }]} />}
      </View>
    </Pressable>
  );
}

function PaymentStepWithStripe({
  items,
  orderType,
  subtotalCents,
  canPayAtPickup,
  stripeReady,
  onSuccess,
}: {
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    selectedOptions?: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>;
  }>;
  orderType: 'pickup' | 'delivery';
  subtotalCents: number;
  canPayAtPickup: boolean;
  stripeReady: boolean;
  onSuccess: (opts: {
    stripePaymentIntentId?: string;
    paymentMethodType: string;
    discountCode?: string;
    discountCodeId?: string;
    discountAmountCents?: number;
    claimedRewardId?: string;
    loyaltyPointsUsed?: number;
    useFreeCoffeeReward?: boolean;
  }) => Promise<void>;
}) {
  const { confirmPayment, createPaymentMethod, handleNextAction } = useStripe();
  const { isPlatformPaySupported, confirmPlatformPayPayment } = usePlatformPay();

  const defaultMethod: PayMethod = Platform.OS === 'ios' ? 'apple_pay' : Platform.OS === 'android' ? 'google_pay' : 'credit_card';
  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [platformPayAvailable, setPlatformPayAvailable] = useState(false);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [saveCardForNextTime, setSaveCardForNextTime] = useState(true);
  const [discountApplied, setDiscountApplied] = useState<ValidatedDiscount | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedClaimedRewardId, setSelectedClaimedRewardId] = useState<string | null>(null);
  const selectedRewardRef = useRef<string | null>(null);
  const [freeRewardLine, setFreeRewardLine] = useState<{ productId: string; name: string } | null>(null);
  const freeRewardLineRef = useRef<{ productId: string; name: string } | null>(null);
  const qc = useQueryClient();

  const { data: claimedRewardsData } = useQuery({
    queryKey: ['loyalty-claimed-rewards'],
    queryFn: () => api.loyalty.claimedRewards(),
  });
  const { data: loyaltyProfileData } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
  });
  const { data: savedMethodsData } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: () => api.payment.methods(),
    enabled: stripeReady,
    staleTime: 60_000,
  });
  const claimedRewards: ClaimedReward[] = claimedRewardsData?.data ?? [];
  const savedPaymentMethods = savedMethodsData?.data ?? [];
  const availableLoyaltyPoints = loyaltyProfileData?.data?.loyaltyPoints ?? 0;
  const [pointsToUseInput, setPointsToUseInput] = useState('');

  // Keep ref in sync for cleanup on unmount
  useEffect(() => {
    selectedRewardRef.current = selectedClaimedRewardId;
  }, [selectedClaimedRewardId]);

  // Keep freeRewardLineRef in sync so unmount cleanup can access current value
  useEffect(() => {
    freeRewardLineRef.current = freeRewardLine;
  }, [freeRewardLine]);

  // Unapply any applied reward when the payment step unmounts (abandoned checkout)
  useEffect(() => {
    return () => {
      if (selectedRewardRef.current) {
        api.loyalty.unapplyClaim(selectedRewardRef.current).catch(() => {});
        selectedRewardRef.current = null;
      }
      freeRewardLineRef.current = null;
      setFreeRewardLine(null);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await isPlatformPaySupported();
      setPlatformPayAvailable(ok);
      if (!ok && (method === 'apple_pay' || method === 'google_pay')) {
        setMethod('credit_card');
      }
    })();
  }, []);

  useEffect(() => {
    if (method !== 'credit_card') return;
    if (!savedPaymentMethods.length) {
      setSelectedSavedPaymentMethodId(null);
      setShowAddCardForm(true);
      return;
    }

    setSelectedSavedPaymentMethodId((current) => {
      if (current && savedPaymentMethods.some((savedMethod) => savedMethod.id === current)) {
        return current;
      }
      const defaultMethodId = savedPaymentMethods.find((savedMethod) => savedMethod.isDefault)?.id;
      return defaultMethodId ?? savedPaymentMethods[0]?.id ?? null;
    });
    setShowAddCardForm(false);
  }, [method, savedPaymentMethods]);

  // If previously selected reward no longer available, clear selection
  useEffect(() => {
    if (selectedClaimedRewardId && !claimedRewards.find(c => c.id === selectedClaimedRewardId)) {
      setSelectedClaimedRewardId(null);
    }
  }, [claimedRewards, selectedClaimedRewardId]);

  // Apply/unapply reward on the server to track cart state
  const handleSelectReward = async (claimId: string | null) => {
    const prev = selectedClaimedRewardId;
    if (prev === claimId) return;

    // Clear any previously injected free item line
    setFreeRewardLine(null);

    if (prev) {
      api.loyalty.unapplyClaim(prev).catch(() => {});
    }
    if (claimId) {
      api.loyalty.applyClaim(claimId).catch(() => {});

      // If it's an item reward whose linked product is not already in cart,
      // show a visible free item line so the customer sees what will be added.
      const claim = claimedRewards.find(c => c.id === claimId);
      if (claim?.rewardType === 'item_reward' && claim.linkedProductId != null) {
        const alreadyInCart = items.some(i => i.productId === claim.linkedProductId);
        if (!alreadyInCart) {
          setFreeRewardLine({ productId: claim.linkedProductId, name: claim.rewardName ?? claim.linkedProductId });
        }
      }
    }
    setSelectedClaimedRewardId(claimId);
    qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
  };

  // Access full cart items (with prices) to compute item-reward discount for display
  const { items: cartItemsWithPrices } = useCart();

  const [useFreeCoffeeReward, setUseFreeCoffeeReward] = useState(false);
  const freeCoffeeRewards = loyaltyProfileData?.data?.freeCoffeeRewards ?? 0;
  const hasCoffeeInCart = cartItemsWithPrices.some(
    (i) => String((i as any).category ?? '').toLowerCase() === 'coffee',
  );

  const cheapestCoffeePriceCents = useMemo(() => {
    if (!useFreeCoffeeReward || !hasCoffeeInCart) return 0;
    const prices = cartItemsWithPrices
      .filter((i) => String((i as any).category ?? '').toLowerCase() === 'coffee')
      .map((i) => i.unitPriceCents ?? 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [useFreeCoffeeReward, hasCoffeeInCart, cartItemsWithPrices]);

  useEffect(() => {
    if (freeCoffeeRewards < 1 || !hasCoffeeInCart) setUseFreeCoffeeReward(false);
  }, [freeCoffeeRewards, hasCoffeeInCart]);

  const selectedClaimed = claimedRewards.find(c => c.id === selectedClaimedRewardId) ?? null;
  const claimedRewardDiscountCents = useMemo(() => {
    if (!selectedClaimed) return 0;
    if (selectedClaimed.rewardType === 'money_voucher') return selectedClaimed.voucherValueCents ?? 0;
    if (selectedClaimed.rewardType === 'item_reward' && selectedClaimed.linkedProductId) {
      // One free unit of the linked product — subtract its unit price from the display total
      const matchingItem = cartItemsWithPrices.find(i => i.productId === selectedClaimed.linkedProductId);
      return matchingItem ? matchingItem.unitPriceCents : 0;
    }
    return 0;
  }, [selectedClaimed, cartItemsWithPrices]);

  const discountCents = (discountApplied?.discountAmountCents ?? 0) + claimedRewardDiscountCents + cheapestCoffeePriceCents;
  const deliveryCents = orderType === 'delivery' ? DELIVERY_FEE_CENTS : 0;
  const baseForFee = subtotalCents + deliveryCents - discountCents;
  const stripeFee = method === 'pay_at_pickup' ? 0 : estimateStripeFeeCents(Math.max(0, baseForFee));
  const totalBeforePointsCents = Math.max(0, baseForFee + stripeFee);
  const maxUsablePoints = Math.min(availableLoyaltyPoints, Math.floor(totalBeforePointsCents / LOYALTY_POINT_VALUE_CENTS));
  const requestedPointsToUse = Math.max(0, Math.floor(Number(pointsToUseInput.replace(/\D/g, '') || '0')));
  const loyaltyPointsUsed = Math.min(requestedPointsToUse, maxUsablePoints);
  const loyaltyPointsDiscountCents = loyaltyPointsUsed * LOYALTY_POINT_VALUE_CENTS;
  const totalCents = Math.max(0, totalBeforePointsCents - loyaltyPointsDiscountCents);
  const totalLabel = `AUD ${(totalCents / 100).toFixed(2)}`;

  useEffect(() => {
    if (requestedPointsToUse !== loyaltyPointsUsed) {
      setPointsToUseInput(loyaltyPointsUsed > 0 ? String(loyaltyPointsUsed) : '');
    }
  }, [loyaltyPointsUsed, requestedPointsToUse]);

  const applyDiscount = async () => {
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setValidatingDiscount(true);
    setDiscountError('');
    try {
      const res = await api.discounts.validate({ code, items: items as any[], orderType });
      setDiscountApplied(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setDiscountError(e?.message ?? 'Invalid discount code.');
      setDiscountApplied(null);
    } finally {
      setValidatingDiscount(false);
    }
  };

  const removeDiscount = () => {
    setDiscountApplied(null);
    setDiscountInput('');
    setDiscountError('');
  };

  const handlePay = async () => {
    if (busy) return;
    if (method === 'pay_at_pickup') {
      setBusy(true);
      try {
        await onSuccess({
          paymentMethodType: 'pay_at_pickup',
          discountCode: discountApplied?.code,
          discountCodeId: discountApplied?.id,
          discountAmountCents: discountApplied?.discountAmountCents,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!stripeReady) {
      Alert.alert('Payment unavailable', 'Payment processing is not available right now.');
      return;
    }

    setBusy(true);
    try {
      if (method === 'credit_card' && selectedSavedPaymentMethodId && !showAddCardForm) {
        const savedPayment = await api.payment.confirmSavedMethod({
          items: items as any[],
          orderType,
          discountCode: discountApplied?.code,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          paymentMethodId: selectedSavedPaymentMethodId,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });

        if (savedPayment.paymentRequired === false || savedPayment.amountCents === 0) {
          await onSuccess({
            paymentMethodType: 'free_reward',
            discountCode: discountApplied?.code,
            discountCodeId: discountApplied?.id,
            discountAmountCents: discountApplied?.discountAmountCents,
            claimedRewardId: selectedClaimedRewardId ?? undefined,
            loyaltyPointsUsed: loyaltyPointsUsed || undefined,
            useFreeCoffeeReward: useFreeCoffeeReward || undefined,
          });
          return;
        }

        if (savedPayment.requiresAction && savedPayment.clientSecret && savedPayment.paymentIntentId) {
          const { error: nextActionError } = await handleNextAction(savedPayment.clientSecret);
          if (nextActionError) {
            throw new Error(nextActionError.message);
          }
          const finalized = await api.payment.confirmIntent(savedPayment.paymentIntentId);
          if (!finalized.success) {
            throw new Error('We could not finalize that saved-card payment. Please try again.');
          }
        }

        if (!savedPayment.success) {
          throw new Error('We could not charge that saved card. Please try another card.');
        }

        await onSuccess({
          stripePaymentIntentId: savedPayment.paymentIntentId ?? undefined,
          paymentMethodType: 'credit_card',
          discountCode: discountApplied?.code,
          discountCodeId: discountApplied?.id,
          discountAmountCents: discountApplied?.discountAmountCents,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });
        return;
      }

      if (method === 'credit_card' && showAddCardForm && saveCardForNextTime) {
        const { paymentMethod, error: paymentMethodError } = await createPaymentMethod({
          paymentMethodType: 'Card',
        });
        if (paymentMethodError) throw new Error(paymentMethodError.message);
        if (!paymentMethod?.id) throw new Error('We could not save that card. Please try again.');

        await api.payment.saveMethod({
          paymentMethodId: paymentMethod.id,
          setAsDefault: savedPaymentMethods.length === 0,
        });
        qc.invalidateQueries({ queryKey: ['payment-methods'] });

        const savedPayment = await api.payment.confirmSavedMethod({
          items: items as any[],
          orderType,
          discountCode: discountApplied?.code,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          paymentMethodId: paymentMethod.id,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });

        if (savedPayment.paymentRequired === false || savedPayment.amountCents === 0) {
          await onSuccess({
            paymentMethodType: 'free_reward',
            discountCode: discountApplied?.code,
            discountCodeId: discountApplied?.id,
            discountAmountCents: discountApplied?.discountAmountCents,
            claimedRewardId: selectedClaimedRewardId ?? undefined,
            loyaltyPointsUsed: loyaltyPointsUsed || undefined,
            useFreeCoffeeReward: useFreeCoffeeReward || undefined,
          });
          return;
        }

        if (savedPayment.requiresAction && savedPayment.clientSecret && savedPayment.paymentIntentId) {
          const { error: nextActionError } = await handleNextAction(savedPayment.clientSecret);
          if (nextActionError) {
            throw new Error(nextActionError.message);
          }
          const finalized = await api.payment.confirmIntent(savedPayment.paymentIntentId);
          if (!finalized.success) {
            throw new Error('We could not finalize your saved card. Please try again.');
          }
        } else if (!savedPayment.success) {
          throw new Error('We could not charge that card. Please try again.');
        }

        await onSuccess({
          stripePaymentIntentId: savedPayment.paymentIntentId ?? undefined,
          paymentMethodType: 'credit_card',
          discountCode: discountApplied?.code,
          discountCodeId: discountApplied?.id,
          discountAmountCents: discountApplied?.discountAmountCents,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });
        return;
      }

      const intent = await api.payment.createIntent({
        items: items as any[],
        orderType,
        discountCode: discountApplied?.code,
        claimedRewardId: selectedClaimedRewardId ?? undefined,
        loyaltyPointsUsed: loyaltyPointsUsed || undefined,
        savePaymentMethod: method === 'credit_card' ? saveCardForNextTime : false,
        useFreeCoffeeReward: useFreeCoffeeReward || undefined,
      });

      // Zero-total orders (e.g. free item reward with empty cart) skip Stripe entirely
      if (intent.amountCents === 0 || intent.paymentRequired === false) {
        await onSuccess({
          paymentMethodType: 'free_reward',
          discountCode: discountApplied?.code,
          discountCodeId: discountApplied?.id,
          discountAmountCents: discountApplied?.discountAmountCents,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });
        return;
      }

      if (method === 'apple_pay' || method === 'google_pay') {
        const displayItems = [
          { label: 'Subtotal', amount: String(subtotalCents / 100), type: 'final' as const, isPending: false },
          ...(deliveryCents > 0 ? [{ label: 'Delivery', amount: String(deliveryCents / 100), type: 'final' as const, isPending: false }] : []),
          ...(discountCents > 0 ? [{ label: 'Discount', amount: String(-discountCents / 100), type: 'final' as const, isPending: false }] : []),
          { label: 'Butterfield Cookies', amount: String(intent.amountCents / 100), type: 'final' as const, isPending: false },
        ];
        const { error: ppError } = await confirmPlatformPayPayment(intent.clientSecret!, {
          applePay: {
            cartItems: displayItems,
            merchantCountryCode: 'AU',
            currencyCode: 'AUD',
          },
          googlePay: {
            testEnv: false,
            merchantName: 'Butterfield Cookies',
            merchantCountryCode: 'AU',
            currencyCode: 'AUD',
            billingAddressConfig: { format: PlatformPay.BillingAddressFormat.Full },
          },
        } as any);
        if (ppError) throw new Error(ppError.message);
        await onSuccess({
          stripePaymentIntentId: intent.paymentIntentId ?? undefined,
          paymentMethodType: method,
          discountCode: discountApplied?.code,
          discountCodeId: discountApplied?.id,
          discountAmountCents: discountApplied?.discountAmountCents,
          claimedRewardId: selectedClaimedRewardId ?? undefined,
          loyaltyPointsUsed: loyaltyPointsUsed || undefined,
          useFreeCoffeeReward: useFreeCoffeeReward || undefined,
        });
        return;
      }

      const { paymentIntent: pi, error: piError } = await confirmPayment(intent.clientSecret!, {
        paymentMethodType: 'Card',
      } as any);
      if (piError) throw new Error(piError.message);
      if (!pi) throw new Error('Payment confirmation failed.');
      await onSuccess({
        stripePaymentIntentId: pi.id,
        paymentMethodType: 'credit_card',
        discountCode: discountApplied?.code,
        discountCodeId: discountApplied?.id,
        discountAmountCents: discountApplied?.discountAmountCents,
        claimedRewardId: selectedClaimedRewardId ?? undefined,
        loyaltyPointsUsed: loyaltyPointsUsed || undefined,
        useFreeCoffeeReward: useFreeCoffeeReward || undefined,
      });
    } catch (e: any) {
      Alert.alert('Payment failed', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={psStyles.wrap}>
      <Text style={psStyles.sectionTitle}>Payment method</Text>

      {stripeReady && platformPayAvailable && (
        <>
          {Platform.OS === 'ios' && (
            <PaymentMethodRow
              method="apple_pay"
              selected={method === 'apple_pay'}
              label="Apple Pay"
              subtitle="Touch ID or Face ID"
              icon="smartphone"
              onPress={() => setMethod('apple_pay')}
            />
          )}
          {Platform.OS === 'android' && (
            <PaymentMethodRow
              method="google_pay"
              selected={method === 'google_pay'}
              label="Google Pay"
              subtitle="Tap to pay"
              icon="smartphone"
              onPress={() => setMethod('google_pay')}
            />
          )}
        </>
      )}

      {stripeReady && (
        <PaymentMethodRow
          method="credit_card"
          selected={method === 'credit_card'}
          label="Credit or debit card"
          subtitle="Visa, Mastercard, Amex"
          icon="credit-card"
          onPress={() => setMethod('credit_card')}
        />
      )}

      {canPayAtPickup && orderType === 'pickup' && (
        <PaymentMethodRow
          method="pay_at_pickup"
          selected={method === 'pay_at_pickup'}
          label="Pay at pickup"
          subtitle="Pay in store when you arrive"
          icon="map-pin"
          onPress={() => setMethod('pay_at_pickup')}
        />
      )}

      {!stripeReady && orderType !== 'pickup' && (
        <View style={[psStyles.noticeRow, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Feather name="alert-triangle" size={14} color="#D97706" />
          <Text style={{ flex: 1, fontSize: 12, color: '#92400E' }}>
            Card payments are not available right now. Please try again later.
          </Text>
        </View>
      )}

      {method === 'credit_card' && stripeReady && (
        <View style={psStyles.cardFieldWrap}>
          {savedPaymentMethods.length > 0 && (
            <View style={psStyles.savedMethodsWrap}>
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
                      psStyles.savedMethodRow,
                      selected
                        ? { borderColor: BLUE, backgroundColor: LIGHT_BLUE }
                        : { borderColor: BORDER, backgroundColor: CARD },
                    ]}
                  >
                    <View style={psStyles.savedMethodIcon}>
                      <Feather name="credit-card" size={18} color={selected ? BLUE : MUTED} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={psStyles.savedMethodHeader}>
                        <Text style={[psStyles.savedMethodBrand, selected && { color: BLUE }]}>
                          {savedMethod.brand.toUpperCase()} ending in {savedMethod.last4}
                        </Text>
                        {savedMethod.isDefault && (
                          <View style={psStyles.defaultBadge}>
                            <Text style={psStyles.defaultBadgeText}>Default</Text>
                          </View>
                        )}
                      </View>
                      <Text style={psStyles.savedMethodMeta}>
                        Expires {`${String(savedMethod.expMonth ?? '').padStart(2, '0')}/${String(savedMethod.expYear ?? '').slice(-2)}`}
                      </Text>
                    </View>
                    <View style={[psStyles.radioOuter, selected ? { borderColor: BLUE } : { borderColor: BORDER }]}>
                      {selected && <View style={[psStyles.radioInner, { backgroundColor: BLUE }]} />}
                    </View>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => {
                  setShowAddCardForm((current) => {
                    const next = !current;
                    if (next) {
                      setSelectedSavedPaymentMethodId(null);
                    } else if (savedPaymentMethods.length > 0) {
                      setSelectedSavedPaymentMethodId(
                        savedPaymentMethods.find((savedMethod) => savedMethod.isDefault)?.id ?? savedPaymentMethods[0]?.id ?? null,
                      );
                    }
                    return next;
                  });
                }}
                style={psStyles.addCardToggle}
              >
                <Feather name={showAddCardForm ? 'check-circle' : 'plus-circle'} size={16} color={BLUE} />
                <Text style={psStyles.addCardToggleText}>
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
              <View style={psStyles.saveCardRowCompact}>
                <View style={{ flex: 1 }}>
                  <Text style={psStyles.saveCardLabel}>Remember card for next time</Text>
                  <Text style={psStyles.savedCardSub}>
                    Stored securely by Stripe for quicker checkout next time.
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

      {claimedRewards.length > 0 && (
        <>
          <Text style={[psStyles.sectionTitle, { marginTop: 8 }]}>Rewards</Text>
          <View style={{ gap: 8 }}>
            {claimedRewards.map((c) => {
              const isVoucher = c.rewardType === 'money_voucher';
              const isSelected = selectedClaimedRewardId === c.id;
              const itemAlreadyInCart = !isVoucher && c.linkedProductId != null &&
                items.some(i => i.productId === c.linkedProductId);
              const itemSubtitle = isVoucher
                ? `$${((c.voucherValueCents ?? 0) / 100).toFixed(2)} off your order`
                : itemAlreadyInCart
                  ? `${c.rewardName} in your cart — tap to make it free`
                  : `Tap to add ${c.rewardName} to your order for free`;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    handleSelectReward(isSelected ? null : c.id);
                  }}
                  style={[
                    psStyles.methodRow,
                    { borderColor: isSelected ? GREEN : BORDER, backgroundColor: isSelected ? '#F0FFF4' : CARD },
                  ]}
                >
                  <View style={[psStyles.radioOuter, { borderColor: isSelected ? GREEN : MUTED }]}>
                    {isSelected && <View style={[psStyles.radioInner, { backgroundColor: GREEN }]} />}
                  </View>
                  <Feather name={isVoucher ? 'tag' : 'gift'} size={18} color={isSelected ? '#16A34A' : MUTED} />
                  <View style={{ flex: 1 }}>
                    <Text style={[psStyles.methodLabel, { color: isSelected ? '#166534' : TEXT }]}>{c.rewardName}</Text>
                    <Text style={{ fontSize: 12, color: isSelected ? '#15803D' : MUTED }}>
                      {itemSubtitle}
                    </Text>
                  </View>
                  {isSelected && (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#16A34A' }}>
                      {isVoucher ? `-AUD ${((c.voucherValueCents ?? 0) / 100).toFixed(2)}` : 'Free'}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {freeRewardLine && (
        <View style={{ marginBottom: 4 }}>
          <Text style={[psStyles.sectionTitle, { marginTop: 0, marginBottom: 6 }]}>Added to order</Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: '#F0FFF4', borderRadius: 10, borderWidth: 1,
            borderColor: '#BBF7D0', padding: 12,
          }}>
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="gift" size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534' }}>{freeRewardLine.name}</Text>
              <Text style={{ fontSize: 11, color: '#15803D', marginTop: 1 }}>Qty: 1 — reward applied at checkout</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#16A34A' }}>Free</Text>
          </View>
        </View>
      )}

      <Text style={[psStyles.sectionTitle, { marginTop: 8 }]}>Discount code</Text>
      {discountApplied ? (
        <View style={psStyles.discountApplied}>
          <Feather name="tag" size={14} color="#16A34A" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534' }}>{discountApplied.code}</Text>
            {discountApplied.description ? (
              <Text style={{ fontSize: 11, color: '#4ADE80', marginTop: 1 }}>{discountApplied.description}</Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>
            -AUD {(discountApplied.discountAmountCents / 100).toFixed(2)}
          </Text>
          <Pressable onPress={removeDiscount} style={{ padding: 4 }}>
            <Feather name="x" size={16} color="#16A34A" />
          </Pressable>
        </View>
      ) : (
        <View style={psStyles.discountRow}>
          <TextInput
            style={[psStyles.discountInput, { borderColor: discountError ? CHERRY : BORDER, color: TEXT }]}
            placeholder="Enter code"
            placeholderTextColor={MUTED}
            value={discountInput}
            onChangeText={(t) => { setDiscountInput(t); setDiscountError(''); }}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={applyDiscount}
          />
          <Pressable
            onPress={applyDiscount}
            disabled={!discountInput.trim() || validatingDiscount}
            style={[psStyles.applyBtn, { backgroundColor: discountInput.trim() ? BLUE : BORDER }]}
          >
            {validatingDiscount
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ fontSize: 13, fontWeight: '600', color: discountInput.trim() ? '#fff' : MUTED }}>Apply</Text>}
          </Pressable>
        </View>
      )}
      {!!discountError && <Text style={{ fontSize: 12, color: CHERRY, marginTop: 2 }}>{discountError}</Text>}

      {freeCoffeeRewards > 0 && hasCoffeeInCart && (
        <View style={psStyles.freeCoffeeRow}>
          <View style={{ flex: 1 }}>
            <Text style={psStyles.freeCoffeeTitle}>Free coffee reward</Text>
            <Text style={psStyles.freeCoffeeSub}>
              {freeCoffeeRewards} available · Thanks for being part of Butterfield.
            </Text>
          </View>
          <Switch
            value={useFreeCoffeeReward}
            onValueChange={(v) => {
              setUseFreeCoffeeReward(v);
              Haptics.selectionAsync();
            }}
            trackColor={{ false: BORDER, true: BLUE }}
            thumbColor="#fff"
          />
        </View>
      )}

      <Text style={[psStyles.sectionTitle, { marginTop: 8 }]}>Use points</Text>
      <View style={psStyles.pointsCard}>
        <View style={psStyles.pointsCardTop}>
          <View>
            <Text style={psStyles.pointsCardValue}>{availableLoyaltyPoints}</Text>
            <Text style={psStyles.pointsCardSub}>Available as {`AUD ${(availableLoyaltyPoints * LOYALTY_POINT_VALUE_CENTS / 100).toFixed(2)}`}</Text>
          </View>
          <Pressable
            onPress={() => setPointsToUseInput(maxUsablePoints > 0 ? String(maxUsablePoints) : '')}
            disabled={maxUsablePoints < 1}
            style={[psStyles.pointsQuickBtn, maxUsablePoints < 1 && { opacity: 0.45 }]}
          >
            <Text style={psStyles.pointsQuickBtnText}>Use all</Text>
          </Pressable>
        </View>
        <View style={psStyles.pointsInputRow}>
          <TextInput
            style={psStyles.pointsInput}
            placeholder="0"
            placeholderTextColor={MUTED}
            value={pointsToUseInput}
            onChangeText={(text) => setPointsToUseInput(text.replace(/\D/g, ''))}
            keyboardType="number-pad"
          />
          <Text style={psStyles.pointsInputMeta}>
            {loyaltyPointsUsed > 0 ? `-${(loyaltyPointsDiscountCents / 100).toFixed(2)} at checkout` : `${maxUsablePoints} max now`}
          </Text>
        </View>
      </View>

      <View style={[psStyles.totalRow, { marginTop: 4 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          {(discountApplied?.discountAmountCents ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#16A34A' }}>Discount code</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>-AUD {((discountApplied?.discountAmountCents ?? 0) / 100).toFixed(2)}</Text>
            </View>
          )}
          {claimedRewardDiscountCents > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#16A34A' }}>Reward voucher</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>-AUD {(claimedRewardDiscountCents / 100).toFixed(2)}</Text>
            </View>
          )}
          {cheapestCoffeePriceCents > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#16A34A' }}>Free coffee reward</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>-AUD {(cheapestCoffeePriceCents / 100).toFixed(2)}</Text>
            </View>
          )}
          {loyaltyPointsDiscountCents > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#16A34A' }}>Loyalty points</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>-AUD {(loyaltyPointsDiscountCents / 100).toFixed(2)}</Text>
            </View>
          )}
          {selectedClaimed?.rewardType === 'item_reward' && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#16A34A' }}>
                {items.some((i) => i.productId === selectedClaimed.linkedProductId)
                  ? `${selectedClaimed.rewardName} made free`
                  : `${selectedClaimed.rewardName} added free`}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A' }}>Free</Text>
            </View>
          )}
          {method !== 'pay_at_pickup' && stripeFee > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: MUTED }}>Card processing fee</Text>
              <Text style={{ fontSize: 12, color: MUTED }}>AUD {(stripeFee / 100).toFixed(2)}</Text>
            </View>
          )}
        </View>
      </View>

      <Pressable
        onPress={handlePay}
        disabled={busy || (!stripeReady && method !== 'pay_at_pickup')}
        style={[
          styles.continueBtn,
          {
            backgroundColor: busy ? '#9CA3AF' : CHERRY,
            opacity: busy ? 0.85 : 1,
            marginTop: 4,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.continueBtnText}>
            {method === 'pay_at_pickup' ? 'Place Order' : `Pay ${totalLabel}`}
          </Text>
        )}
      </Pressable>

      <View style={[psStyles.secureRow]}>
        <Feather name="lock" size={11} color={MUTED} />
        <Text style={{ fontSize: 11, color: MUTED }}>
          {method === 'pay_at_pickup'
            ? 'Order will be paid at pickup.'
            : method === 'credit_card'
              ? showAddCardForm || savedPaymentMethods.length === 0
                ? 'Secured by Stripe. Card details stay in-app during checkout.'
                : 'Secured by Stripe. Your selected saved card will be charged securely.'
              : 'Secured by Stripe with Apple Pay or Google Pay.'}
        </Text>
      </View>
    </View>
  );
}

const psStyles = StyleSheet.create({
  wrap:          { gap: 10 },
  sectionTitle:  { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  methodRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  methodLabel:   { fontSize: 14, fontWeight: '600' },
  radioOuter:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner:    { width: 10, height: 10, borderRadius: 5 },
  cardFieldWrap: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, padding: 12, overflow: 'hidden' },
  savedMethodsWrap:{ gap: 10 },
  savedMethodRow:{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  savedMethodIcon:{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  savedMethodHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  savedMethodBrand:{ fontSize: 13, fontWeight: '700', color: TEXT },
  savedMethodMeta:{ marginTop: 3, fontSize: 12, color: MUTED },
  defaultBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#DBEAFE' },
  defaultBadgeText:{ fontSize: 10, fontWeight: '700', color: BLUE, textTransform: 'uppercase', letterSpacing: 0.4 },
  addCardToggle:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DBEAFE' },
  addCardToggleText:{ fontSize: 13, fontWeight: '600', color: BLUE },
  savedCardSub:  { marginTop: 3, fontSize: 12, lineHeight: 18, color: MUTED },
  saveCardRowCompact:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER },
  saveCardLabel: { fontSize: 13, fontWeight: '600', color: TEXT },
  discountRow:   { flexDirection: 'row', gap: 8 },
  discountInput: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '600', letterSpacing: 0, backgroundColor: CARD },
  applyBtn:      { paddingHorizontal: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  discountApplied:{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC' },
  pointsCard:    { gap: 10, padding: 14, borderRadius: 14, backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER },
  pointsCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointsCardValue:{ fontSize: 22, fontWeight: '700', color: TEXT },
  pointsCardSub: { marginTop: 2, fontSize: 12, color: MUTED },
  pointsQuickBtn:{ marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: LIGHT_BLUE, borderWidth: 1, borderColor: '#BFDBFE' },
  pointsQuickBtnText:{ fontSize: 12, fontWeight: '700', color: BLUE },
  pointsInputRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointsInput:   { width: 92, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '700', color: TEXT, backgroundColor: '#F8FAFC', borderColor: BORDER },
  pointsInputMeta:{ flex: 1, fontSize: 12, lineHeight: 17, color: MUTED },
  totalRow:      { gap: 4 },
  secureRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingTop: 4 },
  noticeRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  freeCoffeeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER, marginTop: 8 },
  freeCoffeeTitle: { fontSize: 14, fontWeight: '600', color: TEXT },
  freeCoffeeSub:   { marginTop: 2, fontSize: 12, color: MUTED },
});

interface Confirmation {
  orderId: string;
  orderNumber?: string | null;
  totalCents: number;
  type: string;
  scheduledLabel?: string;
  paymentMethodType?: string;
  isScheduled?: boolean;
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
  const { user } = useAuth();
  if (!user) return <LoggedOutAccountPrompt redirectTo="/(customer)/cart" compact />;
  return <CartContent />;
}

function CartContent() {
  const insets   = useSafeAreaInsets();
  const { user } = useAuth();
  const { items, totalPriceCents, totalItems, addItemToCart, updateItemQuantity, removeCartItem, clearCart, cartRestoredFromSession, dismissCartRestoredBanner } = useCart();
  const qc = useQueryClient();
  const routeParams = useLocalSearchParams<{ success?: string }>();

  const { data: allProductsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    staleTime: 5 * 60_000,
  });

  const cartProductIdsKey = items.map((i) => i.productId).join(',');
  const cartSuggestedProducts = useMemo(() => {
    const allProducts = allProductsData?.data ?? [];
    if (allProducts.length === 0 || items.length === 0) return [];
    const cartProductIds = items.map((i) => i.productId);
    const cartCategories = items.map((i) => i.category ?? '').filter(Boolean);
    return getSuggestedProductsForCart(cartProductIds, cartCategories, allProducts, 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIdsKey, allProductsData]);

  const [step, setStep]                       = useState(0);
  const [orderType, setOrderType]             = useState<'pickup' | 'delivery'>('pickup');
  const [selectedDate, setSelectedDate]       = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);
  const [pickupWindow, setPickupWindow]         = useState<string | null>(null);
  const [pickupMode, setPickupMode]           = useState<'asap' | 'scheduled'>('scheduled');
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

  const canExitCart = step === 0;
  const cartCategoryFlags = useMemo(() => {
    const categories = items
      .map((item) => `${item.category ?? ''}`.trim().toLowerCase())
      .filter(Boolean);

    const hasDeliverableItems = categories.some((category) => DELIVERY_ELIGIBLE_CATEGORIES.has(category));
    const hasUndeliverableItems = items.some((item) => {
      const category = `${item.category ?? ''}`.trim().toLowerCase();
      return !DELIVERY_ELIGIBLE_CATEGORIES.has(category);
    });

    return {
      hasDeliverableItems,
      hasUndeliverableItems,
      deliveryEnabled: items.length > 0 && !hasUndeliverableItems,
    };
  }, [items]);
  const { hasDeliverableItems, hasUndeliverableItems, deliveryEnabled } = cartCategoryFlags;
  const showMixedDeliveryMessage = hasDeliverableItems && hasUndeliverableItems;

  useEffect(() => {
    if (!deliveryEnabled && orderType === 'delivery') {
      setOrderType('pickup');
      setSelectedDate(null);
      setSelectedTimeMins(null);
      setPickupMode('scheduled');
    }
  }, [deliveryEnabled, orderType, setPickupMode]);

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

  // Helper: fill delivery form from a saved address
  const fillFromAddress = (addr: SavedAddress) => {
    setStreet(addr.street);
    setApt(addr.apt ?? '');
    setSuburb(addr.suburb);
    setPostcode(addr.postcode);
    setAddrState(addr.state);
    setSelectedAddressId(addr.id);
  };

  // Pre-fill contact from server profile (phone lives in /me response, not the JWT)
  useEffect(() => {
    const freshUser = meData?.user ?? user;
    if (!freshUser) return;
    if (!contactName)  setContactName(freshUser.name ?? '');
    if (!contactEmail) setContactEmail(freshUser.email ?? '');
    if (!contactPhone) {
      const phone = (meData?.user as any)?.phone ?? (user as any)?.phone;
      if (phone) setContactPhone(phone);
    }
  }, [user, meData]);

  // Auto-fill default address when delivery tab is opened
  useEffect(() => {
    if (orderType === 'delivery' && defaultAddress && !street) {
      fillFromAddress(defaultAddress);
    }
  }, [orderType, defaultAddress]);

  const subtotalCents = totalPriceCents;
  const { stripeFee: stripeFeeCents, total: totalCents } = calcTotals(subtotalCents, step, orderType, 'card');

  const sydNow        = getSydneyNow();
  const storeOpen     = isStoreOpenForAsap(selectedStore, sydNow);
  const deliveryDates = getDeliveryDates();
  const pickupDates   = getStorePickupDates(selectedStore, sydNow);

  useEffect(() => {
    if (orderType !== 'pickup') return;
    setPickupMode(storeOpen ? 'asap' : 'scheduled');
  }, [orderType, storeOpen, selectedStore?.id]);

  useEffect(() => {
    if (orderType !== 'pickup' || !selectedDate) return;
    const dateStillAvailable = pickupDates.some((date) => isSameDay(date, selectedDate));
    if (!dateStillAvailable) {
      setSelectedDate(null);
      setSelectedTimeMins(null);
      setPickupWindow(null);
    }
  }, [orderType, pickupDates, selectedDate]);

  // Guard delivery date — clear if it falls outside the available Mon/Thu slots
  useEffect(() => {
    if (orderType !== 'delivery' || !selectedDate) return;
    const availableDeliveryDates = deliveryDates.filter(s => s.available).map(s => s.date);
    const stillAvailable = availableDeliveryDates.some(d => isSameDay(d, selectedDate));
    if (!stillAvailable) setSelectedDate(null);
  }, [orderType, deliveryDates, selectedDate]);


  const handleContinue = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      if (orderType === 'pickup') {
        if (pickupMode === 'scheduled' && (!selectedDate || pickupWindow === null)) {
          Alert.alert('Select pickup time', 'Please choose a date and pickup window.');
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
  };

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
      if (orderType === 'pickup') {
        if (pickupMode === 'asap') {
          scheduledLabel = 'Pickup: Within 10 minutes';
        } else if (selectedDate && pickupWindow !== null) {
          const win = PICKUP_WINDOWS.find(w => w.label === pickupWindow);
          const d = new Date(selectedDate);
          d.setHours(Math.floor((win?.startMins ?? 540) / 60), (win?.startMins ?? 540) % 60, 0, 0);
          scheduledForDate = d;
          scheduledLabel = `Pickup ${formatDateChip(sydNow, selectedDate)}, ${pickupWindow}`;
        }
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
      setConfirmation({ orderId: order.data.id, orderNumber: order.data.orderNumber, totalCents: serverTotal, type: orderType, scheduledLabel, paymentMethodType: opts.paymentMethodType, isScheduled: (order.data as any).status === 'scheduled' });
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
    const earnedPoints = Math.max(0, Math.floor(confirmation.totalCents / 100));
    const orderShortId = confirmation.orderNumber ?? `#${confirmation.orderId.slice(0, 8).toUpperCase()}`;
    const placedLabel = new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
    return (
      <View style={[styles.successWrap, { backgroundColor: '#FFFFFF' }]}>
        <ScrollView
          style={{ flex: 1, width: '100%', backgroundColor: '#FFFFFF' }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.successCard}>
            <View style={styles.successGlow}>
              <View style={styles.successContentBlock}>
                <View style={styles.successTopBar}>
                  <Pressable
                    onPress={() => {
                      clearCart();
                      router.dismissAll();
                      router.replace('/(tabs)');
                    }}
                    style={styles.successTopBack}
                  >
                    <Feather name="chevron-left" size={22} color={CHERRY} />
                  </Pressable>
                  <Text style={styles.successTopTitle}>Thank You</Text>
                  <View style={styles.successTopSpacer} />
                </View>
                <View style={styles.characterStage} pointerEvents="none">
                  <View style={styles.characterFrame}>
                    <Image
                      source={require('../../assets/images/thank-you-cookie-character.png')}
                      style={styles.characterImage}
                      contentFit="contain"
                    />
                  </View>
                </View>
                <View style={styles.successHero}>
                  <Text style={styles.successTitle}>Thank you!</Text>
                  <Text style={styles.successOrderLine}>
                    Order Number: <Text style={styles.successOrderStrong}>{orderShortId}</Text>
                  </Text>
                  <Text style={styles.successDescription}>
                    {confirmation.isScheduled
                      ? `Your order has been placed and is awaiting confirmation for ${confirmation.scheduledLabel?.replace('Delivery on ', '') ?? 'your selected delivery date'}. You'll receive a push notification once confirmed.`
                      : confirmation.paymentMethodType === 'pay_at_pickup'
                        ? 'Your order is locked in. Please pay at the counter — check My Orders for live status updates.'
                        : 'Your order is being prepared. Tap Track My Order below to follow its live status.'}
                  </Text>
                </View>
                <View style={styles.successSummaryCard}>
                  <View style={styles.successSummaryTop}>
                    <View style={styles.successSummaryPriceWrap}>
                      <Text style={styles.successSummaryPrice}>AUD {(confirmation.totalCents / 100).toFixed(2)}</Text>
                      <Text style={styles.successSummaryOrderId}>{orderShortId}</Text>
                    </View>
                    {confirmation.paymentMethodType !== 'pay_at_pickup' && (
                      <Pressable
                        onPress={() => {
                          clearCart();
                          router.dismissAll();
                          router.replace('/(tabs)' as any);
                          setTimeout(() => {
                            router.push(`/(customer)/track/${confirmation.orderId}` as any);
                          }, 50);
                        }}
                        style={styles.successTrackLink}
                      >
                        <Text style={styles.successTrackText}>Track</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={styles.successDivider} />
                  <View style={styles.successSummaryBottom}>
                    <View style={styles.successStatusRow}>
                      <Feather name={confirmation.isScheduled ? 'clock' : 'package'} size={14} color="#A35A00" />
                      <Text style={styles.successStatusText}>{confirmation.isScheduled ? 'Awaiting confirmation' : 'Being prepared'}</Text>
                    </View>
                    <Text style={styles.successDateText}>{placedLabel}</Text>
                  </View>
                </View>
                <View style={styles.successPointsInline}>
                  <Feather name="star" size={15} color="#A35A00" />
                  <Text style={styles.successPointsInlineText}>
                    You earned <Text style={styles.successPointsInlineStrong}>+{earnedPoints} points</Text> from this order
                  </Text>
                </View>
              </View>
              {confirmation.paymentMethodType !== 'pay_at_pickup' ? (
                <>
                  <Pressable
                    onPress={() => {
                      clearCart();
                      router.dismissAll();
                      router.replace('/(tabs)' as any);
                      setTimeout(() => {
                        router.push(`/(customer)/track/${confirmation.orderId}` as any);
                      }, 50);
                    }}
                    style={[styles.returnHomeBtn, { backgroundColor: BLUE }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="navigation" size={16} color="#fff" />
                      <Text style={styles.returnHomeBtnText}>Track My Order</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      clearCart();
                      router.dismissAll();
                      router.replace('/(tabs)');
                    }}
                    style={{ alignSelf: 'center', marginTop: 16, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '500', color: MUTED }}>Return home</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => {
                    clearCart();
                    router.dismissAll();
                    router.replace('/(tabs)');
                  }}
                  style={styles.returnHomeBtn}
                >
                  <Text style={styles.returnHomeBtnText}>Return home</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
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
              <Image source={{ uri: imageUrl }} style={styles.itemThumb} contentFit="cover" />
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
                <Text style={[styles.itemOpts, { fontWeight: '400' }]} numberOfLines={2}>
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
          const disabled = t.id === 'delivery' && !deliveryEnabled;
          return (
            <Pressable
              key={t.id}
              disabled={disabled}
              onPress={() => {
              if (disabled) return;
              setOrderType(t.id as any);
              setSelectedDate(null);
              setSelectedTimeMins(null);
              setPickupWindow(null);
              if (t.id === 'pickup') setPickupMode(isStoreOpenForAsap(selectedStore, getSydneyNow()) ? 'asap' : 'scheduled');
              Haptics.selectionAsync();
            }}
              style={[styles.orderTypeCard, {
                backgroundColor: active ? LIGHT_BLUE : CARD,
                borderColor:     active ? BLUE : BORDER,
                borderWidth:     active ? 2 : 1,
                opacity: disabled ? 0.45 : 1,
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

      {!deliveryEnabled && (
        <Text style={styles.deliveryEligibilityNote}>
          {showMixedDeliveryMessage
            ? "Some of the items in your cart are not available for delivery."
            : 'Delivery is only available for cookies, boxes, and merch.'}
        </Text>
      )}

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

      {orderType === 'pickup' && selectedStore && (
        <View style={[styles.deliveryInfoCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
          <View style={[styles.deliveryInfoIcon, { backgroundColor: BLUE }]}>
            <Feather name="map-pin" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.deliveryInfoTag, { color: BLUE }]}>PICKUP STORE</Text>
            <Text style={styles.deliveryInfoTitle}>{selectedStore.name}</Text>
            <Text style={styles.deliveryInfoSub}>
              {selectedStore.openLabel ?? 'Check store hours'}{selectedStore.todayHours?.openTime && selectedStore.todayHours?.closeTime
                ? ` · ${selectedStore.todayHours.openTime}–${selectedStore.todayHours.closeTime}`
                : ''}
            </Text>
          </View>
        </View>
      )}

      {/* ASAP / Schedule toggle — pickup only */}
      {orderType === 'pickup' && (
        <View style={{ gap: 10 }}>
          {/* ASAP option */}
          <Pressable
            onPress={() => {
              if (!storeOpen) return;
              setPickupMode('asap');
              setSelectedDate(null);
              setSelectedTimeMins(null);
              Haptics.selectionAsync();
            }}
            disabled={!storeOpen}
            style={[styles.pickupModeCard, {
              backgroundColor: pickupMode === 'asap' && storeOpen ? LIGHT_BLUE : CARD,
              borderColor:     pickupMode === 'asap' && storeOpen ? BLUE : BORDER,
              borderWidth:     pickupMode === 'asap' && storeOpen ? 2 : 1,
              opacity:         storeOpen ? 1 : 0.6,
            }]}
          >
            <View style={[styles.pickupModeIcon, { backgroundColor: pickupMode === 'asap' && storeOpen ? BLUE : BG }]}>
              <Feather name="zap" size={18} color={pickupMode === 'asap' && storeOpen ? '#fff' : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickupModeLabel, { color: pickupMode === 'asap' && storeOpen ? BLUE : TEXT }]}>ASAP</Text>
              <Text style={[styles.pickupModeSub, { color: pickupMode === 'asap' && storeOpen ? BLUE : MUTED }]}>
                {storeOpen ? 'Ready from your selected store' : getStoreAsapUnavailableReason(selectedStore, sydNow)}
              </Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: pickupMode === 'asap' && storeOpen ? BLUE : BORDER }}>
              {pickupMode === 'asap' && storeOpen && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE }} />}
            </View>
          </Pressable>

          {/* Schedule for later */}
          <Pressable
            onPress={() => { setPickupMode('scheduled'); Haptics.selectionAsync(); }}
            style={[styles.pickupModeCard, {
              backgroundColor: pickupMode === 'scheduled' ? LIGHT_BLUE : CARD,
              borderColor:     pickupMode === 'scheduled' ? BLUE : BORDER,
              borderWidth:     pickupMode === 'scheduled' ? 2 : 1,
            }]}
          >
            <View style={[styles.pickupModeIcon, { backgroundColor: pickupMode === 'scheduled' ? BLUE : BG }]}>
              <Feather name="calendar" size={18} color={pickupMode === 'scheduled' ? '#fff' : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickupModeLabel, { color: pickupMode === 'scheduled' ? BLUE : TEXT }]}>Schedule for later</Text>
              <Text style={[styles.pickupModeSub, { color: pickupMode === 'scheduled' ? BLUE : MUTED }]}>Choose a date & time</Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: pickupMode === 'scheduled' ? BLUE : BORDER }}>
              {pickupMode === 'scheduled' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE }} />}
            </View>
          </Pressable>
        </View>
      )}

      {/* Date header — only for delivery or scheduled pickup */}
      {(orderType === 'delivery' || pickupMode === 'scheduled') && (
        <View style={styles.chooseDateHeader}>
          <Feather name="calendar" size={18} color={TEXT} />
          <Text style={styles.chooseDateTitle}>
            {orderType === 'delivery' ? 'Choose a delivery date' : 'Choose a pickup date'}
          </Text>
        </View>
      )}

      {orderType === 'delivery' ? (
        <>
          {(() => {
            const pairs: (typeof deliveryDates[0] | null)[][] = [];
            for (let i = 0; i < deliveryDates.length; i += 2)
              pairs.push([deliveryDates[i], deliveryDates[i + 1] ?? null]);
            return pairs.map((pair, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                {pair.map((slot, ci) => {
                  if (!slot) return <View key={ci} style={{ flex: 1 }} />;
                  const isSel   = selectedDate != null && isSameDay(selectedDate, slot.date);
                  const dayName = slot.date.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                  const dayDate = slot.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                  return (
                    <Pressable
                      key={ci}
                      disabled={!slot.available}
                      onPress={() => { setSelectedDate(slot.date); Haptics.selectionAsync(); }}
                      style={[styles.deliveryDateCard, {
                        backgroundColor: isSel ? LIGHT_BLUE : '#fff',
                        borderColor:     isSel ? BLUE : BORDER,
                        borderWidth:     isSel ? 2 : 1,
                        opacity:         slot.available ? 1 : 0.4,
                      }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: BLUE }}>{dayName}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{dayDate}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>8am – 5pm</Text>
                    </Pressable>
                  );
                })}
              </View>
            ));
          })()}
        </>
      ) : pickupMode === 'scheduled' ? (
        <>
          <View style={styles.calendarCard}>
            <InlineCalendarPicker
              selectedDate={selectedDate}
              onSelectDate={d => { setSelectedDate(d); setPickupWindow(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
              accentColor={BLUE}
              availableDates={pickupDates}
              minDate={new Date()}
              maxDate={pickupDates.length > 0 ? pickupDates[pickupDates.length - 1] : undefined}
            />
          </View>

          {selectedDate && (
            <>
              <Text style={styles.windowsLabel}>Choose a pickup window</Text>
              <View style={styles.windowsGrid}>
                {PICKUP_WINDOWS.map(w => {
                  const active = pickupWindow === w.label;
                  return (
                    <Pressable
                      key={w.label}
                      onPress={() => { setPickupWindow(w.label); setSelectedTimeMins(w.startMins); Haptics.selectionAsync(); }}
                      style={[styles.windowBtn, active && { borderColor: BLUE, backgroundColor: LIGHT_BLUE }]}
                    >
                      <Feather name="clock" size={14} color={active ? BLUE : MUTED} />
                      <Text style={[styles.windowBtnText, { color: active ? BLUE : TEXT }]}>{w.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </>
      ) : null}

      {orderType === 'delivery' && (
        <>
          <SectionLabel title="DELIVERY ADDRESS" />

          {/* Google Places address search */}
          <AddressSearchInput
            currentValue={street ? `${street}${suburb ? `, ${suburb}` : ''}` : undefined}
            placeholder="Search delivery address…"
            onSelect={(r) => {
              if (r.street) setStreet(r.street);
              if (r.suburb) setSuburb(r.suburb);
              if (r.postcode) setPostcode(r.postcode);
              if (r.state) setAddrState(r.state);
              setSelectedAddressId(null);
            }}
          />

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
              placeholder="Street address"
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
                  placeholder="Suburb"
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
                  placeholder="Postcode"
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
          <Text style={styles.summaryRowLabel}>Estimated card fee</Text>
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
              <Text style={styles.summaryRowValue}>AUD {(DELIVERY_FEE_CENTS / 100).toFixed(2)}</Text>
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
              {orderType === 'pickup' && pickupWindow !== null
                ? `${formatDateChip(sydNow, selectedDate)}, ${pickupWindow}`
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
          {step === 1 && renderShippingStep()}
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
  // Item cards
  itemCard:   { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  itemThumb:  { width: 90, alignSelf: 'stretch' },
  removeBtn:  { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', zIndex: 1 },
  itemBody:   { flex: 1, padding: 12, gap: 4 },
  itemName:   { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  itemOpts:   { fontSize: 12, color: '#8E8E93', lineHeight: 16 },
  itemPrice:  { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  qtyBtn:     { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' },
  qtyBtnText: { fontSize: 16, color: '#1C1C1E', fontWeight: '600', lineHeight: 20 },
  qtyLabel:   { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  // Summary card
  summaryCard:      { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:  { fontSize: 13, fontWeight: '400', color: '#8E8E93' },
  summaryRowValue:  { fontSize: 13, fontWeight: '500', color: '#1C1C1E' },
  summaryTotalLabel:{ fontWeight: '700', fontSize: 15, color: '#1C1C1E' },
  summaryTotalValue:{ fontWeight: '700', fontSize: 16, color: '#1C1C1E' },
  summaryDivider:   { height: 1 },
  shippingNote:     { textAlign: 'center', fontSize: 12, fontWeight: '400', color: '#8E8E93', paddingVertical: 4 },
  // Order type
  orderTypeRow: { flexDirection: 'row', gap: 10 },
  orderTypeCard:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  orderTypeIcon:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  orderTypeSub:   { fontSize: 12, fontWeight: '400', marginTop: 2 },
  deliveryEligibilityNote: { fontSize: 12, fontWeight: '500', color: '#8E8E93', marginTop: -2, paddingHorizontal: 2 },
  // Delivery info card
  deliveryInfoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  deliveryInfoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deliveryInfoTag:  { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  deliveryInfoTitle:{ fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginTop: 2 },
  deliveryInfoSub:  { fontSize: 12, fontWeight: '400', color: '#8E8E93', marginTop: 2 },
  // Pickup mode toggle cards (ASAP / Schedule)
  pickupModeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  pickupModeIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pickupModeLabel: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  pickupModeSub:   { fontSize: 12, fontWeight: '400', marginTop: 2 },
  // Choose date header
  chooseDateHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chooseDateTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  // Inline calendar card
  calendarCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  // Pickup window buttons
  windowsLabel:   { fontSize: 13, fontWeight: '600', color: '#6B7280', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  windowsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  windowBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, width: '47%', paddingVertical: 13,
                    paddingHorizontal: 14, backgroundColor: '#fff', borderRadius: 14,
                    borderWidth: 1.5, borderColor: '#E5E7EB' },
  windowBtnText:  { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  // Delivery date cards (matches wholesale layout)
  deliveryDateCard: { flex: 1, borderRadius: 14, padding: 14, gap: 3 },
  // No slots message
  noSlotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  noSlotsText: { fontSize: 13, fontWeight: '400', color: '#8E8E93' },
  // Forms
  formCard:       { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  formFieldWrap:  { gap: 4 },
  formFieldLabel: { fontSize: 13, fontWeight: '500', color: '#8E8E93' },
  formInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: '#EFF6FF' },
  formRow:        { flexDirection: 'row', gap: 10 },
  formNote:       { fontSize: 12, fontWeight: '400', marginTop: 2 },
  notesInput:     { height: 80, textAlignVertical: 'top', paddingTop: 12 },
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
  // Success
  successWrap:    { flex: 1, overflow: 'visible', backgroundColor: '#FFFFFF' },
  successCard:    { width: '100%', alignItems: 'center', zIndex: 2, maxWidth: 430, paddingTop: 8, flexGrow: 1 },
  successGlow:    {
    width: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  successTitle:   { fontSize: 28, fontWeight: '800', color: '#444444', textAlign: 'center', letterSpacing: -0.3 },
  confettiLayer:  { ...StyleSheet.absoluteFillObject, overflow: 'visible' },
  characterStage: { position: 'relative', left: 0, right: 0, bottom: 0, height: 226, justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, marginBottom: -6 },
  characterFrame: { width: 198, maxWidth: '66%', aspectRatio: 3195 / 3402 },
  characterImage: { width: '100%', height: '100%' },
  successContentBlock: { width: '100%', alignItems: 'center', gap: 18 },
  successTopBar: { width: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ECECEC', paddingBottom: 14 },
  successTopBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  successTopTitle: { fontSize: 18, fontWeight: '600', color: '#222222', textAlign: 'center' },
  successTopSpacer: { width: 36, height: 36 },
  successHero: { alignItems: 'center', gap: 12, width: '100%', paddingTop: 4 },
  successOrderLine: { fontSize: 16, fontWeight: '500', color: '#555555', textAlign: 'center' },
  successOrderStrong: { fontWeight: '800', color: '#3A3A3A' },
  successDescription: { fontSize: 14, fontWeight: '400', color: '#575757', lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  successSummaryCard: {
    alignSelf: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    gap: 12,
  },
  successSummaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  successSummaryPriceWrap: { flex: 1, gap: 3 },
  successSummaryPrice: { fontSize: 18, fontWeight: '700', color: '#2E2E2E' },
  successSummaryOrderId: { fontSize: 14, fontWeight: '500', color: '#707070' },
  successTrackLink: { paddingHorizontal: 6, paddingVertical: 4 },
  successTrackText: { fontSize: 16, fontWeight: '700', color: '#E94677' },
  successDivider: { height: 1, backgroundColor: '#EFEFEF' },
  successSummaryBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  successStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  successStatusText: { fontSize: 14, fontWeight: '500', color: '#5A5A5A' },
  successDateText: { fontSize: 14, fontWeight: '500', color: '#777777' },
  successPointsInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, marginBottom: 8 },
  successPointsInlineText: { fontSize: 14, fontWeight: '500', color: '#5B3A00', textAlign: 'center' },
  successPointsInlineStrong: { fontWeight: '800', color: '#8A4D00' },
  returnHomeBtn: { alignSelf: 'stretch', backgroundColor: '#F61D22', borderRadius: 999, minHeight: 58, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  returnHomeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
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
