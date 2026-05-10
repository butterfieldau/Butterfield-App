import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { api, type ApiProduct } from '@/lib/api';
import ProductCustomizerSheet from '@/components/ProductCustomizerSheet';

const BLUE = '#40C0F2';

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',      icon: 'grid'    },
  { id: 'cookies',    label: 'Cookies',  icon: 'star'    },
  { id: 'coffee',     label: 'Coffee',   icon: 'coffee'  },
  { id: 'desserts',   label: 'Desserts', icon: 'heart'   },
  { id: 'sandwiches', label: 'Food',     icon: 'layers'  },
  { id: 'pastries',   label: 'Pastries', icon: 'sun'     },
  { id: 'drinks',     label: 'Drinks',   icon: 'droplet' },
  { id: 'bundles',    label: 'Bundles',  icon: 'gift'    },
];

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

function getDisplayPrice(p: ApiProduct): { display: number; was?: number } {
  const raw = p as any;
  const retail = (raw.priceCents ?? p.prices?.[0]?.unit_amount ?? 0) / 100;
  const sale   = raw.salePriceCents ? raw.salePriceCents / 100 : null;
  return sale ? { display: sale, was: retail } : { display: retail };
}

function getChips(p: ApiProduct): string[] {
  const raw = p as any;
  const dietary = parseArr(raw.dietaryTags ?? p.metadata?.dietaryTags);
  if (dietary.length > 0) return dietary.slice(0, 3);
  const tags = parseArr(raw.tags ?? p.metadata?.tags);
  if (tags.length > 0) return tags.slice(0, 3);
  return getPalette(p.metadata?.category).defaultTags.slice(0, 3);
}

function ProductTile({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const raw = product as any;
  const { display, was } = getDisplayPrice(product);
  const palette          = getPalette(product.metadata?.category);
  const chips            = getChips(product);
  const photoUrl         = product.images?.[0] ?? null;
  const available        = product.metadata?.available !== 'false';
  const isNew            = product.metadata?.isNew === 'true';
  const isLimited        = product.metadata?.isLimitedDrop === 'true' || raw.isLimitedDrop;
  const isSoldOut        = !available || raw.isSoldOut;

  return (
    <Pressable
      onPress={() => { if (available && !isSoldOut) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[s.tile, { opacity: isSoldOut ? 0.7 : 1 }]}
    >
      <View style={[s.tileTop, { backgroundColor: photoUrl ? '#F0EDE8' : palette.bg }]}>
        {photoUrl
          ? <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          : <Text style={s.tileEmoji}>{palette.emoji}</Text>
        }
        <View style={s.badgeRow}>
          {isNew     && <View style={[s.badge, { backgroundColor: '#1C1C1E' }]}><Text style={[s.badgeText, { fontFamily: 'Inter_700Bold' }]}>NEW</Text></View>}
          {isLimited && <View style={[s.badge, { backgroundColor: '#F40009' }]}><Text style={[s.badgeText, { fontFamily: 'Inter_700Bold' }]}>LIMITED</Text></View>}
        </View>
        <View style={s.pricePill}>
          {was ? <Text style={[s.priceWas, { fontFamily: 'Inter_400Regular' }]}>${was.toFixed(0)}</Text> : null}
          <Text style={[s.priceMain, { fontFamily: 'Inter_700Bold' }]}>${display.toFixed(0)}</Text>
        </View>
        {isSoldOut && (
          <View style={s.soldOutOverlay}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 12 }}>Sold Out</Text>
          </View>
        )}
        <View style={[s.bannerStrip, { backgroundColor: photoUrl ? 'rgba(0,0,0,0.42)' : palette.banner }]}>
          <Text style={[s.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
            In-store Pickup · Merrylands
          </Text>
        </View>
      </View>
      <View style={s.tileBottom}>
        <View style={s.nameRow}>
          <Text style={[s.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[s.arrow, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>↗</Text>
        </View>
        {raw.shortDescription ? (
          <Text style={[s.shortDesc, { fontFamily: 'Inter_400Regular' }]} numberOfLines={1}>{raw.shortDescription}</Text>
        ) : null}
        <View style={s.chipsRow}>
          {chips.map(tag => {
            const icon = DIETARY_ICONS[tag];
            return (
              <View key={tag} style={[s.chip, { backgroundColor: `${palette.bg}55` }]}>
                {icon ? <Text style={{ fontSize: 9 }}>{icon}</Text> : null}
                <Text style={[s.chipText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
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
        <Text style={[s.frequentName, { fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[s.frequentPrice, { fontFamily: 'Inter_400Regular' }]}>${(cents / 100).toFixed(2)}</Text>
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
  const isSkipQueue = params.skipQueue === '1';

  useEffect(() => {
    if (params.category) setActiveCategory(params.category);
  }, [params.category]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });

  const products = data?.data ?? [];

  const coffeeProducts = useMemo(
    () => products.filter(p => p.metadata?.category === 'coffee').slice(0, 4),
    [products],
  );

  const filtered = useMemo(() => products.filter(p => {
    const matchCat    = activeCategory === 'all' || p.metadata?.category === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.description ?? '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [products, activeCategory, search]);

  const [customizerProduct, setCustomizerProduct] = useState<ApiProduct | null>(null);
  const handleTilePress = (p: ApiProduct) => { setCustomizerProduct(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  return (
    <View style={s.root}>
      <ProductCustomizerSheet
        product={customizerProduct}
        visible={!!customizerProduct}
        onClose={() => setCustomizerProduct(null)}
      />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerTop}>
          <Text style={[s.headerTitle, { fontFamily: 'Inter_700Bold' }]}>Menu</Text>
          {isSkipQueue && (
            <View style={s.skipBadge}>
              <Feather name="zap" size={12} color="#E07B00" />
              <Text style={[s.skipBadgeText, { fontFamily: 'Inter_600SemiBold' }]}>Skip the Queue</Text>
            </View>
          )}
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <Feather name="search" size={16} color="#8E8E93" />
          <TextInput
            style={[s.searchInput, { fontFamily: 'Inter_400Regular' }]}
            placeholder="Search cookies, coffee…"
            placeholderTextColor="#8E8E93"
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch('')}><Feather name="x" size={16} color="#8E8E93" /></Pressable> : null}
        </View>

        {/* Category carousel — Uber Eats style */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 2 }}>
          {CATEGORIES.map(cat => {
            const pal    = getPalette(cat.id === 'all' ? 'default' : cat.id);
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => { setActiveCategory(cat.id); setSearch(''); Haptics.selectionAsync(); }}
                style={[s.catTile, { borderColor: active ? pal.banner : '#E8E8ED', backgroundColor: active ? `${pal.banner}0F` : '#fff' }]}
              >
                <View style={[s.catIconWrap, { backgroundColor: active ? pal.banner : '#F2F2F7' }]}>
                  <Feather name={cat.icon as any} size={18} color={active ? '#fff' : '#636366'} />
                </View>
                <Text style={[s.catLabel, {
                  color: active ? pal.banner : '#3C3C43',
                  fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium',
                }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
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
                      <Text style={[s.frequentTitle, { fontFamily: 'Inter_700Bold' }]}>Your usual?</Text>
                      <Text style={[s.frequentSub, { fontFamily: 'Inter_400Regular' }]}>Frequently ordered</Text>
                    </View>
                    <Pressable onPress={() => router.push('/(customer)/cart')} style={s.viewCartBtn}>
                      <Text style={[s.viewCartText, { fontFamily: 'Inter_600SemiBold' }]}>View cart</Text>
                      <Feather name="chevron-right" size={13} color={BLUE} />
                    </Pressable>
                  </View>
                  {coffeeProducts.map(p => (
                    <FrequentCoffeeTile key={p.id} product={p} onPress={() => handleTilePress(p)} />
                  ))}
                  <View style={s.frequentDivider} />
                </View>
              )}
              <Text style={[s.count, { fontFamily: 'Inter_400Regular' }]}>
                {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                {activeCategory !== 'all' ? ` · ${CATEGORIES.find(c => c.id === activeCategory)?.label ?? activeCategory}` : ''}
              </Text>
            </>
          }
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

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#fff' },

  // Header
  header:      {
    paddingHorizontal: 16, paddingBottom: 14, gap: 12, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, zIndex: 10,
  },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 28, color: '#1C1C1E' },
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
  viewCartText:    { fontSize: 13, color: '#40C0F2' },
  frequentTile:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9F9FB', borderRadius: 14, padding: 10, marginBottom: 8 },
  frequentImg:     { width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frequentName:    { fontSize: 14, color: '#1C1C1E' },
  frequentPrice:   { fontSize: 13, color: '#8E8E93' },
  frequentAdd:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#40C0F2', alignItems: 'center', justifyContent: 'center' },
  frequentDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginTop: 8, marginBottom: 4 },

  // Product tile
  tile:        { flex: 1, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  tileTop:     { height: 160, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  tileEmoji:   { fontSize: 56, lineHeight: 66 },
  badgeRow:    { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  badge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:   { color: '#fff', fontSize: 9 },
  pricePill:   { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceWas:    { fontSize: 11, color: 'rgba(255,255,255,0.7)', textDecorationLine: 'line-through' },
  priceMain:   { fontSize: 16, color: '#1C1C1E' },
  soldOutOverlay:{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bannerStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText:  { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  tileBottom:  { padding: 10, gap: 5, backgroundColor: '#fff' },
  nameRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  tileName:    { fontSize: 13, color: '#1C1C1E', flex: 1 },
  arrow:       { fontSize: 13 },
  shortDesc:   { fontSize: 10, color: '#8E8E93' },
  chipsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  chipText:    { fontSize: 9 },
});
