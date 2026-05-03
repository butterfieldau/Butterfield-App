import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useQuery } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { api, type ApiProduct } from '@/lib/api';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'sandwiches', label: 'Food' },
  { id: 'bundles', label: 'Bundles' },
];

function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}

function getTags(p: ApiProduct): string[] {
  const raw = p.metadata?.tags;
  if (raw) return raw.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4);
  return getPalette(p.metadata?.category).defaultTags.slice(0, 4);
}

function ProductTile({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const price = getPrice(product);
  const palette = getPalette(product.metadata?.category);
  const tags = getTags(product);
  const available = product.metadata?.available !== 'false';

  return (
    <Pressable
      onPress={() => { if (available) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[styles.tile, { opacity: available ? 1 : 0.6 }]}
    >
      {/* Image area */}
      <View style={[styles.tileTop, { backgroundColor: palette.bg }]}>
        {/* NEW badge */}
        {product.metadata?.isNew === 'true' && (
          <View style={[styles.newBadge, { backgroundColor: '#1C1C1E' }]}>
            <Text style={[styles.newBadgeText, { fontFamily: 'Inter_700Bold' }]}>NEW</Text>
          </View>
        )}

        {/* Price — top right */}
        <View style={styles.priceBadge}>
          <Text style={[styles.priceText, { fontFamily: 'Inter_700Bold' }]}>${price.toFixed(0)}</Text>
        </View>

        {/* Product emoji */}
        <Text style={styles.tileEmoji}>{palette.emoji}</Text>

        {/* Sold-out overlay */}
        {!available && (
          <View style={styles.soldOut}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Sold Out</Text>
          </View>
        )}

        {/* Bottom banner strip */}
        <View style={[styles.bannerStrip, { backgroundColor: palette.banner }]}>
          <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium', color: palette.bannerText }]} numberOfLines={1}>
            In-store Pickup · Merrylands
          </Text>
        </View>
      </View>

      {/* Info area */}
      <View style={styles.tileBottom}>
        <View style={styles.nameRow}>
          <Text style={[styles.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{product.name}</Text>
          <Pressable onPress={() => { if (available) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}>
            <Text style={[styles.orderNow, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>Order Now ↗</Text>
          </Pressable>
        </View>

        {/* Tag chips */}
        <View style={styles.tagsRow}>
          {tags.map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: `${palette.bg}55` }]}>
              <Text style={[styles.tagText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });

  const products = data?.data ?? [];
  const filtered = useMemo(() => products.filter((p) => {
    const matchCat = activeCategory === 'all' || p.metadata?.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, activeCategory, search]);

  const handleTilePress = (p: ApiProduct) => {
    setSelectedProduct(p);
    router.push('/product');
  };

  const activePalette = getPalette(activeCategory === 'all' ? 'default' : activeCategory);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: '#fff' }]}>
        <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold', color: '#1C1C1E' }]}>Menu</Text>
        <View style={[styles.searchBar, { backgroundColor: '#F5F6FA', borderRadius: 14 }]}>
          <Feather name="search" size={16} color="#8E8E93" />
          <TextInput
            style={[styles.searchInput, { fontFamily: 'Inter_400Regular', color: '#1C1C1E' }]}
            placeholder="Search cookies, coffee..."
            placeholderTextColor="#8E8E93"
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color="#8E8E93" /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
          {CATEGORIES.map((cat) => {
            const pal = getPalette(cat.id === 'all' ? 'default' : cat.id);
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => { setActiveCategory(cat.id); Haptics.selectionAsync(); }}
                style={[styles.catPill, {
                  backgroundColor: active ? pal.banner : '#F5F6FA',
                  borderRadius: 20,
                }]}
              >
                <Text style={[styles.catLabel, {
                  color: active ? '#fff' : '#8E8E93',
                  fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium',
                }]}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#40C0F2" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#40C0F2" />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
              <Feather name="search" size={28} color="#D0D0D0" />
              <Text style={{ color: '#8E8E93', fontFamily: 'Inter_400Regular', fontSize: 14 }}>No items found.</Text>
            </View>
          }
          renderItem={({ item: p }) => (
            <View style={{ flex: 1 }}>
              <ProductTile product={p} onPress={() => handleTilePress(p)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F6FA' },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  headerTitle: { fontSize: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8 },
  catLabel: { fontSize: 13 },

  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  tileTop: {
    height: 150,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 54, lineHeight: 64 },
  newBadge: {
    position: 'absolute', top: 8, left: 8,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  newBadgeText: { color: '#fff', fontSize: 9 },
  priceBadge: {
    position: 'absolute', top: 8, right: 8,
  },
  priceText: { fontSize: 16, color: '#1C1C1E' },
  soldOut: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerStrip: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingVertical: 5, paddingHorizontal: 8,
    alignItems: 'center',
  },
  bannerText: { fontSize: 10, letterSpacing: 0.2 },

  tileBottom: {
    padding: 10, gap: 8, backgroundColor: '#fff',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  tileName: { fontSize: 13, color: '#1C1C1E', flex: 1 },
  orderNow: { fontSize: 10, textDecorationLine: 'underline' },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 9 },
});
