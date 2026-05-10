import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { getPalette } from '@/constants/categoryColors';

const BLUE   = '#40C0F2';
const CARD   = '#FFFFFF';
const BG     = '#F5F6FA';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

interface Props {
  product: ApiProduct | null;
  visible: boolean;
  onClose: () => void;
}

type SelectionMap = Record<string, string[]>;   // groupId → [optionId, ...]
type TextMap      = Record<string, string>;     // groupId → free text

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCustomizerSheet({ product, visible, onClose }: Props) {
  const insets                              = useSafeAreaInsets();
  const { addItemToCart }                   = useCart();
  const [selectedVariantId, setVariantId]   = useState<string | null>(null);
  const [selections, setSelections]         = useState<SelectionMap>({});
  const [textValues, setTextValues]         = useState<TextMap>({});
  const [quantity, setQuantity]             = useState(1);

  // Fetch full product detail (variants + option groups) when sheet opens
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['product-detail', product?.id],
    queryFn:  () => api.products.get(product!.id),
    enabled:  !!product?.id && visible,
    staleTime: 60000,
  });

  const detail    = detailData?.data as any;
  const variants  = (detail?.variants ?? (product as any)?.variants ?? []) as any[];
  const optGroups = (detail?.optionGroups ?? []) as any[];

  // Reset state when product changes
  useEffect(() => {
    if (!product) return;
    setVariantId(null);
    setSelections({});
    setTextValues({});
    setQuantity(1);
  }, [product?.id]);

  // Auto-select first variant + defaults when data loads
  useEffect(() => {
    if (!variants.length) return;
    if (!selectedVariantId) setVariantId(variants[0]?.id ?? null);
  }, [variants.length, product?.id]);

  useEffect(() => {
    if (!optGroups.length) return;
    const defaults: SelectionMap = {};
    for (const g of optGroups) {
      if (g.selectionType === 'text') continue;
      const defaultOpt = (g.options ?? []).find((o: any) => o.isDefault);
      if (defaultOpt && !selections[g.id]) {
        defaults[g.id] = [defaultOpt.id];
      }
    }
    if (Object.keys(defaults).length > 0) {
      setSelections(prev => ({ ...defaults, ...prev }));
    }
  }, [optGroups.length, product?.id]);

  // ── Price calculation ────────────────────────────────────────────────────
  const basePriceCents = useMemo(() => {
    const raw = product as any;
    if (selectedVariantId && variants.length) {
      const v = variants.find((v: any) => v.id === selectedVariantId);
      if (v) return v.priceCents as number;
    }
    return raw?.priceCents ?? raw?.prices?.[0]?.unit_amount ?? 0;
  }, [selectedVariantId, variants, product]);

  const optionsTotalCents = useMemo(() => {
    let total = 0;
    for (const g of optGroups) {
      const sel = selections[g.id] ?? [];
      for (const optId of sel) {
        const opt = (g.options ?? []).find((o: any) => o.id === optId);
        if (opt) total += opt.priceAdjustmentCents ?? 0;
      }
    }
    return total;
  }, [selections, optGroups]);

  const unitPriceCents = basePriceCents + optionsTotalCents;
  const totalCents     = unitPriceCents * quantity;

  // ── Option toggle helpers ────────────────────────────────────────────────
  const toggleOption = useCallback((groupId: string, optionId: string, selectionType: string) => {
    Haptics.selectionAsync();
    setSelections(prev => {
      const cur = prev[groupId] ?? [];
      if (selectionType === 'single') return { ...prev, [groupId]: [optionId] };
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter(id => id !== optionId) };
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  }, []);

  // ── Add to cart ──────────────────────────────────────────────────────────
  const handleAddToCart = useCallback(() => {
    if (!product) return;
    const raw = product as any;

    const selectedOptions = optGroups
      .filter(g => g.selectionType !== 'text')
      .flatMap((g: any) => {
        const sel = selections[g.id] ?? [];
        return sel.map((optId: string) => {
          const opt = (g.options ?? []).find((o: any) => o.id === optId);
          return opt ? {
            groupId: g.id, groupName: g.name,
            optionId: opt.id, optionName: opt.name,
            priceAdjustmentCents: opt.priceAdjustmentCents ?? 0,
          } : null;
        }).filter(Boolean);
      });

    // Append barista notes text groups
    for (const g of optGroups) {
      if (g.selectionType === 'text' && textValues[g.id]?.trim()) {
        selectedOptions.push({
          groupId: g.id, groupName: g.name,
          optionId: undefined, optionName: undefined,
          priceAdjustmentCents: 0, textValue: textValues[g.id].trim(),
        } as any);
      }
    }

    const selectedVariant = variants.find((v: any) => v.id === selectedVariantId);

    addItemToCart({
      productId:    product.id,
      productName:  product.name,
      variantId:    selectedVariantId ?? undefined,
      variantName:  selectedVariant?.name ?? undefined,
      basePriceCents,
      selectedOptions: selectedOptions as any,
      quantity,
      imageUrl:     raw.images?.[0] ?? raw.imageUrl,
      category:     raw.category ?? raw.metadata?.category,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [product, optGroups, selections, textValues, variants, selectedVariantId, basePriceCents, quantity, addItemToCart, onClose]);

  if (!product) return null;

  const raw     = product as any;
  const palette = getPalette(raw.category ?? raw.metadata?.category ?? 'default');
  const imageUrl = raw.images?.[0] ?? raw.imageUrl ?? null;

  // ── Render option group ──────────────────────────────────────────────────
  const renderOptionGroup = (g: any) => {
    const sel = selections[g.id] ?? [];
    const opts = (g.options ?? []).filter((o: any) => o.isActive !== false);

    if (g.selectionType === 'text') {
      return (
        <View key={g.id} style={s.groupWrap}>
          <Text style={[s.groupName, { fontFamily: 'Inter_600SemiBold' }]}>{g.name}</Text>
          <TextInput
            style={[s.textInput, { fontFamily: 'Inter_400Regular' }]}
            placeholder="E.g. oat milk, extra hot…"
            placeholderTextColor={MUTED}
            value={textValues[g.id] ?? ''}
            onChangeText={v => setTextValues(prev => ({ ...prev, [g.id]: v }))}
            multiline
            maxLength={200}
          />
        </View>
      );
    }

    return (
      <View key={g.id} style={s.groupWrap}>
        <View style={s.groupHeader}>
          <Text style={[s.groupName, { fontFamily: 'Inter_600SemiBold' }]}>{g.name}</Text>
          {g.isRequired && <View style={s.reqBadge}><Text style={s.reqText}>Required</Text></View>}
          {g.selectionType === 'multi' && <Text style={[s.groupHint, { fontFamily: 'Inter_400Regular' }]}>Select all that apply</Text>}
        </View>
        <View style={s.pillRow}>
          {opts.map((opt: any) => {
            const active = sel.includes(opt.id);
            const adj    = opt.priceAdjustmentCents ?? 0;
            return (
              <Pressable
                key={opt.id}
                onPress={() => toggleOption(g.id, opt.id, g.selectionType)}
                style={[s.optPill, { backgroundColor: active ? BLUE : BG, borderColor: active ? BLUE : BORDER }]}
              >
                <Text style={[s.optPillText, { color: active ? '#fff' : TEXT, fontFamily: active ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>
                  {opt.name}
                </Text>
                {adj !== 0 && (
                  <Text style={[s.optPriceAdj, { color: active ? 'rgba(255,255,255,0.85)' : MUTED, fontFamily: 'Inter_400Regular' }]}>
                    {adj > 0 ? `+${formatCents(adj)}` : formatCents(adj)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}
        >
          {/* Handle bar */}
          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Product hero */}
            <View style={[s.hero, { backgroundColor: imageUrl ? '#F0EDE8' : palette.bg }]}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={s.heroImg} contentFit="cover" />
              ) : (
                <Text style={s.heroEmoji}>{palette.emoji}</Text>
              )}
            </View>

            <View style={s.body}>
              {/* Title + base price */}
              <View style={s.titleRow}>
                <Text style={[s.productName, { fontFamily: 'Inter_700Bold' }]}>{product.name}</Text>
                <Text style={[s.basePrice, { fontFamily: 'Inter_600SemiBold', color: palette.banner }]}>
                  {formatCents(basePriceCents)}
                </Text>
              </View>
              {product.description ? (
                <Text style={[s.desc, { fontFamily: 'Inter_400Regular' }]}>{product.description}</Text>
              ) : null}

              {/* ── Variants ─────────────────────────────────────────── */}
              {variants.length > 1 && (
                <View style={s.groupWrap}>
                  <Text style={[s.groupName, { fontFamily: 'Inter_600SemiBold' }]}>Size</Text>
                  <View style={s.pillRow}>
                    {variants.map((v: any) => {
                      const active = selectedVariantId === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => { setVariantId(v.id); Haptics.selectionAsync(); }}
                          style={[s.variantPill, { backgroundColor: active ? TEXT : BG, borderColor: active ? TEXT : BORDER }]}
                        >
                          <Text style={[s.variantPillText, { color: active ? '#fff' : TEXT, fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                            {v.name}
                          </Text>
                          <Text style={[s.variantPrice, { color: active ? 'rgba(255,255,255,0.8)' : MUTED, fontFamily: 'Inter_400Regular' }]}>
                            {formatCents(v.priceCents)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── Option groups ─────────────────────────────────────── */}
              {isLoading && !optGroups.length ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={BLUE} />
                  <Text style={[s.loadingText, { fontFamily: 'Inter_400Regular' }]}>Loading options…</Text>
                </View>
              ) : (
                optGroups.map(renderOptionGroup)
              )}

              {/* ── Quantity stepper ──────────────────────────────────── */}
              <View style={s.qtyRow}>
                <Text style={[s.qtyLabel, { fontFamily: 'Inter_600SemiBold' }]}>Quantity</Text>
                <View style={s.qtyStepper}>
                  <Pressable
                    onPress={() => { if (quantity > 1) { setQuantity(q => q - 1); Haptics.selectionAsync(); } }}
                    style={[s.qtyBtn, { opacity: quantity <= 1 ? 0.3 : 1 }]}
                  >
                    <Text style={[s.qtyBtnText, { fontFamily: 'Inter_700Bold' }]}>–</Text>
                  </Pressable>
                  <Text style={[s.qtyNum, { fontFamily: 'Inter_700Bold' }]}>{quantity}</Text>
                  <Pressable
                    onPress={() => { setQuantity(q => q + 1); Haptics.selectionAsync(); }}
                    style={s.qtyBtn}
                  >
                    <Text style={[s.qtyBtnText, { fontFamily: 'Inter_700Bold' }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* ── Footer: add to cart ─────────────────────────────────── */}
          <View style={s.footer}>
            <Pressable style={[s.addBtn, { backgroundColor: palette.banner }]} onPress={handleAddToCart}>
              <Text style={[s.addBtnText, { fontFamily: 'Inter_700Bold' }]}>
                Add to Cart · {formatCents(totalCents)}
              </Text>
              <Feather name="shopping-bag" size={18} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', overflow: 'hidden' },
  handleWrap:     { alignItems: 'center', paddingVertical: 10 },
  handle:         { width: 38, height: 4, borderRadius: 2, backgroundColor: BORDER },
  hero:           { height: 200, alignItems: 'center', justifyContent: 'center' },
  heroImg:        { width: '100%', height: '100%' },
  heroEmoji:      { fontSize: 80 },
  body:           { paddingHorizontal: 20, paddingTop: 20, gap: 4 },
  titleRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  productName:    { fontSize: 22, color: TEXT, flex: 1 },
  basePrice:      { fontSize: 20 },
  desc:           { fontSize: 14, color: MUTED, lineHeight: 20, marginBottom: 16 },
  groupWrap:      { marginTop: 20 },
  groupHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  groupName:      { fontSize: 15, color: TEXT, marginBottom: 10 },
  groupHint:      { fontSize: 11, color: MUTED },
  reqBadge:       { backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  reqText:        { fontSize: 10, color: '#D97706', fontFamily: 'Inter_600SemiBold' },
  pillRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optPill:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1.5 },
  optPillText:    { fontSize: 13 },
  optPriceAdj:    { fontSize: 11 },
  variantPill:    { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5, gap: 2 },
  variantPillText:{ fontSize: 14 },
  variantPrice:   { fontSize: 12 },
  textInput:      { backgroundColor: BG, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, minHeight: 70, textAlignVertical: 'top' },
  loadingText:    { color: MUTED, fontSize: 13, marginTop: 8 },
  qtyRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: BORDER },
  qtyLabel:       { fontSize: 15, color: TEXT },
  qtyStepper:     { flexDirection: 'row', alignItems: 'center', gap: 0 },
  qtyBtn:         { width: 42, height: 42, borderRadius: 21, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER },
  qtyBtnText:     { fontSize: 20, color: TEXT },
  qtyNum:         { fontSize: 18, color: TEXT, width: 48, textAlign: 'center' },
  footer:         { paddingHorizontal: 20, paddingTop: 12 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 56, borderRadius: 28 },
  addBtnText:     { fontSize: 17, color: '#fff' },
});
