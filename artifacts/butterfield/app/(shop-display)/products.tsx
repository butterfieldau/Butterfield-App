import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  StyleSheet, Switch, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { api } from '@/lib/api';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE   = '#1493FF';
const GREEN  = '#16A34A';
const RED    = '#EF4444';

type Product = {
  id: string;
  name?: string | null;
  active?: boolean | null;
  isActive?: boolean | null;
  isSoldOut?: boolean | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
  images?: string[] | null;
  category?: string | null;
  categoryId?: string | null;
  priceCents?: number | null;
};

function getCategoryLabel(product: Product): string {
  return product.category ?? product.metadata?.category ?? product.metadata?.type ?? 'General';
}

function getPriceCents(product: Product): number | null {
  if (product.priceCents != null) return product.priceCents;
  const raw = product.metadata?.price_cents ?? product.metadata?.priceCents;
  if (raw) return Number(raw);
  return null;
}

function formatPrice(cents: number | null): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  cookies:   { bg: '#FEF3C7', text: '#92400E' },
  coffee:    { bg: '#F3E8FF', text: '#6B21A8' },
  desserts:  { bg: '#FCE7F3', text: '#9D174D' },
  sandwiches:{ bg: '#D1FAE5', text: '#065F46' },
  bundles:   { bg: '#DBEAFE', text: '#1D4ED8' },
  general:   { bg: '#F3F4F6', text: '#374151' },
};

export default function ShopDisplayProductsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const numCols = isWide ? (width >= 1100 ? 3 : 2) : 2;

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['shop-display-products'],
    queryFn: () => api.shopDisplay.products({ manage: true }),
    staleTime: 30000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ productId, isSoldOut }: { productId: string; isSoldOut: boolean }) =>
      api.shopDisplay.toggleStock(productId, isSoldOut),
    onMutate: async ({ productId, isSoldOut }) => {
      await queryClient.cancelQueries({ queryKey: ['shop-display-products'] });
      const snapshot = queryClient.getQueryData<{ data: Product[] }>(['shop-display-products']);
      queryClient.setQueryData<{ data: Product[] }>(['shop-display-products'], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) =>
            p.id === productId ? { ...p, isSoldOut } : p,
          ),
        };
      });
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['shop-display-products'], context.snapshot);
      }
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: 'Could not save stock status. Please try again.',
        position: 'bottom',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-display-products'] });
    },
  });

  const products: Product[] = (data?.data ?? []) as Product[];

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const p of products) seen.add(getCategoryLabel(p).toLowerCase());
    return Array.from(seen).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategory) list = list.filter((p) => getCategoryLabel(p).toLowerCase() === selectedCategory);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [products, search, selectedCategory]);

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BLUE} size="large" />
        <Text style={s.loadingText}>Loading products…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Feather name="lock" size={40} color={MUTED} />
        <Text style={s.emptyTitle}>Products not enabled</Text>
        <Text style={s.emptyText}>Contact your director to enable product access for this display.</Text>
      </View>
    );
  }

  const renderItem = ({ item: product }: { item: Product }) => {
    const cat = getCategoryLabel(product).toLowerCase();
    const catColors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.general;
    const price = getPriceCents(product);
    const isActive = product.isActive !== false && product.active !== false;
    const isSoldOut = product.isSoldOut === true;
    const isMutating = toggleMutation.isPending &&
      (toggleMutation.variables as any)?.productId === product.id;

    return (
      <View style={[s.card, !isActive && s.cardInactive]}>
        <View style={s.cardTop}>
          <View style={[s.categoryBadge, { backgroundColor: catColors.bg }]}>
            <Text style={[s.categoryText, { color: catColors.text }]}>{getCategoryLabel(product)}</Text>
          </View>
          <View style={[s.availBadge, { backgroundColor: isActive ? '#DCFCE7' : '#FEE2E2' }]}>
            <View style={[s.availDot, { backgroundColor: isActive ? GREEN : RED }]} />
            <Text style={[s.availText, { color: isActive ? '#166534' : '#B91C1C' }]}>
              {isActive ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>
        <Text style={[s.productName, !isActive && { color: MUTED }]} numberOfLines={2}>
          {product.name ?? 'Unnamed product'}
        </Text>
        {price != null && (
          <Text style={s.productPrice}>{formatPrice(price)}</Text>
        )}
        {product.description ? (
          <Text style={s.productDesc} numberOfLines={2}>{product.description}</Text>
        ) : null}

        {/* Stock toggle */}
        <View style={[s.stockRow, { backgroundColor: isSoldOut ? '#FEF2F2' : '#F0FDF4', borderColor: isSoldOut ? '#FECACA' : '#BBF7D0' }]}>
          <View style={s.stockLabelWrap}>
            <View style={[s.stockDot, { backgroundColor: isSoldOut ? RED : GREEN }]} />
            <Text style={[s.stockLabel, { color: isSoldOut ? '#B91C1C' : '#166534' }]}>
              {isSoldOut ? 'Sold Out' : 'In Stock'}
            </Text>
          </View>
          <Switch
            value={!isSoldOut}
            onValueChange={(inStock) => {
              toggleMutation.mutate({ productId: product.id, isSoldOut: !inStock });
            }}
            disabled={isMutating}
            trackColor={{ false: '#FECACA', true: '#86EFAC' }}
            thumbColor={isSoldOut ? RED : GREEN}
            ios_backgroundColor="#FECACA"
          />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Feather name="search" size={16} color={MUTED} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search products…"
            placeholderTextColor={MUTED}
            clearButtonMode="while-editing"
          />
        </View>
        <Text style={s.countLabel}>{filtered.length} items</Text>
      </View>

      {categories.length > 1 && (
        <View style={s.catRow}>
          <Pressable
            onPress={() => setSelectedCategory(null)}
            style={[s.catChip, !selectedCategory && s.catChipActive]}
          >
            <Text style={[s.catChipText, !selectedCategory && s.catChipTextActive]}>All</Text>
          </Pressable>
          {categories.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              style={[s.catChip, selectedCategory === cat && s.catChipActive]}
            >
              <Text style={[s.catChipText, selectedCategory === cat && s.catChipTextActive]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <FlatList
        key={numCols}
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={numCols}
        columnWrapperStyle={numCols > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={{ padding: numCols > 1 ? 0 : 16, paddingTop: 14, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={BLUE} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Feather name="package" size={40} color={MUTED} />
            <Text style={s.emptyTitle}>No products found</Text>
            <Text style={s.emptyText}>{search ? 'Try a different search term.' : 'No products in the catalogue yet.'}</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: BG, padding: 32 },
  loadingText:     { color: MUTED, fontSize: 15, fontWeight: '500', marginTop: 8 },
  searchRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  searchBox:       { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderWidth: 1, borderColor: BORDER },
  searchInput:     { flex: 1, fontSize: 15, color: TEXT, fontWeight: '500' },
  countLabel:      { color: MUTED, fontSize: 13, fontWeight: '600', minWidth: 56, textAlign: 'right' },
  catRow:          { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexWrap: 'wrap' },
  catChip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  catChipActive:   { backgroundColor: BLUE, borderColor: BLUE },
  catChipText:     { fontSize: 13, fontWeight: '700', color: TEXT },
  catChipTextActive:{ color: '#fff' },
  card:            { flex: 1, backgroundColor: CARD, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 8 },
  cardInactive:    { opacity: 0.65 },
  cardTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  categoryBadge:   { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText:    { fontSize: 11, fontWeight: '700' },
  availBadge:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  availDot:        { width: 6, height: 6, borderRadius: 3 },
  availText:       { fontSize: 11, fontWeight: '700' },
  productName:     { fontSize: 15, fontWeight: '800', color: TEXT, lineHeight: 20 },
  productPrice:    { fontSize: 17, fontWeight: '800', color: BLUE },
  productDesc:     { fontSize: 13, color: MUTED, lineHeight: 18 },
  emptyWrap:       { alignItems: 'center', marginTop: 80, gap: 12, paddingHorizontal: 32 },
  emptyTitle:      { fontSize: 18, fontWeight: '700', color: TEXT, textAlign: 'center' },
  emptyText:       { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  stockRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, marginTop: 4 },
  stockLabelWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockDot:        { width: 7, height: 7, borderRadius: 4 },
  stockLabel:      { fontSize: 13, fontWeight: '700' },
});
