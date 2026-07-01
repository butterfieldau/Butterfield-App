/**
 * BuildABoxFlow — shared 2-step UI for both Customer and POS.
 *
 * Step 0: choose box size (fetched from /api/products/build-a-box/sizes)
 * Step 1: fill with cookies (fetched from /api/products, filtered to cookies)
 *
 * The parent wraps this in a <Modal> and supplies onConfirm, which receives
 * all the selection data so customer vs POS can add it to their own cart/ticket.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';
import SizePicker, { type BoxOption } from './SizePicker';
import CookiePicker, { type CookieSelection } from './CookiePicker';

const BLUE   = '#40C0F2';
const CHERRY = '#D20001';
const GREEN  = '#16A34A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

export interface BuildABoxResult {
  selectedBox:   BoxOption;
  selections:    Map<string, CookieSelection>;
  surchargeTotal: number;
}

interface Props {
  onClose:   () => void;
  onConfirm: (result: BuildABoxResult) => void;
  numColumns?: number;
}

export default function BuildABoxFlow({ onClose, onConfirm, numColumns }: Props) {
  const insets = useSafeAreaInsets();

  const [step, setStep]               = useState<0 | 1>(0);
  const [selectedBox, setSelectedBox] = useState<BoxOption | null>(null);
  const [selections, setSelections]   = useState<Map<string, CookieSelection>>(new Map());

  const { data: sizesData, isLoading: sizesLoading } = useQuery({
    queryKey: ['build-a-box-sizes'],
    queryFn: () => api.products.buildABoxSizes(),
    staleTime: 5 * 60_000,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    staleTime: 60_000,
  });

  const isLoading = sizesLoading || productsLoading;

  const boxOptions: BoxOption[] = useMemo(
    () => (sizesData?.data ?? []).map(s => ({ size: s.size, label: s.label, priceCents: s.priceCents, imageUrl: s.imageUrl })),
    [sizesData],
  );

  const cookies = useMemo(
    () => (productsData?.data ?? []).filter(p => {
      const cat = ((p as any).category ?? p.metadata?.category ?? '').toLowerCase();
      return cat === 'cookies'
        && ((p as any).isAvailable !== false)
        && !((p as any).buildABoxExcluded);
    }),
    [productsData],
  );

  const filled = useMemo(
    () => Array.from(selections.values()).reduce((s, v) => s + v.quantity, 0),
    [selections],
  );
  const surchargeTotal = useMemo(
    () => Array.from(selections.values()).reduce((s, v) => s + v.quantity * v.surchargeCents, 0),
    [selections],
  );

  const boxSize       = selectedBox?.size ?? 0;
  const allFilled     = boxSize > 0 && filled === boxSize;
  const remaining     = boxSize - filled;
  const canContinue   = step === 0 ? selectedBox !== null : allFilled;

  const fillProgress = useSharedValue(0);
  React.useEffect(() => {
    fillProgress.value = withTiming(boxSize > 0 ? filled / boxSize : 0, { duration: 350 });
  }, [filled, boxSize]);
  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(1, fillProgress.value) * 100}%` as any,
  }));

  const handleIncrement = (product: ApiProduct) => {
    if (filled >= boxSize) return;
    const surchargeCents = (product as any).buildABoxSurchargeCents ?? 0;
    setSelections(prev => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      next.set(product.id, { quantity: (existing?.quantity ?? 0) + 1, surchargeCents, name: product.name });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDecrement = (productId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      const existing = next.get(productId);
      if (!existing || existing.quantity <= 0) return prev;
      if (existing.quantity === 1) next.delete(productId);
      else next.set(productId, { ...existing, quantity: existing.quantity - 1 });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirm = () => {
    if (!selectedBox || !allFilled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm({ selectedBox, selections, surchargeTotal });
    // Reset for next use
    setStep(0);
    setSelectedBox(null);
    setSelections(new Map());
  };

  const handleClose = () => {
    setStep(0);
    setSelectedBox(null);
    setSelections(new Map());
    onClose();
  };

  return (
    <View style={[s.root, { paddingTop: Math.max(insets.top, 8) }]}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={s.header}>
        <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
          <Text style={s.closeBtnText}>✕</Text>
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.title}>Build Your Box</Text>
          <View style={s.stepDots}>
            <View style={[s.dot, step === 0 && s.dotActive]} />
            <View style={[s.dot, step === 1 && s.dotActive]} />
          </View>
        </View>
        <View style={s.headerSpacer} />
      </View>

      {/* ── Content ──────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={s.loadingText}>Loading options…</Text>
        </View>
      ) : step === 0 ? (
        <ScrollView style={s.scrollFill} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
          <SizePicker
            boxOptions={boxOptions}
            selected={selectedBox}
            onSelect={opt => { setSelectedBox(opt); setSelections(new Map()); }}
          />
        </ScrollView>
      ) : (
        <CookiePicker
          cookies={cookies}
          selections={selections}
          boxSize={boxSize}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          numColumns={numColumns}
        />
      )}

      {/* ── Footer (single bottom bar) ────────────────────────── */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {step === 1 && (
          <View style={s.progressWrap}>
            <View style={s.progressTrack}>
              <Reanimated.View style={[s.progressBar, barStyle]} />
            </View>
            <View style={s.progressRow}>
              <Text style={s.progressSlots}>
                <Text style={{ fontWeight: '700', color: allFilled ? GREEN : TEXT }}>{filled}</Text>
                <Text style={{ color: MUTED }}> / {boxSize} slots filled</Text>
              </Text>
              {surchargeTotal > 0 && (
                <Text style={s.progressSurcharge}>+${(surchargeTotal / 100).toFixed(2)} extras</Text>
              )}
            </View>
          </View>
        )}

        <View style={s.btnRow}>
          {step === 1 && (
            <Pressable
              onPress={() => { setStep(0); Haptics.selectionAsync(); }}
              style={s.backBtn}
            >
              <Text style={s.backBtnText}>← Back</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              if (step === 0) { setStep(1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }
              else { handleConfirm(); }
            }}
            disabled={!canContinue}
            style={[s.ctaBtn, !canContinue && s.ctaBtnDisabled]}
          >
            <Text style={[s.ctaBtnText, !canContinue && s.ctaBtnTextDisabled]}>
              {step === 0
                ? 'Choose Cookies →'
                : allFilled
                  ? `Add · $${((selectedBox!.priceCents + surchargeTotal) / 100).toFixed(2)}`
                  : `Choose ${remaining} more cookie${remaining !== 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F5F6FA' },

  header:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:{ fontSize: 14, fontWeight: '600', color: TEXT },
  headerCenter:{ flex: 1, alignItems: 'center', gap: 4 },
  headerSpacer:{ width: 36 },
  title:       { fontSize: 17, fontWeight: '700', color: TEXT, letterSpacing: -0.2 },
  stepDots:    { flexDirection: 'row', gap: 6 },
  dot:         { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5E7EB' },
  dotActive:   { backgroundColor: BLUE, width: 16, borderRadius: 3 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: MUTED, fontSize: 14 },

  scrollFill:  { flex: 1 },
  scrollContent:{ flexGrow: 1, justifyContent: 'center' },

  footer:      {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER,
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
  },
  progressWrap:  { gap: 6 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressBar:   { height: '100%', borderRadius: 3, backgroundColor: BLUE },
  progressRow:   { flexDirection: 'row', alignItems: 'center' },
  progressSlots: { flex: 1, fontSize: 13 },
  progressSurcharge: { fontSize: 13, color: CHERRY, fontWeight: '600' },

  btnRow:      { flexDirection: 'row', gap: 10, alignItems: 'center' },
  backBtn:     { height: 52, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: TEXT, fontSize: 15, fontWeight: '600' },
  ctaBtn:      { flex: 1, height: 52, borderRadius: 14, backgroundColor: CHERRY, alignItems: 'center', justifyContent: 'center' },
  ctaBtnDisabled:    { backgroundColor: '#E5E7EB' },
  ctaBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  ctaBtnTextDisabled:{ color: MUTED },
});
