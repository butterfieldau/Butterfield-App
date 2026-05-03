import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

export default function StaffProducts() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const [products, setProducts] = useState<Product[]>(PRODUCTS);

  const filtered = filter === 'all' ? products : products.filter((p) => p.category === filter);

  const toggleAvailability = (id: string, val: boolean) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, available: val } : p)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0D0604' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 80 : insets.top + 20 }]}>
        <Text style={[styles.title, { fontFamily: 'Inter_700Bold' }]}>Products</Text>
        <Text style={[styles.subtitle, { fontFamily: 'Inter_400Regular' }]}>
          {products.filter((p) => p.available).length} of {products.length} available
        </Text>
      </View>

      {/* Category filter */}
      <FlatList
        horizontal
        data={CATEGORIES}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catScroll}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setFilter(item.id);
              Haptics.selectionAsync();
            }}
            style={[
              styles.catPill,
              { backgroundColor: filter === item.id ? '#C8833A' : 'rgba(255,255,255,0.08)', borderRadius: 20 },
            ]}
          >
            <Text style={[styles.catText, { color: filter === item.id ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'Inter_500Medium' }]}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: product }) => (
          <View
            style={[
              styles.productRow,
              { backgroundColor: '#1A0A04', borderRadius: colors.radius, borderColor: 'rgba(255,255,255,0.06)' },
            ]}
          >
            <LinearGradient
              colors={product.gradient as [string, string]}
              style={[styles.swatch, { borderRadius: 10 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.nameRow}>
                <Text style={[styles.productName, { color: '#fff', fontFamily: 'Inter_600SemiBold' }]}>
                  {product.name}
                </Text>
                {product.isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newText}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.category, { color: 'rgba(255,255,255,0.4)' }]}>
                {product.category.charAt(0).toUpperCase() + product.category.slice(1)}
              </Text>
              <Text style={[styles.price, { color: '#C8833A', fontFamily: 'Inter_600SemiBold' }]}>
                ${product.price.toFixed(2)}
              </Text>
            </View>
            <View style={styles.toggleCol}>
              <Switch
                value={product.available}
                onValueChange={(val) => toggleAvailability(product.id, val)}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#C8833A50' }}
                thumbColor={product.available ? '#C8833A' : 'rgba(255,255,255,0.3)'}
                ios_backgroundColor="rgba(255,255,255,0.1)"
              />
              <Text style={[styles.toggleLabel, { color: product.available ? '#4ADE80' : 'rgba(255,255,255,0.3)' }]}>
                {product.available ? 'Live' : 'Off'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 2,
  },
  title: {
    color: '#fff',
    fontSize: 26,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },
  catScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  catText: {
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    gap: 8,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  swatch: {
    width: 52,
    height: 52,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productName: {
    fontSize: 14,
  },
  newBadge: {
    backgroundColor: '#C8833A20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newText: {
    color: '#C8833A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  category: {
    fontSize: 12,
  },
  price: {
    fontSize: 14,
  },
  toggleCol: {
    alignItems: 'center',
    gap: 4,
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
