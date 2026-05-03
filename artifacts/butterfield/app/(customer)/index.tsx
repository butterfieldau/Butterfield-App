import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { api, type ApiProduct } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'sandwiches', label: 'Food' },
  { id: 'bundles', label: 'Bundles' },
];

const PRODUCT_IMAGES: Record<string, string> = {
  'prod_classic_choc_chip': 'https://butterfieldcookies.com.au/cdn/shop/files/classic-choc-chip.jpg',
  'prod_double_chocolate': 'https://butterfieldcookies.com.au/cdn/shop/files/double-choc.jpg',
  'prod_flat_white': 'https://butterfieldcookies.com.au/cdn/shop/files/flat-white.jpg',
  'prod_cookie_sandwich': 'https://butterfieldcookies.com.au/cdn/shop/files/cookie-sandwich.jpg',
};

function getPrice(p: ApiProduct): number {
  return (p.prices?.[0]?.unit_amount ?? 0) / 100;
}

function getGradient(p: ApiProduct): [string, string] {
  const g = p.metadata?.gradient?.split(',');
  if (g?.length === 2) return [g[0], g[1]];
  return ['#4B72C4', '#3A5BA8'];
}

function ProductTile({ product, onAdd }: { product: ApiProduct; onAdd: () => void }) {
  const colors = useColors();
  const gradient = getGradient(product);
  const price = getPrice(product);
  const available = product.metadata?.available !== 'false';
  const imageUrl = PRODUCT_IMAGES[product.id];

  return (
    <Pressable style={[styles.tile, { borderRadius: colors.radius, backgroundColor: colors.card }]} onPress={available ? onAdd : undefined}>
      <View style={[styles.tileImage, { borderRadius: colors.radius - 4, overflow: 'hidden' }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <LinearGradient colors={gradient} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        {product.metadata?.isNew === 'true' && (
          <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>
        )}
        {!available && (
          <View style={styles.soldOutOverlay}><Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Sold Out</Text></View>
        )}
      </View>
      <View style={styles.tileInfo}>
        <Text style={[styles.tileName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.tileDesc, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>{product.description}</Text>
        <View style={styles.tileBottom}>
          <Text style={[styles.tilePrice, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>${price.toFixed(2)}</Text>
          {available && (
            <Pressable onPress={onAdd} style={[styles.addBtn, { backgroundColor: colors.primary, borderRadius: 10 }]}>
              <Feather name="plus" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addItem, totalItems } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');

  const { data: productsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });

  const { data: loyaltyData } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
    retry: 1,
  });

  const products = productsData?.data ?? [];
  const loyaltyPoints = loyaltyData?.data?.loyaltyPoints ?? 0;
  const loyaltyTier = loyaltyData?.data?.loyaltyTier ?? 'bronze';

  const popular = products.filter((p) => p.metadata?.popular === 'true');
  const featured = products.filter((p) =>
    activeCategory === 'all' ? true : p.metadata?.category === activeCategory
  );

  const handleAdd = useCallback((p: ApiProduct) => {
    addItem({
      id: p.id,
      name: p.name,
      category: (p.metadata?.category ?? 'cookies') as any,
      price: getPrice(p),
      description: p.description,
      available: p.metadata?.available !== 'false',
      gradient: getGradient(p),
      priceId: p.prices?.[0]?.id,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [addItem]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <LinearGradient colors={['#4B72C4', '#3058A8']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { fontFamily: 'Inter_400Regular' }]}>{greeting},</Text>
            <Text style={[styles.name, { fontFamily: 'Inter_700Bold' }]}>{firstName} 👋</Text>
          </View>
          <View style={styles.headerActions}>
            {totalItems > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Feather name="shopping-bag" size={16} color="#fff" />
                <Text style={[styles.cartBadgeText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>{totalItems}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={[styles.loyaltyChip, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Feather name="star" size={14} color="#FFE4A0" />
          <Text style={[styles.loyaltyText, { fontFamily: 'Inter_700Bold' }]}>{loyaltyPoints} pts</Text>
          <Text style={[styles.loyaltyLabel, { fontFamily: 'Inter_400Regular' }]}>· {loyaltyTier.charAt(0).toUpperCase() + loyaltyTier.slice(1)} Member</Text>
        </View>
      </LinearGradient>

      <View style={styles.promoSection}>
        <LinearGradient colors={['#5AB8FF', '#3A7FD4']} style={[styles.promoBanner, { borderRadius: colors.radius }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.promoContent}>
            <Text style={[styles.promoTag, { fontFamily: 'Inter_600SemiBold' }]}>🍪 DAILY SPECIAL</Text>
            <Text style={[styles.promoTitle, { fontFamily: 'Inter_700Bold' }]}>Cookie & Cream Sandwich</Text>
            <Text style={[styles.promoSub, { fontFamily: 'Inter_400Regular' }]}>Two warm cookies + vanilla cream</Text>
          </View>
          <View style={[styles.promoCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
        </LinearGradient>
      </View>

      {popular.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Fan Favourites</Text>
          <FlatList
            data={popular}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            renderItem={({ item }) => (
              <Pressable style={[styles.favCard, { backgroundColor: colors.card, borderRadius: colors.radius }]} onPress={() => handleAdd(item)}>
                <View style={[styles.favImage, { overflow: 'hidden', borderRadius: 10 }]}>
                  <LinearGradient colors={getGradient(item)} style={{ flex: 1 }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                </View>
                <Text style={[styles.favName, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.favPrice, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>${getPrice(item).toFixed(2)}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => { setActiveCategory(cat.id); Haptics.selectionAsync(); }}
            style={[styles.catPill, {
              backgroundColor: activeCategory === cat.id ? colors.primary : colors.muted,
              borderRadius: 20,
            }]}
          >
            <Text style={[styles.catLabel, { color: activeCategory === cat.id ? '#fff' : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{cat.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : featured.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>No products in this category yet.</Text>
        ) : (
          <View style={[styles.grid, { paddingHorizontal: 20 }]}>
            {featured.map((p) => (
              <ProductTile key={p.id} product={p} onAdd={() => handleAdd(p)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  name: { color: '#fff', fontSize: 24 },
  headerActions: { flexDirection: 'row', gap: 8 },
  cartBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  cartBadgeText: { fontSize: 13 },
  loyaltyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  loyaltyText: { color: '#FFE4A0', fontSize: 14 },
  loyaltyLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  promoSection: { paddingHorizontal: 20, paddingTop: 20 },
  promoBanner: { padding: 20, minHeight: 100, overflow: 'hidden' },
  promoContent: { gap: 4, zIndex: 1 },
  promoTag: { color: 'rgba(255,255,255,0.85)', fontSize: 11, letterSpacing: 1 },
  promoTitle: { color: '#fff', fontSize: 20 },
  promoSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  promoCircle: { position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: 60 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 20, paddingHorizontal: 20, marginBottom: 12 },
  favCard: { width: 130, padding: 12, gap: 8, shadowColor: '#4B72C4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  favImage: { width: '100%', height: 80 },
  favName: { fontSize: 13 },
  favPrice: { fontSize: 13 },
  catScroll: { marginTop: 24 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8 },
  catLabel: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47%', padding: 12, gap: 8, shadowColor: '#4B72C4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tileImage: { width: '100%', height: 90, alignItems: 'flex-start', justifyContent: 'flex-start', padding: 0 },
  newBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#4B72C4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 9, fontFamily: 'Inter_700Bold' },
  soldOutOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  tileInfo: { gap: 4 },
  tileName: { fontSize: 13 },
  tileDesc: { fontSize: 11, lineHeight: 15 },
  tileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  tilePrice: { fontSize: 14 },
  addBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
