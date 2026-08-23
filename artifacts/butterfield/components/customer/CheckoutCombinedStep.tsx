import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CardField, useStripe, usePlatformPay, PlatformPay, PlatformPayButton } from '@stripe/stripe-react-native';
import { StableApplePayButton } from '@/components/checkout/StableApplePayButton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { api, type ClaimedReward, type SavedAddress } from '@/lib/api';
import { computeCheckoutTotals, LOYALTY_POINT_VALUE_CENTS } from '@/lib/checkoutTotals';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import { isSameDay, formatDateChip } from '@/lib/dateUtils';
import { getStoreAsapUnavailableReason } from '@/lib/storeSchedule';

const BLUE   = '#40C0F2';
const CHERRY = '#D20001';
const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT   = '#111111';
const MUTED  = '#6B7280';
const GREEN  = '#16A34A';
const GREEN_BG = '#F0FDF4';

export type PayMethod = 'credit_card' | 'apple_pay' | 'google_pay' | 'pay_at_pickup';

function minsToLabel(mins: number): string {
  const h   = Math.floor(mins / 60);
  const m   = mins % 60;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

function SecLabel({ label }: { label: string }) {
  return (
    <Text style={s.secLabel}>{label}</Text>
  );
}

function RowDivider() {
  return <View style={{ height: 1, backgroundColor: BORDER, marginLeft: 20 }} />;
}

interface ValidatedDiscount {
  id: string;
  code: string;
  discountAmountCents: number;
  discountType: string;
  description: string | null;
}

function buildApplePayCartItems({
  subtotalCents, deliveryCents, discountCents, totalCents,
}: { subtotalCents: number; deliveryCents: number; discountCents: number; totalCents: number }): PlatformPay.CartSummaryItem[] {
  const items: PlatformPay.CartSummaryItem[] = [
    { label: 'Subtotal', amount: (subtotalCents / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Immediate, isPending: false },
  ];
  if (deliveryCents > 0) items.push({ label: 'Delivery', amount: (deliveryCents / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Immediate, isPending: false });
  if (discountCents > 0) items.push({ label: 'Discount', amount: (-discountCents / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Immediate, isPending: false });
  items.push({ label: 'Butterfield Cookies', amount: (totalCents / 100).toFixed(2), paymentType: PlatformPay.PaymentType.Immediate, isPending: false });
  return items;
}

export interface CheckoutCombinedStepProps {
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    selectedOptions?: Array<{ optionId?: string; groupId?: string; priceAdjustmentCents?: number }>;
  }>;
  orderType: 'pickup' | 'delivery' | 'table';
  setOrderType: (v: 'pickup' | 'delivery' | 'table') => void;
  tableNumber: string;
  setTableNumber: (v: string) => void;
  nearbyStore: { id: string; name: string } | null;
  pickupMode: 'asap' | 'scheduled';
  setPickupMode: (v: 'asap' | 'scheduled') => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date | null) => void;
  selectedTimeMins: number | null;
  setSelectedTimeMins: (m: number | null) => void;
  street: string; setStreet: (v: string) => void;
  suburb: string; setSuburb: (v: string) => void;
  postcode: string; setPostcode: (v: string) => void;
  addrState: string;
  apt: string; setApt: (v: string) => void;
  selectedAddressId: string | null;
  setSelectedAddressId: (v: string | null) => void;
  contactName: string; setContactName: (v: string) => void;
  contactPhone: string; setContactPhone: (v: string) => void;
  contactEmail: string; setContactEmail: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  subtotalCents: number;
  deliveryFeeCents: number;
  deliveryEnabled: boolean;
  showMixedDeliveryMessage: boolean;
  selectedStore: any;
  storeOpen: boolean;
  sydNow: Date;
  deliveryDates: Array<{ date: Date; available: boolean; window?: string }>;
  pickupDates: Date[];
  validSlots: number[];
  savedAddresses: SavedAddress[];
  fillFromAddress: (addr: SavedAddress) => void;
  canPayAtPickup: boolean;
  stripeReady: boolean;
  applePaySupported: boolean | null;
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
}

export function CheckoutCombinedStep(props: CheckoutCombinedStepProps) {
  const {
    items, orderType, setOrderType, tableNumber, setTableNumber, nearbyStore,
    pickupMode, setPickupMode,
    selectedDate, setSelectedDate, selectedTimeMins, setSelectedTimeMins,
    street, setStreet, suburb, setSuburb, postcode, setPostcode, addrState,
    apt, setApt, selectedAddressId, setSelectedAddressId,
    contactName, setContactName, contactPhone, setContactPhone,
    contactEmail, setContactEmail, notes, setNotes,
    subtotalCents, deliveryFeeCents, deliveryEnabled, showMixedDeliveryMessage,
    selectedStore, storeOpen, sydNow, deliveryDates, pickupDates, validSlots,
    savedAddresses, fillFromAddress,
    canPayAtPickup, stripeReady, applePaySupported, onSuccess,
  } = props;

  // ── Stripe ────────────────────────────────────────────────────────────────
  const { confirmPayment, createPaymentMethod } = useStripe();
  const { isPlatformPaySupported, confirmPlatformPayPayment } = usePlatformPay();
  const [internalApplePaySupported, setInternalApplePaySupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !stripeReady) return;
    isPlatformPaySupported().then((ok) => setInternalApplePaySupported(ok));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripeReady]);
  const effectiveApplePaySupported = internalApplePaySupported ?? applePaySupported;

  // ── Payment method state ───────────────────────────────────────────────────
  const defaultMethod: PayMethod = Platform.OS === 'android' ? 'google_pay' : 'credit_card';
  const [method, setMethod] = useState<PayMethod>(defaultMethod);
  const [platformPayAvailable, setPlatformPayAvailable] = useState<boolean | null>(null);
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] = useState<string | null>(null);
  const [saveCardForNextTime, setSaveCardForNextTime] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  // ── Discount ──────────────────────────────────────────────────────────────
  const [discountInput, setDiscountInput] = useState('');
  const [discountApplied, setDiscountApplied] = useState<ValidatedDiscount | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  // ── Rewards ───────────────────────────────────────────────────────────────
  const [selectedClaimedRewardId, setSelectedClaimedRewardId] = useState<string | null>(null);
  const selectedRewardRef = useRef<string | null>(null);
  const [freeRewardLine, setFreeRewardLine] = useState<{ productId: string; name: string } | null>(null);
  const freeRewardLineRef = useRef<{ productId: string; name: string } | null>(null);

  // ── Points stepper state ───────────────────────────────────────────────────
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsInput, setPointsInput] = useState('');
  const [editingPoints, setEditingPoints] = useState(false);
  const pointsInputRef = useRef<TextInput>(null);

  // ── Free coffee ────────────────────────────────────────────────────────────
  const [useFreeCoffeeReward, setUseFreeCoffeeReward] = useState(false);

  // ── Apple Pay intent pre-fetch ─────────────────────────────────────────────
  const applePayInFlightRef   = useRef(false);
  const pendingIntentRef      = useRef<{ clientSecret: string; paymentIntentId: string; amountCents: number } | null>(null);
  const [applePayClientSecret, setApplePayClientSecret] = useState<string | null>(null);
  const applePayParamsRef     = useRef<{
    discountCode?: string; discountCodeId?: string; discountAmountCents?: number;
    claimedRewardId?: string; loyaltyPointsUsed?: number; useFreeCoffeeReward?: boolean;
  }>({});

  const qc = useQueryClient();

  // ── Delivery address section visibility ───────────────────────────────────
  const [showAddressForm, setShowAddressForm] = useState(false);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: claimedRewardsData } = useQuery({ queryKey: ['loyalty-claimed-rewards'], queryFn: () => api.loyalty.claimedRewards() });
  const { data: loyaltyProfileData } = useQuery({ queryKey: ['loyalty-profile'],         queryFn: () => api.loyalty.profile() });
  const { data: savedMethodsData }   = useQuery({ queryKey: ['payment-methods'],         queryFn: () => api.payment.methods(), enabled: stripeReady, staleTime: 60_000 });

  const claimedRewards         = claimedRewardsData?.data ?? [];
  const savedPaymentMethods    = savedMethodsData?.data ?? [];
  const availableLoyaltyPoints = loyaltyProfileData?.data?.loyaltyPoints ?? 0;
  const annualTierSpendCents   = loyaltyProfileData?.data?.annualTierSpendCents ?? 0;

  const freeCoffeeRewards = (loyaltyProfileData?.data?.freeCoffeeRewards ?? 0) || (loyaltyProfileData?.data?.freeCoffeesEarned ?? 0);
  const { items: cartItemsWithPrices } = useCart();
  const isCoffeeItem = (i: { category?: string | null; isCoffee?: boolean }) =>
    i.isCoffee === true || String(i.category ?? '').toLowerCase() === 'coffee';
  const hasCoffeeInCart = cartItemsWithPrices.some(isCoffeeItem);

  // Sync refs
  useEffect(() => { selectedRewardRef.current = selectedClaimedRewardId; }, [selectedClaimedRewardId]);
  useEffect(() => { freeRewardLineRef.current = freeRewardLine; }, [freeRewardLine]);

  // Cleanup on unmount
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
    if (Platform.OS !== 'android') return;
    isPlatformPaySupported().then((ok) => {
      setPlatformPayAvailable(ok);
      if (!ok && method === 'google_pay') setMethod('credit_card');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Table orders cannot use pay_at_pickup — reset to card if needed.
  useEffect(() => {
    if (orderType === 'table' && method === 'pay_at_pickup') {
      setMethod('credit_card');
    }
  }, [orderType, method]);

  useEffect(() => {
    if (effectiveApplePaySupported === false && method === 'google_pay') setMethod('credit_card');
  }, [effectiveApplePaySupported]);

  // Auto-select Apple Pay on iOS once support is confirmed
  useEffect(() => {
    if (internalApplePaySupported === true && stripeReady) {
      setMethod('apple_pay');
    }
  }, [internalApplePaySupported, stripeReady]);

  useEffect(() => {
    if (method !== 'credit_card') return;
    if (!savedPaymentMethods.length) { setSelectedSavedPaymentMethodId(null); return; }
    setSelectedSavedPaymentMethodId((cur) => {
      if (cur && savedPaymentMethods.some((m) => m.id === cur)) return cur;
      const def = savedPaymentMethods.find((m) => m.isDefault)?.id;
      return def ?? savedPaymentMethods[0]?.id ?? null;
    });
  }, [method, savedPaymentMethods]);

  useEffect(() => {
    if (selectedClaimedRewardId && !claimedRewards.find((c) => c.id === selectedClaimedRewardId)) setSelectedClaimedRewardId(null);
  }, [claimedRewards, selectedClaimedRewardId]);

  useEffect(() => {
    if (freeCoffeeRewards < 1 || !hasCoffeeInCart) setUseFreeCoffeeReward(false);
  }, [freeCoffeeRewards, hasCoffeeInCart]);

  // Initialise points to max when toggled on
  useEffect(() => {
    if (usePoints && pointsToUse === 0 && availableLoyaltyPoints > 0) {
      setPointsToUse(availableLoyaltyPoints);
      setPointsInput(String(availableLoyaltyPoints));
    }
  }, [usePoints, availableLoyaltyPoints]);

  // Computed values
  const cheapestCoffeePriceCents = useMemo(() => {
    if (!useFreeCoffeeReward || !hasCoffeeInCart) return 0;
    const prices = cartItemsWithPrices.filter(isCoffeeItem).map((i) => i.unitPriceCents ?? 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [useFreeCoffeeReward, hasCoffeeInCart, cartItemsWithPrices]);

  const selectedClaimed = claimedRewards.find((c) => c.id === selectedClaimedRewardId) ?? null;
  const cheapestCookiePriceCents = useMemo(() => {
    const cookieCategories = new Set(['cookies', 'cookie-frappes']);
    const prices = cartItemsWithPrices.filter((i) => cookieCategories.has(String((i as any).category ?? '').toLowerCase())).map((i) => i.unitPriceCents ?? 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [cartItemsWithPrices]);

  const claimedRewardDiscountCents = useMemo(() => {
    if (!selectedClaimed) return 0;
    if (selectedClaimed.rewardType === 'money_voucher') return selectedClaimed.voucherValueCents ?? 0;
    if (selectedClaimed.rewardType === 'item_reward' && selectedClaimed.linkedProductId) {
      const m = cartItemsWithPrices.find((i) => i.productId === selectedClaimed.linkedProductId);
      return m ? m.unitPriceCents : 0;
    }
    if (selectedClaimed.rewardType === 'cookie_any' || selectedClaimed.rewardType === 'birthday_cookie') return cheapestCookiePriceCents;
    return 0;
  }, [selectedClaimed, cartItemsWithPrices, cheapestCookiePriceCents]);

  const pointsToUseInput = usePoints ? String(pointsToUse) : '';

  const {
    discountCents, deliveryCents, stripeFee, maxUsablePoints,
    requestedPointsToUse, loyaltyPointsUsed, loyaltyPointsDiscountCents, totalCents, totalLabel,
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
  }), [discountApplied, claimedRewardDiscountCents, cheapestCoffeePriceCents, orderType, deliveryFeeCents, subtotalCents, method, availableLoyaltyPoints, pointsToUseInput]);

  // Clamp points display to max usable
  useEffect(() => {
    if (usePoints && pointsToUse > maxUsablePoints && maxUsablePoints > 0) {
      setPointsToUse(maxUsablePoints);
      setPointsInput(String(maxUsablePoints));
    }
  }, [maxUsablePoints, usePoints]);

  // Keep applePayParamsRef in sync
  useEffect(() => {
    applePayParamsRef.current = {
      discountCode: discountApplied?.code,
      discountCodeId: discountApplied?.id,
      discountAmountCents: discountApplied?.discountAmountCents,
      claimedRewardId: selectedClaimedRewardId ?? undefined,
      loyaltyPointsUsed: loyaltyPointsUsed || undefined,
      useFreeCoffeeReward: useFreeCoffeeReward || undefined,
    };
  }, [discountApplied, selectedClaimedRewardId, loyaltyPointsUsed, useFreeCoffeeReward]);

  // Pre-fetch Apple Pay intent
  useEffect(() => {
    const isIos = Platform.OS === 'ios';
    if (!isIos || !stripeReady || effectiveApplePaySupported !== true || totalCents === 0) {
      const stale = pendingIntentRef.current;
      if (stale) { pendingIntentRef.current = null; setApplePayClientSecret(null); api.payment.cancelIntent(stale.paymentIntentId).catch(() => {}); }
      return;
    }
    if (pendingIntentRef.current?.amountCents === totalCents) return;
    const stale = pendingIntentRef.current;
    pendingIntentRef.current = null; setApplePayClientSecret(null);
    if (stale) api.payment.cancelIntent(stale.paymentIntentId).catch(() => {});
    let cancelled = false;
    api.payment.createIntent({ items: items as any[], orderType, discountCode: discountApplied?.code, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, savePaymentMethod: false, useFreeCoffeeReward: useFreeCoffeeReward || undefined }).then((intent) => {
      if (cancelled) return;
      if (intent.clientSecret && intent.paymentIntentId && intent.amountCents > 0) {
        pendingIntentRef.current = { clientSecret: intent.clientSecret, paymentIntentId: intent.paymentIntentId, amountCents: intent.amountCents };
        setApplePayClientSecret(intent.clientSecret);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveApplePaySupported, stripeReady, totalCents, selectedClaimedRewardId, useFreeCoffeeReward]);

  useEffect(() => {
    return () => {
      const stale = pendingIntentRef.current;
      if (stale) { pendingIntentRef.current = null; api.payment.cancelIntent(stale.paymentIntentId).catch(() => {}); }
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const applyDiscount = async () => {
    const code = discountInput.trim().toUpperCase();
    if (!code) return;
    setValidatingDiscount(true); setDiscountError('');
    try {
      const res = await api.discounts.validate({ code, items: items as any[], orderType });
      setDiscountApplied(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setDiscountError(e?.message ?? 'Invalid discount code.'); setDiscountApplied(null);
    } finally { setValidatingDiscount(false); }
  };

  const handleSelectReward = async (claimId: string | null) => {
    const prev = selectedClaimedRewardId;
    if (prev === claimId) return;
    setFreeRewardLine(null);
    if (prev) api.loyalty.unapplyClaim(prev).catch(() => {});
    if (claimId) {
      api.loyalty.applyClaim(claimId).catch(() => {});
      const claim = claimedRewards.find((c) => c.id === claimId);
      if (claim?.rewardType === 'item_reward' && claim.linkedProductId != null) {
        const alreadyInCart = items.some((i) => i.productId === claim.linkedProductId);
        if (!alreadyInCart) setFreeRewardLine({ productId: claim.linkedProductId, name: claim.rewardName ?? claim.linkedProductId });
      }
    }
    setSelectedClaimedRewardId(claimId);
    qc.invalidateQueries({ queryKey: ['loyalty-claimed-rewards'] });
  };

  function commitPointsInput(raw: string) {
    const n       = parseInt(raw, 10);
    const clamped = isNaN(n) ? 1 : Math.min(maxUsablePoints || availableLoyaltyPoints, Math.max(1, n));
    setPointsToUse(clamped);
    setPointsInput(String(clamped));
    setEditingPoints(false);
  }

  const isIosApplePay      = Platform.OS === 'ios' && effectiveApplePaySupported === true && stripeReady;
  const isAndroidGooglePay = Platform.OS === 'android' && platformPayAvailable === true && stripeReady && method === 'google_pay';

  const handleApplePay = async () => {
    if (applePayInFlightRef.current) return;
    setCancelMessage(null);
    if (totalCents === 0) {
      setBusy(true);
      try { await onSuccess({ paymentMethodType: 'free_reward', ...applePayParamsRef.current }); } finally { setBusy(false); }
      return;
    }
    if (!stripeReady) { Alert.alert('Payment unavailable', 'Payment processing is not available right now.'); return; }
    applePayInFlightRef.current = true;
    let usedIntentId: string | null = null;
    try {
      const cached = pendingIntentRef.current;
      let intent: any;
      if (cached && cached.amountCents === totalCents) {
        pendingIntentRef.current = null; intent = cached;
      } else {
        if (cached) { pendingIntentRef.current = null; api.payment.cancelIntent(cached.paymentIntentId).catch(() => {}); }
        intent = await api.payment.createIntent({ items: items as any[], orderType, discountCode: discountApplied?.code, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, savePaymentMethod: false, useFreeCoffeeReward: useFreeCoffeeReward || undefined });
      }
      if (intent.amountCents === 0 || intent.paymentRequired === false) {
        await onSuccess({ paymentMethodType: 'free_reward', ...applePayParamsRef.current }); return;
      }
      usedIntentId = intent.paymentIntentId ?? null;
      const { error: ppError } = await confirmPlatformPayPayment(intent.clientSecret!, {
        applePay: { cartItems: buildApplePayCartItems({ subtotalCents, deliveryCents, discountCents, totalCents: intent.amountCents }), merchantCountryCode: 'AU', currencyCode: 'AUD' },
      } as any);
      if (ppError) {
        if (ppError.code === 'Canceled') { if (usedIntentId) api.payment.cancelIntent(usedIntentId).catch(() => {}); setCancelMessage('Payment cancelled. Tap to try again.'); return; }
        throw new Error(ppError.message);
      }
      await onSuccess({ stripePaymentIntentId: intent.paymentIntentId ?? undefined, paymentMethodType: 'apple_pay', ...applePayParamsRef.current });
    } catch (e: any) { Alert.alert('Payment failed', e?.message ?? 'Please try again.'); } finally { applePayInFlightRef.current = false; }
  };

  const handleApplePaySuccess = useCallback(async () => {
    const paymentIntentId = pendingIntentRef.current?.paymentIntentId ?? undefined;
    pendingIntentRef.current = null;
    await onSuccess({ stripePaymentIntentId: paymentIntentId, paymentMethodType: 'apple_pay', ...applePayParamsRef.current });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess]);

  const handlePlaceOrder = async () => {
    if (busy) return;
    // Validate delivery/pickup/table selections before attempting payment
    if (orderType === 'table') {
      if (!tableNumber) {
        Alert.alert('Select table number', 'Please choose your table number.');
        return;
      }
    }
    if (orderType === 'pickup' && pickupMode === 'scheduled') {
      if (!selectedDate || selectedTimeMins === null) {
        Alert.alert('Select pickup time', 'Please choose a date and pickup time.');
        return;
      }
    }
    if (orderType === 'delivery') {
      if (!selectedDate) { Alert.alert('Select delivery date', 'Please choose a delivery date.'); return; }
      if (!street.trim() || !suburb.trim() || !postcode.trim()) { Alert.alert('Delivery address required', 'Please enter your full delivery address.'); return; }
      const pc = parseInt(postcode.trim(), 10);
      if (addrState !== 'NSW' || isNaN(pc) || pc < 2000 || pc > 2999) {
        Alert.alert('Sydney deliveries only', 'We currently deliver within Sydney (NSW postcodes 2000–2999) only.'); return;
      }
    }
    setBusy(true);
    setCancelMessage(null);
    try {
      if (totalCents === 0) {
        await onSuccess({ paymentMethodType: 'free_reward', discountCode: discountApplied?.code, discountCodeId: discountApplied?.id, discountAmountCents: discountApplied?.discountAmountCents, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, useFreeCoffeeReward: useFreeCoffeeReward || undefined }); return;
      }
      if (method === 'pay_at_pickup') {
        // Defensive guard — table orders must be paid by card.
        if (orderType === 'table') {
          Alert.alert('Card payment required', 'Table orders must be paid by card.');
          setBusy(false);
          return;
        }
        await onSuccess({ paymentMethodType: 'pay_at_pickup', discountCode: discountApplied?.code, discountCodeId: discountApplied?.id, discountAmountCents: discountApplied?.discountAmountCents, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, useFreeCoffeeReward: useFreeCoffeeReward || undefined }); return;
      }
      if (!stripeReady) { Alert.alert('Payment unavailable', 'Card payments are not available right now. Choose another method.'); return; }
      const intent = await api.payment.createIntent({ items: items as any[], orderType, discountCode: discountApplied?.code, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, savePaymentMethod: saveCardForNextTime, useFreeCoffeeReward: useFreeCoffeeReward || undefined });
      if (intent.amountCents === 0 || intent.paymentRequired === false) {
        await onSuccess({ paymentMethodType: 'free_reward', discountCode: discountApplied?.code, discountCodeId: discountApplied?.id, discountAmountCents: discountApplied?.discountAmountCents, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, useFreeCoffeeReward: useFreeCoffeeReward || undefined }); return;
      }
      let pmId = selectedSavedPaymentMethodId;
      if (!pmId) {
        const { paymentMethod, error: pmError } = await createPaymentMethod({ paymentMethodType: 'Card' });
        if (pmError || !paymentMethod) { Alert.alert('Card error', pmError?.message ?? 'Could not read card details. Please try again.'); return; }
        pmId = paymentMethod.id;
      }
      const { error: confirmError } = await confirmPayment(intent.clientSecret!, { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: pmId } } as any);
      if (confirmError) { Alert.alert('Payment failed', confirmError.message ?? 'Please try again.'); return; }
      await onSuccess({ stripePaymentIntentId: intent.paymentIntentId ?? undefined, paymentMethodType: 'credit_card', discountCode: discountApplied?.code, discountCodeId: discountApplied?.id, discountAmountCents: discountApplied?.discountAmountCents, claimedRewardId: selectedClaimedRewardId ?? undefined, loyaltyPointsUsed: loyaltyPointsUsed || undefined, useFreeCoffeeReward: useFreeCoffeeReward || undefined });
    } catch (e: any) { Alert.alert('Order failed', e?.message ?? 'Please try again.'); } finally { setBusy(false); }
  };

  // ── Computed for display ───────────────────────────────────────────────────
  const addressDisplay = street ? `${apt ? apt + '/' : ''}${street}, ${suburb} NSW ${postcode}`.trim() : '';
  const totalSaved     = loyaltyPointsDiscountCents + claimedRewardDiscountCents + (discountApplied?.discountAmountCents ?? 0) + cheapestCoffeePriceCents;

  // ── Delivery UI helpers ────────────────────────────────────────────────────
  const pickupDateChips = useMemo(() => pickupDates.slice(0, 7).map((d, i) => ({
    label: formatDateChip(sydNow, d), sub: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }), date: d, idx: i,
  })), [pickupDates, sydNow]);

  const selectedPickupIdx = useMemo(() =>
    selectedDate ? pickupDateChips.findIndex((c) => isSameDay(c.date, selectedDate)) : -1,
  [pickupDateChips, selectedDate]);

  const deliveryDateChips = useMemo(() => deliveryDates.filter((d) => d.available).slice(0, 7).map((d, i) => ({
    label: d.date.toLocaleDateString('en-AU', { weekday: 'short' }),
    sub:   d.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    date:  d.date, window: d.window, idx: i,
  })), [deliveryDates]);

  const selectedDelivIdx = useMemo(() =>
    selectedDate ? deliveryDateChips.findIndex((c) => isSameDay(c.date, selectedDate)) : -1,
  [deliveryDateChips, selectedDate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.wrap}>

      {/* ── DELIVERY ─────────────────────────────────────────────────────── */}
      <SecLabel label="Delivery" />

      {/* Segmented toggle */}
      <View style={s.segWrap}>
        <View style={s.segTrack}>
          <Pressable
            onPress={() => { setOrderType('pickup'); setSelectedDate(null); setSelectedTimeMins(null); setPickupMode(storeOpen ? 'asap' : 'scheduled'); Haptics.selectionAsync(); }}
            style={[s.segBtn, orderType === 'pickup' && s.segBtnActive]}
          >
            <Feather name="shopping-bag" size={13} color={orderType === 'pickup' ? TEXT : MUTED} />
            <Text style={[s.segLabel, { color: orderType === 'pickup' ? TEXT : MUTED }]}>Pickup · Free</Text>
          </Pressable>
          <Pressable
            disabled={!deliveryEnabled}
            onPress={() => { if (!deliveryEnabled) return; setOrderType('delivery'); setSelectedDate(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
            style={[s.segBtn, orderType === 'delivery' && s.segBtnActive, !deliveryEnabled && { opacity: 0.45 }]}
          >
            <Feather name="map-pin" size={13} color={orderType === 'delivery' ? TEXT : MUTED} />
            <Text style={[s.segLabel, { color: orderType === 'delivery' ? TEXT : MUTED }]}>{`Delivery · $${(deliveryFeeCents / 100).toFixed(2)}`}</Text>
          </Pressable>
          {nearbyStore != null && (
            <Pressable
              onPress={() => { setOrderType('table'); Haptics.selectionAsync(); }}
              style={[s.segBtn, orderType === 'table' && s.segBtnActive]}
            >
              <Feather name="coffee" size={13} color={orderType === 'table' ? TEXT : MUTED} />
              <Text style={[s.segLabel, { color: orderType === 'table' ? TEXT : MUTED }]}>Table</Text>
            </Pressable>
          )}
        </View>
      </View>

      {orderType === 'table' && nearbyStore != null && (
        <Text style={s.deliveryNote}>Dine in at {nearbyStore.name}</Text>
      )}

      {!deliveryEnabled && orderType !== 'table' && (
        <Text style={s.deliveryNote}>
          {showMixedDeliveryMessage ? 'Some items in your cart aren\'t available for delivery.' : 'Delivery is only available for cookies, boxes & merch.'}
        </Text>
      )}

      {/* Main delivery card */}
      <View style={s.card}>

        {/* TABLE SERVICE */}
        {orderType === 'table' && (
          <View style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
              Table Number
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {Array.from({ length: 50 }, (_, i) => String(i + 1)).map((num) => {
                const active = tableNumber === num;
                return (
                  <Pressable
                    key={num}
                    onPress={() => { setTableNumber(num); Haptics.selectionAsync(); }}
                    style={[s.tableNumChip, active && s.tableNumChipActive]}
                  >
                    <Text style={[s.tableNumChipText, { color: active ? '#fff' : TEXT }]}>{num}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {tableNumber ? (
              <View style={[s.tableBadgeInline, { marginTop: 12 }]}>
                <Feather name="coffee" size={14} color={BLUE} />
                <Text style={s.tableBadgeInlineText}>Table {tableNumber} at {nearbyStore?.name}</Text>
              </View>
            ) : (
              <Text style={[s.asapNote, { marginTop: 8, textAlign: 'left' }]}>Select your table number above</Text>
            )}
          </View>
        )}

        {/* PICKUP */}
        {orderType === 'pickup' && (
          <>
            {/* Store info */}
            {selectedStore && (
              <View style={s.storeRow}>
                <View style={s.storeIconWrap}>
                  <Feather name="map-pin" size={17} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.storeName}>{selectedStore.name}</Text>
                  {(selectedStore.address || selectedStore.suburb) && (
                    <Text style={s.storeAddr}>{[selectedStore.address, selectedStore.suburb, selectedStore.state].filter(Boolean).join(', ')}</Text>
                  )}
                  <View style={[s.openBadge, { backgroundColor: storeOpen ? GREEN_BG : '#FEF9C3' }]}>
                    <Text style={[s.openBadgeText, { color: storeOpen ? GREEN : '#854D0E' }]}>
                      {storeOpen ? 'Open' : 'Closed'}{selectedStore.todayHours?.closeTime ? ` · Closes ${selectedStore.todayHours.closeTime}` : ''}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={MUTED} />
              </View>
            )}

            <RowDivider />

            {/* Now / Schedule toggle */}
            <View style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['now', 'schedule'] as const).map((t) => {
                  const active = (t === 'now' && pickupMode === 'asap') || (t === 'schedule' && pickupMode === 'scheduled');
                  const disabled = t === 'now' && !storeOpen;
                  return (
                    <Pressable key={t} disabled={disabled}
                      onPress={() => { if (disabled) return; const mode = t === 'now' ? 'asap' : 'scheduled'; setPickupMode(mode); if (t === 'now') { setSelectedDate(null); setSelectedTimeMins(null); } Haptics.selectionAsync(); }}
                      style={[s.timingBtn, active && s.timingBtnActive, disabled && { opacity: 0.45 }]}
                    >
                      <Feather name={t === 'now' ? 'zap' : 'calendar'} size={14} color={active ? BLUE : MUTED} />
                      <Text style={[s.timingLabel, { color: active ? BLUE : MUTED }]}>
                        {t === 'now' ? 'Now' : 'Schedule'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {pickupMode === 'asap' && storeOpen && (
                <Text style={s.asapNote}>Ready in approx 5–10 minutes</Text>
              )}
              {!storeOpen && (
                <Text style={[s.asapNote, { color: '#B45309' }]}>{getStoreAsapUnavailableReason(selectedStore, sydNow)}</Text>
              )}
            </View>

            {/* Date + time picker — when Schedule selected */}
            {pickupMode === 'scheduled' && (
              <>
                <RowDivider />
                <View style={{ paddingBottom: 8 }}>
                  {/* Date chips */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 12 }}>
                    {pickupDateChips.map((chip, i) => {
                      const sel = selectedPickupIdx === i;
                      return (
                        <Pressable key={i} onPress={() => { setSelectedDate(chip.date); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                          style={[s.dateChip, sel && s.dateChipActive]}>
                          <Text style={[s.dateChipLabel, { color: sel ? '#fff' : TEXT }]}>{chip.label}</Text>
                          <Text style={[s.dateChipSub,   { color: sel ? 'rgba(255,255,255,0.7)' : MUTED }]}>{chip.sub}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Time slots grid */}
                  {selectedDate !== null && validSlots.length > 0 && (
                    <>
                      <Text style={s.slotsLabel}>Pick a time</Text>
                      <View style={s.slotsGrid}>
                        {validSlots.map((mins) => {
                          const label = minsToLabel(mins);
                          const sel   = selectedTimeMins === mins;
                          return (
                            <Pressable key={mins} onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                              style={[s.slotBtn, sel && s.slotBtnActive]}>
                              <Text style={[s.slotLabel, { color: sel ? '#fff' : TEXT }]}>{label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                  {selectedDate !== null && validSlots.length === 0 && (
                    <Text style={[s.asapNote, { paddingHorizontal: 16, paddingBottom: 12 }]}>No pickup slots available for this date.</Text>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* DELIVERY */}
        {orderType === 'delivery' && (
          <>
            {/* Address compact row */}
            <Pressable onPress={() => setShowAddressForm((v) => !v)} style={s.addrRow}>
              <Feather name="map-pin" size={16} color={BLUE} />
              <Text style={[s.addrText, !addressDisplay && { color: MUTED }]} numberOfLines={1}>
                {addressDisplay || 'Add delivery address'}
              </Text>
              <Feather name={showAddressForm ? 'chevron-up' : 'chevron-right'} size={14} color={MUTED} />
            </Pressable>

            {/* Address form — expands on tap */}
            {showAddressForm && (
              <>
                <RowDivider />
                <View style={{ padding: 14, gap: 10 }}>
                  <AddressSearchInput
                    currentValue={street ? `${street}${suburb ? `, ${suburb}` : ''}` : undefined}
                    placeholder="Search delivery address…"
                    onSelect={(r) => {
                      if (r.street) setStreet(r.street);
                      if (r.suburb) setSuburb(r.suburb);
                      if (r.postcode) setPostcode(r.postcode);
                      setSelectedAddressId(null);
                    }}
                  />
                  {savedAddresses.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {savedAddresses.map((addr) => {
                        const isSel = selectedAddressId === addr.id;
                        return (
                          <Pressable key={addr.id} onPress={() => { fillFromAddress(addr); Haptics.selectionAsync(); }}
                            style={[s.savedChip, isSel && s.savedChipActive]}>
                            <Feather name={addr.label.toLowerCase() === 'home' ? 'home' : addr.label.toLowerCase() === 'work' ? 'briefcase' : 'map-pin'} size={11} color={isSel ? BLUE : MUTED} />
                            <Text style={[s.savedChipText, { color: isSel ? BLUE : TEXT }]}>{addr.label}</Text>
                          </Pressable>
                        );
                      })}
                      <Pressable onPress={() => router.push('/addresses')} style={s.savedChip}>
                        <Feather name="plus" size={11} color={MUTED} />
                        <Text style={[s.savedChipText, { color: MUTED }]}>Manage</Text>
                      </Pressable>
                    </ScrollView>
                  )}
                  <TextInput style={s.input} placeholder="Street address" placeholderTextColor={MUTED} value={street} onChangeText={(v) => { setStreet(v); setSelectedAddressId(null); }} autoCapitalize="words" />
                  <TextInput style={s.input} placeholder="Apt / unit (optional)" placeholderTextColor={MUTED} value={apt} onChangeText={(v) => { setApt(v); setSelectedAddressId(null); }} autoCapitalize="words" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[s.input, { flex: 1 }]} placeholder="Suburb" placeholderTextColor={MUTED} value={suburb} onChangeText={(v) => { setSuburb(v); setSelectedAddressId(null); }} autoCapitalize="words" />
                    <TextInput style={[s.input, { width: 100 }]} placeholder="Postcode" placeholderTextColor={MUTED} value={postcode} onChangeText={(v) => { setPostcode(v); setSelectedAddressId(null); }} keyboardType="number-pad" maxLength={4} />
                  </View>
                  <View style={s.nswBadge}>
                    <Feather name="map-pin" size={11} color={BLUE} />
                    <Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>NSW — Sydney deliveries only</Text>
                  </View>
                </View>
              </>
            )}

            <RowDivider />

            {/* Delivery date chips */}
            <View style={{ paddingTop: 12, paddingBottom: 4 }}>
              <Text style={s.slotsLabel}>Choose a delivery date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
                {deliveryDateChips.map((chip, i) => {
                  const sel = selectedDelivIdx === i;
                  return (
                    <Pressable key={i} onPress={() => { setSelectedDate(chip.date); Haptics.selectionAsync(); }}
                      style={[s.dateChip, sel && s.dateChipActive]}>
                      <Text style={[s.dateChipLabel, { color: sel ? '#fff' : TEXT }]}>{chip.label}</Text>
                      <Text style={[s.dateChipSub,   { color: sel ? 'rgba(255,255,255,0.7)' : MUTED }]}>{chip.sub}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={[s.asapNote, { paddingHorizontal: 16, paddingBottom: 12 }]}>
                Delivered between 8am and 5pm · AUD {(deliveryFeeCents / 100).toFixed(2)} flat fee
              </Text>
            </View>

            {/* Contact / notes for delivery */}
            <RowDivider />
            <View style={{ padding: 14, gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>Your details</Text>
              <TextInput style={s.input} placeholder="Full name" placeholderTextColor={MUTED} value={contactName} onChangeText={setContactName} autoCapitalize="words" />
              <TextInput style={s.input} placeholder="Mobile number" placeholderTextColor={MUTED} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
              <TextInput style={s.input} placeholder="Email" placeholderTextColor={MUTED} value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={[s.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]} placeholder="Notes (allergies, gate code, gift wrap…)" placeholderTextColor={MUTED} value={notes} onChangeText={setNotes} multiline />
            </View>
          </>
        )}
      </View>

      {/* ── USE REWARDS ──────────────────────────────────────────────────── */}
      <SecLabel label="Use Rewards" />
      <View style={s.card}>

        {/* Points row */}
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Feather name="award" size={15} color={BLUE} />
            <Text style={{ flex: 1, fontSize: 11, lineHeight: 16, color: MUTED }}>
              Membership tier progress: AUD {(annualTierSpendCents / 100).toFixed(2)} from qualifying orders in the past 12 months. Using points does not reduce this.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[s.rewardIcon, usePoints && { backgroundColor: '#EFF9FF', borderColor: BLUE }]}>
              <Feather name="star" size={17} color={usePoints ? BLUE : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rewardTitle}>{availableLoyaltyPoints} points available</Text>
              <Text style={s.rewardSub}>Worth AUD {(availableLoyaltyPoints * LOYALTY_POINT_VALUE_CENTS / 100).toFixed(2)} · 1 pt = AUD {(LOYALTY_POINT_VALUE_CENTS / 100).toFixed(2)}</Text>
            </View>
            {!usePoints ? (
              <Pressable onPress={() => { setUsePoints(true); Haptics.selectionAsync(); }} style={s.useBtn}>
                <Text style={s.useBtnText}>Use</Text>
              </Pressable>
            ) : null}
          </View>

          {usePoints && (
            <View style={{ marginTop: 12 }}>
              {/* Stepper */}
              <View style={s.stepper}>
                <Pressable onPress={() => { const next = Math.max(1, pointsToUse - 1); setPointsToUse(next); setPointsInput(String(next)); Haptics.selectionAsync(); }} style={s.stepperBtn}>
                  <Text style={[s.stepperMath, { color: pointsToUse <= 1 ? BORDER : BLUE }]}>−</Text>
                </Pressable>
                <Pressable onPress={() => { setEditingPoints(true); setPointsInput(String(pointsToUse)); setTimeout(() => pointsInputRef.current?.focus(), 30); }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
                  {editingPoints ? (
                    <View style={{ alignItems: 'center', gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TextInput
                          ref={pointsInputRef}
                          autoFocus
                          keyboardType="number-pad"
                          value={pointsInput}
                          onChangeText={(v) => setPointsInput(v.replace(/\D/g, ''))}
                          onBlur={() => commitPointsInput(pointsInput)}
                          onSubmitEditing={() => commitPointsInput(pointsInput)}
                          style={{ width: 72, textAlign: 'center', fontSize: 17, fontWeight: '700', color: TEXT, borderBottomWidth: 2, borderBottomColor: BLUE, paddingBottom: 2 }}
                        />
                        <Text style={{ fontSize: 14, color: MUTED }}>pts</Text>
                      </View>
                      <Text style={{ color: GREEN, fontSize: 12, fontWeight: '600' }}>−AUD {((parseInt(pointsInput || '0', 10) || 0) * LOYALTY_POINT_VALUE_CENTS / 100).toFixed(2)} off</Text>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <Text style={{ color: TEXT, fontSize: 17, fontWeight: '700' }}>{pointsToUse}</Text>
                        <Text style={{ color: MUTED, fontSize: 12 }}>pts</Text>
                      </View>
                      <Text style={{ color: GREEN, fontSize: 12, fontWeight: '600', marginTop: 1 }}>−AUD {(pointsToUse * LOYALTY_POINT_VALUE_CENTS / 100).toFixed(2)} off</Text>
                      <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>tap to edit</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={() => { const max = maxUsablePoints || availableLoyaltyPoints; const next = Math.min(max, pointsToUse + 1); setPointsToUse(next); setPointsInput(String(next)); Haptics.selectionAsync(); }} style={s.stepperBtn}>
                  <Text style={[s.stepperMath, { color: pointsToUse >= (maxUsablePoints || availableLoyaltyPoints) ? BORDER : BLUE }]}>+</Text>
                </Pressable>
              </View>

              {/* Progress */}
              <View style={{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: BORDER, overflow: 'hidden' }}>
                <View style={{ height: '100%', borderRadius: 2, backgroundColor: BLUE, width: `${(pointsToUse / (maxUsablePoints || availableLoyaltyPoints || 1)) * 100}%` }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: MUTED, fontSize: 11 }}>1 min</Text>
                <Text style={{ color: MUTED, fontSize: 11 }}>{maxUsablePoints || availableLoyaltyPoints} max</Text>
              </View>

              <Pressable onPress={() => { setUsePoints(false); setPointsToUse(0); setPointsInput(''); Haptics.selectionAsync(); }} style={s.removeBtn}>
                <Text style={{ color: MUTED, fontSize: 13, fontWeight: '600' }}>Remove points</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Free coffee row */}
        {freeCoffeeRewards > 0 && hasCoffeeInCart && (
          <>
            <RowDivider />
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
              <View style={[s.rewardIcon, useFreeCoffeeReward && { backgroundColor: '#EFF9FF', borderColor: BLUE }]}>
                <Feather name="coffee" size={17} color={useFreeCoffeeReward ? BLUE : MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rewardTitle}>Free coffee</Text>
                <Text style={s.rewardSub}>{freeCoffeeRewards} available · AUD {(cheapestCoffeePriceCents / 100).toFixed(2)} off</Text>
              </View>
              <Pressable onPress={() => { setUseFreeCoffeeReward(!useFreeCoffeeReward); Haptics.selectionAsync(); }}
                style={[s.useBtn, useFreeCoffeeReward && { backgroundColor: BLUE }]}>
                <Text style={[s.useBtnText, useFreeCoffeeReward && { color: '#fff' }]}>
                  {useFreeCoffeeReward ? 'Applied ✓' : 'Use'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Claimed rewards */}
        {claimedRewards.filter((r) => r.status === 'available' || r.status === 'applied_to_cart').map((reward) => (
          <React.Fragment key={reward.id}>
            <RowDivider />
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
              <View style={[s.rewardIcon, selectedClaimedRewardId === reward.id && { backgroundColor: '#EFF9FF', borderColor: BLUE }]}>
                <Feather name="gift" size={17} color={selectedClaimedRewardId === reward.id ? BLUE : MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rewardTitle}>{reward.rewardName}</Text>
                {reward.expiresAt && <Text style={s.rewardSub}>Expires {new Date(reward.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</Text>}
              </View>
              <Pressable onPress={() => { handleSelectReward(selectedClaimedRewardId === reward.id ? null : reward.id); Haptics.selectionAsync(); }}
                style={[s.useBtn, selectedClaimedRewardId === reward.id && { backgroundColor: BLUE }]}>
                <Text style={[s.useBtnText, selectedClaimedRewardId === reward.id && { color: '#fff' }]}>
                  {selectedClaimedRewardId === reward.id ? 'Applied ✓' : 'Use'}
                </Text>
              </Pressable>
            </View>
          </React.Fragment>
        ))}

        {/* Discount code */}
        <RowDivider />
        {discountApplied ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
            <Feather name="tag" size={16} color={GREEN} />
            <Text style={{ flex: 1, color: GREEN, fontSize: 14, fontWeight: '600' }}>{discountApplied.code} — −AUD {(discountApplied.discountAmountCents / 100).toFixed(2)}</Text>
            <Pressable onPress={() => { setDiscountApplied(null); setDiscountInput(''); setDiscountError(''); }} style={s.useBtn}>
              <Text style={s.useBtnText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
            <Feather name="tag" size={16} color={MUTED} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: TEXT }}
              placeholder="Discount code"
              placeholderTextColor={MUTED}
              value={discountInput}
              onChangeText={(v) => { setDiscountInput(v); setDiscountError(''); }}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={applyDiscount}
            />
            {validatingDiscount
              ? <ActivityIndicator size="small" color={BLUE} />
              : <Pressable onPress={applyDiscount}><Text style={{ color: BLUE, fontSize: 14, fontWeight: '700' }}>Apply</Text></Pressable>
            }
          </View>
        )}
        {discountError ? <Text style={{ color: CHERRY, fontSize: 12, paddingHorizontal: 16, paddingBottom: 10 }}>{discountError}</Text> : null}
      </View>

      {/* ── PAYMENT ──────────────────────────────────────────────────────── */}
      <SecLabel label="Payment" />
      <View style={s.card}>
        {cancelMessage && (
          <View style={{ backgroundColor: '#FEF3C7', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="alert-circle" size={14} color="#92400E" />
            <Text style={{ flex: 1, color: '#92400E', fontSize: 13 }}>{cancelMessage}</Text>
          </View>
        )}

        {/* Apple Pay row */}
        {isIosApplePay && (
          <>
            <Pressable onPress={() => { setMethod('apple_pay'); Haptics.selectionAsync(); }} style={s.methodRow}>
              <View style={[s.methodIcon, method === 'apple_pay' && s.methodIconActive]}>
                <Feather name="smartphone" size={18} color={method === 'apple_pay' ? BLUE : MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.methodLabel, { color: method === 'apple_pay' ? TEXT : TEXT }]}>Apple Pay</Text>
                <Text style={s.methodSub}>Face ID · instant</Text>
              </View>
              <View style={[s.radio, method === 'apple_pay' && { borderColor: BLUE, backgroundColor: BLUE }]}>
                {method === 'apple_pay' && <Feather name="check" size={12} color="#fff" />}
              </View>
            </Pressable>
            <RowDivider />
          </>
        )}

        {/* Saved cards */}
        {savedPaymentMethods.map((pm, i) => (
          <React.Fragment key={pm.id}>
            <Pressable onPress={() => { setMethod('credit_card'); setSelectedSavedPaymentMethodId(pm.id); Haptics.selectionAsync(); }} style={s.methodRow}>
              <View style={[s.methodIcon, method === 'credit_card' && selectedSavedPaymentMethodId === pm.id && s.methodIconActive]}>
                <Feather name="credit-card" size={18} color={method === 'credit_card' && selectedSavedPaymentMethodId === pm.id ? BLUE : MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.methodLabel}>•••• {pm.last4}</Text>
                <Text style={s.methodSub}>{pm.brand?.toUpperCase()} · expires {pm.expMonth}/{pm.expYear}</Text>
              </View>
              <View style={[s.radio, method === 'credit_card' && selectedSavedPaymentMethodId === pm.id && { borderColor: BLUE, backgroundColor: BLUE }]}>
                {method === 'credit_card' && selectedSavedPaymentMethodId === pm.id && <Feather name="check" size={12} color="#fff" />}
              </View>
            </Pressable>
            <RowDivider />
          </React.Fragment>
        ))}

        {/* Add new card row */}
        <Pressable onPress={() => { setMethod('credit_card'); setSelectedSavedPaymentMethodId(null); Haptics.selectionAsync(); }} style={s.methodRow}>
          <View style={[s.methodIcon, method === 'credit_card' && !selectedSavedPaymentMethodId && s.methodIconActive]}>
            <Feather name="plus-circle" size={18} color={method === 'credit_card' && !selectedSavedPaymentMethodId ? BLUE : MUTED} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.methodLabel}>New card</Text>
            <Text style={s.methodSub}>Visa, Mastercard, Amex</Text>
          </View>
          <View style={[s.radio, method === 'credit_card' && !selectedSavedPaymentMethodId && { borderColor: BLUE, backgroundColor: BLUE }]}>
            {method === 'credit_card' && !selectedSavedPaymentMethodId && <Feather name="check" size={12} color="#fff" />}
          </View>
        </Pressable>

        {method === 'credit_card' && !selectedSavedPaymentMethodId && (
          <>
            <RowDivider />
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: MUTED, marginBottom: 8, letterSpacing: 0.3 }}>CARD NUMBER · EXPIRY · CVC</Text>
              <View style={{
                borderWidth: 1.5, borderColor: BLUE, borderRadius: 12,
                backgroundColor: '#fff', overflow: 'hidden',
                paddingHorizontal: 4,
              }}>
                <CardField
                  postalCodeEnabled={false}
                  placeholders={{ number: '4242 4242 4242 4242', expiration: 'MM/YY', cvc: 'CVC' }}
                  style={{ width: '100%', height: 54 }}
                  cardStyle={{
                    backgroundColor: '#ffffff',
                    textColor: TEXT,
                    placeholderColor: '#9CA3AF',
                    borderRadius: 10,
                    fontSize: 16,
                  }}
                />
              </View>
              <Text style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                Test card: 4242 4242 4242 4242 · any expiry · any CVC
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <Text style={{ color: MUTED, fontSize: 13 }}>Save card for next time</Text>
                <Switch value={saveCardForNextTime} onValueChange={setSaveCardForNextTime} trackColor={{ false: BORDER, true: BLUE }} />
              </View>
            </View>
          </>
        )}

        {/* Pay at pickup — not available for table orders */}
        {canPayAtPickup && orderType === 'pickup' && (
          <>
            <RowDivider />
            <Pressable onPress={() => { setMethod('pay_at_pickup'); Haptics.selectionAsync(); }} style={s.methodRow}>
              <View style={[s.methodIcon, method === 'pay_at_pickup' && s.methodIconActive]}>
                <Feather name="shopping-bag" size={17} color={method === 'pay_at_pickup' ? BLUE : MUTED} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.methodLabel}>Pay at counter</Text>
                <Text style={s.methodSub}>When you arrive</Text>
              </View>
              <View style={[s.radio, method === 'pay_at_pickup' && { borderColor: BLUE, backgroundColor: BLUE }]}>
                {method === 'pay_at_pickup' && <Feather name="check" size={12} color="#fff" />}
              </View>
            </Pressable>
          </>
        )}
      </View>

      {/* ── TOTAL ────────────────────────────────────────────────────────── */}
      <View style={s.totalCard}>
        <View style={s.totalRow}>
          <Text style={s.totalRowLabel}>Subtotal</Text>
          <Text style={s.totalRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        {deliveryCents > 0 && (
          <View style={s.totalRow}>
            <Text style={s.totalRowLabel}>Delivery</Text>
            <Text style={s.totalRowValue}>AUD {(deliveryCents / 100).toFixed(2)}</Text>
          </View>
        )}
        {stripeFee > 0 && method !== 'pay_at_pickup' && method !== 'apple_pay' && (
          <View style={s.totalRow}>
            <Text style={s.totalRowLabel}>Estimated card fee</Text>
            <Text style={s.totalRowValue}>AUD {(stripeFee / 100).toFixed(2)}</Text>
          </View>
        )}
        {totalSaved > 0 && (
          <View style={s.totalRow}>
            <Text style={[s.totalRowLabel, { color: GREEN }]}>Rewards saved</Text>
            <Text style={[s.totalRowValue, { color: GREEN }]}>−AUD {(totalSaved / 100).toFixed(2)}</Text>
          </View>
        )}
        <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 10 }} />
        <View style={s.totalRow}>
          <Text style={s.grandLabel}>Total</Text>
          <Text style={s.grandValue}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40, gap: 10 }}>
        {isIosApplePay && method === 'apple_pay' ? (
          applePayClientSecret ? (
            <StableApplePayButton
              clientSecret={applePayClientSecret}
              totalAmount={totalCents / 100}
              onSuccess={handleApplePaySuccess}
            />
          ) : (
            <Pressable onPress={handleApplePay} disabled={busy} style={[s.ctaBtn, { backgroundColor: TEXT }]}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Feather name="smartphone" size={18} color="#fff" />
                  <Text style={s.ctaLabel}>Pay AUD {(totalCents / 100).toFixed(2)}</Text>
                </>
              )}
            </Pressable>
          )
        ) : (
          <Pressable onPress={handlePlaceOrder} disabled={busy} style={[s.ctaBtn, { backgroundColor: CHERRY, opacity: busy ? 0.8 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.ctaLabel}>Place Order · AUD {(totalCents / 100).toFixed(2)}</Text>
            )}
          </Pressable>
        )}
        <Text style={{ color: MUTED, fontSize: 11, textAlign: 'center' }}>Secure checkout · Terms apply</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:         { paddingBottom: 8 },
  secLabel:     { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  card:         { backgroundColor: CARD, marginHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  // Segmented toggle
  segWrap:      { paddingHorizontal: 16, marginBottom: 12 },
  segTrack:     { flexDirection: 'row', backgroundColor: BORDER, borderRadius: 14, padding: 5, gap: 4 },
  segBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  segBtnActive: { backgroundColor: CARD, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segLabel:     { fontSize: 14, fontWeight: '600' },
  deliveryNote: { fontSize: 12, color: MUTED, paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  // Store row
  storeRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  storeIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#EFF9FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  storeName:     { fontSize: 15, fontWeight: '700', color: TEXT },
  storeAddr:     { fontSize: 13, color: MUTED, marginTop: 2 },
  openBadge:     { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, marginTop: 6 },
  openBadgeText: { fontSize: 11, fontWeight: '700' },
  // Timing buttons
  timingBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER },
  timingBtnActive: { borderColor: BLUE, backgroundColor: '#EFF9FF' },
  timingLabel:     { fontSize: 14, fontWeight: '600' },
  asapNote:        { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 8 },
  // Date chips
  dateChip:       { flexShrink: 0, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: BG, alignItems: 'center' },
  dateChipActive: { backgroundColor: TEXT, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  dateChipLabel:  { fontSize: 13, fontWeight: '700' },
  dateChipSub:    { fontSize: 11, marginTop: 2 },
  // Time slots
  slotsLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 16, paddingBottom: 8 },
  slotsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  slotBtn:       { width: '31%', paddingVertical: 9, borderRadius: 10, backgroundColor: BG, alignItems: 'center' },
  slotBtnActive: { backgroundColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3 },
  slotLabel:     { fontSize: 13, fontWeight: '600' },
  // Address
  addrRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  addrText:   { flex: 1, fontSize: 14, color: TEXT },
  input:      { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT },
  nswBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EFF9FF', borderRadius: 8, alignSelf: 'flex-start' },
  // Saved address chips
  savedChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  savedChipActive: { backgroundColor: '#EFF9FF', borderColor: BLUE },
  savedChipText:   { fontSize: 13, fontWeight: '500' },
  // Rewards
  rewardIcon:  { width: 38, height: 38, borderRadius: 10, backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rewardTitle: { fontSize: 15, fontWeight: '600', color: TEXT },
  rewardSub:   { fontSize: 12, color: MUTED, marginTop: 2 },
  useBtn:      { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: BG, flexShrink: 0 },
  useBtnText:  { fontSize: 13, fontWeight: '700', color: TEXT },
  // Points stepper
  stepper:    { flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 14, borderWidth: 1.5, borderColor: BLUE, overflow: 'hidden' },
  stepperBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepperMath:{ fontSize: 26, fontWeight: '300', lineHeight: 30 },
  removeBtn:  { marginTop: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center' },
  // Payment methods
  methodRow:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  methodIcon:     { width: 40, height: 40, borderRadius: 11, backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  methodIconActive:{ backgroundColor: '#EFF9FF', borderColor: BLUE },
  methodLabel:    { fontSize: 15, fontWeight: '600', color: TEXT },
  methodSub:      { fontSize: 12, color: MUTED, marginTop: 2 },
  radio:          { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  // Total
  totalCard:      { marginHorizontal: 16, marginTop: 16, padding: 16, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  totalRowLabel:  { fontSize: 14, color: MUTED },
  totalRowValue:  { fontSize: 14, color: TEXT },
  grandLabel:     { fontSize: 19, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  grandValue:     { fontSize: 19, fontWeight: '800', color: TEXT },
  // CTA
  ctaBtn:   { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  ctaLabel: { color: '#fff', fontSize: 17, fontWeight: '700' },
  // Table number chips
  tableNumChip:       { width: 44, height: 44, borderRadius: 22, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tableNumChipActive: { backgroundColor: BLUE, borderColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  tableNumChipText:   { fontSize: 14, fontWeight: '700' },
  tableBadgeInline:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#EFF9FF', borderRadius: 10 },
  tableBadgeInlineText: { fontSize: 14, fontWeight: '600', color: BLUE },
});
