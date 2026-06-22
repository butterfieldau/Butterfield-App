import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusStatusBar } from '@/hooks/useScrollStatusBar';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useCart } from '@/context/CartContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiProduct, type ProductCategory } from '@/lib/api';
import SharedProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { MenuShimmerGrid } from '@/components/customer/MenuShimmerGrid';
import { DietaryTagFilter } from '@/components/customer/DietaryTagFilter';
import { CategoryFilterBar } from '@/components/customer/CategoryFilterBar';

const BLUE   = '#40C0F2';
const CHERRY = '#D20001';

const CAT_ICON_MAP: Record<string, string> = {
  coffee: 'coffee', matcha: 'mc:leaf', tea: 'mc:cup-water', cookies: 'mc:cookie-outline',
  'cold-drinks': 'mc:snowflake', 'soft-serve': 'mc:ice-cream', specials: 'zap', seasonal: 'sun',
  merch: 'tag', boxes: 'svg:box', desserts: 'mc:cake-variant-outline', sandwiches: 'layers',
  pastries: 'mc:croissant', drinks: 'droplet', bundles: 'gift', milkshakes: 'svg:milkshake',
  fusions: 'svg:fusion', 'iced-drinks': 'svg:iced-drink', 'cookie-frappes': 'svg:frappe',
};
const DIETARY_ICONS: Record<string, string> = {
  Vegan: '🌱', Vegetarian: '🥦', 'Gluten-Free': '🌾', 'Dairy-Free': '🥛', 'Nut-Free': '🥜',
};
function toCategoryImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${url}` : null;
}
function parseArr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val) {
    try { const r = JSON.parse(val); if (Array.isArray(r)) return r; } catch {}
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}



export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  useFocusStatusBar('dark-content');
  const { addItemToCart } = useCart();
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch]                   = useState('');
  const [activeCategory, setActiveCategory]   = useState(params.category ?? 'all');
  const [userChangedCategory, setUserChangedCategory] = useState(false);
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<string[]>([]);

  const { width, height } = useWindowDimensions();
  const isTablet    = width >= 768;
  const isLandscape = isTablet && width > height;
  const numColumns  = isLandscape ? 4 : isTablet ? 3 : 2;
  const hPad        = isTablet ? (isLandscape ? 28 : 24) : 16;
  const tileGap     = isTablet ? 14 : 12;
  const qc          = useQueryClient();

  useEffect(() => {
    if (params.category) { setActiveCategory(params.category); setSelectedDietaryTags([]); }
  }, [params.category]);

  const { data, isLoading, refetch } = useQuery({ queryKey: ['products'], queryFn: () => api.products.list(), staleTime: 0, retry: 2 });
  const { refreshing, onRefresh }    = useRefreshControl(refetch);
  const { data: categoriesData }     = useQuery({ queryKey: ['categories'], queryFn: () => api.products.categories(), staleTime: 0 });

  const categories = useMemo(() => {
    const backendCats: ProductCategory[] = categoriesData?.data ?? [];
    const items = backendCats.map(c => ({
      id: c.slug, label: c.name,
      icon: (CAT_ICON_MAP[c.slug] ?? 'tag') as string,
      imageUrl: toCategoryImageUrl(c.imageUrl),
      color: c.color ?? null,
    }));
    return [...items, { id: 'all', label: 'All', icon: 'grid' as string, imageUrl: null, color: null }];
  }, [categoriesData]);

  useEffect(() => {
    if (!params.category && !userChangedCategory && categories.length > 1) {
      setActiveCategory(categories[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const listRef = useRef(null);
  useScrollToTop(listRef);

  const shimmerProgress = useSharedValue(0);
  const contentOpacity  = useSharedValue(isLoading ? 0 : 1);
  useEffect(() => {
    if (isLoading) {
      contentOpacity.value = 0;
      shimmerProgress.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      cancelAnimation(shimmerProgress);
      contentOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    }
  }, [isLoading]);
  const contentAnimStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const products = data?.data ?? [];

  // Build a set of slugs that are visible to customers. When no categories
  // have loaded yet (null) we skip the filter so nothing disappears on first load.
  const visibleSlugs = useMemo<Set<string> | null>(() => {
    const backendCats: ProductCategory[] = categoriesData?.data ?? [];
    if (!categoriesData || backendCats.length === 0) return null;
    return new Set(backendCats.map(c => c.slug));
  }, [categoriesData]);

  const categoryFiltered = useMemo(() => products.filter(p => {
    const cat = p.metadata?.category as string | undefined;
    // Hide products whose category has been disabled by the director.
    if (visibleSlugs && cat && !visibleSlugs.has(cat)) return false;
    const matchCat    = activeCategory === 'all' || cat === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, activeCategory, search, visibleSlugs]);

  const availableChips = useMemo(() => {
    const tagSet = new Set<string>();
    for (const p of categoryFiltered) {
      const tags = p.dietaryTags ?? parseArr(p.metadata?.dietaryTags);
      for (const t of tags) if (t) tagSet.add(t);
    }
    return Object.keys(DIETARY_ICONS).filter(k => tagSet.has(k));
  }, [categoryFiltered]);

  const filtered = useMemo(() => {
    if (selectedDietaryTags.length === 0) return categoryFiltered;
    return categoryFiltered.filter(p => {
      const tags = p.dietaryTags ?? parseArr(p.metadata?.dietaryTags);
      return selectedDietaryTags.every(t => tags.includes(t));
    });
  }, [categoryFiltered, selectedDietaryTags]);

  const catalogHasDietaryTags = useMemo(
    () => products.some(p => (p.dietaryTags ?? parseArr(p.metadata?.dietaryTags)).length > 0),
    [products],
  );

  const toggleDietaryTag = (tag: string) => {
    setSelectedDietaryTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const handleTilePress = (p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    qc.prefetchQuery({ queryKey: ['product-detail-route', p.id], queryFn: () => api.products.get(p.id), staleTime: 60_000 });
    setSelectedProduct(p);
    router.push({ pathname: '/product', params: { id: p.id } } as any);
  };
  const handleAddToCart = (p: ApiProduct) => {
    const raw = p as any;
    addItemToCart({
      productId: p.id, productName: p.name,
      variantId: undefined, variantName: undefined,
      basePriceCents: raw.priceCents ?? p.prices?.[0]?.unit_amount ?? 0,
      selectedOptions: [], quantity: 1,
      imageUrl: p.images?.[0] ?? PRODUCT_IMAGES[p.name],
      category: p.metadata?.category,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <OfflineBanner />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16, paddingHorizontal: hPad }]}>
        <View style={s.headerTop}>
          <Text style={[s.headerTitle, { fontWeight: '700', fontSize: isTablet ? 36 : 32 }]}>Menu</Text>
        </View>

        {/* Search */}
        <View style={[s.searchBar, isTablet && { height: 50, borderRadius: 18 }]}>
          <Feather name="search" size={16} color="#8E8E93" />
          <TextInput
            style={[s.searchInput, { fontWeight: '400', fontSize: isTablet ? 16 : 15 }]}
            placeholder="Search cookies, coffee…"
            placeholderTextColor="#8E8E93"
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color="#8E8E93" /></Pressable> : null}
        </View>

        {/* Category carousel */}
        <CategoryFilterBar
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={(id) => {
            setUserChangedCategory(true);
            setActiveCategory(id);
            setSearch('');
            setSelectedDietaryTags([]);
          }}
          isTablet={isTablet}
        />

        {/* Dietary filter chips */}
        {catalogHasDietaryTags && availableChips.length > 0 && (
          <DietaryTagFilter chips={availableChips} selectedTags={selectedDietaryTags} onToggle={toggleDietaryTag} hPad={0} />
        )}
      </View>

      {isLoading ? (
        <MenuShimmerGrid shimmerProgress={shimmerProgress} numColumns={numColumns} hPad={hPad} />
      ) : (
        <Reanimated.View style={[{ flex: 1 }, contentAnimStyle]}>
          <FlatList
            ref={listRef}
            key={numColumns}
            data={filtered}
            keyExtractor={p => p.id}
            numColumns={numColumns}
            columnWrapperStyle={{ gap: tileGap }}
            contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: hPad, gap: tileGap, paddingBottom: insets.bottom + 110 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
            ListHeaderComponent={
              <>
                <Text style={[s.count, { fontWeight: '400' }]}>
                  {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                  {activeCategory !== 'all' ? ` · ${categories.find((c: any) => c.id === activeCategory)?.label ?? activeCategory}` : ''}
                  {selectedDietaryTags.length > 0 ? ` · ${selectedDietaryTags.join(', ')}` : ''}
                </Text>
              </>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
                <Feather name={selectedDietaryTags.length > 0 ? 'filter' : 'search'} size={36} color="#8E8E93" />
                <Text style={{ color: '#1C1C1E', fontWeight: '600', fontSize: 15, textAlign: 'center' }}>
                  {selectedDietaryTags.length > 0
                    ? `No ${activeCategory !== 'all' ? (categories.find((c: any) => c.id === activeCategory)?.label ?? activeCategory) + ' ' : ''}items match your filters`
                    : 'No items found'}
                </Text>
                {selectedDietaryTags.length > 0 && (
                  <Pressable onPress={() => { setSelectedDietaryTags([]); Haptics.selectionAsync(); }} style={s.clearFiltersBtn}>
                    <Text style={[s.clearFiltersText, { fontWeight: '600' }]}>Clear filters</Text>
                  </Pressable>
                )}
              </View>
            }
            renderItem={({ item: p }) => (
              <View style={{ flex: 1 }}>
                <SharedProductTile product={p} onPress={() => handleTilePress(p)} onAddToCart={() => handleAddToCart(p)} />
              </View>
            )}
          />
        </Reanimated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingBottom: 16, gap: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, zIndex: 10,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#1C1C1E' },
  // Search
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44, backgroundColor: '#F2F2F7', borderRadius: 16 },
  searchInput: { flex: 1, color: '#1C1C1E' },
  // Count row
  count: { color: '#8E8E93', fontSize: 13, marginBottom: 4 },
  // Clear filters button
  clearFiltersBtn:  { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: '#EBF7FD', borderWidth: 1.5, borderColor: '#40C0F2' },
  clearFiltersText: { color: '#0D8FC4', fontSize: 14 },
});
