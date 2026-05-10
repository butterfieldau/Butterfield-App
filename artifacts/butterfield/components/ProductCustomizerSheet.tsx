import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Modal, PanResponder,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { getPalette } from '@/constants/categoryColors';

const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E8E8ED';
const BG     = '#F5F6FA';
const IMAGE_H = 250;

interface Props {
  product: ApiProduct | null;
  visible: boolean;
  onClose: () => void;
}

type SelectionMap = Record<string, string[]>;
type TextMap      = Record<string, string>;

function fmt(c: number) { return `$${(c / 100).toFixed(2)}`; }

export default function ProductCustomizerSheet({ product, visible, onClose }: Props) {
  const insets                            = useSafeAreaInsets();
  const { height: SCREEN_H }             = useWindowDimensions();
  const { addItemToCart }                = useCart();
  const [selectedVariantId, setVariantId] = useState<string | null>(null);
  const [selections, setSelections]       = useState<SelectionMap>({});
  const [textValues, setTextValues]       = useState<TextMap>({});
  const [quantity, setQuantity]           = useState(1);

  const MAX_SHEET_H = Math.round(SCREEN_H * 0.92);

  // ── Swipe-to-dismiss ─────────────────────────────────────────────────────────
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder:  (_, gs) => gs.dy > 6 && gs.vy >= 0,
      onPanResponderMove:           (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 110 || gs.vy > 0.55) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
        }
      },
    })
  ).current;

  useEffect(() => { if (visible) translateY.setValue(0); }, [visible]);

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['product-detail', product?.id],
    queryFn:  () => api.products.get(product!.id),
    enabled:  !!product?.id && visible,
    staleTime: 60000,
  });

  const detail    = detailData?.data as any;
  const variants  = (detail?.variants  ?? (product as any)?.variants    ?? []) as any[];
  const optGroups = (detail?.optionGroups ?? []) as any[];

  useEffect(() => {
    if (!product) return;
    setVariantId(null); setSelections({}); setTextValues({}); setQuantity(1);
  }, [product?.id]);

  useEffect(() => {
    if (variants.length && !selectedVariantId) setVariantId(variants[0]?.id ?? null);
  }, [variants.length, product?.id]);

  useEffect(() => {
    if (!optGroups.length) return;
    const defaults: SelectionMap = {};
    for (const g of optGroups) {
      if (g.selectionType === 'text') continue;
      const def = (g.options ?? []).find((o: any) => o.isDefault);
      if (def && !selections[g.id]) defaults[g.id] = [def.id];
    }
    if (Object.keys(defaults).length) setSelections(prev => ({ ...defaults, ...prev }));
  }, [optGroups.length, product?.id]);

  const basePriceCents = useMemo(() => {
    const raw = product as any;
    if (selectedVariantId && variants.length) {
      const v = variants.find((v: any) => v.id === selectedVariantId);
      if (v) return v.priceCents as number;
    }
    return raw?.priceCents ?? raw?.prices?.[0]?.unit_amount ?? 0;
  }, [selectedVariantId, variants, product]);

  const optionsTotal = useMemo(() => {
    let t = 0;
    for (const g of optGroups) {
      for (const id of selections[g.id] ?? []) {
        const o = (g.options ?? []).find((o: any) => o.id === id);
        if (o) t += o.priceAdjustmentCents ?? 0;
      }
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
    if (!product) return;
    const raw = product as any;
    const opts = optGroups
      .filter(g => g.selectionType !== 'text')
      .flatMap((g: any) => (selections[g.id] ?? []).map(id => {
        const o = (g.options ?? []).find((o: any) => o.id === id);
        return o ? { groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, priceAdjustmentCents: o.priceAdjustmentCents ?? 0 } : null;
      }).filter(Boolean));
    for (const g of optGroups) {
      if (g.selectionType === 'text' && textValues[g.id]?.trim()) {
        opts.push({ groupId: g.id, groupName: g.name, optionId: undefined, optionName: undefined, priceAdjustmentCents: 0, textValue: textValues[g.id].trim() } as any);
      }
    }
    const selVariant = variants.find((v: any) => v.id === selectedVariantId);
    addItemToCart({
      productId:   product.id,
      productName: product.name,
      variantId:   selectedVariantId ?? undefined,
      variantName: selVariant?.name ?? undefined,
      basePriceCents,
      selectedOptions: opts as any,
      quantity,
      imageUrl:  raw.images?.[0] ?? raw.imageUrl,
      category:  raw.category ?? raw.metadata?.category,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [product, optGroups, selections, textValues, variants, selectedVariantId, basePriceCents, quantity, addItemToCart, onClose]);

  if (!product) return null;

  const raw      = product as any;
  const palette  = getPalette(raw.category ?? raw.metadata?.category ?? 'default');
  const imageUrl = raw.images?.[0] ?? raw.imageUrl ?? null;
  const isNew    = raw.metadata?.isNew === 'true' || raw.isNew;
  const isLimited= raw.metadata?.isLimitedDrop === 'true' || raw.isLimitedDrop;
  const category = raw.category ?? raw.metadata?.category ?? '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        {/* Tap the backdrop above the sheet to dismiss */}
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} onPress={onClose} />

        <Animated.View style={[s.sheet, { maxHeight: Math.round(SCREEN_H * 0.88), transform: [{ translateY }] }]}>

          {/* ── Image area — also swipe-down to dismiss ─────────────── */}
          <View style={[s.imageArea, { backgroundColor: imageUrl ? '#000' : palette.bg }]} {...panResponder.panHandlers}>
            {imageUrl
              ? <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.banner, opacity: 0.15 }]} />
            }
            {/* NEW / LIMITED badges */}
            {(isNew || isLimited) && (
              <View style={s.imageBadges}>
                {isNew     && <View style={[s.imgBadge, { backgroundColor: '#1C1C1E' }]}><Text style={s.imgBadgeText}>NEW</Text></View>}
                {isLimited && <View style={[s.imgBadge, { backgroundColor: '#F40009' }]}><Text style={s.imgBadgeText}>LIMITED</Text></View>}
              </View>
            )}
          </View>

          {/* ── White content panel ─────────────────────────────────── */}
          <View style={[s.content, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>

            {/* Drag handle — tap/swipe down from here to dismiss */}
            <View style={s.handleWrap} {...panResponder.panHandlers}>
              <View style={s.handle} />
            </View>

            {/* Name + category badge */}
            <View style={s.nameRow}>
              <Text style={s.name} numberOfLines={2}>{product.name}</Text>
              {category ? (
                <View style={[s.catChip, { backgroundColor: palette.banner + '1A' }]}>
                  <Text style={[s.catChipText, { color: palette.banner }]}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                </View>
              ) : null}
            </View>

            {product.description ? (
              <Text style={s.desc} numberOfLines={2}>{product.description}</Text>
            ) : null}

            {/* Options / variants (scrollable) */}
            <ScrollView
              style={s.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {/* Loading indicator */}
              {isLoading && !optGroups.length && (
                <ActivityIndicator color={palette.banner} style={{ marginVertical: 24 }} />
              )}

              {/* Size / variants */}
              {variants.length > 1 && (
                <View style={s.group}>
                  <Text style={s.groupLabel}>Size</Text>
                  <View style={s.pillRow}>
                    {variants.map((v: any) => {
                      const active = selectedVariantId === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => { setVariantId(v.id); Haptics.selectionAsync(); }}
                          style={[s.pill, active && { backgroundColor: palette.banner, borderColor: palette.banner }]}
                        >
                          <Text style={[s.pillLabel, active && { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                            {v.name}
                          </Text>
                          {v.priceCents !== basePriceCents && (
                            <Text style={[s.pillSub, active && { color: 'rgba(255,255,255,0.75)' }]}>
                              {' '}{fmt(v.priceCents)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Option groups */}
              {optGroups.map(g => {
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
                            <Text style={[s.pillLabel, active && { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                              {opt.name}
                            </Text>
                            {adj !== 0 && (
                              <Text style={[s.pillSub, active && { color: 'rgba(255,255,255,0.75)' }]}>
                                {adj > 0 ? ` +${fmt(adj)}` : ` ${fmt(adj)}`}
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

            </ScrollView>

            {/* ── Footer: qty stepper + add-to-cart pill ──────────── */}
            <View style={s.footer}>
              {/* Quantity stepper */}
              <View style={s.qtyStepper}>
                <Pressable
                  onPress={() => { if (quantity > 1) { setQuantity(q => q - 1); Haptics.selectionAsync(); } }}
                  style={[s.qtyBtn, { opacity: quantity <= 1 ? 0.3 : 1 }]}
                  hitSlop={10}
                >
                  <Feather name="minus" size={15} color={TEXT} />
                </Pressable>
                <Text style={s.qtyNum}>{quantity}</Text>
                <Pressable
                  onPress={() => { setQuantity(q => q + 1); Haptics.selectionAsync(); }}
                  style={s.qtyBtn}
                  hitSlop={10}
                >
                  <Feather name="plus" size={15} color={TEXT} />
                </Pressable>
              </View>

              {/* Add-to-cart pill: price | divider | label */}
              <Pressable style={[s.addBtn, { backgroundColor: TEXT }]} onPress={handleAddToCart}>
                <Text style={s.addPrice}>{fmt(totalCents)}</Text>
                <View style={s.addDivider} />
                <Text style={s.addLabel}>Add to Cart</Text>
              </Pressable>
            </View>

          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },

  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },

  // ── Image header ─────────────────────────────────────────────────────────────
  imageArea:    { height: IMAGE_H, overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handleWrap:   { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle:       { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)' },
  imageBadges:  { position: 'absolute', bottom: 14, left: 16, flexDirection: 'row', gap: 6 },
  imgBadge:     { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 },
  imgBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },

  // ── White content ─────────────────────────────────────────────────────────────
  content: {
    flexShrink: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 0,
  },

  nameRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 5, marginTop: 14 },
  name:        { flex: 1, fontSize: 26, fontFamily: 'Inter_700Bold', color: TEXT, lineHeight: 32 },
  catChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 5 },
  catChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  desc:        { fontSize: 13, color: MUTED, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },

  scroll:    { flexShrink: 1 },
  group:     { marginBottom: 18 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupLabel:{ fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT, marginBottom: 10 },
  optText:   { fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' },
  reqBadge:  { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqText:   { fontSize: 10, color: '#D97706', fontFamily: 'Inter_600SemiBold' },

  pillRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 26, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
  pillLabel: { fontSize: 13, color: TEXT, fontFamily: 'Inter_500Medium' },
  pillSub:   { fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' },

  textInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, fontFamily: 'Inter_400Regular', minHeight: 70, textAlignVertical: 'top' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },

  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn:     { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  qtyNum:     { fontSize: 17, fontFamily: 'Inter_700Bold', color: TEXT, minWidth: 26, textAlign: 'center' },

  // Dark pill: price | divider | Add to Cart
  addBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: 27, paddingHorizontal: 22 },
  addPrice:   { fontSize: 15, color: '#fff', fontFamily: 'Inter_700Bold' },
  addDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.28)', marginHorizontal: 14 },
  addLabel:   { flex: 1, fontSize: 15, color: '#fff', fontFamily: 'Inter_700Bold', textAlign: 'center' },
});
