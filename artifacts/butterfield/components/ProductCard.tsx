import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import type { Product } from '@/types';

interface ProductCardProps {
  product: Product;
  onAdd?: (product: Product) => void;
  showWholesalePrice?: boolean;
  minQty?: number;
  compact?: boolean;
}

export function ProductCard({ product, onAdd, showWholesalePrice, minQty = 1, compact }: ProductCardProps) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    if (!product.available) return;
    scale.value = withSpring(0.95, { duration: 100 }, () => {
      scale.value = withSpring(1, { duration: 150 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd?.(product);
  }, [product, onAdd, scale]);

  const displayPrice = showWholesalePrice && product.wholesalePrice
    ? product.wholesalePrice
    : product.price;

  if (compact) {
    return (
      <Animated.View style={[animatedStyle, { flex: 1 }]}>
        <Pressable
          onPress={handlePress}
          style={[
            styles.compactCard,
            { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
            !product.available && { opacity: 0.5 },
          ]}
        >
          <LinearGradient
            colors={product.gradient as [string, string]}
            style={[styles.compactGradient, { borderRadius: colors.radius - 2 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.compactContent}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.compactName, { color: colors.foreground }]} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={[styles.compactPrice, { color: colors.primary }]}>
                ${displayPrice.toFixed(2)}
              </Text>
            </View>
            {onAdd && (
              <Pressable
                onPress={handlePress}
                style={[styles.addBtnSmall, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[animatedStyle, styles.card, { shadowColor: colors.accent }]}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.cardInner,
          { backgroundColor: colors.card, borderRadius: colors.radius },
          !product.available && { opacity: 0.5 },
        ]}
      >
        <LinearGradient
          colors={product.gradient as [string, string]}
          style={[styles.cardGradient, { borderTopLeftRadius: colors.radius, borderTopRightRadius: colors.radius }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {product.isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          {!product.available && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableText}>Sold Out</Text>
            </View>
          )}
        </LinearGradient>
        <View style={styles.cardContent}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.productName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
              {product.name}
            </Text>
            <Text style={[styles.productDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
              {product.description}
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <View>
              <Text style={[styles.price, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                ${displayPrice.toFixed(2)}
              </Text>
              {showWholesalePrice && minQty > 1 && (
                <Text style={[styles.minQty, { color: colors.mutedForeground }]}>
                  min {minQty} units
                </Text>
              )}
            </View>
            {onAdd && product.available && (
              <Pressable
                onPress={handlePress}
                style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: colors.radius / 2 }]}
              >
                <Feather name="plus" size={18} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardInner: {
    overflow: 'hidden',
  },
  cardGradient: {
    height: 130,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 12,
  },
  cardContent: {
    padding: 14,
    gap: 8,
  },
  productName: {
    fontSize: 15,
    marginBottom: 3,
  },
  productDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  price: {
    fontSize: 17,
  },
  minQty: {
    fontSize: 10,
  },
  addBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C8833A',
    letterSpacing: 1,
  },
  unavailableBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  unavailableText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  compactCard: {
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  compactGradient: {
    height: 70,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  compactName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  compactPrice: {
    fontSize: 13,
    fontWeight: '700',
  },
  addBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
