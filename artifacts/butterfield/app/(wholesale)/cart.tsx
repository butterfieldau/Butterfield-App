import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Platform, Pressable,
  StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';

// ── Shared async-storage keys (imported by catalog.tsx) ─────────────────────
export const WS_CART_KEY          = '@ws_cart_v2';
export const WS_OPEN_CHECKOUT_KEY = '@ws_open_checkout';

// ── Colors ───────────────────────────────────────────────────────────────────
const BG    = '#F5F6FA';
const CARD  = '#FFFFFF';
const BLUE  = '#1493FF';
const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER= '#E5E7EB';
const RED   = '#EF4444';

// ── Wholesale pricing tiers ───────────────────────────────────────────────────
const WS_TIERS = [
  { minQty: 1,  discount: 0    },
  { minQty: 10, discount: 0.10 },
  { minQty: 25, discount: 0.20 },
  { minQty: 50, discount: 0.30 },
];
function wsPrice(bp: number, qty: number) {
  const tier = [...WS_TIERS].reverse().find(t => qty >= t.minQty);
  return bp * (1 - (tier?.discount ?? 0));
}
function basePrice(p: ApiProduct) {
  return (p.prices?.[0]?.unit_amount ?? (p as any).priceCents ?? 0) / 100;
}

interface CartEntry { product: ApiProduct; quantity: number }

// ── Screen ───────────────────────────────────────────────────────────────────
export default function WholesaleCartScreen() {
  const insets = useSafeAreaInsets();
  const [cart, setCart]       = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: accountData } = useQuery({
    queryKey: ['wholesale-account'],
    queryFn:  () => api.wholesale.account(),
    staleTime: 60_000,
  });
  const deliveryFeeCents: number = accountData?.data?.deliveryFeeCents ?? 0;

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

  const subtotalCents = cart.reduce(
    (s, e) => s + Math.round(wsPrice(basePrice(e.product), e.quantity) * e.quantity * 100), 0,
  );
  const totalCents = subtotalCents + (deliveryFeeCents > 0 ? deliveryFeeCents : 0);
  const totalQty   = cart.reduce((s, e) => s + e.quantity, 0);
  const meetsMinimum = subtotalCents >= 5000;

  const handleCheckout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(WS_OPEN_CHECKOUT_KEY, '1');
    router.navigate('/(wholesale)/catalog');
  };

  // Bottom padding for list: just safe area (no tab bar on cart screen)
  const listBottom = insets.bottom + 24;

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
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: listBottom }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: entry }) => {
            const bp        = basePrice(entry.product);
            const wp        = wsPrice(bp, entry.quantity);
            const lineTotal = Math.round(wp * entry.quantity * 100);
            const imgUri    = (entry.product as any).images?.[0] ?? (entry.product as any).imageUrl;
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
                  <Text style={s.lineTotal}>AUD {(lineTotal / 100).toFixed(2)}</Text>
                  <Text style={s.unitPrice}>AUD {wp.toFixed(2)} / unit</Text>
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
            <View style={s.summaryCard}>
              {/* Line items */}
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
                <Text style={[s.sumLabel, { color: TEXT, fontWeight: '700', fontSize: 15 }]}>Order Total</Text>
                <Text style={[s.sumValue, { color: BLUE, fontWeight: '700', fontSize: 17 }]}>
                  AUD {(totalCents / 100).toFixed(2)}
                </Text>
              </View>

              {/* Minimum order warning */}
              {!meetsMinimum && (
                <View style={s.warningRow}>
                  <Feather name="alert-circle" size={13} color={RED} />
                  <Text style={s.warningText}>Minimum wholesale order is AUD 50.00</Text>
                </View>
              )}

              {/* Checkout button — lives right in the summary card */}
              <View style={s.sumDivider} />
              <Pressable
                onPress={handleCheckout}
                disabled={!meetsMinimum}
                style={[s.checkoutBtn, { backgroundColor: meetsMinimum ? BLUE : '#C7C7CC' }]}
              >
                <Feather name="shopping-bag" size={16} color="#fff" />
                <Text style={s.checkoutBtnText}>Proceed to Checkout</Text>
              </Pressable>

              {meetsMinimum && (
                <Text style={s.checkoutNote}>
                  Your order will be confirmed by your account manager
                </Text>
              )}
            </View>
          )}
        />
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

  summaryCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
    marginTop: 4,
  },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumLabel:    { fontSize: 13, fontWeight: '400', color: MUTED },
  sumValue:    { fontSize: 14, fontWeight: '600', color: TEXT },
  sumDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },

  warningRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warningText: { color: RED, fontSize: 12, fontWeight: '400', flex: 1 },

  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 28,
  },
  checkoutBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  checkoutNote:    { fontSize: 11, color: MUTED, textAlign: 'center', lineHeight: 15 },
});
