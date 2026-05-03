import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRODUCTS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';
import type { Product } from '@/types';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'bundles', label: 'Bundles' },
];

const wholesaleProducts = PRODUCTS.filter((p) => p.wholesalePrice && p.category !== 'coffee');

function PriceTierRow({ minQty, price, current }: { minQty: number; price: number; current: number }) {
  const isActive = current >= minQty;
  return (
    <View style={[styles.tierRow, { backgroundColor: isActive ? '#E8F4EE' : '#F4F7F5' }]}>
      <Text style={[styles.tierQty, { color: isActive ? '#1A3A2A' : '#6A9A7A' }]}>{minQty}+ units</Text>
      <Text style={[styles.tierPrice, { color: isActive ? '#2A6A4A' : '#9AB8A8', fontFamily: 'Inter_700Bold' }]}>
        ${price.toFixed(2)}/ea
      </Text>
      {isActive && <Feather name="check" size={12} color="#2A6A4A" />}
    </View>
  );
}

function WholesaleProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product, qty: number) => void }) {
  const colors = useColors();
  const [qty, setQty] = useState(12);
  const minTier = product.wholesalePriceTiers?.[0];
  const activePrice = product.wholesalePriceTiers?.slice().reverse().find((t) => qty >= t.minQty)?.price ?? product.wholesalePrice ?? product.price;
  const subtotal = qty * activePrice;

  return (
    <View style={[styles.productCard, { backgroundColor: '#fff', borderRadius: colors.radius, borderColor: '#C8DDD4' }]}>
      <View style={styles.cardTop}>
        <LinearGradient
          colors={product.gradient as [string, string]}
          style={[styles.swatch, { borderRadius: 10 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.productName, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>
            {product.name}
          </Text>
          <Text style={[styles.category, { color: '#6A9A7A' }]}>
            {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
          </Text>
          <Text style={[styles.retailNote, { color: '#9AB8A8' }]}>
            RRP ${product.price.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Price tiers */}
      {product.wholesalePriceTiers && (
        <View style={styles.tiers}>
          {product.wholesalePriceTiers.map((tier) => (
            <PriceTierRow key={tier.minQty} minQty={tier.minQty} price={tier.price} current={qty} />
          ))}
        </View>
      )}

      {/* Qty selector */}
      <View style={styles.qtyRow}>
        <View style={styles.qtyControls}>
          <Pressable
            onPress={() => { setQty((q) => Math.max(1, q - 12)); Haptics.selectionAsync(); }}
            style={[styles.qtyBtn, { borderColor: '#C8DDD4' }]}
          >
            <Feather name="minus" size={14} color="#2A6A4A" />
          </Pressable>
          <Text style={[styles.qtyValue, { color: '#1A3A2A', fontFamily: 'Inter_600SemiBold' }]}>{qty}</Text>
          <Pressable
            onPress={() => { setQty((q) => q + 12); Haptics.selectionAsync(); }}
            style={[styles.qtyBtn, { borderColor: '#C8DDD4' }]}
          >
            <Feather name="plus" size={14} color="#2A6A4A" />
          </Pressable>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.subtotalLabel, { color: '#6A9A7A' }]}>Subtotal</Text>
          <Text style={[styles.subtotal, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>
            ${subtotal.toFixed(2)}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => { onAdd(product, qty); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        style={[styles.addBtn, { backgroundColor: '#2A6A4A', borderRadius: colors.radius / 2 }]}
      >
        <Feather name="plus" size={15} color="#fff" />
        <Text style={[styles.addBtnText, { fontFamily: 'Inter_600SemiBold' }]}>Add to Order</Text>
      </Pressable>
    </View>
  );
}

export default function WholesaleCatalog() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const [added, setAdded] = useState<Record<string, number>>({});

  const filtered = filter === 'all' ? wholesaleProducts : wholesaleProducts.filter((p) => p.category === filter);

  const handleAdd = (product: Product, qty: number) => {
    setAdded((prev) => ({ ...prev, [product.id]: (prev[product.id] ?? 0) + qty }));
  };

  const totalItems = Object.values(added).reduce((a, b) => a + b, 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F8F5' }}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20, backgroundColor: '#F2F8F5' }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: '#1A3A2A', fontFamily: 'Inter_700Bold' }]}>Wholesale Catalog</Text>
            <Text style={[styles.subtitle, { color: '#6A9A7A' }]}>{filtered.length} products</Text>
          </View>
          {totalItems > 0 && (
            <View style={[styles.orderDraft, { backgroundColor: '#2A6A4A', borderRadius: 20 }]}>
              <Text style={[styles.orderDraftText, { fontFamily: 'Inter_600SemiBold' }]}>{totalItems} in draft</Text>
            </View>
          )}
        </View>

        <FlatList
          horizontal
          data={CATEGORIES}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { setFilter(item.id); Haptics.selectionAsync(); }}
              style={[
                styles.catPill,
                { backgroundColor: filter === item.id ? '#2A6A4A' : '#E8F4EE', borderRadius: 20 },
              ]}
            >
              <Text style={[styles.catText, { color: filter === item.id ? '#fff' : '#2A6A4A', fontFamily: 'Inter_500Medium' }]}>
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <WholesaleProductCard product={item} onAdd={handleAdd} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#C8DDD4',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  orderDraft: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  orderDraftText: {
    color: '#fff',
    fontSize: 13,
  },
  catScroll: {
    gap: 8,
    paddingBottom: 12,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  catText: {
    fontSize: 13,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  productCard: {
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#1A3A2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  swatch: {
    width: 56,
    height: 56,
  },
  productName: {
    fontSize: 15,
    marginBottom: 3,
  },
  category: {
    fontSize: 12,
    marginBottom: 2,
  },
  retailNote: {
    fontSize: 11,
  },
  tiers: {
    gap: 4,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tierQty: {
    flex: 1,
    fontSize: 12,
  },
  tierPrice: {
    fontSize: 13,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    fontSize: 18,
    minWidth: 36,
    textAlign: 'center',
  },
  subtotalLabel: {
    fontSize: 11,
  },
  subtotal: {
    fontSize: 18,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
  },
});
