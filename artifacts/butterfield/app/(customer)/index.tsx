import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCard } from '@/components/ProductCard';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { PRODUCTS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';
import type { Product } from '@/types';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'bundles', label: 'Bundles' },
];

export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addItem, totalItems } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');

  const popular = PRODUCTS.filter((p) => p.popular && p.available);
  const featured = PRODUCTS.filter((p) =>
    activeCategory === 'all' ? p.available : p.category === activeCategory && p.available
  );

  const handleAdd = (product: Product) => {
    addItem(product);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={['#C8833A', '#8B4513']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { fontFamily: 'Inter_400Regular' }]}>Good morning</Text>
            <Text style={[styles.greetingName, { fontFamily: 'Inter_700Bold' }]}>{firstName}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(customer)/cart')}
            style={styles.cartBtn}
          >
            <Feather name="shopping-bag" size={22} color="#fff" />
            {totalItems > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalItems}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Loyalty chip */}
        <View style={styles.loyaltyChip}>
          <Feather name="star" size={14} color="#C8833A" />
          <Text style={[styles.loyaltyText, { fontFamily: 'Inter_600SemiBold' }]}>
            {user?.loyaltyPoints?.toLocaleString() ?? 0} points
          </Text>
          <Text style={[styles.loyaltySub, { fontFamily: 'Inter_400Regular' }]}>
            · Silver member
          </Text>
        </View>
      </LinearGradient>

      {/* Hero Promo */}
      <Pressable
        style={[styles.promoBanner, { marginHorizontal: 20, marginTop: 20, borderRadius: colors.radius }]}
      >
        <LinearGradient
          colors={['#3D1F0D', '#7A3A18']}
          style={[styles.promoGradient, { borderRadius: colors.radius }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.promoContent}>
            <Text style={[styles.promoEyebrow, { fontFamily: 'Inter_500Medium' }]}>THIS WEEK ONLY</Text>
            <Text style={[styles.promoTitle, { fontFamily: 'Inter_700Bold' }]}>
              Buy 2 cookies,{'\n'}get 1 free
            </Text>
            <View style={styles.promoCta}>
              <Text style={[styles.promoCtaText, { fontFamily: 'Inter_600SemiBold' }]}>Order now</Text>
              <Feather name="arrow-right" size={14} color="#C8833A" />
            </View>
          </View>
          <View style={styles.promoDecor}>
            <LinearGradient
              colors={['#C8833A', '#E0A050']}
              style={styles.promoCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>
        </LinearGradient>
      </Pressable>

      {/* Popular */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            Fan Favourites
          </Text>
        </View>
        <FlatList
          data={popular}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View style={{ width: 180 }}>
              <ProductCard product={item} onAdd={handleAdd} />
            </View>
          )}
        />
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => {
              setActiveCategory(cat.id);
              Haptics.selectionAsync();
            }}
            style={[
              styles.categoryPill,
              {
                backgroundColor: activeCategory === cat.id ? colors.primary : colors.muted,
                borderRadius: 20,
              },
            ]}
          >
            <Text
              style={[
                styles.categoryText,
                {
                  color: activeCategory === cat.id ? '#fff' : colors.mutedForeground,
                  fontFamily: 'Inter_500Medium',
                },
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Product grid */}
      <View style={styles.grid}>
        {featured.map((product, index) => (
          <View key={product.id} style={styles.gridItem}>
            <ProductCard product={product} onAdd={handleAdd} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greeting: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  greetingName: {
    color: '#fff',
    fontSize: 24,
  },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C8833A',
  },
  loyaltyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  loyaltyText: {
    fontSize: 13,
    color: '#4A2410',
  },
  loyaltySub: {
    fontSize: 12,
    color: '#9A7B5A',
  },
  promoBanner: {
    overflow: 'hidden',
    shadowColor: '#4A2410',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  promoGradient: {
    flexDirection: 'row',
    padding: 20,
    overflow: 'hidden',
  },
  promoContent: {
    flex: 1,
    gap: 8,
  },
  promoEyebrow: {
    color: '#C8833A',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  promoTitle: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 26,
  },
  promoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  promoCtaText: {
    color: '#C8833A',
    fontSize: 13,
  },
  promoDecor: {
    justifyContent: 'center',
  },
  promoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
  },
  section: {
    marginTop: 24,
    gap: 14,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
  },
  categoryScroll: {
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 20,
    marginBottom: 4,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryText: {
    fontSize: 14,
  },
  grid: {
    paddingHorizontal: 20,
    gap: 12,
    marginTop: 12,
  },
  gridItem: {
    flex: 1,
  },
});
