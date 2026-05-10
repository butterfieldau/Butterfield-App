import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal,
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

interface Props {
  product: ApiProduct | null;
  visible: boolean;
  onClose: () => void;
}

type SelectionMap = Record<string, string[]>;
type TextMap      = Record<string, string>;

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function ProductCustomizerSheet({ product, visible, onClose }: Props) {
  const insets                              = useSafeAreaInsets();
  const { height: SCREEN_H }               = useWindowDimensions();
  const { addItemToCart }                   = useCart();
  const [selectedVariantId, setVariantId]   = useState<string | null>(null);
  const [selections, setSelections]         = useState<SelectionMap>({});
  const [textValues, setTextValues]         = useState<TextMap>({});
  const [quantity, setQuantity]             = useState(1);

  const MAX_SHEET_H = Math.round(SCREEN_H * 0.92);

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['product-detail', product?.id],
    queryFn:  () => api.products.get(product!.id),
    enabled:  !!product?.id && visible,
    staleTime: 60000,
  });

  const detail    = detailData?.data as any;
  const variants  = (detail?.variants ?? (product as any)?.variants ?? []) as any[];
  const optGroups = (detail?.optionGroups ?? []) as any[];

  useEffect(() => {
    if (!product) return;
    setVariantId(null);
    setSelections({});
    setTextValues({});
    setQuantity(1);
  }, [product?.id]);

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
      if (defaultOpt && !selections[g.id]) defaults[g.id] = [defaultOpt.id];
    }
    if (Object.keys(defaults).length > 0) setSelections(prev => ({ ...defaults, ...prev }));
  }, [optGroups.length, product?.id]);

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

  const toggleOption = useCallback((groupId: string, optionId: string, selectionType: string) => {
    Haptics.selectionAsync();
    setSelections(prev => {
      const cur = prev[groupId] ?? [];
      if (selectionType === 'single') return { ...prev, [groupId]: [optionId] };
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter(id => id !== optionId) };
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  }, []);

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
      productId:   product.id,
      productName: product.name,
      variantId:   selectedVariantId ?? undefined,
      variantName: selectedVariant?.name ?? undefined,
      basePriceCents,
      selectedOptions: selectedOptions as any,
      quantity,
      imageUrl:    raw.images?.[0] ?? raw.imageUrl,
      category:    raw.category ?? raw.metadata?.category,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
  }, [product, optGroups, selections, textValues, variants, selectedVariantId, basePriceCents, quantity, addItemToCart, onClose]);

  if (!product) return null;

  const raw      = product as any;
  const palette  = getPalette(raw.category ?? raw.metadata?.category ?? 'default');
  const imageUrl = raw.images?.[0] ?? raw.imageUrl ?? null;
  const hasOptions = optGroups.length > 0 || variants.length > 1;

  const renderOptionGroup = (g: any) => {
    const sel  = selections[g.id] ?? [];
    const opts = (g.options ?? []).filter((o: any) => o.isActive !== false);

    if (g.selectionType === 'text') {
      return (
        <View key={g.id} style={s.section}>
          <Text style={s.sectionLabel}>{g.name}</Text>
          <TextInput
            style={s.textInput}
            placeholder="Add a note for the barista…"
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
      <View key={g.id} style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>{g.name}</Text>
          {g.isRequired
            ? <View style={s.reqBadge}><Text style={s.reqText}>Required</Text></View>
            : <Text style={s.optionalText}>{g.selectionType === 'multi' ? 'Choose any' : 'Optional'}</Text>
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
                style={[
                  s.optPill,
                  active && { backgroundColor: palette.banner, borderColor: palette.banner },
                ]}
              >
                {active && <Feather name="check" size={12} color="#fff" style={{ marginRight: 2 }} />}
                <Text style={[s.optPillText, active && { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                  {opt.name}
                </Text>
                {adj !== 0 && (
                  <Text style={[s.optPriceAdj, active && { color: 'rgba(255,255,255,0.8)' }]}>
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
      statusBarTranslucent
    >
      {/* Full-screen container — tap outside the sheet to dismiss */}
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/*
          Sheet has an EXPLICIT pixel height so that flex:1 children (ScrollView)
          have a definite parent height to measure against.
          maxHeight alone does NOT work — flex children collapse to 0 in Yoga.
        */}
        <View style={[s.sheet, { height: MAX_SHEET_H, paddingBottom: Math.max(insets.bottom, 16) }]}>

          {/* ── Handle ─────────────────────────────────────────────────── */}
          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>

          {/* ── Product Header ─────────────────────────────────────────── */}
          {imageUrl ? (
            <View style={s.imageHeader}>
              <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.72)']}
                style={s.imageOverlay}
              >
                <Pressable onPress={onClose} style={s.closeBtn}>
                  <Feather name="x" size={18} color="#fff" />
                </Pressable>
                <View style={s.imageHeaderInfo}>
                  <Text style={s.imageProductName} numberOfLines={2}>{product.name}</Text>
                  {product.description ? (
                    <Text style={s.imageProductDesc} numberOfLines={2}>{product.description}</Text>
                  ) : null}
                </View>
              </LinearGradient>
            </View>
          ) : (
            <View style={[s.compactHeader, { backgroundColor: palette.bg }]}>
              <View style={s.compactHeaderInner}>
                <Text style={s.compactEmoji}>{palette.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.compactName, { color: palette.banner }]}>{product.name}</Text>
                  {product.description ? (
                    <Text style={s.compactDesc} numberOfLines={2}>{product.description}</Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={onClose} style={[s.compactClose, { backgroundColor: `${palette.banner}18` }]}>
                <Feather name="x" size={16} color={palette.banner} />
              </Pressable>
            </View>
          )}

          {/* ── Price + qty strip ──────────────────────────────────────── */}
          <View style={[s.priceStrip, { borderBottomColor: BORDER }]}>
            <View>
              <Text style={s.priceLabel}>Price</Text>
              <Text style={[s.priceValue, { color: palette.banner }]}>{formatCents(basePriceCents)}</Text>
            </View>
            {optionsTotalCents !== 0 && (
              <View style={s.optionsAdj}>
                <Text style={s.optionsAdjText}>
                  Options {optionsTotalCents > 0 ? '+' : ''}{formatCents(optionsTotalCents)}
                </Text>
              </View>
            )}
            <View style={s.qtyStepper}>
              <Pressable
                onPress={() => { if (quantity > 1) { setQuantity(q => q - 1); Haptics.selectionAsync(); } }}
                style={[s.qtyBtn, { opacity: quantity <= 1 ? 0.35 : 1 }]}
                hitSlop={8}
              >
                <Feather name="minus" size={16} color={TEXT} />
              </Pressable>
              <Text style={s.qtyNum}>{quantity}</Text>
              <Pressable
                onPress={() => { setQuantity(q => q + 1); Haptics.selectionAsync(); }}
                style={s.qtyBtn}
                hitSlop={8}
              >
                <Feather name="plus" size={16} color={TEXT} />
              </Pressable>
            </View>
          </View>

          {/* ── Scrollable body — flex:1 works because parent has explicit height ── */}
          <ScrollView
            style={s.scrollBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {/* Variants (size) */}
            {variants.length > 1 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Size</Text>
                <View style={s.variantRow}>
                  {variants.map((v: any) => {
                    const active = selectedVariantId === v.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => { setVariantId(v.id); Haptics.selectionAsync(); }}
                        style={[s.variantCard, active && { borderColor: palette.banner, backgroundColor: `${palette.banner}0D` }]}
                      >
                        <Text style={[s.variantName, { color: active ? palette.banner : TEXT, fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                          {v.name}
                        </Text>
                        <Text style={[s.variantPrice, { color: active ? palette.banner : MUTED }]}>
                          {formatCents(v.priceCents)}
                        </Text>
                        {active && (
                          <View style={[s.variantCheck, { backgroundColor: palette.banner }]}>
                            <Feather name="check" size={10} color="#fff" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Options */}
            {isLoading && !optGroups.length ? (
              <View style={{ paddingVertical: 28, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={palette.banner} />
                <Text style={{ color: MUTED, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Loading options…</Text>
              </View>
            ) : (
              optGroups.map(renderOptionGroup)
            )}

            {!hasOptions && !isLoading && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
                <Text style={{ color: MUTED, fontSize: 13, fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>
                  No customisations for this item.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* ── Add to Cart footer ─────────────────────────────────────── */}
          <View style={[s.footer, { borderTopColor: BORDER }]}>
            <Pressable
              style={[s.addBtn, { backgroundColor: palette.banner }]}
              onPress={handleAddToCart}
            >
              <View style={s.addBtnLeft}>
                <View style={s.qtyBubble}>
                  <Text style={s.qtyBubbleText}>{quantity}</Text>
                </View>
                <Text style={s.addBtnText}>Add to Cart</Text>
              </View>
              <Text style={s.addBtnPrice}>{formatCents(totalCents)}</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },

  // Sheet: explicit height set inline via useWindowDimensions so flex:1 children work
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    flexDirection: 'column',
  },

  handleWrap:   { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:       { width: 36, height: 4, borderRadius: 2, backgroundColor: BORDER },

  imageHeader:      { height: 200, position: 'relative' },
  imageOverlay:     { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end', padding: 16, paddingBottom: 14 },
  imageHeaderInfo:  { flex: 1 },
  imageProductName: { fontSize: 22, color: '#fff', fontFamily: 'Inter_700Bold', lineHeight: 28 },
  imageProductDesc: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 18 },
  closeBtn:         { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },

  compactHeader:      { paddingHorizontal: 16, paddingVertical: 16 },
  compactHeaderInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  compactEmoji:       { fontSize: 44, lineHeight: 52 },
  compactName:        { fontSize: 20, fontFamily: 'Inter_700Bold', lineHeight: 26 },
  compactDesc:        { fontSize: 13, color: MUTED, fontFamily: 'Inter_400Regular', marginTop: 3, lineHeight: 18 },
  compactClose:       { position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  priceStrip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 8 },
  priceLabel:    { fontSize: 11, color: MUTED, fontFamily: 'Inter_500Medium', textTransform: 'uppercase', letterSpacing: 0.4 },
  priceValue:    { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 1 },
  optionsAdj:    { flex: 1, paddingLeft: 4 },
  optionsAdjText:{ fontSize: 12, color: MUTED, fontFamily: 'Inter_400Regular' },

  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  qtyBtn:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  qtyNum:     { fontSize: 17, fontFamily: 'Inter_700Bold', color: TEXT, minWidth: 30, textAlign: 'center' },

  // flex:1 is valid here because the parent <View style={{ height: MAX_SHEET_H }}> has an explicit height
  scrollBody: { flex: 1 },

  section:       { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel:  { fontSize: 14, color: TEXT, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  optionalText:  { fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' },
  reqBadge:      { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reqText:       { fontSize: 10, color: '#D97706', fontFamily: 'Inter_600SemiBold' },

  variantRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantCard: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff', position: 'relative' },
  variantName: { fontSize: 14 },
  variantPrice:{ fontSize: 13, fontFamily: 'Inter_400Regular' },
  variantCheck:{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22, borderWidth: 1.5, borderColor: BORDER, backgroundColor: '#fff' },
  optPillText:{ fontSize: 13, color: TEXT, fontFamily: 'Inter_400Regular' },
  optPriceAdj:{ fontSize: 11, color: MUTED, fontFamily: 'Inter_400Regular' },

  textInput: { backgroundColor: BG, borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, fontFamily: 'Inter_400Regular', minHeight: 72, textAlignVertical: 'top' },

  footer:    { paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1 },
  addBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 58, borderRadius: 18, paddingHorizontal: 18 },
  addBtnLeft:{ flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  qtyBubbleText: { fontSize: 14, color: '#fff', fontFamily: 'Inter_700Bold' },
  addBtnText:{ fontSize: 17, color: '#fff', fontFamily: 'Inter_700Bold' },
  addBtnPrice: { fontSize: 17, color: '#fff', fontFamily: 'Inter_600SemiBold', opacity: 0.9 },
});
