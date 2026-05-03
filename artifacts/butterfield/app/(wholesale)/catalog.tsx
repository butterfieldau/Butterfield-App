import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';

const BG = '#0A1A0A';
const CARD = '#122012';
const ACCENT = '#3A8A3A';

const WHOLESALE_TIERS = [
  { minQty: 1, label: 'Retail', discount: 0 },
  { minQty: 10, label: 'Trade (10+)', discount: 0.1 },
  { minQty: 25, label: 'Bulk (25+)', discount: 0.2 },
  { minQty: 50, label: 'Volume (50+)', discount: 0.3 },
];

function getPrice(p: ApiProduct): number { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }
function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#3A8A3A', '#2A6A2A'];
}
function getWholesalePrice(basePrice: number, qty: number): number {
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => qty >= t.minQty);
  return basePrice * (1 - (tier?.discount ?? 0));
}

interface CartEntry { product: ApiProduct; quantity: number }

function ProductRow({
  product,
  cartEntry,
  onAdd,
}: {
  product: ApiProduct;
  cartEntry?: CartEntry;
  onAdd: (product: ApiProduct, qty: number) => void;
}) {
  const [qty, setQty] = useState('12');
  const basePrice = getPrice(product);
  const parsedQty = parseInt(qty) || 1;
  const wsPrice = getWholesalePrice(basePrice, parsedQty);
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => parsedQty >= t.minQty);
  return (
    <View style={[styles.productCard, { backgroundColor: CARD, borderRadius: 14 }]}>
      <LinearGradient colors={getGradient(product)} style={styles.productThumbLg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {product.metadata?.popular === 'true' && (
          <View style={[{ position: 'absolute', top: 6, left: 6, backgroundColor: ACCENT, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 9 }]}>POPULAR</Text>
          </View>
        )}
      </LinearGradient>
      <View style={{ padding: 12, gap: 6 }}>
        <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }]}>{product.name}</Text>
        <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 11 }]} numberOfLines={2}>{product.description}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 12, textDecorationLine: 'line-through' }]}>${basePrice.toFixed(2)} RRP</Text>
          <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${wsPrice.toFixed(2)}/unit</Text>
          {tier && tier.discount > 0 && (
            <View style={[{ backgroundColor: `${ACCENT}30`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 10 }]}>−{tier.discount * 100}%</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 }}>
          <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, height: 40 }]}>
            <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 12 }]}>Qty: </Text>
            <TextInput
              style={[{ flex: 1, color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }]}
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
            />
          </View>
          <Pressable
            onPress={() => onAdd(product, parsedQty)}
            style={[{ backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 16, height: 40, alignItems: 'center', justifyContent: 'center' }]}
          >
            <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }]}>
              {cartEntry ? `In cart (${cartEntry.quantity})` : 'Add'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function WholesaleCatalog() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [poRef, setPoRef] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['wholesale-products'], queryFn: () => api.wholesale.products(), retry: 1 });
  const products = data?.data ?? [];

  const filtered = useMemo(() => products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  ), [products, search]);

  const addToCart = (product: ApiProduct, qty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart((prev) => {
      const existing = prev.find((e) => e.product.id === product.id);
      if (existing) return prev.map((e) => e.product.id === product.id ? { ...e, quantity: e.quantity + qty } : e);
      return [...prev, { product, quantity: qty }];
    });
  };

  const removeFromCart = (productId: string) => setCart((prev) => prev.filter((e) => e.product.id !== productId));

  const totalCents = cart.reduce((sum, e) => sum + Math.round(getWholesalePrice(getPrice(e.product), e.quantity) * e.quantity * 100), 0);

  const handlePlaceOrder = async () => {
    if (cart.length === 0) { Alert.alert('Cart is empty'); return; }
    if (totalCents < 5000) { Alert.alert('Minimum order', 'Minimum wholesale order is $50.'); return; }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.wholesale.createOrder({
        items: cart.map((e) => ({
          productStripeId: e.product.id,
          productName: e.product.name,
          quantity: e.quantity,
          unitPriceCents: Math.round(getWholesalePrice(getPrice(e.product), e.quantity) * 100),
        })),
        poReference: poRef.trim() || undefined,
        notes: notes.trim() || undefined,
        totalCents,
        deliveryType: 'delivery',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['wholesale-orders'] });
      setCart([]); setPoRef(''); setNotes(''); setShowCart(false);
      Alert.alert('Order Submitted!', "Your wholesale order has been received. We'll confirm within 1 business day.");
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[{ color: '#fff', fontSize: 26, fontFamily: 'Inter_700Bold' }]}>Wholesale Catalog</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[styles.searchBar, { flex: 1, backgroundColor: CARD, borderRadius: 12 }]}>
            <Feather name="search" size={14} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={[{ flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 }]}
              placeholder="Search products..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          {cart.length > 0 && (
            <Pressable onPress={() => setShowCart(true)} style={[styles.cartBtn, { backgroundColor: ACCENT, borderRadius: 12 }]}>
              <Feather name="shopping-cart" size={16} color="#fff" />
              <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }]}>{cart.reduce((s, e) => s + e.quantity, 0)}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WHOLESALE_TIERS.map((tier) => (
            <View key={tier.label} style={[styles.tierTag, { backgroundColor: CARD, borderRadius: 10 }]}>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 11 }]}>{tier.label}</Text>
              {tier.discount > 0 && <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 10 }]}>−{tier.discount * 100}%</Text>}
            </View>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} /></View>
      ) : showCart ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 120 }}>
          <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }]}>Order Summary</Text>
          {cart.map((entry) => {
            const wsPrice = getWholesalePrice(getPrice(entry.product), entry.quantity);
            return (
              <View key={entry.product.id} style={[styles.cartRow, { backgroundColor: CARD, borderRadius: 14 }]}>
                <LinearGradient colors={getGradient(entry.product)} style={styles.cartThumb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{entry.product.name}</Text>
                  <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11 }]}>Qty: {entry.quantity}</Text>
                  <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 2 }]}>${wsPrice.toFixed(2)} ea · ${(wsPrice * entry.quantity).toFixed(2)} total</Text>
                </View>
                <Pressable onPress={() => removeFromCart(entry.product.id)} style={[{ padding: 6 }]}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              </View>
            );
          })}
          <View style={[styles.totalCard, { backgroundColor: CARD, borderRadius: 14 }]}>
            <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>Order Total</Text>
            <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 24 }]}>${(totalCents / 100).toFixed(2)}</Text>
            {totalCents < 5000 && <Text style={[{ color: '#EF4444', fontFamily: 'Inter_400Regular', fontSize: 12 }]}>Minimum order $50 not met</Text>}
          </View>
          {[
            { label: 'PO Reference (optional)', key: 'poRef', setter: setPoRef, value: poRef, placeholder: 'e.g. PO-2024-001' },
            { label: 'Notes', key: 'notes', setter: setNotes, value: notes, placeholder: 'Delivery instructions, special requests...' },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 12, marginBottom: 6 }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: CARD, color: '#fff', fontFamily: 'Inter_400Regular', borderRadius: 12 }]}
                placeholder={field.placeholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={field.value}
                onChangeText={field.setter}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowCart(false)} style={[{ flex: 1, padding: 16, backgroundColor: CARD, borderRadius: 14, alignItems: 'center' }]}>
              <Text style={[{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold' }]}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handlePlaceOrder}
              disabled={submitting || totalCents < 5000}
              style={[{ flex: 2, padding: 16, backgroundColor: totalCents >= 5000 ? ACCENT : '#2A4A2A', borderRadius: 14, alignItems: 'center' }]}
            >
              <Text style={[{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }]}>{submitting ? 'Submitting...' : 'Place Order'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={ACCENT} />}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Feather name="package" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={[{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 14 }]}>No products available</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <ProductRow
              product={p}
              cartEntry={cart.find((e) => e.product.id === p.id)}
              onAdd={addToCart}
            />
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 42 },
  tierTag: { paddingHorizontal: 10, paddingVertical: 6, gap: 2, alignItems: 'center' },
  productCard: { overflow: 'hidden' },
  productThumbLg: { height: 100, position: 'relative' },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cartThumb: { width: 48, height: 48, borderRadius: 10 },
  totalCard: { padding: 16, alignItems: 'center', gap: 4 },
  input: { padding: 14, fontSize: 14 },
});
