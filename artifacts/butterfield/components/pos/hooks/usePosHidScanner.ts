import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api } from '@/lib/api';
import type { PosCustomerResult } from '@/lib/api';
import { upsertCustomerCache } from '@/lib/posCache';
import type { AttachedCustomer, Ticket } from '../types';

type ScannerBanner = { kind: 'success' | 'error'; message: string } | null;

export function usePosHidScanner({
  activeIdx,
  tickets,
  updateTicket,
  anyModalOpen,
}: {
  activeIdx: number;
  tickets: Ticket[];
  updateTicket: (patch: any) => void;
  anyModalOpen: boolean;
}) {
  const scannerInputRef = useRef<any>(null);
  const scannerBufRef = useRef('');
  const scannerFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scannerBanner, setScannerBanner] = useState<ScannerBanner>(null);
  const scannerBannerOpacity = useRef(new Animated.Value(0)).current;
  const scannerBannerSlide = useRef(new Animated.Value(-40)).current;

  const showScannerBanner = useCallback((kind: 'success' | 'error', message: string) => {
    if (scannerBannerTimerRef.current) clearTimeout(scannerBannerTimerRef.current);
    setScannerBanner({ kind, message });
    scannerBannerOpacity.setValue(0);
    scannerBannerSlide.setValue(-40);
    Animated.parallel([
      Animated.timing(scannerBannerOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(scannerBannerSlide, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    scannerBannerTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(scannerBannerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(scannerBannerSlide, { toValue: -40, duration: 300, useNativeDriver: true }),
      ]).start(() => setScannerBanner(null));
    }, 2000);
  }, [scannerBannerOpacity, scannerBannerSlide]);

  const handleHidScan = useCallback(async (payload: string) => {
    const trimmed = payload.trim();
    if (trimmed.length < 4) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let result: PosCustomerResult | null = null;
    try { const res = await api.pos.customerSearch({ qrPayload: trimmed }); result = res.data[0] ?? null; } catch { showScannerBanner('error', 'Customer not found'); return; }
    if (!result) { showScannerBanner('error', 'Customer not found'); return; }
    const newCustomer: AttachedCustomer = {
      userId: result.userId, name: result.name, email: result.email,
      loyaltyPoints: result.loyaltyPoints, stampCount: result.stampCount, loyaltyTier: result.loyaltyTier,
      freeCoffeeRewards: result.freeCoffeeRewards ?? 0, birthday: (result as any).birthday ?? null,
      availableClaimedRewards: (result as any).availableClaimedRewards ?? [],
    };
    const tierLabel = newCustomer.loyaltyTier.charAt(0).toUpperCase() + newCustomer.loyaltyTier.slice(1);
    const current = (tickets[activeIdx] ?? tickets[0]!).customer;
    if (current) {
      if (current.userId === newCustomer.userId) { showScannerBanner('success', `${newCustomer.name} — already attached · ${tierLabel}`); return; }
      Alert.alert('Replace Customer?', `Replace ${current.name} with ${newCustomer.name}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', onPress: () => { updateTicket({ customer: newCustomer, appliedDiscount: null }); upsertCustomerCache(newCustomer).catch(() => {}); showScannerBanner('success', `${newCustomer.name} — ${newCustomer.loyaltyPoints} pts · ${tierLabel}`); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
      ]);
      return;
    }
    updateTicket({ customer: newCustomer, appliedDiscount: null });
    upsertCustomerCache(newCustomer).catch(() => {});
    showScannerBanner('success', `${newCustomer.name} — ${newCustomer.loyaltyPoints} pts · ${tierLabel}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [tickets, activeIdx, updateTicket, showScannerBanner]); // eslint-disable-line react-hooks/exhaustive-deps

  const flushScannerBuf = useCallback(() => {
    if (scannerFlushTimerRef.current) { clearTimeout(scannerFlushTimerRef.current); scannerFlushTimerRef.current = null; }
    const value = scannerBufRef.current;
    scannerBufRef.current = '';
    scannerInputRef.current?.clear();
    if (value.length >= 4) handleHidScan(value);
  }, [handleHidScan]);

  const focusScannerInput = useCallback(() => {
    if (anyModalOpen) return;
    scannerInputRef.current?.focus();
  }, [anyModalOpen]);

  useEffect(() => {
    const t = setTimeout(focusScannerInput, 80);
    return () => clearTimeout(t);
  }, [activeIdx, anyModalOpen, focusScannerInput]);

  useEffect(() => {
    return () => {
      if (scannerFlushTimerRef.current) clearTimeout(scannerFlushTimerRef.current);
      if (scannerBannerTimerRef.current) clearTimeout(scannerBannerTimerRef.current);
    };
  }, []);

  return { scannerInputRef, scannerBufRef, scannerFlushTimerRef, scannerBannerOpacity, scannerBannerSlide, scannerBanner, flushScannerBuf, focusScannerInput };
}
