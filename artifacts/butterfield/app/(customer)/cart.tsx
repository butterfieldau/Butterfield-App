import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, totalPrice, totalItems, updateQuantity, removeItem, clearCart } = useCart();
  const [orderPlaced, setOrderPlaced] = useState(false);

  const delivery = 0;
  const total = totalPrice + delivery;

  const handleCheckout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOrderPlaced(true);
    clearCart();
  };

  if (orderPlaced) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 100 : insets.top + 60 }]}>
        <LinearGradient colors={['#C8833A', '#8B4513']} style={styles.successIcon}>
          <Feather name="check" size={36} color="#fff" />
        </LinearGradient>
        <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          Order Placed!
        </Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
          Your order is being prepared.{'\n'}Estimated time: 10–15 minutes.
        </Text>
        <Pressable
          onPress={() => setOrderPlaced(false)}
          style={[styles.continueBtn, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <Text style={[styles.continueBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Continue Shopping</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 100 : insets.top + 60 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
          <Feather name="shopping-bag" size={36} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          Your cart is empty
        </Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          Add some delicious items from the menu
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          Your Cart
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {totalItems} item{totalItems !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <View
            key={item.product.id}
            style={[styles.cartItem, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}
          >
            <LinearGradient
              colors={item.product.gradient as [string, string]}
              style={[styles.itemSwatch, { borderRadius: 10 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {item.product.name}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.primary }]}>
                ${item.product.price.toFixed(2)} each
              </Text>
            </View>
            <View style={styles.qtyControls}>
              <Pressable
                onPress={() => {
                  updateQuantity(item.product.id, item.quantity - 1);
                  Haptics.selectionAsync();
                }}
                style={[styles.qtyBtn, { borderColor: colors.border }]}
              >
                <Feather name={item.quantity === 1 ? 'trash-2' : 'minus'} size={14} color={item.quantity === 1 ? '#DC2626' : colors.foreground} />
              </Pressable>
              <Text style={[styles.qty, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {item.quantity}
              </Text>
              <Pressable
                onPress={() => {
                  updateQuantity(item.product.id, item.quantity + 1);
                  Haptics.selectionAsync();
                }}
                style={[styles.qtyBtn, { borderColor: colors.border, backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        ))}

        {/* Summary */}
        <View style={[styles.summary, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>${totalPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Pickup</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>Free</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>${total.toFixed(2)}</Text>
          </View>
          <Text style={[styles.pointsEarn, { color: colors.mutedForeground }]}>
            You'll earn {Math.floor(total)} loyalty points with this order
          </Text>
        </View>
      </ScrollView>

      {/* Checkout */}
      <View style={[styles.checkoutBar, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 10, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable onPress={handleCheckout} style={[styles.checkoutBtn, { borderRadius: colors.radius }]}>
          <LinearGradient
            colors={['#C8833A', '#8B4513']}
            style={[styles.checkoutGradient, { borderRadius: colors.radius }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.checkoutText, { fontFamily: 'Inter_600SemiBold' }]}>
              Place Order · ${total.toFixed(2)}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 2,
  },
  title: {
    fontSize: 26,
  },
  subtitle: {
    fontSize: 14,
  },
  content: {
    padding: 20,
    gap: 10,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderWidth: 1,
  },
  itemSwatch: {
    width: 48,
    height: 48,
  },
  itemName: {
    fontSize: 14,
    marginBottom: 3,
  },
  itemPrice: {
    fontSize: 13,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 15,
    minWidth: 20,
    textAlign: 'center',
  },
  summary: {
    padding: 18,
    gap: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
  },
  summaryDivider: {
    height: 1,
  },
  totalLabel: {
    fontSize: 16,
  },
  totalValue: {
    fontSize: 18,
  },
  pointsEarn: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: -4,
  },
  checkoutBar: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  checkoutBtn: {
    overflow: 'hidden',
  },
  checkoutGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutText: {
    color: '#fff',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  successIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 26,
  },
  successSub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  continueBtn: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginTop: 8,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
  },
});
