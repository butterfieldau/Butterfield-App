import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Pressable,
  StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { getPalette } from '@/constants/categoryColors';

const TEXT    = '#1C1C1E';
const MUTED   = '#8E8E93';
const BORDER  = '#E8E8ED';
const BG      = '#F5F6FA';
const BTN_CLR = '#D0312D';
const IMAGE_H = 240;
const BACKDROP_OPACITY = 0.55;

const SPRING_IN  = { damping: 36, stiffness: 320, overshootClamping: true } as const;

interface Props {
  product: ApiProduct | null;
  visible: boolean;
  onClose: () => void;
}

type SelectionMap = Record<string, string[]>;
type TextMap      = Record<string, string>;

function fmt(c: number) { return `$${(c / 100).toFixed(2)}`; }

function parseArr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

export default function ProductCustomizerSheet({ product, visible, onClose }: Props) {
  const insets                             = useSafeAreaInsets();
  const { height: SCREEN_H }              = useWindowDimensions();
  const { addItemToCart }                 = useCart();
  const [selectedVariantId, setVariantId] = useState<string | null>(null);
  const [selections, setSelections]       = useState<SelectionMap>({});
  const [textValues, setTextValues]       = useState<TextMap>({});
  const [quantity, setQuantity]           = useState(1);

  // Keep modal alive during dismiss animation
  const [modalVisible, setModalVisible] = useState(false);
  // Hold last product so content stays visible during dismiss
  const lastProductRef = useRef<ApiProduct | null>(null);
  if (product) lastProductRef.current = product;
  const displayProduct = lastProductRef.current;

  const translateY = useSharedValue(SCREEN_H);
  const backdropO  = useSharedValue(0);
  const scrollY    = useSharedValue(0);
  const scrollRef  = useRef(null);

  // ── Internal close: animate out, then signal parent ──────────────────────────
  const internalClose = useCallback(() => {
    backdropO.value  = withTiming(0, { duration: 220 });
    translateY.value = withTiming(SCREEN_H, { duration: 300 }, (done) => {
      if (done) {
        runOnJS(setModalVisible)(false);
        runOnJS(onClose)();
      }
    });
  }, [backdropO, translateY, SCREEN_H, onClose]);

  // Used by pan gesture after it has already animated the sheet away
  const dismiss = useCallback(() => {
    setModalVisible(false);
    onClose();
  }, [onClose]);

  // ── Entrance animation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Snap to off-screen and make modal visible in the same tick so the
      // first paint always shows the sheet below the fold — no flash.
      translateY.value = SCREEN_H;
      backdropO.value  = 0;
      scrollY.value    = 0;
      setModalVisible(true);
      // Wait one frame for the modal to finish its initial layout before
      // starting the spring. This prevents the "stop and readjust" glitch
      // caused by a layout reflow happening mid-animation.
      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING_IN);
        backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 300 });
      });
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan gesture (swipe-to-dismiss) ───────────────────────────────────────────
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onUpdate((e) => {
        if (e.translationY > 0 && scrollY.value <= 2) {
          translateY.value = e.translationY;
          backdropO.value  = interpolate(e.translationY, [0, 300], [BACKDROP_OPACITY, 0], { extrapolateRight: 'clamp' });
        }
      })
      .onEnd((e) => {
        const shouldDismiss =
          translateY.value > 110 ||
          (e.velocityY > 600 && translateY.value > 20);

        if (shouldDismiss) {
          backdropO.value  = withTiming(0, { duration: 200 });
          translateY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
            if (done) runOnJS(dismiss)();
          });
        } else {
          translateY.value = withSpring(0, SPRING_IN);
          backdropO.value  = withTiming(BACKDROP_OPACITY, { duration: 180 });
        }
      }),
  [scrollY, translateY, backdropO, dismiss, SCREEN_H]);

  // ── Animated styles ───────────────────────────────────────────────────────────
  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropO.value }));

  // ── Product data ──────────────────────────────────────────────────────────────
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['product-detail', displayProduct?.id],
    queryFn:  () => api.products.get(displayProduct!.id),
    enabled:  !!displayProduct?.id && visible,
    staleTime: 60_000,
    networkMode: 'offlineFirst',
  });

  const detail    = detailData?.data as any;
  const variants  = (detail?.variants ?? (displayProduct as any)?.variants ?? []) as any[];
  const optGroups = (detail?.optionGroups ?? []) as any[];

  useEffect(() => {
    if (!displayProduct) return;
    setVariantId(null); setSelections({}); setTextValues({}); setQuantity(1);
  }, [displayProduct?.id]);

  useEffect(() => {
    if (variants.length && !selectedVariantId) setVariantId(variants[0]?.id ?? null);
  }, [variants.length, displayProduct?.id]);

  useEffect(() => {
    if (!optGroups.length) return;
    const defs: SelectionMap = {};
    for (const g of optGroups) {
      if (g.selectionType === 'text') continue;
      const def = (g.options ?? []).find((o: any) => o.isDefault);
      if (def) defs[g.id] = [def.id];
    }
    if (Object.keys(defs).length) setSelections(prev => ({ ...defs, ...prev }));
  }, [optGroups.length, displayProduct?.id]);

  const basePriceCents = useMemo(() => {
    const raw = displayProduct as any;
    if (selectedVariantId && variants.length) {
      const v = variants.find((v: any) => v.id === selectedVariantId);
      if (v) return v.priceCents as number;
    }
    return raw?.priceCents ?? raw?.prices?.[0]?.unit_amount ?? 0;
  }, [selectedVariantId, variants, displayProduct]);

  const optionsTotal = useMemo(() => {
    let t = 0;
    for (const g of optGroups)
      for (const id of selections[g.id] ?? []) {
        const o = (g.options ?? []).find((o: any) => o.id === id);
        if (o) t += o.priceAdjustmentCents ?? 0;
      }
    return t;
  }, [selections, optGroups]);

  const totalCents = (basePriceCents + optionsTotal) * quantity;

  const toggleOption = useCallback((groupId: string, optId: string, type: string) => {
    Haptics.selectionAsync();
    setSelections(prev => {
      const cur = prev[groupId] ?? [];
      if (type === 'single') return { ...prev, [groupId]: [optId] };
      return { ...prev, [groupId]: cur.includes(optId) ? cur.filter(x => x !== optId) : [...cur, optId] };
    });
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!displayProduct) return;
    const raw = displayProduct as any;
    const opts = optGroups
      .filter(g => g.selectionType !== 'text')
      .flatMap((g: any) => (selections[g.id] ?? []).map(id => {
        const o = (g.options ?? []).find((o: any) => o.id === id);
        return o ? { groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, priceAdjustmentCents: o.priceAdjustmentCents ?? 0 } : null;
      }).filter(Boolean));
    for (const g of optGroups)
      if (g.selectionType === 'text' && textValues[g.id]?.trim())
        opts.push({ groupId: g.id, groupName: g.name, optionId: undefined, optionName: undefined, priceAdjustmentCents: 0, textValue: textValues[g.id].trim() } as any);

    const selVariant = variants.find((v: any) => v.id === selectedVariantId);
    addItemToCart({
      productId:   displayProduct.id, productName: displayProduct.name,
      variantId:   selectedVariantId ?? undefined,
      variantName: selVariant?.name ?? undefined,
      basePriceCents, selectedOptions: opts as any, quantity,
      imageUrl,
      category:  raw.category ?? raw.metadata?.category,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    internalClose();
  }, [displayProduct, optGroups, selections, textValues, variants, selectedVariantId, basePriceCents, quantity, addItemToCart, internalClose]);

  // ── Gallery URLs (must be above early return — hooks cannot be conditional) ──
  const raw         = displayProduct as any;
  const galleryUrls = useMemo(() => {
    if (!displayProduct) return [];
    const combined = [
      ...(raw?.images ?? []),
      ...parseArr(raw?.galleryUrls),
      ...parseArr(detail?.galleryUrls),
    ].filter(Boolean);
    return Array.from(new Set(combined));
  }, [displayProduct, raw?.images, raw?.galleryUrls, detail?.galleryUrls]);

  // Nothing to render yet
  if (!displayProduct && !modalVisible) return null;

  const palette    = getPalette(raw?.category ?? raw?.metadata?.category ?? 'default');
  const imageUrl   = galleryUrls[0] ?? raw?.imageUrl ?? null;
  const isNew      = raw?.metadata?.isNew === 'true' || raw?.isNew;
  const isLim      = raw?.metadata?.isLimitedDrop === 'true' || raw?.isLimitedDrop;
  const category   = raw?.category ?? raw?.metadata?.category ?? '';
  const productUrl = raw?.productUrl ?? detail?.productUrl ?? null;
  const nutrition   = raw?.nutritionInfo ?? raw?.metadata?.nutritionInfo ?? detail?.nutritionInfo ?? '';

  return (
    <Modal
      visible={modalVisible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={internalClose}
      statusBarTranslucent
    >
      <View style={s.root}>

        {/* Dimming backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={internalClose} />
        </Animated.View>

        {/* Sheet — fixed height so content loading never causes a layout shift mid-animation */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[s.sheet, { height: Math.round(SCREEN_H * 0.82) }, sheetStyle]}>

            {/* Image header */}
            <View style={[s.imageArea, { backgroundColor: imageUrl ? 'transparent' : palette.bg }]}>
              {imageUrl
                ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                : <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.banner, opacity: 0.14 }]} />
              }
              {(isNew || isLim) && (
                <View style={s.imageBadges}>
                  {isNew && <View style={[s.imgBadge, { backgroundColor: '#1C1C1E' }]}><Text style={s.imgBadgeText}>NEW</Text></View>}
                  {isLim && <View style={[s.imgBadge, { backgroundColor: '#F40009' }]}><Text style={s.imgBadgeText}>LIMITED</Text></View>}
                </View>
              )}
            </View>

            {/* White content area */}
            <View style={[s.content, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}>

              <View style={s.handleWrap} pointerEvents="none">
                <View style={s.handle} />
              </View>

              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={2}>{displayProduct?.name}</Text>
                {category ? (
                  <View style={[s.catChip, { backgroundColor: palette.banner + '1A' }]}>
                    <Text style={[s.catChipText, { color: palette.banner }]}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {displayProduct?.description ? (
                <Text style={s.desc} numberOfLines={2}>{displayProduct.description}</Text>
              ) : null}

              {productUrl ? (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(productUrl).catch(() => {}); }}
                  style={s.websiteLink}
                >
                  <Text style={s.websiteLinkText}>View on Website</Text>
                  <Text style={{ fontSize: 11, color: BTN_CLR, fontFamily: 'Inter_400Regular', marginLeft: 2 }}>↗</Text>
                </Pressable>
              ) : null}

              {galleryUrls.length > 1 ? (
                <View style={s.galleryRow}>
                  <GHScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.galleryContent}>
                    {galleryUrls.map((url, idx) => (
                      <View key={`${url}-${idx}`} style={s.galleryThumbWrap}>
                        <Image source={{ uri: url }} style={s.galleryThumb} contentFit="cover" />
                      </View>
                    ))}
                  </GHScrollView>
                </View>
              ) : null}

              <GHScrollView
                ref={scrollRef}
                style={s.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 4 }}
                onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
                bounces={false}
              >
                {isLoading && !optGroups.length && (
                  <ActivityIndicator color={palette.banner} style={{ marginVertical: 24 }} />
                )}

                {variants.length > 1 && (
                  <View style={s.group}>
                    <Text style={[s.groupLabel, { marginBottom: 10 }]}>Size</Text>
                    <View style={s.pillRow}>
                      {variants.map((v: any) => {
                        const active = selectedVariantId === v.id;
                        return (
                          <Pressable
                            key={v.id}
                            onPress={() => { setVariantId(v.id); Haptics.selectionAsync(); }}
                            style={[s.pill, active && { backgroundColor: palette.banner, borderColor: palette.banner }]}
                          >
                            <Text style={[s.pillLabel, active && { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>{v.name}</Text>
                            {v.priceCents !== basePriceCents && (
                              <Text style={[s.pillSub, active && { color: 'rgba(255,255,255,0.75)' }]}> {fmt(v.priceCents)}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {optGroups.map((g: any) => {
                  const sel  = selections[g.id] ?? [];
                  const opts = (g.options ?? []).filter((o: any) => o.isActive !== false);
                  if (g.selectionType === 'text') {
                    return (
                      <View key={g.id} style={s.group}>
                        <Text style={s.groupLabel}>{g.name}</Text>
                        <TextInput
                          style={s.textInput}
                          placeholder="Add a note…"
                          placeholderTextColor={MUTED}
                          value={textValues[g.id] ?? ''}
                          onChangeText={v => setTextValues(p => ({ ...p, [g.id]: v }))}
                          multiline maxLength={200}
                        />
                      </View>
                    );
                  }
                  return (
                    <View key={g.id} style={s.group}>
                      <View style={s.groupHead}>
                        <Text style={s.groupLabel}>{g.name}</Text>
                        {g.isRequired
                          ? <View style={s.reqBadge}><Text style={s.reqText}>Required</Text></View>
                          : <Text style={s.optText}>Optional</Text>
                        }
                      </View>
                      <View style={s.pillRow}>
                        {opts.map((opt: any) => {
                          const active = sel.includes(opt.id);
                          const adj    = opt.priceAdjustmentCents ?? 0;
                          return (
                            <Pressable
                              key={opt.id}
                              onPress={() => toggleOption(g.id, opt.id, g.selectionType)}
                              style={[s.pill, active && { backgroundColor: palette.banner, borderColor: palette.banner }]}
                            >
                              <Text style={[s.pillLabel, active && { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>{opt.name}</Text>
                              {adj !== 0 && <Text style={[s.pillSub, active && { color: 'rgba(255,255,255,0.75)' }]}>{adj > 0 ? ` +${fmt(adj)}` : ` ${fmt(adj)}`}</Text>}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}

                {nutrition ? (
                  <View style={s.group}>
                    <Text style={s.groupLabel}>Nutrition</Text>
                    <Text style={s.metaText}>{nutrition}</Text>
                  </View>
                ) : null}
              </GHScrollView>

              <View style={s.footer}>
                <View style={s.qtyStepper}>
                  <Pressable
                    onPress={() => { if (quantity > 1) { setQuantity(q => q - 1); Haptics.selectionAsync(); } }}
                    style={[s.qtyBtn, { opacity: quantity <= 1 ? 0.3 : 1 }]}
                    hitSlop={12}
                  >
                    <Feather name="minus" size={16} color={TEXT} />
                  </Pressable>
                  <Text style={s.qtyNum}>{quantity}</Text>
                  <Pressable
                    onPress={() => { setQuantity(q => q + 1); Haptics.selectionAsync(); }}
                    style={s.qtyBtn}
                    hitSlop={12}
                  >
                    <Feather name="plus" size={16} color={TEXT} />
                  </Pressable>
                </View>

                <Pressable style={s.addBtn} onPress={handleAddToCart}>
                  <Text style={s.addPrice}>{fmt(totalCents)}</Text>
                  <View style={s.addDivider} />
                  <Text style={s.addLabel}>Add to Cart</Text>
                </Pressable>
              </View>

            </View>
          </Animated.View>
        </GestureDetector>

      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, justifyContent: 'flex-end' },
  backdrop:{ backgroundColor: '#000' },

  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },

  imageArea: {
    height: IMAGE_H,
    overflow: 'hidden',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
  },
  imageBadges:  { position: 'absolute', bottom: 14, left: 16, flexDirection: 'row', gap: 6 },
  imgBadge:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 },
  imgBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },

  content: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },

  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.12)' },

  nameRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, marginBottom: 6 },
  name:        { flex: 1, fontSize: 22, fontFamily: 'Inter_700Bold', color: TEXT, lineHeight: 28 },
  catChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 3 },
  catChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  desc:        { fontSize: 13, color: MUTED, fontFamily: 'Inter_400Regular', lineHeight: 19, marginBottom: 12 },

  websiteLink:     { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  websiteLinkText: { fontSize: 13, color: BTN_CLR, fontFamily: 'Inter_600SemiBold' },

  galleryRow:      { marginBottom: 14 },
  galleryContent:  { gap: 8, paddingRight: 4 },
  galleryThumbWrap:{ width: 58, height: 58, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, backgroundColor: '#F3F4F6' },
  galleryThumb:    { width: '100%', height: '100%' },

  scroll:     { flex: 1 },
  group:      { marginBottom: 20 },
  // groupHead provides the label→pill gap; groupLabel must NOT add its own marginBottom
  // to avoid double-spacing (standalone Size label adds { marginBottom: 10 } inline)
  groupHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', color: TEXT, letterSpacing: 0.1 },
  optText:    { fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' },
  reqBadge:   { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqText:    { fontSize: 10, color: '#D97706', fontFamily: 'Inter_600SemiBold' },
  metaText:   { fontSize: 13, color: MUTED, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 4 },

  pillRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
  pillLabel: { fontSize: 13, color: TEXT, fontFamily: 'Inter_500Medium' },
  pillSub:   { fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' },

  textInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, fontFamily: 'Inter_400Regular', minHeight: 70, textAlignVertical: 'top' },

  footer:     { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER, gap: 12 },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  qtyBtn:     { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  qtyNum:     { fontSize: 18, fontFamily: 'Inter_700Bold', color: TEXT, minWidth: 32, textAlign: 'center' },
  addBtn:     { flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: 27, paddingHorizontal: 24, backgroundColor: BTN_CLR },
  addPrice:   { fontSize: 15, color: '#fff', fontFamily: 'Inter_700Bold' },
  addDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.28)', marginHorizontal: 14 },
  addLabel:   { flex: 1, fontSize: 15, color: '#fff', fontFamily: 'Inter_700Bold', textAlign: 'center' },
});
