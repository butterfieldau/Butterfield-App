import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';

// ── Shared async-storage keys (imported by catalog.tsx) ─────────────────────
export const WS_CART_KEY          = '@ws_cart_v2';
export const WS_OPEN_CHECKOUT_KEY = '@ws_open_checkout';

// ── Colors ───────────────────────────────────────────────────────────────────
const BG = 'transparent';
const CARD  = '#FFFFFF';
const BLUE  = '#1493FF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const RED   = '#EF4444';

// ── Pricing context (mirrors the server engine priority order) ────────────────
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
): { unitCents: number; isCustom: boolean; isQtyBreak: boolean } {
  if (!ctx || !baseCents) return { unitCents: baseCents, isCustom: false, isQtyBreak: false };
  const custom = ctx.customPrices.find((cp) => cp.productId === productId && cp.unitPriceCents);
  if (custom?.unitPriceCents) return { unitCents: custom.unitPriceCents, isCustom: true, isQtyBreak: false };
  const applicable = [...(ctx.qtyBreaks ?? [])]
    .filter((qb) => qb.productId === productId && qb.unitPriceCents && qty >= qb.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (applicable?.unitPriceCents) return { unitCents: applicable.unitPriceCents, isCustom: false, isQtyBreak: true };
  return { unitCents: baseCents, isCustom: false, isQtyBreak: false };
}

function baseCentsFor(p: ApiProduct): number {
  return (p as any).unitPriceCents ?? (p.prices?.[0]?.unit_amount ?? 0);
}

interface CartEntry { product: ApiProduct; quantity: number }

// ── Screen ───────────────────────────────────────────────────────────────────
export default function WholesaleCartScreen() {
  const insets = useSafeAreaInsets();
  const [cart, setCart]     = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn:  () => api.wholesale.account(),
    staleTime: 60_000,
  });
  const account = accountData?.data ?? null;
  const deliveryFeeCents: number = account?.deliveryFeeCents ?? 0;

  const { data: pricingData } = useQuery({
    queryKey: ['wholesale-pricing-context'],
    queryFn:  () => api.wholesale.pricingContext(),
    staleTime: 60_000,
    retry: false,
  });
  const pricingCtx = (pricingData?.data ?? null) as PricingContext | null;

  // Minimum order — account-level override takes priority over tier default
  const minOrderCents: number = (account?.minOrderCents ?? 0) > 0
    ? (account?.minOrderCents ?? 0)
    : (account?.tier?.minOrderCents ?? 0);

  // Reload cart from AsyncStorage every time this tab gains focus
  useFocusEffect(useCallback(() => {
    setLoading(true);
    AsyncStorage.getItem(WS_CART_KEY).then(val => {
      try { setCart(val ? JSON.parse(val) : []); } catch { setCart([]); }
      setLoading(false);
    });
  }, []));

  const saveCart = useCallback(async (next: CartEntry[]) => {
    setCart(next);
    await AsyncStorage.setItem(WS_CART_KEY, JSON.stringify(next));
  }, []);

  const updateQty = (id: string, qty: number) => {
    Haptics.selectionAsync();
    saveCart(qty <= 0
      ? cart.filter(e => e.product.id !== id)
      : cart.map(e => e.product.id === id ? { ...e, quantity: qty } : e),
    );
  };

  const removeItem = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveCart(cart.filter(e => e.product.id !== id));
  };

  const subtotalCents = cart.reduce((s, e) => {
    const bc = baseCentsFor(e.product);
    return s + computePriceInfo(e.product.id, e.quantity, bc, pricingCtx).unitCents * e.quantity;
  }, 0);
  const totalCents = subtotalCents + (deliveryFeeCents > 0 ? deliveryFeeCents : 0);
  const totalQty   = cart.reduce((s, e) => s + e.quantity, 0);

  const belowMin = minOrderCents > 0 && subtotalCents < minOrderCents;

  const handleCheckout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(WS_OPEN_CHECKOUT_KEY, '1');
    router.navigate('/(wholesale)/catalog');
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <LinearGradient
        colors={['#1A2B4A', '#253B5E']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: 16 }]}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Text style={s.title}>Cart</Text>
          {totalQty > 0 && (
            <Text style={s.sub}>{totalQty} item{totalQty !== 1 ? 's' : ''}</Text>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : cart.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <View style={s.emptyIcon}>
            <Feather name="shopping-cart" size={32} color={BLUE} />
          </View>
          <Text style={s.emptyTitle}>Cart is empty</Text>
          <Text style={s.emptySub}>
            Browse the catalog to add wholesale products to your order
          </Text>
          <Pressable onPress={() => router.navigate('/(wholesale)/catalog')} style={s.browseBtn}>
            <Text style={s.browseBtnText}>Browse Catalog</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cart}
          keyExtractor={e => e.product.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry }) => {
            const bc = baseCentsFor(entry.product);
            const priceInfo = computePriceInfo(entry.product.id, entry.quantity, bc, pricingCtx);
            const lineTotalCents = priceInfo.unitCents * entry.quantity;
            const imgUri = (entry.product as any).images?.[0] ?? (entry.product as any).imageUrl;
            return (
              <View style={s.card}>
                {imgUri ? (
                  <Image source={{ uri: imgUri }} style={s.thumb} contentFit="cover" />
                ) : (
                  <View style={[s.thumb, { backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }]}>
                    <Feather name="package" size={24} color={BLUE} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <Text style={s.productName} numberOfLines={2}>{entry.product.name}</Text>
                    <Pressable onPress={() => removeItem(entry.product.id)} hitSlop={10}>
                      <Feather name="x" size={15} color={MUTED} />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.lineTotal}>AUD {(lineTotalCents / 100).toFixed(2)}</Text>
                    {priceInfo.isCustom && (
                      <View style={s.priceBadge}>
                        <Text style={s.priceBadgeText}>Custom</Text>
                      </View>
                    )}
                    {priceInfo.isQtyBreak && (
                      <View style={s.priceBadge}>
                        <Text style={s.priceBadgeText}>Qty price</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.unitPrice}>AUD {(priceInfo.unitCents / 100).toFixed(2)} / unit</Text>
                  <View style={s.qtyRow}>
                    <Pressable
                      onPress={() => updateQty(entry.product.id, entry.quantity - 1)}
                      style={[s.qtyBtn, { opacity: entry.quantity <= 1 ? 0.35 : 1 }]}
                      hitSlop={8}
                    >
                      <Feather name="minus" size={13} color={TEXT} />
                    </Pressable>
                    <Text style={s.qtyNum}>{entry.quantity}</Text>
                    <Pressable onPress={() => updateQty(entry.product.id, entry.quantity + 1)} style={s.qtyBtn} hitSlop={8}>
                      <Feather name="plus" size={13} color={TEXT} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
          ListFooterComponent={(
            <View style={[s.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={s.sumRow}>
                <Text style={s.sumLabel}>Subtotal ({cart.length} product{cart.length !== 1 ? 's' : ''})</Text>
                <Text style={s.sumValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
              </View>
              {deliveryFeeCents > 0 && (
                <>
                  <View style={s.sumDivider} />
                  <View style={s.sumRow}>
                    <Text style={s.sumLabel}>Estimated delivery</Text>
                    <Text style={s.sumValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
                  </View>
                </>
              )}
              <View style={s.sumDivider} />
              <View style={s.sumRow}>
                <Text style={[s.sumLabel, { color: TEXT, fontWeight: '700' }]}>Order Total</Text>
                <Text style={[s.sumValue, { color: BLUE, fontWeight: '700', fontSize: 16 }]}>
                  AUD {(totalCents / 100).toFixed(2)}
                </Text>
              </View>
              {belowMin && (
                <Text style={{ color: RED, fontSize: 12, fontWeight: '400', marginTop: 4 }}>
                  Minimum wholesale order is AUD {(minOrderCents / 100).toFixed(2)}
                </Text>
              )}
            </View>
          )}
        />
      )}

      {cart.length > 0 && (
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={s.footerInner}>
            <View>
              <Text style={s.footerLabel}>TOTAL</Text>
              <Text style={s.footerTotal}>AUD {(totalCents / 100).toFixed(2)}</Text>
            </View>
            <Pressable
              onPress={handleCheckout}
              disabled={belowMin}
              style={[s.checkoutBtn, { backgroundColor: belowMin ? '#C7C7CC' : BLUE }]}
            >
              <Feather name="shopping-bag" size={15} color="#fff" />
              <Text style={s.checkoutBtnText}>Proceed to Checkout</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  title:  { color: '#fff', fontSize: 26, fontWeight: '700' },
  sub:    { color: 'rgba(255,255,255,0.8)', fontWeight: '400', fontSize: 13 },

  emptyIcon:     { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' },
  emptyTitle:    { fontSize: 20, fontWeight: '700', color: TEXT },
  emptySub:      { fontSize: 14, fontWeight: '400', color: MUTED, textAlign: 'center', lineHeight: 20 },
  browseBtn:     { backgroundColor: BLUE, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28, marginTop: 4 },
  browseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card:        { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  thumb:       { width: 72, height: 72, borderRadius: 10, flexShrink: 0 },
  productName: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT, lineHeight: 19 },
  lineTotal:   { fontSize: 15, fontWeight: '700', color: TEXT },
  unitPrice:   { fontSize: 11, fontWeight: '400', color: MUTED },
  qtyRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  qtyBtn:      { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  qtyNum:      { fontSize: 15, fontWeight: '700', color: TEXT, minWidth: 28, textAlign: 'center' },

  priceBadge:     { backgroundColor: '#EBF8FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priceBadgeText: { fontSize: 10, fontWeight: '600', color: BLUE },

  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10, marginTop: 4 },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:    { fontSize: 13, fontWeight: '400', color: MUTED },
  sumValue:    { fontSize: 14, fontWeight: '600', color: TEXT },
  sumDivider:  { height: 1, backgroundColor: BORDER },

  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingTop: 12 },
  footerInner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerLabel:     { fontSize: 10, fontWeight: '600', color: MUTED, letterSpacing: 0.5 },
  footerTotal:     { fontSize: 18, fontWeight: '700', color: TEXT },
  checkoutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24 },
  checkoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
