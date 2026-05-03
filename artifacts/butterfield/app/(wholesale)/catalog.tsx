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

function getSydneyNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
}

function formatDateChip(syd: Date, d: Date): string {
  if (d.getDate() === syd.getDate() && d.getMonth() === syd.getMonth() && d.getFullYear() === syd.getFullYear()) return 'Today';
  const tom = new Date(syd); tom.setDate(syd.getDate() + 1);
  if (d.getDate() === tom.getDate() && d.getMonth() === tom.getMonth()) return 'Tomorrow';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getPickupDates(): Date[] {
  const syd = getSydneyNow();
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(syd); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
    if (i === 0) {
      const nowMins = syd.getHours() * 60 + syd.getMinutes();
      if (nowMins + 180 <= 19 * 60) dates.push(d);
    } else {
      dates.push(d);
    }
  }
  return dates;
}

function getPickupTimeMins(date: Date, syd: Date): number[] {
  const sameDay = date.getDate() === syd.getDate() && date.getMonth() === syd.getMonth() && date.getFullYear() === syd.getFullYear();
  const minAllowed = sameDay ? syd.getHours() * 60 + syd.getMinutes() + 180 : 0;
  const slots: number[] = [];
  for (let h = 10; h <= 19; h++) {
    const limit = h === 19 ? 1 : 60;
    for (let m = 0; m < limit; m += 30) {
      const t = h * 60 + m;
      if (t >= minAllowed) slots.push(t);
    }
  }
  return slots;
}

interface DeliveryDate { date: Date; label: string; available: boolean; note?: string }

function getDeliveryDates(): DeliveryDate[] {
  const syd = getSydneyNow();
  const results: DeliveryDate[] = [];
  for (let i = 1; i <= 28 && results.length < 6; i++) {
    const d = new Date(syd); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const label = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    if (day === 1) {
      const cutoff = new Date(d); cutoff.setDate(d.getDate() - 2); cutoff.setHours(17, 0, 0, 0);
      const available = syd.getTime() < cutoff.getTime();
      results.push({ date: d, label, available, note: available ? undefined : 'Order closed (Sat 5pm)' });
    } else if (day === 4) {
      results.push({ date: d, label, available: true });
    }
  }
  return results;
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

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

function ProductRow({ product, cartEntry, onAdd }: { product: ApiProduct; cartEntry?: CartEntry; onAdd: (product: ApiProduct, qty: number) => void }) {
  const [qty, setQty] = useState('12');
  const basePrice = getPrice(product);
  const parsedQty = parseInt(qty) || 1;
  const wsPrice = getWholesalePrice(basePrice, parsedQty);
  const tier = [...WHOLESALE_TIERS].reverse().find((t) => parsedQty >= t.minQty);
  return (
    <View style={[styles.productCard, { backgroundColor: CARD, borderRadius: 14 }]}>
      <LinearGradient colors={getGradient(product)} style={styles.productThumbLg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {cartEntry && (
          <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 11 }}>In cart: {cartEntry.quantity}</Text>
          </View>
        )}
      </LinearGradient>
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{product.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>{product.description}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 16 }}>${wsPrice.toFixed(2)}</Text>
            {tier && tier.discount > 0 && (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter_400Regular', fontSize: 10, textDecorationLine: 'line-through' }}>${basePrice.toFixed(2)}</Text>
            )}
          </View>
        </View>
        {tier && (
          <View style={{ backgroundColor: `${ACCENT}22`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
            <Text style={{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}{tier.discount > 0 ? ` −${tier.discount * 100}%` : ''}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0A1A0A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flex: 1 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 12 }}>Qty:</Text>
            <TextInput
              style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 16, flex: 1 }}
              value={qty}
              onChangeText={setQty}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>
          <Pressable
            onPress={() => onAdd(product, parsedQty)}
            style={{ backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}
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
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={{ color: '#fff', fontSize: 26, fontFamily: 'Inter_700Bold' }}>Wholesale Catalog</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[styles.searchBar, { flex: 1, backgroundColor: CARD, borderRadius: 12 }]}>
            <Feather name="search" size={14} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={{ flex: 1, color: '#fff', fontFamily: 'Inter_400Regular', fontSize: 14 }}
              placeholder="Search products..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={search}
              onChangeText={setSearch}
            />
          </View>
          {cart.length > 0 && (
            <Pressable onPress={() => setShowCart(true)} style={[styles.cartBtn, { backgroundColor: ACCENT, borderRadius: 12 }]}>
              <Feather name="shopping-cart" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 13 }}>{cart.reduce((s, e) => s + e.quantity, 0)}</Text>
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {WHOLESALE_TIERS.map((tier) => (
            <View key={tier.label} style={[styles.tierTag, { backgroundColor: CARD, borderRadius: 10 }]}>
              <Text style={{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>{tier.label}</Text>
              {tier.discount > 0 && <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 10 }}>−{tier.discount * 100}%</Text>}
            </View>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} /></View>
      ) : showCart ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
          <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 4 }}>Order Summary</Text>

          {/* Cart items */}
          {cart.map((entry) => {
            const wsPrice = getWholesalePrice(getPrice(entry.product), entry.quantity);
            return (
              <View key={entry.product.id} style={[styles.cartRow, { backgroundColor: CARD, borderRadius: 14 }]}>
                <LinearGradient colors={getGradient(entry.product)} style={styles.cartThumb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{entry.product.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 11 }}>Qty: {entry.quantity}</Text>
                  <Text style={{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 12, marginTop: 2 }}>${wsPrice.toFixed(2)} ea · ${(wsPrice * entry.quantity).toFixed(2)} total</Text>
                </View>
                <Pressable onPress={() => removeFromCart(entry.product.id)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              </View>
            );
          })}

          {/* Total */}
          <View style={[styles.totalCard, { backgroundColor: CARD, borderRadius: 14 }]}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 13 }}>Order Total</Text>
            <Text style={{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 24 }}>${(totalCents / 100).toFixed(2)}</Text>
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
                  borderColor: orderType === t.id ? ACCENT : 'rgba(255,255,255,0.12)',
                  borderWidth: orderType === t.id ? 2 : 1,
                  backgroundColor: orderType === t.id ? `${ACCENT}22` : CARD,
                  borderRadius: 12,
                }]}
              >
                <Feather name={t.icon as any} size={16} color={orderType === t.id ? ACCENT : 'rgba(255,255,255,0.4)'} />
                <Text style={{ color: orderType === t.id ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Scheduling */}
          <Text style={styles.sectionLabel}>{orderType === 'delivery' ? 'Delivery day' : 'Pickup date & time'}</Text>

          {orderType === 'delivery' ? (
            <>
              <View style={[styles.infoRow, { backgroundColor: `${ACCENT}22`, borderRadius: 10 }]}>
                <Feather name="truck" size={13} color={ACCENT} />
                <Text style={{ color: ACCENT, fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 }}>
                  Mon & Thu delivery · Monday orders close Sat 5pm
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {deliveryDates.map((slot) => {
                  const isSelected = selectedDate ? isSameDay(selectedDate, slot.date) : false;
                  return (
                    <Pressable
                      key={slot.label}
                      disabled={!slot.available}
                      onPress={() => { if (slot.available) { setSelectedDate(slot.date); Haptics.selectionAsync(); } }}
                      style={[styles.datePill, {
                        borderColor: isSelected ? ACCENT : 'rgba(255,255,255,0.12)',
                        backgroundColor: isSelected ? ACCENT : !slot.available ? 'rgba(255,255,255,0.03)' : CARD,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: slot.available ? 1 : 0.45,
                        borderRadius: 20,
                      }]}
                    >
                      <Text style={{ color: isSelected ? '#fff' : !slot.available ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                        {slot.label}
                      </Text>
                      {slot.note && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>{slot.note}</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={[styles.infoRow, { backgroundColor: `${ACCENT}22`, borderRadius: 10 }]}>
                <Feather name="clock" size={13} color={ACCENT} />
                <Text style={{ color: ACCENT, fontFamily: 'Inter_500Medium', fontSize: 12, flex: 1 }}>
                  10am – 7pm · 30-min slots · At least 3 hrs ahead
                </Text>
              </View>
              {/* Date row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {pickupDates.map((d) => {
                  const isSelected = selectedDate ? isSameDay(selectedDate, d) : false;
                  const lbl = formatDateChip(sydNow, d);
                  return (
                    <Pressable
                      key={lbl}
                      onPress={() => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                      style={[styles.datePill, {
                        borderColor: isSelected ? ACCENT : 'rgba(255,255,255,0.12)',
                        backgroundColor: isSelected ? ACCENT : CARD,
                        borderWidth: isSelected ? 2 : 1,
                        borderRadius: 20,
                      }]}
                    >
                      <Text style={{ color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* Time row */}
              {selectedDate && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 0 }]}>Select a time</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {pickupTimes.length === 0 ? (
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 10 }}>
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
                            borderColor: isSelected ? ACCENT : 'rgba(255,255,255,0.12)',
                            backgroundColor: isSelected ? ACCENT : CARD,
                            borderWidth: isSelected ? 2 : 1,
                            borderRadius: 20,
                          }]}
                        >
                          <Text style={{ color: isSelected ? '#fff' : 'rgba(255,255,255,0.8)', fontFamily: 'Inter_500Medium', fontSize: 13 }}>{lbl}</Text>
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
                style={[styles.input, { backgroundColor: CARD, color: '#fff', fontFamily: 'Inter_400Regular', borderRadius: 12 }]}
                placeholder={field.placeholder}
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={field.value}
                onChangeText={field.setter}
              />
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setShowCart(false)} style={{ flex: 1, padding: 16, backgroundColor: CARD, borderRadius: 14, alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_600SemiBold' }}>Back</Text>
            </Pressable>
            <Pressable
              onPress={handlePlaceOrder}
              disabled={submitting || totalCents < 5000}
              style={{ flex: 2, padding: 16, backgroundColor: totalCents >= 5000 ? ACCENT : '#2A4A2A', borderRadius: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{submitting ? 'Submitting...' : 'Place Order'}</Text>
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
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter_400Regular', fontSize: 14 }}>No products available</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <ProductRow product={p} cartEntry={cart.find((e) => e.product.id === p.id)} onAdd={addToCart} />
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
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  datePill: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
});
