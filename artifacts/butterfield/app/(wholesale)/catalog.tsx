import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import Reanimated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import { WS_REORDER_KEY } from './orders';
import { WS_CART_KEY, WS_OPEN_CHECKOUT_KEY } from './cart';
import WholesaleConfidentialWatermark from '@/components/wholesale/WholesaleConfidentialWatermark';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
} as const;

const TILE_GAP = 10;
const TILE_PAD = 14;
const NUM_COLS = 2;

interface PricingContext {
  tierId: string | null;
  tierName: string | null;
  qtyBreaks: Array<{ id: string; productId: string; minQty: number; unitPriceCents: number }>;
  customPrices: Array<{ id: string; productId: string; unitPriceCents: number | null }>;
}

function computePriceInfo(
  productId: string,
  qty: number,
  baseCents: number,
  ctx: PricingContext | null,
): { unitCents: number; isCustom: boolean; isQtyBreak: boolean; activeBreakMinQty: number | null } {
  if (!ctx || !baseCents) return { unitCents: baseCents, isCustom: false, isQtyBreak: false, activeBreakMinQty: null };
  const custom = ctx.customPrices.find((cp) => cp.productId === productId && cp.unitPriceCents);
  if (custom?.unitPriceCents) return { unitCents: custom.unitPriceCents, isCustom: true, isQtyBreak: false, activeBreakMinQty: null };
  const applicable = [...(ctx.qtyBreaks ?? [])]
    .filter((qb) => qb.productId === productId && qb.unitPriceCents && qty >= qb.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (applicable?.unitPriceCents) return { unitCents: applicable.unitPriceCents, isCustom: false, isQtyBreak: true, activeBreakMinQty: applicable.minQty };
  return { unitCents: baseCents, isCustom: false, isQtyBreak: false, activeBreakMinQty: null };
}

interface CartEntry { product: ApiProduct; quantity: number }

function WholesaleProductTile({ product, cartEntry, qty, onQtyChange, pricingCtx, tileWidth }: {
  product: ApiProduct;
  cartEntry?: CartEntry;
  qty: string;
  onQtyChange: (productId: string, val: string) => void;
  pricingCtx: PricingContext | null;
  tileWidth: number;
}) {
  const baseCents    = (product as any).unitPriceCents ?? (product.prices?.[0]?.unit_amount ?? 0);
  const parsedQty    = Math.max(0, parseInt(qty) || 0);
  const priceInfo    = computePriceInfo(product.id, parsedQty, baseCents, pricingCtx);
  const palette      = getPalette(product.metadata?.category);
  const imageUrl     = (product as any).images?.[0];
  const inCart       = !!cartEntry;
  const hasQty       = parsedQty > 0;
  const productBreaks = pricingCtx
    ? [...(pricingCtx.qtyBreaks ?? [])].filter((qb) => qb.productId === product.id).sort((a, b) => a.minQty - b.minQty)
    : [];

  const scaleAnim = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleAnim.value }] }));

  const increment = () => {
    scaleAnim.value = withTiming(0.95, { duration: 60 }, () => { scaleAnim.value = withTiming(1, { duration: 80 }); });
    onQtyChange(product.id, String(parsedQty + 1));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const decrement = () => {
    if (parsedQty === 0) return;
    scaleAnim.value = withTiming(0.95, { duration: 60 }, () => { scaleAnim.value = withTiming(1, { duration: 80 }); });
    onQtyChange(product.id, String(Math.max(0, parsedQty - 1)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Reanimated.View style={[
      styles.tile, { width: tileWidth },
      hasQty && styles.tileSelected,
      inCart && !hasQty && styles.tileInCart,
      animStyle, GLASS_SHADOW,
    ]}>
      {/* Image */}
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.image, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 28 }}>{palette.emoji}</Text>
          </View>
        )}
        {inCart && (
          <View style={styles.inCartBadge}>
            <Text style={styles.inCartBadgeText}>{cartEntry!.quantity}</Text>
          </View>
        )}
        {(priceInfo.isCustom || priceInfo.isQtyBreak) && (
          <View style={styles.priceBadge}>
            <Text style={styles.priceBadgeText}>
              {priceInfo.isCustom ? 'Custom' : `${priceInfo.activeBreakMinQty}+`}
            </Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.tileName} numberOfLines={2}>{product.name}</Text>

      {/* Price + qty breaks */}
      <View style={{ alignItems: 'center', gap: 3, alignSelf: 'stretch' }}>
        <Text style={styles.tilePrice}>${(priceInfo.unitCents / 100).toFixed(2)} ea</Text>
        {productBreaks.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {productBreaks.map((qb) => (
              <Text key={qb.id} style={[styles.breakTag, { color: parsedQty >= qb.minQty ? BLUE : MUTED }]}>
                {qb.minQty}+ ${(qb.unitPriceCents / 100).toFixed(2)}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Stepper */}
      <View style={styles.stepperRow}>
        <Pressable onPress={decrement} style={[styles.stepBtn, parsedQty === 0 && styles.stepBtnOff]} hitSlop={8}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          style={[styles.stepQty, hasQty && styles.stepQtyActive]}
          value={qty}
          onChangeText={(v) => onQtyChange(product.id, v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          selectTextOnFocus
        />
        <Pressable onPress={increment} style={styles.stepBtn} hitSlop={8}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

export default function WholesaleCatalog() {
  const insets = useSafeAreaInsets();
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('All');
  const [cart, setCart]           = useState<CartEntry[]>([]);
  const [gridWidth, setGridWidth] = useState(0);
  const [qtys, setQtys]           = useState<Record<string, string>>({});

  const tileWidth = gridWidth > 0
    ? Math.floor((gridWidth - TILE_PAD * 2 - TILE_GAP * (NUM_COLS - 1)) / NUM_COLS)
    : 0;

  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn: () => api.wholesale.account(),
    staleTime: 60_000, retry: false,
  });
  const account   = accountData?.data;
  const isPending = account?.status === 'pending';

  const { data: pricingData } = useQuery({
    queryKey: ['wholesale-pricing-context'],
    queryFn:  () => api.wholesale.pricingContext(),
    staleTime: 60_000, retry: false,
    enabled: !isPending,
  });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wholesale-products'],
    queryFn: () => api.wholesale.catalog(),
    retry: 1,
    enabled: !isPending,
  });
  const products = data?.data ?? [];
  const { refreshing, onRefresh } = useRefreshControl(refetch);

  // Seed qty map with default minOrderQty when products first load
  useEffect(() => {
    if (products.length === 0) return;
    setQtys((prev) => {
      const next = { ...prev };
      for (const p of products) {
        if (!(p.id in next)) next[p.id] = '';
      }
      return next;
    });
  }, [products]);

  const handleQtyChange = useCallback((productId: string, val: string) => {
    setQtys((prev) => ({ ...prev, [productId]: val }));
  }, []);

  const [pendingReorder, setPendingReorder] = useState<{ productId: string; qty: number; productName: string }[] | null>(null);
  const reorderProcessed = useRef(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(WS_CART_KEY).then((val) => {
        try { if (val) setCart(JSON.parse(val)); } catch {}
      });
      AsyncStorage.getItem(WS_REORDER_KEY).then((val) => {
        if (val) {
          reorderProcessed.current = false;
          setPendingReorder(JSON.parse(val));
          AsyncStorage.removeItem(WS_REORDER_KEY);
        }
      });
    }, [])
  );

  useEffect(() => {
    AsyncStorage.setItem(WS_CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!pendingReorder || products.length === 0 || reorderProcessed.current) return;
    reorderProcessed.current = true;
    const newCart: CartEntry[] = [];
    const notFound: string[] = [];
    for (const item of pendingReorder) {
      const product = products.find((p) => p.id === item.productId);
      if (product) newCart.push({ product, quantity: item.qty });
      else if (item.productName) notFound.push(item.productName);
    }
    if (newCart.length > 0) {
      setCart(newCart);
      const msg = notFound.length > 0
        ? `${newCart.length} item${newCart.length !== 1 ? 's' : ''} added to cart.\n\nNote: ${notFound.join(', ')} ${notFound.length === 1 ? 'is' : 'are'} no longer available.`
        : `${newCart.length} item${newCart.length !== 1 ? 's' : ''} added to your cart.`;
      AsyncStorage.setItem(WS_CART_KEY, JSON.stringify(newCart)).then(() =>
        AsyncStorage.setItem(WS_OPEN_CHECKOUT_KEY, '1').then(() => {
          router.navigate('/(wholesale)/cart' as any);
          Alert.alert('Cart Ready', msg);
        })
      );
    } else {
      Alert.alert('Products Unavailable', 'None of the products from that order are currently available.');
    }
    setPendingReorder(null);
  }, [pendingReorder, products]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.metadata?.category) cats.add(p.metadata.category); });
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filtered = useMemo(() => products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = category === 'All' || p.metadata?.category === category;
    return matchSearch && matchCat;
  }), [products, search, category]);

  // Items the customer has set a qty > 0 for (across ALL products, not just filtered)
  const selectedItems = useMemo(() =>
    products.filter((p) => (parseInt(qtys[p.id] ?? '') || 0) > 0),
    [products, qtys]
  );
  const totalSelectedUnits = useMemo(() =>
    selectedItems.reduce((s, p) => s + (parseInt(qtys[p.id] ?? '') || 0), 0),
    [selectedItems, qtys]
  );
  const hasSelection = selectedItems.length > 0;

  const addToCart = useCallback(() => {
    if (!hasSelection) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCart((prev) => {
      let next = [...prev];
      for (const product of selectedItems) {
        const qty = parseInt(qtys[product.id] ?? '') || 0;
        if (qty <= 0) continue;
        const idx = next.findIndex((e) => e.product.id === product.id);
        if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        else next = [...next, { product, quantity: qty }];
      }
      return next;
    });
    // Reset selected qtys to empty
    setQtys((prev) => {
      const next = { ...prev };
      for (const p of selectedItems) next[p.id] = '';
      return next;
    });
  }, [hasSelection, selectedItems, qtys]);

  const pricingCtx = (pricingData?.data ?? null) as PricingContext | null;
  const totalCartQty = cart.reduce((s, e) => s + e.quantity, 0);

  // Floating bar animation
  const floatY = useSharedValue(100);
  useEffect(() => {
    floatY.value = withSpring(hasSelection ? 0 : 100, { damping: 18, stiffness: 200 });
  }, [hasSelection]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  // Tab bar = 46px pill + Math.max(insets.bottom, 12) padding, positioned at bottom:0
  const TAB_BAR_H    = 46 + Math.max(insets.bottom, 12);
  const floatBarHeight = 64;
  const listBottomPad  = TAB_BAR_H + floatBarHeight + 46;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WholesaleConfidentialWatermark businessName={account?.companyName} email={account?.email ?? undefined} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.catalogHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Catalog</Text>
          {totalCartQty > 0 && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/(wholesale)/cart' as any); }}
              style={styles.cartBtn}
            >
              <Feather name="shopping-cart" size={16} color={BLUE} />
              <Text style={{ color: BLUE, fontWeight: '700', fontSize: 14 }}>{totalCartQty}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.searchBar, { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER }]}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={{ flex: 1, fontSize: 15, color: TEXT, fontWeight: '400' }}
            placeholder="Search products…"
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color={MUTED} /></Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {categories.map((cat) => {
            const active = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => { setCategory(cat); Haptics.selectionAsync(); }}
                style={[styles.catChip, { backgroundColor: active ? BLUE : CARD, borderColor: active ? BLUE : BORDER }]}
              >
                <Text style={[styles.catChipText, { color: active ? '#fff' : MUTED }]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Product grid ────────────────────────────────────────────────── */}
      {isPending ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <Feather name="clock" size={40} color="#F59E0B" />
          <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 16, textAlign: 'center' }}>Account Pending Approval</Text>
          <Text style={{ color: '#B45309', fontWeight: '400', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
            You will be able to browse and order from the catalog once your wholesale account has been approved.
          </Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={BLUE} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={NUM_COLS}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
          contentContainerStyle={{ padding: TILE_PAD, gap: TILE_GAP, paddingBottom: listBottomPad }}
          columnWrapperStyle={{ gap: TILE_GAP }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8, paddingHorizontal: 32 }}>
              <Feather name="package" size={32} color={BORDER} />
              <Text style={{ color: TEXT, fontWeight: '600', fontSize: 15, textAlign: 'center' }}>No products available yet</Text>
              <Text style={{ color: MUTED, fontWeight: '400', fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
                {search
                  ? `No products match "${search}" — try a different search.`
                  : 'Your catalog is being set up. Contact your account manager if this persists.'}
              </Text>
            </View>
          }
          renderItem={({ item: product }) => (
            tileWidth > 0 ? (
              <WholesaleProductTile
                product={product}
                cartEntry={cart.find((e) => e.product.id === product.id)}
                qty={qtys[product.id] ?? ''}
                onQtyChange={handleQtyChange}
                pricingCtx={pricingCtx}
                tileWidth={tileWidth}
              />
            ) : <View style={{ width: tileWidth }} />
          )}
        />
      )}

      {/* ── Floating Add to Cart bar ─────────────────────────────────── */}
      <Reanimated.View style={[
        styles.floatBar,
        { bottom: TAB_BAR_H + 25 },
        floatStyle,
      ]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.floatTitle}>
            {selectedItems.length} product{selectedItems.length !== 1 ? 's' : ''} selected
          </Text>
          <Text style={styles.floatSub}>{totalSelectedUnits} units total</Text>
        </View>
        <Pressable onPress={addToCart} style={styles.floatBtn}>
          <Feather name="shopping-cart" size={16} color="#fff" />
          <Text style={styles.floatBtnText}>Add to Cart</Text>
        </Pressable>
      </Reanimated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  catalogHeader: { paddingHorizontal: TILE_PAD, paddingTop: 14, paddingBottom: 14, gap: 10 },
  searchBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  catChip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catChipText:   { fontSize: 13, fontWeight: '600' },
  cartBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#EBF8FF', borderWidth: 1, borderColor: `${BLUE}30` },

  tile:         {
    backgroundColor: CARD,
    borderRadius: 14, padding: 10,
    borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center', gap: 7,
  },
  tileSelected: { borderColor: BLUE, backgroundColor: '#EBF5FF' },
  tileInCart:   { borderColor: '#22C55E', backgroundColor: '#F0FDF4' },

  imageWrap:   { alignSelf: 'stretch', aspectRatio: 1, position: 'relative' },
  image:       { width: '100%', height: '100%', borderRadius: 10 },

  inCartBadge:     { position: 'absolute', top: 5, left: 5, backgroundColor: '#22C55E', borderRadius: 9, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: CARD },
  inCartBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  priceBadge:      { position: 'absolute', top: 5, right: 5, backgroundColor: BLUE, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2 },
  priceBadgeText:  { color: '#fff', fontSize: 10, fontWeight: '700' },

  tileName:  { fontSize: 12, fontWeight: '600', color: TEXT, textAlign: 'center', lineHeight: 16, height: 32, alignSelf: 'stretch' },
  tilePrice: { fontSize: 14, fontWeight: '700', color: BLUE },
  breakTag:  { fontSize: 10, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: `${BLUE}12` },

  stepperRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stepBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  stepBtnOff:   { backgroundColor: '#D1D5DB' },
  stepBtnText:  { fontSize: 18, color: '#fff', fontWeight: '600', lineHeight: 22 },
  stepQty:      { width: 44, height: 30, textAlign: 'center', fontSize: 13, fontWeight: '700', color: TEXT, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  stepQtyActive:{ borderColor: BLUE, backgroundColor: '#fff', color: BLUE },

  floatBar: {
    position: 'absolute', left: 16, right: 16,
    height: 64, borderRadius: 18,
    backgroundColor: '#0A3D8F',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 14, elevation: 10,
  },
  floatTitle:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  floatSub:     { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  floatBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: BLUE, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  floatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
