import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

const ORDER_TYPES = [
  { id: 'pickup', label: 'Pickup', icon: 'map-pin' },
  { id: 'delivery', label: 'Delivery', icon: 'truck' },
];

function getSydneyNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
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
    const d = new Date(syd);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
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
  const sameDay =
    date.getDate() === syd.getDate() &&
    date.getMonth() === syd.getMonth() &&
    date.getFullYear() === syd.getFullYear();
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
    const d = new Date(syd);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
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

interface OrderConfirmation {
  orderId: string;
  total: number;
  type: string;
  scheduledLabel?: string;
}

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, totalPrice, totalItems, updateQuantity, removeItem, clearCart } = useCart();
  const queryClient = useQueryClient();

  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTimeMins, setSelectedTimeMins] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const sydNow = getSydneyNow();
  const pickupDates = getPickupDates();
  const deliveryDates = getDeliveryDates();
  const pickupTimes = selectedDate ? getPickupTimeMins(selectedDate, sydNow) : [];
  const totalCents = Math.round(totalPrice * 100);

  const handleCheckout = async () => {
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
    let scheduledLabel: string | undefined;

    if (orderType === 'pickup' && selectedDate && selectedTimeMins !== null) {
      const d = new Date(selectedDate);
      d.setHours(Math.floor(selectedTimeMins / 60), selectedTimeMins % 60, 0, 0);
      scheduledForDate = d;
      scheduledLabel = `Pickup ${formatDateChip(sydNow, selectedDate)} at ${formatTime(selectedTimeMins)}`;
    } else if (orderType === 'delivery' && selectedDate) {
      scheduledForDate = selectedDate;
      scheduledLabel = `Delivery on ${selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const orderItems = items.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        quantity: i.quantity,
        unitPriceCents: Math.round(i.product.price * 100),
        priceId: (i.product as any).priceId,
      }));

      const order = await api.orders.create({
        items: orderItems,
        type: orderType,
        scheduledFor: scheduledForDate?.toISOString(),
        notes: notes.trim() || undefined,
        totalCents,
      });

      clearCart();
      queryClient.invalidateQueries({ queryKey: ['loyalty-profile'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmation({ orderId: order.data.id, total: totalPrice, type: orderType, scheduledLabel });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmation) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 80 : insets.top + 40 }]}>
        <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={styles.successIcon}>
          <Feather name="check" size={36} color="#fff" />
        </LinearGradient>
        <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Order Received!</Text>
        <Text style={[styles.successOrderId, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
          #{confirmation.orderId.slice(0, 8).toUpperCase()}
        </Text>
        <View style={[styles.importantBox, { backgroundColor: '#FFF8E7', borderColor: '#F0A030', borderRadius: colors.radius }]}>
          <Feather name="alert-circle" size={18} color="#D97706" style={{ marginTop: 2 }} />
          <Text style={[styles.importantText, { fontFamily: 'Inter_500Medium' }]}>
            Your order is not ready until you receive confirmation from our team. Please wait for your notification before coming in.
          </Text>
        </View>
        {confirmation.scheduledLabel && (
          <View style={[styles.slotBox, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <Feather name="clock" size={16} color={colors.primary} />
            <Text style={[styles.slotText, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>{confirmation.scheduledLabel}</Text>
          </View>
        )}
        <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          Total: ${confirmation.total.toFixed(2)}
        </Text>
        <Pressable onPress={() => setConfirmation(null)} style={[styles.continueBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}>
          <Text style={[styles.continueBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Continue Shopping</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 80 : insets.top + 60 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
          <Feather name="shopping-bag" size={36} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Your cart is empty</Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Add something delicious from the menu</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold' }]}>Your Cart</Text>
          <Text style={[styles.headerSub, { fontFamily: 'Inter_400Regular' }]}>{totalItems} item{totalItems !== 1 ? 's' : ''}</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          {/* Order Type */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Order type</Text>
          <View style={styles.typeRow}>
            {ORDER_TYPES.map((t) => (
              <Pressable key={t.id}
                onPress={() => { setOrderType(t.id as any); setSelectedDate(null); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                style={[styles.typeBtn, { borderRadius: colors.radius, borderColor: orderType === t.id ? colors.primary : colors.border, borderWidth: orderType === t.id ? 2 : 1, backgroundColor: orderType === t.id ? colors.card : colors.background }]}>
                <Feather name={t.icon as any} size={18} color={orderType === t.id ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: orderType === t.id ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Scheduling */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {orderType === 'delivery' ? 'Delivery day' : 'Pickup date & time'}
          </Text>

          {orderType === 'delivery' ? (
            <>
              <View style={[styles.infoRow, { backgroundColor: '#E6F4FF', borderRadius: colors.radius }]}>
                <Feather name="truck" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary, fontFamily: 'Inter_500Medium' }]}>
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
                        borderRadius: 20,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : !slot.available ? colors.background : colors.card,
                        borderWidth: isSelected ? 2 : 1,
                        opacity: slot.available ? 1 : 0.5,
                      }]}
                    >
                      <Text style={[styles.datePillText, { color: isSelected ? '#fff' : !slot.available ? colors.mutedForeground : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                        {slot.label}
                      </Text>
                      {slot.note && (
                        <Text style={[styles.datePillSub, { color: colors.mutedForeground }]}>{slot.note}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={[styles.infoRow, { backgroundColor: '#E6F4FF', borderRadius: colors.radius }]}>
                <Feather name="clock" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary, fontFamily: 'Inter_500Medium' }]}>
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
                      key={d.toISOString()}
                      onPress={() => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
                      style={[styles.datePill, {
                        borderRadius: 20,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : colors.card,
                        borderWidth: isSelected ? 2 : 1,
                      }]}
                    >
                      <Text style={[styles.datePillText, { color: isSelected ? '#fff' : colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{lbl}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Time row */}
              {selectedDate && (
                <>
                  <Text style={[styles.subLabel, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>Select a time</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {pickupTimes.length === 0 ? (
                      <Text style={[styles.noSlots, { color: colors.mutedForeground }]}>No slots available — choose another day</Text>
                    ) : pickupTimes.map((mins) => {
                      const lbl = formatTime(mins);
                      const isSelected = selectedTimeMins === mins;
                      return (
                        <Pressable
                          key={mins}
                          onPress={() => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                          style={[styles.datePill, {
                            borderRadius: 20,
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? colors.primary : colors.card,
                            borderWidth: isSelected ? 2 : 1,
                          }]}
                        >
                          <Text style={[styles.datePillText, { color: isSelected ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>{lbl}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}
            </>
          )}

          {/* Cart Items */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Items</Text>
          {items.map((item) => (
            <View key={item.product.id} style={[styles.cartItem, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
              <LinearGradient colors={item.product.gradient} style={styles.cartItemImage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
              <View style={styles.cartItemInfo}>
                <Text style={[styles.cartItemName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{item.product.name}</Text>
                <Text style={[styles.cartItemPrice, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>${(item.product.price * item.quantity).toFixed(2)}</Text>
              </View>
              <View style={styles.qtyRow}>
                <Pressable onPress={() => { updateQuantity(item.product.id, item.quantity - 1); Haptics.selectionAsync(); }} style={[styles.qtyBtn, { backgroundColor: colors.muted, borderRadius: 8 }]}>
                  <Feather name="minus" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={[styles.qtyText, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>{item.quantity}</Text>
                <Pressable onPress={() => { updateQuantity(item.product.id, item.quantity + 1); Haptics.selectionAsync(); }} style={[styles.qtyBtn, { backgroundColor: colors.muted, borderRadius: 8 }]}>
                  <Feather name="plus" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
          ))}

          {/* Notes */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Notes</Text>
          <View style={[styles.notesInput, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <TextInput
              style={[styles.notesText, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
              placeholder="Any special requests or allergies..."
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Summary */}
          <View style={[styles.summary, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>Subtotal</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>${totalPrice.toFixed(2)}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 }]}>Total</Text>
              <Text style={[styles.summaryValue, { color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 18 }]}>${totalPrice.toFixed(2)}</Text>
            </View>
          </View>

          <Pressable onPress={handleCheckout} disabled={loading} style={[styles.checkoutBtn, { borderRadius: colors.radius }]}>
            <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.checkoutGradient, { borderRadius: colors.radius }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Feather name="credit-card" size={18} color="#fff" />
                  <Text style={[styles.checkoutText, { fontFamily: 'Inter_700Bold' }]}>Place Order · ${totalPrice.toFixed(2)}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Text style={[styles.stripeNote, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            🔒 Secured with Stripe · Apple Pay & Google Pay supported
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 4 },
  headerTitle: { color: '#fff', fontSize: 26 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  successTitle: { fontSize: 26, textAlign: 'center' },
  successOrderId: { fontSize: 14 },
  importantBox: { flexDirection: 'row', gap: 10, padding: 16, borderWidth: 1.5, alignSelf: 'stretch' },
  importantText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 20 },
  slotBox: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, alignSelf: 'stretch', justifyContent: 'center' },
  slotText: { fontSize: 14 },
  successSub: { fontSize: 16, textAlign: 'center' },
  continueBtn: { paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  continueBtnText: { color: '#fff', fontSize: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 20 },
  emptySub: { fontSize: 14 },
  label: { fontSize: 15, marginTop: 8 },
  subLabel: { fontSize: 13, marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  typeBtnLabel: { fontSize: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  infoText: { fontSize: 13, flex: 1 },
  datePill: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  datePillText: { fontSize: 13 },
  datePillSub: { fontSize: 10, marginTop: 2 },
  noSlots: { fontSize: 13, paddingVertical: 10 },
  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cartItemImage: { width: 48, height: 48, borderRadius: 10 },
  cartItemInfo: { flex: 1, gap: 2 },
  cartItemName: { fontSize: 14 },
  cartItemPrice: { fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 15, minWidth: 20, textAlign: 'center' },
  notesInput: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  notesText: { fontSize: 14, lineHeight: 20 },
  summary: { padding: 16, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14 },
  divider: { height: 1 },
  checkoutBtn: { overflow: 'hidden', marginTop: 8 },
  checkoutGradient: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  checkoutText: { color: '#fff', fontSize: 17 },
  stripeNote: { fontSize: 12, textAlign: 'center' },
});
