import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CardField, useStripe, usePlatformPay, PlatformPay, PlatformPayButton } from '@stripe/stripe-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { api, type ClaimedReward } from '@/lib/api';
import { computeCheckoutTotals, LOYALTY_POINT_VALUE_CENTS } from '@/lib/checkoutTotals';

const BLUE       = '#1493FF';
const CARD       = '#FFFFFF';
const GREEN      = '#22C55E';
const CHERRY     = '#D0312D';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const LIGHT_BLUE = '#E6F0FF';

export type PayMethod = 'credit_card' | 'apple_pay' | 'google_pay' | 'pay_at_pickup';

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

export function PaymentStepWithStripe({
  items,
  orderType,
  subtotalCents,
  deliveryFeeCents,
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
  deliveryFeeCents: number;
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

  const defaultMethod: PayMethod = Platform.OS === 'android' ? 'google_pay' : 'credit_card';
  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [platformPayAvailable, setPlatformPayAvailable] = useState(false);
  const [altMethodSelected, setAltMethodSelected] = useState(false);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [saveCardForNextTime, setSaveCardForNextTime] = useState(true);
  const [discountApplied, setDiscountApplied] = useState<ValidatedDiscount | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
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
      if (!ok && method === 'google_pay') {
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
  const cheapestCookiePriceCents = useMemo(() => {
    const cookieCategories = new Set(['cookies', 'cookie-frappes']);
    const prices = cartItemsWithPrices
      .filter((i) => cookieCategories.has(String((i as any).category ?? '').toLowerCase()))
      .map((i) => i.unitPriceCents ?? 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [cartItemsWithPrices]);

  const claimedRewardDiscountCents = useMemo(() => {
    if (!selectedClaimed) return 0;
    if (selectedClaimed.rewardType === 'money_voucher') return selectedClaimed.voucherValueCents ?? 0;
    if (selectedClaimed.rewardType === 'item_reward' && selectedClaimed.linkedProductId) {
      // One free unit of the linked product — subtract its unit price from the display total
      const matchingItem = cartItemsWithPrices.find(i => i.productId === selectedClaimed.linkedProductId);
      return matchingItem ? matchingItem.unitPriceCents : 0;
    }
    if (selectedClaimed.rewardType === 'cookie_any' || selectedClaimed.rewardType === 'birthday_cookie') {
      // Free cheapest cookie — use client-side estimate for display only; server recomputes
      return cheapestCookiePriceCents;
    }
    return 0;
  }, [selectedClaimed, cartItemsWithPrices, cheapestCookiePriceCents]);

  const {
    discountCents,
    deliveryCents,
    stripeFee,
    maxUsablePoints,
    requestedPointsToUse,
    loyaltyPointsUsed,
    loyaltyPointsDiscountCents,
    totalCents,
    totalLabel,
  } = useMemo(() => computeCheckoutTotals({
    subtotalCents,
    discountAppliedCents: discountApplied?.discountAmountCents ?? 0,
    claimedRewardDiscountCents,
    cheapestCoffeePriceCents,
    orderType,
    deliveryFeeCents,
    method,
    availableLoyaltyPoints,
    pointsToUseInput,
  }), [
    discountApplied,
    claimedRewardDiscountCents,
    cheapestCoffeePriceCents,
    orderType,
    deliveryFeeCents,
    subtotalCents,
    method,
    availableLoyaltyPoints,
    pointsToUseInput,
  ]);

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

  const isIosApplePay = Platform.OS === 'ios' && platformPayAvailable && stripeReady;
  const isAndroidGooglePay = Platform.OS === 'android' && platformPayAvailable && stripeReady && method === 'google_pay';

  const handleApplePay = async () => {
    if (busy) return;
    setCancelMessage(null);

    if (totalCents === 0) {
      setBusy(true);
      try {
        await onSuccess({
          paymentMethodType: 'free_reward',
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
    let createdIntentId: string | null = null;
    try {
      const intent = await api.payment.createIntent({
        items: items as any[],
        orderType,
        discountCode: discountApplied?.code,
        claimedRewardId: selectedClaimedRewardId ?? undefined,
        loyaltyPointsUsed: loyaltyPointsUsed || undefined,
        savePaymentMethod: false,
        useFreeCoffeeReward: useFreeCoffeeReward || undefined,
      });

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

      createdIntentId = intent.paymentIntentId ?? null;

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
      } as any);

      if (ppError) {
        if (ppError.code === 'Canceled') {
          if (createdIntentId) {
            api.payment.cancelIntent(createdIntentId).catch(() => {});
          }
          setCancelMessage('Payment cancelled. Tap to try again.');
          return;
        }
        throw new Error(ppError.message);
      }

      await onSuccess({
        stripePaymentIntentId: intent.paymentIntentId ?? undefined,
        paymentMethodType: 'apple_pay',
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

    // Free-order fast-path — skip Stripe entirely when nothing is owed
    if (totalCents === 0) {
      setBusy(true);
      try {
        await onSuccess({
          paymentMethodType: 'free_reward',
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
        if (ppError) {
          if (ppError.code === 'Canceled') {
            if (intent.paymentIntentId) {
              api.payment.cancelIntent(intent.paymentIntentId).catch(() => {});
            }
            setCancelMessage('Payment cancelled. Tap to try again.');
            return;
          }
          throw new Error(ppError.message);
        }
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

      {isIosApplePay && (
        <>
          <PlatformPayButton
            onPress={handleApplePay}
            type={PlatformPay.ButtonType.Buy}
            appearance={PlatformPay.ButtonStyle.Black}
            disabled={busy}
            borderRadius={14}
            style={psStyles.applePayBtn}
          />
          {totalCents > 0 && (
            <Text style={psStyles.applePayTotalLabel}>{`Pay ${totalLabel}`}</Text>
          )}
          {cancelMessage ? (
            <View style={psStyles.cancelMessageRow}>
              <Feather name="info" size={13} color={MUTED} />
              <Text style={psStyles.cancelMessageText}>{cancelMessage}</Text>
            </View>
          ) : null}
          <View style={psStyles.dividerRow}>
            <View style={psStyles.dividerLine} />
            <Text style={psStyles.dividerText}>or pay another way</Text>
            <View style={psStyles.dividerLine} />
          </View>
        </>
      )}

      {isAndroidGooglePay && (
        <>
          <PlatformPayButton
            onPress={handlePay}
            type={PlatformPay.ButtonType.Buy}
            appearance={PlatformPay.ButtonStyle.Black}
            disabled={busy}
            borderRadius={14}
            style={psStyles.applePayBtn}
          />
          {totalCents > 0 && (
            <Text style={psStyles.applePayTotalLabel}>{`Pay ${totalLabel}`}</Text>
          )}
          {cancelMessage ? (
            <View style={psStyles.cancelMessageRow}>
              <Feather name="info" size={13} color={MUTED} />
              <Text style={psStyles.cancelMessageText}>{cancelMessage}</Text>
            </View>
          ) : null}
          <View style={psStyles.dividerRow}>
            <View style={psStyles.dividerLine} />
            <Text style={psStyles.dividerText}>or pay another way</Text>
            <View style={psStyles.dividerLine} />
          </View>
        </>
      )}

      {stripeReady && platformPayAvailable && Platform.OS === 'android' && (
        <PaymentMethodRow
          method="google_pay"
          selected={method === 'google_pay'}
          label="Google Pay"
          subtitle="Tap to pay"
          icon="smartphone"
          onPress={() => setMethod('google_pay')}
        />
      )}

      {stripeReady && (
        <PaymentMethodRow
          method="credit_card"
          selected={method === 'credit_card'}
          label="Credit or debit card"
          subtitle="Visa, Mastercard, Amex"
          icon="credit-card"
          onPress={() => {
            setMethod('credit_card');
            setAltMethodSelected(true);
          }}
        />
      )}

      {canPayAtPickup && orderType === 'pickup' && (
        <PaymentMethodRow
          method="pay_at_pickup"
          selected={method === 'pay_at_pickup'}
          label="Pay at pickup"
          subtitle="Pay in store when you arrive"
          icon="map-pin"
          onPress={() => {
            setMethod('pay_at_pickup');
            setAltMethodSelected(true);
          }}
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

      {(!isIosApplePay || altMethodSelected) && !isAndroidGooglePay && (
        <Pressable
          onPress={handlePay}
          disabled={busy || (!stripeReady && method !== 'pay_at_pickup' && totalCents > 0)}
          style={[
            psStyles.continueBtn,
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
            <Text style={psStyles.continueBtnText}>
              {method === 'pay_at_pickup' ? 'Place Order' : `Pay ${totalLabel}`}
            </Text>
          )}
        </Pressable>
      )}

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
  continueBtn:     { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  applePayBtn:     { width: '100%', height: 54 },
  applePayTotalLabel: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 2 },
  cancelMessageRow:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 2 },
  cancelMessageText:{ fontSize: 12, color: MUTED, flex: 1 },
  dividerRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 },
  dividerLine:     { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText:     { fontSize: 11, fontWeight: '500', color: MUTED, letterSpacing: 0.2 },
});
