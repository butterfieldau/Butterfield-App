import { useState, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getRetailDeliveryDates,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';
import {
  getStorePickupDates,
  getStorePickupTimeMins,
  isStoreOpenForAsap,
} from '@/lib/storeSchedule';
import type { SavedAddress } from '@/lib/api';

const STRIPE_CARD_RATE = 0.017;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;

function estimateStripeFeeCents(amountCents: number) {
  return amountCents > 0
    ? Math.max(0, Math.round(amountCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_FEE_CENTS)
    : 0;
}

function calcTotals(
  subtotalCents: number,
  step: number,
  orderType: 'pickup' | 'delivery',
  deliveryFeeCents: number,
) {
  const deliv = step >= 1 && orderType === 'delivery' ? deliveryFeeCents : 0;
  const base = subtotalCents + deliv;
  const stripeFee = estimateStripeFeeCents(base);
  return { deliv, stripeFee, total: base + stripeFee };
}

export interface UseCheckoutParams {
  totalPriceCents: number;
  items: Array<{ productId: string; category?: string | null }>;
  deliveryConfig: {
    slots?: Array<{ deliveryLabel: string; windowOpen: string; windowClose: string }>;
    blackoutDates?: string[];
    feeCents?: number;
    deliveryEnabled?: boolean;
    deliverableCategories?: string[];
    pickupOnlyProductIds?: string[];
  } | undefined;
  selectedStore: any;
  deliveryFeeCents: number;
  globalDeliveryEnabled: boolean;
  eligibleCategories: Set<string>;
  pickupOnlyIds: Set<string>;
  meData: any;
  user: any;
}

export function useCheckout({
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
}: UseCheckoutParams) {
  const [step, setStep]                           = useState(0);
  const [orderType, setOrderType]                 = useState<'pickup' | 'delivery'>('pickup');
  const [selectedDate, setSelectedDate]           = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins]   = useState<number | null>(null);
  const [pickupMode, setPickupMode]               = useState<'asap' | 'scheduled'>('scheduled');
  const [street, setStreet]                       = useState('');
  const [suburb, setSuburb]                       = useState('');
  const [postcode, setPostcode]                   = useState('');
  const [addrState, setAddrState]                 = useState('NSW');
  const [apt, setApt]                             = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [contactName, setContactName]             = useState('');
  const [contactPhone, setContactPhone]           = useState('');
  const [contactEmail, setContactEmail]           = useState('');
  const [notes, setNotes]                         = useState('');
  const [loading, setLoading]                     = useState(false);

  const hasDeliverableItems = items.some((item) => {
    const cat = `${item.category ?? ''}`.trim().toLowerCase();
    return eligibleCategories.has(cat);
  });
  const hasUndeliverableItems = items.some((item) => {
    const cat = `${item.category ?? ''}`.trim().toLowerCase();
    return !eligibleCategories.has(cat) || pickupOnlyIds.has(item.productId);
  });
  const deliveryEnabled        = globalDeliveryEnabled && items.length > 0 && !hasUndeliverableItems;
  const showMixedDeliveryMessage = hasDeliverableItems && hasUndeliverableItems;

  const sydNow       = getSydneyNow();
  const storeOpen    = isStoreOpenForAsap(selectedStore, sydNow);
  const deliveryDates = getRetailDeliveryDates(
    (deliveryConfig?.slots ?? []) as any,
    deliveryConfig?.blackoutDates ?? [],
  );
  const pickupDates  = getStorePickupDates(selectedStore, sydNow);

  const validSlots = useMemo(() => {
    if (!selectedDate || orderType !== 'pickup' || pickupMode !== 'scheduled') return [];
    return getStorePickupTimeMins(selectedStore, selectedDate, sydNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedStore, orderType, pickupMode]);

  useEffect(() => {
    if (!deliveryEnabled && orderType === 'delivery') {
      setOrderType('pickup');
      setSelectedDate(null);
      setSelectedTimeMins(null);
      setPickupMode('scheduled');
    }
  }, [deliveryEnabled, orderType]);

  useEffect(() => {
    if (orderType !== 'pickup') return;
    setPickupMode(storeOpen ? 'asap' : 'scheduled');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, storeOpen, selectedStore?.id]);

  useEffect(() => {
    if (orderType !== 'pickup' || !selectedDate) return;
    const dateStillAvailable = pickupDates.some((d) => isSameDay(d, selectedDate));
    if (!dateStillAvailable) {
      setSelectedDate(null);
      setSelectedTimeMins(null);
    }
  }, [orderType, pickupDates, selectedDate]);

  useEffect(() => {
    if (orderType !== 'pickup' || pickupMode !== 'scheduled') return;
    if (validSlots.length > 0) {
      setSelectedTimeMins((prev) => {
        if (prev !== null && validSlots.includes(prev)) return prev;
        return validSlots[0];
      });
    } else {
      setSelectedTimeMins(null);
    }
  }, [validSlots, orderType, pickupMode]);

  useEffect(() => {
    if (orderType !== 'delivery' || !selectedDate) return;
    const available = deliveryDates.filter((s) => s.available).map((s) => s.date);
    const stillAvailable = available.some((d) => isSameDay(d, selectedDate));
    if (!stillAvailable) setSelectedDate(null);
  }, [orderType, deliveryDates, selectedDate]);

  useEffect(() => {
    const freshUser = meData?.user ?? user;
    if (!freshUser) return;
    if (!contactName)  setContactName(freshUser.name ?? '');
    if (!contactEmail) setContactEmail(freshUser.email ?? '');
    if (!contactPhone) {
      const phone = (meData?.user as any)?.phone ?? (user as any)?.phone;
      if (phone) setContactPhone(phone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, meData]);

  const subtotalCents = totalPriceCents;
  const { stripeFee: stripeFeeCents, total: totalCents } = calcTotals(
    subtotalCents,
    step,
    orderType,
    deliveryFeeCents,
  );

  const fillFromAddress = (addr: SavedAddress) => {
    setStreet(addr.street);
    setApt(addr.apt ?? '');
    setSuburb(addr.suburb);
    setPostcode(addr.postcode);
    setAddrState(addr.state);
    setSelectedAddressId(addr.id);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (step === 0) { setStep(1); return; }
    if (step === 1) {
      if (orderType === 'pickup') {
        if (pickupMode === 'scheduled' && (!selectedDate || selectedTimeMins === null)) {
          Alert.alert('Select pickup time', 'Please choose a date and pickup time.');
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
            'We currently deliver within Sydney (NSW postcodes 2000–2999) only. Please choose pickup or update your address.',
          );
          return;
        }
        if (!contactName.trim()) {
          Alert.alert('Your details required', 'Please enter your full name.');
          return;
        }
      }
      setStep(2);
    }
  };

  return {
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
  };
}
