import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCard } from '@/components/ProductCard';
import { useCart } from '@/context/CartContext';
import { PRODUCTS } from '@/data/mockData';
import { useColors } from '@/hooks/useColors';
import type { Product } from '@/types';

const CATEGORIES = [
  { id: 'all', label: 'All Items' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'bundles', label: 'Bundles' },
];

export default function MenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = PRODUCTS.filter((p) => {
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const available = filtered.filter((p) => p.available);
  const unavailable = filtered.filter((p) => !p.available);
  const displayList = [...available, ...unavailable];

  const handleAdd = (product: Product) => {
    addItem(product);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === 'web' ? 67 : insets.top + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
          Our Menu
        </Text>

        {/* Search */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, borderRadius: colors.radius },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder="Search menu..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Category pills */}
        <FlatList
          horizontal
          data={CATEGORIES}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setActiveCategory(item.id);
                Haptics.selectionAsync();
              }}
              style={[
                styles.catPill,
                {
                  backgroundColor: activeCategory === item.id ? colors.primary : colors.muted,
                  borderRadius: 20,
                },
              ]}
            >
              <Text
                style={[
                  styles.catText,
                  {
                    color: activeCategory === item.id ? '#fff' : colors.mutedForeground,
                    fontFamily: 'Inter_500Medium',
                  },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <FlatList
        data={displayList}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.itemWrap}>
            <ProductCard product={item} onAdd={handleAdd} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="coffee" size={40} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No items found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: {
    fontSize: 26,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 46,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  catScroll: {
    gap: 8,
  },
  catPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  catText: {
    fontSize: 13,
  },
  list: {
    padding: 20,
    gap: 12,
  },
  itemWrap: {
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
});
