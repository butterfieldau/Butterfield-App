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
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import {
  formatDateChip,
  formatTime,
  getDeliveryDates,
  getPickupDates,
  getPickupTimeMins,
  getSydneyNow,
  isSameDay,
} from '@/lib/dateUtils';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

const WHOLESALE_TIERS = [
  { minQty: 1,  label: 'Retail',      discount: 0 },
  { minQty: 10, label: 'Trade (10+)', discount: 0.1 },
  { minQty: 25, label: 'Bulk (25+)',  discount: 0.2 },
  { minQty: 50, label: 'Volume (50+)',discount: 0.3 },
];

function getPrice(p: ApiProduct): number { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }
function getWholesalePrice(basePrice: number, qty: number): number {
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => qty >= t.minQty);
  return basePrice * (1 - (tier?.discount ?? 0));
}

interface CartEntry { product: ApiProduct; quantity: number }

function ProductRow({ product, cartEntry, onAdd }: { product: ApiProduct; cartEntry?: CartEntry; onAdd: (product: ApiProduct, qty: number) => void }) {
  const [qty, setQty] = useState('12');
  const basePrice = getPrice(product);
  const parsedQty = parseInt(qty) || 1;
  const wsPrice = getWholesalePrice(basePrice, parsedQty);
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => parsedQty >= t.minQty);
  const palette = getPalette(product.metadata?.category);

  return (
    <View style={[styles.productCard, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
      <View style={[styles.productThumbLg, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }]}>
        <Text style={{ fontSize: 36 }}>{palette.emoji}</Text>
        {cartEntry && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 11 }}>In cart: {cartEntry.quantity}</Text>
          </View>
        )}
      </View>
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 15 }}>{product.name}</Text>
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }} numberOfLines={2}>{product.description}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 16 }}>${wsPrice.toFixed(2)}</Text>
            {tier && tier.discount > 0 && (
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 10, textDecorationLine: 'line-through' }}>${basePrice.toFixed(2)}</Text>
            )}
          </View>
        </View>
        {tier && (
          <View style={{ backgroundColor: `${BLUE}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
            <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}{tier.discount > 0 ? ` −${tier.discount * 100}%` : ''}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BG, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flex: 1, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12 }}>Qty:</Text>
            <TextInput
              style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 16, flex: 1 }}
              value={qty}
              onChangeText={setQty}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>
          <Pressable
            onPress={() => onAdd(product, parsedQty)}
            style={{ backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
          >
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>Add</Text>
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

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('delivery');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);

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

  const sydNow = getSydneyNow();
  const pickupDates = getPickupDates();
  const deliveryDates = getDeliveryDates();
  const pickupTimes = selectedDate ? getPickupTimeMins(selectedDate, sydNow) : [];

  const handlePlaceOrder = async () => {
    if (cart.length === 0) { Alert.alert('Cart is empty'); return; }
    if (totalCents < 5000) { Alert.alert('Minimum order', 'Minimum wholesale order is $50.'); return; }
    if (orderType === 'pickup') {
      if (!selectedDate || selectedTimeMins === null) {
        Alert.alert('Select pickup time', 'Please choose a date and time for your pickup.');
        return;
      }
    } else {
      if (!selectedDate) {
        Alert.alert('Select delivery day', 'Please choose a delivery date to continue.');
        return;
      }
    }

    let scheduledForDate: Date | undefined;
    if (orderType === 'pickup' && selectedDate && selectedTimeMins !== null) {
      const d = new Date(selectedDate);
      d.setHours(Math.floor(selectedTimeMins / 60), selectedTimeMins % 60, 0, 0);
      scheduledForDate = d;
    } else if (orderType === 'delivery' && selectedDate) {
      scheduledForDate = selectedDate;
    }

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
        deliveryType: orderType,
        scheduledDate: scheduledForDate?.toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['wholesale-orders'] });
      setCart([]); setPoRef(''); setNotes(''); setShowCart(false);
      setSelectedDate(null); setSelectedTimeMins(null);
      Alert.alert('Order Submitted! 🎉', "Your wholesale order has been received. We'll confirm within 1 business day.");
    } catch (e: any) { Alert.alert('Error', e.message); } finally { setSubmitting(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: TEXT, fontSize: 26, fontFamily: 'Inter_700Bold' }}>Wholesale Catalog</Text>
          {cart.length > 0 && (
            <Pressable onPress={() => setShowCart(true)} style={[styles.cartBtn, { backgroundColor: BLUE, borderRadius: 12 }]}>
              <Feather name="shopping-cart" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{cart.reduce((s, e) => s + e.quantity, 0)}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.searchBar, { backgroundColor: BG, borderRadius: 12, borderColor: BORDER, borderWidth: 1 }]}>
          <Feather name="search" size={14} color={MUTED} />
          <TextInput
            style={{ flex: 1, color: TEXT, fontFamily: 'Inter_400Regular', fontSize: 14 }}
            placeholder="Search products..."
            placeholderTextColor={MUTED}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WHOLESALE_TIERS.map((tier) => (
            <View key={tier.label} style={[styles.tierTag, { backgroundColor: `${BLUE}12`, borderRadius: 10, borderWidth: 1, borderColor: `${BLUE}30` }]}>
              <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}</Text>
              {tier.discount > 0 && <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 10 }}>−{tier.discount * 100}%</Text>}
            </View>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={BLUE} /></View>
      ) : showCart ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
          <Text style={{ color: TEXT, fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }}>Order Summary</Text>

          {/* Cart items */}
          {cart.map((entry) => {
            const wsPrice = getWholesalePrice(getPrice(entry.product), entry.quantity);
            const palette = getPalette(entry.product.metadata?.category);
            return (
              <View key={entry.product.id} style={[styles.cartRow, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
                <View style={[styles.cartThumb, { backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }]}>
                  <Text style={{ fontSize: 22 }}>{palette.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{entry.product.name}</Text>
                  <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11 }}>Qty: {entry.quantity}</Text>
                  <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 2 }}>${wsPrice.toFixed(2)} ea · ${(wsPrice * entry.quantity).toFixed(2)} total</Text>
                </View>
                <Pressable onPress={() => removeFromCart(entry.product.id)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              </View>
            );
          })}

          {/* Total */}
          <View style={[styles.totalCard, { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER }]}>
            <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>Order Total</Text>
            <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 26 }}>${(totalCents / 100).toFixed(2)}</Text>
            {totalCents < 5000 && <Text style={{ color: '#EF4444', fontFamily: 'Inter_400Regular', fontSize: 12 }}>Minimum order $50 not met</Text>}
          </View>

          {/* Order type */}
          <Text style={styles.sectionLabel}>Fulfilment type</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[{ id: 'delivery', label: 'Delivery', icon: 'truck' }, { id: 'pickup', label: 'Pickup', icon: 'map-pin' }].map((t) => (
              <Pressable
                key={t.id}
                onPress={() => { setOrderType(t.id as any); setSelectedDate(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                style={[styles.typeBtn, {
                  borderColor: orderType === t.id ? BLUE : BORDER,
                  borderWidth: orderType === t.id ? 2 : 1,
                  backgroundColor: orderType === t.id ? `${BLUE}12` : CARD,
                  borderRadius: 12,
                }]}
              >
                <Feather name={t.icon as any} size={16} color={orderType === t.id ? BLUE : MUTED} />
                <Text style={{ color: orderType === t.id ? TEXT : MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Scheduling */}
          <Text style={styles.sectionLabel}>{orderType === 'delivery' ? 'Delivery day' : 'Pickup date & time'}</Text>

          {orderType === 'delivery' ? (
            <>
              <View style={[styles.infoRow, { backgroundColor: `${BLUE}12`, borderRadius: 10 }]}>
                <Feather name="truck" size={13} color={BLUE} />
                <Text style={{ color: BLUE, fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 }}>
                  Mon & Thu delivery · Monday orders close Sat 5pm
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {deliveryDates.map((slot) => {
                  const isSelected = selectedDate ? isSameDay(selectedDate, slot.date) : false;
                  return (
                    <Pressable
                      key={slot.date.toISOString()}
                      disabled={!slot.available}
                      onPress={() => { if (slot.available) { setSelectedDate(slot.date); Haptics.selectionAsync(); } }}
                      style={[styles.datePill, {
                        borderColor: isSelected ? BLUE : BORDER,
                        backgroundColor: isSelected ? BLUE : !slot.available ? '#F5F6FA' : CARD,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: slot.available ? 1 : 0.45,
                        borderRadius: 20,
                      }]}
                    >
                      <Text style={{ color: isSelected ? '#fff' : !slot.available ? MUTED : TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {slot.label}
                      </Text>
                      {slot.note && <Text style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{slot.note}</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={[styles.infoRow, { backgroundColor: `${BLUE}12`, borderRadius: 10 }]}>
                <Feather name="clock" size={13} color={BLUE} />
                <Text style={{ color: BLUE, fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 }}>
                  10am – 7pm · 30-min slots · At least 3 hrs ahead
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {pickupDates.map((d) => {
                  const isSelected = selectedDate ? isSameDay(selectedDate, d) : false;
                  const lbl = formatDateChip(sydNow, d);
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                      style={[styles.datePill, {
                        borderColor: isSelected ? BLUE : BORDER,
                        backgroundColor: isSelected ? BLUE : CARD,
                        borderWidth: isSelected ? 2 : 1,
                        borderRadius: 20,
                      }]}
                    >
                      <Text style={{ color: isSelected ? '#fff' : TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selectedDate && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Select a time</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {pickupTimes.length === 0 ? (
                      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 10 }}>
                        No slots available — choose another day
                      </Text>
                    ) : pickupTimes.map((mins) => {
                      const lbl = formatTime(mins);
                      const isSelected = selectedTimeMins === mins;
                      return (
                        <Pressable
                          key={mins}
                          onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                          style={[styles.datePill, {
                            borderColor: isSelected ? BLUE : BORDER,
                            backgroundColor: isSelected ? BLUE : CARD,
                            borderWidth: isSelected ? 2 : 1,
                            borderRadius: 20,
                          }]}
                        >
                          <Text style={{ color: isSelected ? '#fff' : TEXT, fontFamily: 'Inter_500Medium', fontSize: 13 }}>{lbl}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </>
          )}

          {/* PO Reference + Notes */}
          {[
            { label: 'PO Reference (optional)', key: 'poRef', setter: setPoRef, value: poRef, placeholder: 'e.g. PO-2024-001' },
            { label: 'Notes', key: 'notes', setter: setNotes, value: notes, placeholder: 'Delivery instructions, special requests...' },
          ].map((field) => (
            <View key={field.key}>
              <Text style={[styles.sectionLabel, { marginTop: 0 }]}>{field.label}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: CARD, color: TEXT, fontFamily: 'Inter_400Regular', borderRadius: 12, borderColor: BORDER, borderWidth: 1 }]}
                placeholder={field.placeholder}
                placeholderTextColor={MUTED}
                value={field.value}
                onChangeText={field.setter}
              />
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowCart(false)} style={{ flex: 1, padding: 16, backgroundColor: CARD, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_600SemiBold' }}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handlePlaceOrder}
              disabled={submitting || totalCents < 5000}
              style={{ flex: 2, padding: 16, backgroundColor: totalCents >= 5000 ? BLUE : '#C7C7CC', borderRadius: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{submitting ? 'Submitting...' : 'Place Order'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: cart.length > 0 ? 110 : 40 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Feather name="package" size={32} color={BORDER} />
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14 }}>No products available</Text>
            </View>
          }
          renderItem={({ item: product }) => (
            <ProductRow
              product={product}
              cartEntry={cart.find((e) => e.product.id === product.id)}
              onAdd={addToCart}
            />
          )}
        />
      )}

      {/* Floating cart bar — visible on catalog list when cart has items */}
      {cart.length > 0 && !showCart && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCart(true); }}
          style={[styles.floatingCart, { paddingBottom: insets.bottom + 10 }]}
        >
          <LinearGradient
            colors={['#40C0F2', '#2398D8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.floatingCartInner}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.floatingCartBadge}>
                <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }}>
                  {cart.reduce((s, e) => s + e.quantity, 0)}
                </Text>
              </View>
              <View>
                <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>View Cart</Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>
                  {cart.length} line item{cart.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17 }}>
                ${(totalCents / 100).toFixed(2)}
              </Text>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.85)" />
            </View>
          </LinearGradient>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, gap: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 42 },
  cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  tierTag: { paddingHorizontal: 10, paddingVertical: 6, gap: 2, alignItems: 'center' },
  productCard: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  productThumbLg: { height: 120 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cartThumb: { width: 48, height: 48 },
  totalCard: { padding: 16, gap: 4 },
  sectionLabel: { color: MUTED, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  datePill: { paddingHorizontal: 14, paddingVertical: 10 },
  input: { padding: 14, fontSize: 14 },
  floatingCart: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: 'rgba(245,246,250,0.95)',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  floatingCartInner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 15, borderRadius: 18,
    shadowColor: '#40C0F2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  floatingCartBadge: {
    backgroundColor: '#fff', borderRadius: 10, minWidth: 30, height: 30,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
});
