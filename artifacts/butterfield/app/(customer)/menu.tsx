import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api, type ApiProduct } from '@/lib/api';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'sandwiches', label: 'Food' },
  { id: 'bundles', label: 'Bundles' },
];

function getPrice(p: ApiProduct): number { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }
function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  return g?.length === 2 ? [g[0], g[1]] : ['#4B72C4', '#3A5BA8'];
}

export default function MenuScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItem } = useCart();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({ queryKey: ['products'], queryFn: () => api.products.list(), retry: 2 });

  const products = data?.data ?? [];
  const filtered = useMemo(() => products.filter((p) => {
    const matchCat = activeCategory === 'all' || p.metadata?.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, activeCategory, search]);

  const handleAdd = (p: ApiProduct) => {
    addItem({ id: p.id, name: p.name, category: (p.metadata?.category ?? 'cookies') as any, price: getPrice(p), description: p.description, available: p.metadata?.available !== 'false', gradient: getGradient(p), priceId: p.prices?.[0]?.id });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleProductPress = (p: ApiProduct) => {
    Haptics.selectionAsync();
    router.push(`/(customer)/product/${p.id}` as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={['#4B72C4', '#3058A8']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[styles.headerTitle, { fontFamily: 'Inter_700Bold' }]}>Menu</Text>
        <View style={[styles.searchBar, { backgroundColor: '#fff', borderRadius: colors.radius }]}>
          <Feather name="search" size={16} color="#4B72C4" />
          <TextInput style={[styles.searchInput, { fontFamily: 'Inter_400Regular', color: '#1C1C1E' }]}
            placeholder="Search cookies, coffee..." placeholderTextColor="#8E8E93" value={search} onChangeText={setSearch} />
          {search ? <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color="#8E8E93" /></Pressable> : null}
        </View>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => { setActiveCategory(item.id); Haptics.selectionAsync(); }}
              style={[styles.catPill, { backgroundColor: activeCategory === item.id ? '#fff' : 'rgba(255,255,255,0.2)', borderRadius: 20 }]}>
              <Text style={[styles.catLabel, { color: activeCategory === item.id ? '#4B72C4' : '#fff', fontFamily: 'Inter_600SemiBold' }]}>{item.label}</Text>
            </Pressable>
          )}
        />
      </LinearGradient>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>No items found.</Text>}
          renderItem={({ item: p }) => {
            const available = p.metadata?.available !== 'false';
            const price = getPrice(p);
            const gradient = getGradient(p);
            return (
              <Pressable style={[styles.tile, { flex: 1, backgroundColor: colors.card, borderRadius: colors.radius }]} onPress={() => handleProductPress(p)}>
                <LinearGradient colors={gradient} style={[styles.tileImage, { borderRadius: colors.radius - 2 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  {p.metadata?.isNew === 'true' && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                  {!available && <View style={styles.soldOut}><Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Sold Out</Text></View>}
                </LinearGradient>
                <View style={{ gap: 4, padding: 2 }}>
                  <Text style={[styles.tileName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.tileDesc, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>{p.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={[{ color: colors.primary, fontFamily: 'Inter_700Bold', fontSize: 14 }]}>${price.toFixed(2)}</Text>
                    {available && (
                      <Pressable onPress={(e) => { e.stopPropagation?.(); handleAdd(p); }} style={[{ backgroundColor: colors.primary, borderRadius: 10, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }]}>
                        <Feather name="plus" size={14} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  headerTitle: { color: '#fff', fontSize: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7 },
  catLabel: { fontSize: 13 },
  tile: { padding: 12, gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tileImage: { width: '100%', height: 90, alignItems: 'flex-start', justifyContent: 'flex-start', padding: 6 },
  newBadge: { backgroundColor: '#4B72C4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' },
  soldOut: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tileName: { fontSize: 13 },
  tileDesc: { fontSize: 11, lineHeight: 15 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14 },
});
