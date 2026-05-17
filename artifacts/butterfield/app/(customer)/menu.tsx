import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useQuery } from '@tanstack/react-query';
import { getPalette } from '@/constants/categoryColors';
import { api, type ApiProduct } from '@/lib/api';
import { useFavouriteCategory } from '@/hooks/useFavouriteCategory';
import SharedProductTile from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { setSelectedProduct } from '@/lib/selectedProduct';

const BLUE   = '#1493FF';
const CHERRY = '#D0312D';
// ── Shimmer primitives ────────────────────────────────────────────────────────
interface ShimmerBoxProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  shimmerProgress: SharedValue<number>;
}
function ShimmerBox({ width = '100%', height = 16, borderRadius = 8, style, shimmerProgress }: ShimmerBoxProps) {
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerProgress.value, [0, 1], [0.35, 0.75]),
  }));
  return (
    <Reanimated.View
      style={[{ width, height, borderRadius, backgroundColor: '#D1D5DB' }, animStyle, style]}
    />
  );
}
function ShimmerProductCard({ shimmerProgress }: { shimmerProgress: SharedValue<number> }) {
  return (
    <View style={shimmerCard.tile}>
      <ShimmerBox width="100%" height={165} borderRadius={0} shimmerProgress={shimmerProgress} />
      <View style={shimmerCard.info}>
        <ShimmerBox width="75%" height={13} borderRadius={5} shimmerProgress={shimmerProgress} />
        <ShimmerBox width="50%" height={11} borderRadius={5} shimmerProgress={shimmerProgress} />
        <View style={shimmerCard.priceRow}>
          <ShimmerBox width={44} height={16} borderRadius={5} shimmerProgress={shimmerProgress} />
          <ShimmerBox width={36} height={36} borderRadius={18} shimmerProgress={shimmerProgress} />
        </View>
      </View>
    </View>
  );
}
const SHIMMER_COUNT = 6;
function MenuShimmer({ shimmerProgress }: { shimmerProgress: SharedValue<number> }) {
  const pairs = Array.from({ length: Math.ceil(SHIMMER_COUNT / 2) });
  return (
    <View style={{ padding: 16, gap: 14 }}>
      {pairs.map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><ShimmerProductCard shimmerProgress={shimmerProgress} /></View>
        </View>
      ))}
    </View>
  );
}
const shimmerCard = StyleSheet.create({
  tile:     { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  info:     { padding: 12, gap: 6, backgroundColor: '#fff' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
const CAT_ICON_MAP: Record<string, string> = {
  coffee:        'coffee',
  matcha:        'mc:leaf',
  tea:           'mc:cup-water',
  cookies:       'mc:cookie-outline',
  'cold-drinks': 'mc:snowflake',
  'soft-serve':  'mc:ice-cream',
  specials:      'zap',
  seasonal:      'sun',
  merch:         'tag',
  boxes:         'box',
  desserts:      'mc:cake-variant-outline',
  sandwiches:    'layers',
  pastries:      'sun',
  drinks:        'droplet',
  bundles:       'gift',
};
const DIETARY_ICONS: Record<string, string> = {
  Vegan: '🌱', Vegetarian: '🥦', 'Gluten-Free': '🌾', 'Dairy-Free': '🥛', 'Nut-Free': '🥜',
};
function parseArr(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val) {
    try { const r = JSON.parse(val); if (Array.isArray(r)) return r; } catch {}
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}
function FrequentCoffeeTile({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const photoUrl = product.images?.[0] ?? null;
  const palette  = getPalette('coffee');
  const raw      = product as any;
  const cents    = raw.priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
  return (
    <Pressable
      style={s.frequentTile}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <View style={[s.frequentImg, { backgroundColor: photoUrl ? '#F0EDE8' : palette.bg }]}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          : <Text style={{ fontSize: 32 }}>{palette.emoji}</Text>
        }
      </View>
      <View style={{ flex: 1, paddingVertical: 2, gap: 2 }}>
        <Text style={[s.frequentName, { fontWeight: '600' }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[s.frequentPrice, { fontWeight: '400' }]}>${(cents / 100).toFixed(2)}</Text>
      </View>
      <View style={s.frequentAdd}>
        <Feather name="plus" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}
export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; skipQueue?: string }>();
  const [search, setSearch]           = useState('');
  const [activeCategory, setActiveCategory] = useState(params.category ?? 'all');
  const [userChangedCategory, setUserChangedCategory] = useState(false);
  const isSkipQueue = params.skipQueue === '1';
  useEffect(() => {
    if (params.category) setActiveCategory(params.category);
  }, [params.category]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });

  const { refreshing, onRefresh } = useRefreshControl(refetch);

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.products.categories(),
    staleTime: 5 * 60 * 1000,
  });
  const categories = useMemo(() => {
    const backendCats: any[] = categoriesData?.data ?? [];
    const items = backendCats.map(c => ({
      id: c.slug as string,
      label: c.name as string,
      icon: (CAT_ICON_MAP[c.slug] ?? 'tag') as string,
    }));
    return [{ id: 'all', label: 'All', icon: 'grid' as string }, ...items];
  }, [categoriesData]);
  // Shimmer animation — runs while products are loading
  const shimmerProgress = useSharedValue(0);
  const contentOpacity  = useSharedValue(isLoading ? 0 : 1);
  useEffect(() => {
    if (isLoading) {
      contentOpacity.value = 0;
      shimmerProgress.value = 0;
      shimmerProgress.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(shimmerProgress);
      contentOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    }
  }, [isLoading]);
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));
  const products = data?.data ?? [];
  const favouriteCategory = useFavouriteCategory(products);
  useEffect(() => {
    if (!userChangedCategory && !params.category && favouriteCategory) {
      setActiveCategory(favouriteCategory);
    }
  }, [favouriteCategory, params.category, userChangedCategory]);
  const coffeeProducts = useMemo(
    () => products.filter(p => p.metadata?.category === 'coffee').slice(0, 4),
    [products],
  );
  const filtered = useMemo(() => products.filter(p => {
    const matchCat    = activeCategory === 'all' || p.metadata?.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, activeCategory, search]);
  const handleTilePress = (p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(p);
    router.push({ pathname: '/product', params: { id: p.id } } as any);
  };
  return (
    <View style={s.root}>
      <OfflineBanner />
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerTop}>
          <Text style={[s.headerTitle, { fontWeight: '700' }]}>Menu</Text>
          {isSkipQueue && (
            <View style={s.skipBadge}>
              <Feather name="zap" size={12} color="#E07B00" />
              <Text style={[s.skipBadgeText, { fontWeight: '600' }]}>Skip the Queue</Text>
            </View>
          )}
        </View>
        {/* Search */}
        <View style={s.searchBar}>
          <Feather name="search" size={16} color="#8E8E93" />
          <TextInput
            style={[s.searchInput, { fontWeight: '400' }]}
            placeholder="Search cookies, coffee…"
            placeholderTextColor="#8E8E93"
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color="#8E8E93" /></Pressable> : null}
        </View>
        {/* Category carousel — Uber Eats style */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2, paddingHorizontal: 16 }}>
          {categories.map(cat => {
            const pal    = getPalette(cat.id === 'all' ? 'default' : cat.id);
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => { setUserChangedCategory(true); setActiveCategory(cat.id); setSearch(''); Haptics.selectionAsync(); }}
                style={[s.catTile, { borderColor: active ? pal.banner : '#E8E8ED', backgroundColor: active ? `${pal.banner}0F` : '#fff' }]}
              >
                <View style={[s.catIconWrap, { backgroundColor: active ? pal.banner : '#F2F2F7' }]}>
                  {cat.icon.startsWith('mc:')
                    ? <MaterialCommunityIcons name={cat.icon.slice(3) as any} size={18} color={active ? '#fff' : '#636366'} />
                    : <Feather name={cat.icon as any} size={18} color={active ? '#fff' : '#636366'} />
                  }
                </View>
                <Text style={[s.catLabel, {
                  color: active ? pal.banner : '#3C3C43',
                  fontWeight: active ? '700' : '500',
                }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {isLoading ? (
        <MenuShimmer shimmerProgress={shimmerProgress} />
      ) : (
        <Reanimated.View style={[{ flex: 1 }, contentAnimStyle]}>
          <FlatList
            data={filtered}
            keyExtractor={p => p.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 110 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
            ListHeaderComponent={
              <>
                {/* Frequently ordered — only shown on Skip the Queue */}
                {isSkipQueue && coffeeProducts.length > 0 && (
                  <View style={s.frequentSection}>
                    <View style={s.frequentHeader}>
                      <View style={s.frequentIconWrap}>
                        <Text style={{ fontSize: 14 }}>☕</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.frequentTitle, { fontWeight: '700' }]}>Your usual?</Text>
                        <Text style={[s.frequentSub, { fontWeight: '400' }]}>Frequently ordered</Text>
                      </View>
                      <Pressable onPress={() => router.push('/(customer)/cart')} style={s.viewCartBtn}>
                        <Text style={[s.viewCartText, { fontWeight: '600' }]}>View cart</Text>
                        <Feather name="chevron-right" size={13} color={BLUE} />
                      </Pressable>
                    </View>
                    {coffeeProducts.map(p => (
                      <FrequentCoffeeTile key={p.id} product={p} onPress={() => handleTilePress(p)} />
                    ))}
                    <View style={s.frequentDivider} />
                  </View>
                )}
                <Text style={[s.count, { fontWeight: '400' }]}>
                  {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                  {activeCategory !== 'all' ? ` · ${categories.find((c: any) => c.id === activeCategory)?.label ?? activeCategory}` : ''}
                </Text>
              </>
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
                <Feather name="search" size={28} color="#D0D0D0" />
                <Text style={{ color: '#8E8E93', fontWeight: '400', fontSize: 14 }}>No items found.</Text>
              </View>
            }
            renderItem={({ item: p }) => (
              <View style={{ flex: 1 }}>
                <SharedProductTile product={p} onPress={() => handleTilePress(p)} />
              </View>
            )}
          />
        </Reanimated.View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#fff' },
  // Header
  header:      {
    paddingHorizontal: 16, paddingBottom: 16, gap: 14, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, zIndex: 10,
  },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 32, color: '#1C1C1E' },
  skipBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF3E0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  skipBadgeText:{ fontSize: 12, color: '#E07B00' },
  // Search
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 44, backgroundColor: '#F2F2F7', borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  // Category carousel — Uber Eats style
  catTile:     { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, minWidth: 72 },
  catIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catLabel:    { fontSize: 12, textAlign: 'center' },
  // Count row
  count:       { color: '#8E8E93', fontSize: 13, marginBottom: 4 },
  // Frequently ordered section
  frequentSection: { marginBottom: 16, gap: 0 },
  frequentHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  frequentIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center' },
  frequentTitle:   { fontSize: 16, color: '#1C1C1E' },
  frequentSub:     { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  viewCartBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewCartText:    { fontSize: 13, color: '#1493FF' },
  frequentTile:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9F9FB', borderRadius: 14, padding: 10, marginBottom: 8 },
  frequentImg:     { width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frequentName:    { fontSize: 14, color: '#1C1C1E' },
  frequentPrice:   { fontSize: 13, color: '#8E8E93' },
  frequentAdd:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#D0312D', alignItems: 'center', justifyContent: 'center' },
  frequentDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginTop: 8, marginBottom: 4 },
  // Product tile
  tile:          { flex: 1, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  tileImg:       { height: 155, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  tileEmoji:     { fontSize: 52, lineHeight: 62 },
  badgeRow:      { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:     { color: '#fff', fontSize: 9 },
  soldOutOverlay:{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  tileInfo:      { padding: 10, gap: 4, backgroundColor: '#fff' },
  tileName:      { fontSize: 13, color: '#1C1C1E', flex: 1 },
  shortDesc:     { fontSize: 11, color: '#8E8E93', lineHeight: 15 },
  tilePriceRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  priceMain:     { fontSize: 15, color: '#1C1C1E' },
  tileAddBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
});
