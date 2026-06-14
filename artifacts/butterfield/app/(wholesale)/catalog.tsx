import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import { WS_REORDER_KEY } from './orders';
import { WS_CART_KEY, WS_OPEN_CHECKOUT_KEY } from './cart';

const BG         = '#EFF6FF';
const CARD       = '#FFFFFF';
const BLUE       = '#1493FF';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

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

function CompactProductRow({ product, cartEntry, onAdd, pricingCtx }: {
  product: ApiProduct;
  cartEntry?: CartEntry;
  onAdd: (product: ApiProduct, qty: number) => void;
  pricingCtx: PricingContext | null;
}) {
  const defaultQty  = String((product as any).minOrderQty ?? 12);
  const [qty, setQty]  = useState(defaultQty);
  const [added, setAdded] = useState(false);
  const addedTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseCents   = (product as any).unitPriceCents ?? (product.prices?.[0]?.unit_amount ?? 0);
  const parsedQty   = Math.max(1, parseInt(qty) || 1);
  const priceInfo   = computePriceInfo(product.id, parsedQty, baseCents, pricingCtx);
  const palette     = getPalette(product.metadata?.category);
  const imageUrl    = (product as any).images?.[0];
  const inCart      = !!cartEntry;
  const productBreaks = pricingCtx
    ? [...(pricingCtx.qtyBreaks ?? [])].filter((qb) => qb.productId === product.id).sort((a, b) => a.minQty - b.minQty)
    : [];
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  const increment = () => { const n = parsedQty + 1; setQty(String(n)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const decrement = () => { const n = Math.max(1, parsedQty - 1); setQty(String(n)); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const handleAdd = () => {
    onAdd(product, parsedQty);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQty(defaultQty);
    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 2000);
  };
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactThumbWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.compactThumb} resizeMode="cover" />
        ) : (
          <View style={[styles.compactThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 22 }}>{palette.emoji}</Text>
          </View>
        )}
        {inCart && (
          <View style={styles.inCartBadge}>
            <Text style={styles.inCartBadgeText}>{cartEntry!.quantity}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.compactName} numberOfLines={1}>{product.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.compactPrice}>${(priceInfo.unitCents / 100).toFixed(2)}</Text>
          {priceInfo.isCustom && <View style={styles.discountBadge}><Text style={styles.discountBadgeText}>Custom</Text></View>}
          {priceInfo.isQtyBreak && <View style={styles.discountBadge}><Text style={styles.discountBadgeText}>{priceInfo.activeBreakMinQty}+ price</Text></View>}
        </View>
        {productBreaks.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 2 }}>
            {productBreaks.map((qb) => (
              <Text key={qb.id} style={[styles.breakTag, { color: parsedQty >= qb.minQty ? BLUE : MUTED }]}>
                {qb.minQty}+ ${(qb.unitPriceCents / 100).toFixed(2)}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={styles.stepperRow}>
          <Pressable onPress={decrement} style={styles.stepBtn}><Text style={styles.stepBtnText}>−</Text></Pressable>
          <TextInput style={styles.stepQty} value={qty} onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" selectTextOnFocus />
          <Pressable onPress={increment} style={styles.stepBtn}><Text style={styles.stepBtnText}>+</Text></Pressable>
        </View>
        <Pressable onPress={handleAdd} style={[styles.addBtn, { backgroundColor: added ? '#22C55E' : BLUE }]}>
          <Feather name={added ? 'check' : 'plus'} size={11} color="#fff" />
          <Text style={styles.addBtnText}>{added ? 'Added' : 'Add'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function WholesaleCatalog() {
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('All');
  const [cart, setCart]           = useState<CartEntry[]>([]);

  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn: () => api.wholesale.account(),
    staleTime: 60_000, retry: false,
  });
  const account = accountData?.data;
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

  const addToCart = (product: ApiProduct, qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev) => {
      const existing = prev.find((e) => e.product.id === product.id);
      if (existing) return prev.map((e) => e.product.id === product.id ? { ...e, quantity: e.quantity + qty } : e);
      return [...prev, { product, quantity: qty }];
    });
  };

  const pricingCtx = (pricingData?.data ?? null) as PricingContext | null;
  const totalQty   = cart.reduce((s, e) => s + e.quantity, 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.catalogHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>Catalog</Text>
          {totalQty > 0 && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/(wholesale)/cart' as any); }}
              style={styles.cartBtn}
            >
              <Feather name="shopping-cart" size={16} color={BLUE} />
              <Text style={{ color: BLUE, fontWeight: '700', fontSize: 14 }}>{totalQty}</Text>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 0 }}>
          {categories.map((cat) => {
            const active = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => { setCategory(cat); Haptics.selectionAsync(); }}
                style={[styles.catChip, {
                  backgroundColor: active ? BLUE : CARD,
                  borderColor: active ? BLUE : BORDER,
                }]}
              >
                <Text style={[styles.catChipText, { color: active ? '#fff' : MUTED }]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Product list ────────────────────────────────────────────────── */}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
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
            <CompactProductRow
              product={product}
              cartEntry={cart.find((e) => e.product.id === product.id)}
              onAdd={addToCart}
              pricingCtx={pricingCtx}
            />
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  catalogHeader:    { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10 },
  searchBar:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  catChip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catChipText:      { fontSize: 13, fontWeight: '600' },
  cartBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#EBF8FF', borderWidth: 1, borderColor: `${BLUE}30` },
  compactRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GLASS_BG, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: GLASS_BORDER, ...GLASS_SHADOW },
  compactThumbWrap: { position: 'relative' },
  compactThumb:     { width: 56, height: 56, borderRadius: 10 },
  inCartBadge:      { position: 'absolute', top: -5, right: -5, backgroundColor: '#22C55E', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: CARD },
  inCartBadgeText:  { color: '#fff', fontSize: 9, fontWeight: '700' },
  compactName:      { fontSize: 14, fontWeight: '600', color: TEXT },
  compactPrice:     { fontSize: 14, fontWeight: '700', color: BLUE },
  discountBadge:    { backgroundColor: `${BLUE}18`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  discountBadgeText:{ fontSize: 10, fontWeight: '700', color: BLUE },
  breakTag:         { fontSize: 10, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: `${BLUE}12` },
  stepperRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, overflow: 'hidden', height: 34 },
  stepBtn:          { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepBtnText:      { fontSize: 18, color: TEXT, fontWeight: '400', lineHeight: 22 },
  stepQty:          { width: 36, height: 34, textAlign: 'center', fontSize: 13, fontWeight: '700', color: TEXT },
  addBtn:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 10, justifyContent: 'center' },
  addBtnText:       { color: '#fff', fontSize: 13, fontWeight: '700' },
});
