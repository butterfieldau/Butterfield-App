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

function getNextAvailableSlots(): { label: string; date: Date }[] {
  const slots: { label: string; date: Date }[] = [];
  const now = new Date();
  const minTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let d = new Date(minTime);
  while (slots.length < 4) {
    const day = d.getDay();
    if (day === 1) {
      const slot8 = new Date(d); slot8.setHours(8, 0, 0, 0);
      const slot12 = new Date(d); slot12.setHours(12, 0, 0, 0);
      const slot16 = new Date(d); slot16.setHours(16, 0, 0, 0);
      if (slot8 > minTime) slots.push({ label: `Mon ${slot8.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} 8am`, date: slot8 });
      if (slot12 > minTime && slots.length < 4) slots.push({ label: `Mon ${slot12.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} 12pm`, date: slot12 });
      if (slot16 > minTime && slots.length < 4) slots.push({ label: `Mon ${slot16.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} 4pm`, date: slot16 });
    }
    if (day === 4) {
      const slot8 = new Date(d); slot8.setHours(8, 0, 0, 0);
      const slot12 = new Date(d); slot12.setHours(12, 0, 0, 0);
      if (slot8 > minTime && slots.length < 4) slots.push({ label: `Thu ${slot8.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} 8am`, date: slot8 });
      if (slot12 > minTime && slots.length < 4) slots.push({ label: `Thu ${slot12.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} 12pm`, date: slot12 });
    }
    d.setDate(d.getDate() + 1);
    if (slots.length > 4) break;
    if (d.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1000) break;
  }
  return slots.slice(0, 4);
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
  const [selectedSlot, setSelectedSlot] = useState<{ label: string; date: Date } | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const slots = getNextAvailableSlots();
  const totalCents = Math.round(totalPrice * 100);

  const handleCheckout = async () => {
    if (!selectedSlot && orderType === 'delivery') {
      Alert.alert('Select a delivery slot', 'Please choose a delivery time to continue.');
      return;
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
        scheduledFor: selectedSlot?.date.toISOString(),
        notes: notes.trim() || undefined,
        totalCents,
      });

      clearCart();
      queryClient.invalidateQueries({ queryKey: ['loyalty-profile'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmation({
        orderId: order.data.id,
        total: totalPrice,
        type: orderType,
        scheduledLabel: selectedSlot?.label,
      });
    } catch (e: any) {
      Alert.alert('Order failed', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (confirmation) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 80 : insets.top + 40 }]}>
        <LinearGradient colors={['#C8833A', '#8B4513']} style={styles.successIcon}>
          <Feather name="check" size={36} color="#fff" />
        </LinearGradient>
        <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Order Received!</Text>
        <Text style={[styles.successOrderId, { color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }]}>
          #{confirmation.orderId.slice(0, 8).toUpperCase()}
        </Text>

        <View style={[styles.importantBox, { backgroundColor: '#FFF8E7', borderColor: '#F0A030', borderRadius: colors.radius }]}>
          <Feather name="alert-circle" size={18} color="#D97706" style={{ marginTop: 2 }} />
          <Text style={[styles.importantText, { fontFamily: 'Inter_500Medium' }]}>
            Your order is not ready until you receive confirmation from our team. Please wait for your pickup notification before coming in.
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
        <LinearGradient colors={['#C8833A', '#8B4513']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold' }]}>Your Cart</Text>
          <Text style={[styles.headerSub, { fontFamily: 'Inter_400Regular' }]}>{totalItems} item{totalItems !== 1 ? 's' : ''}</Text>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          {/* Order Type */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>Order type</Text>
          <View style={styles.typeRow}>
            {ORDER_TYPES.map((t) => (
              <Pressable key={t.id} onPress={() => { setOrderType(t.id as any); Haptics.selectionAsync(); }}
                style={[styles.typeBtn, { borderRadius: colors.radius, borderColor: orderType === t.id ? colors.primary : colors.border, borderWidth: orderType === t.id ? 2 : 1, backgroundColor: orderType === t.id ? colors.card : colors.background }]}>
                <Feather name={t.icon as any} size={18} color={orderType === t.id ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.typeBtnLabel, { color: orderType === t.id ? colors.foreground : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Delivery Slot */}
          <Text style={[styles.label, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
            {orderType === 'delivery' ? 'Delivery slot' : 'Pickup time'} <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>(Mon & Thu, 8am–4pm)</Text>
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {slots.map((slot) => (
              <Pressable key={slot.label} onPress={() => { setSelectedSlot(slot); Haptics.selectionAsync(); }}
                style={[styles.slotPill, {
                  borderRadius: 20, borderColor: selectedSlot?.label === slot.label ? colors.primary : colors.border,
                  backgroundColor: selectedSlot?.label === slot.label ? colors.primary : colors.card,
                  borderWidth: selectedSlot?.label === slot.label ? 2 : 1,
                }]}>
                <Text style={[styles.slotPillText, { color: selectedSlot?.label === slot.label ? '#fff' : colors.foreground, fontFamily: 'Inter_500Medium' }]}>{slot.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

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
            <LinearGradient colors={['#C8833A', '#8B4513']} style={[styles.checkoutGradient, { borderRadius: colors.radius }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
  typeRow: { flexDirection: 'row', gap: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  typeBtnLabel: { fontSize: 14 },
  slotPill: { paddingHorizontal: 16, paddingVertical: 10 },
  slotPillText: { fontSize: 13 },
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
