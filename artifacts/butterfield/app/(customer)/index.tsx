import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
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

const MERCH = [
  { id: 'merch-retro-shirt', name: 'Retro Shirt', price: 50, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldNEWTEE.jpg?v=1766964759&width=600' },
  { id: 'merch-bucket-hat', name: 'Bucket Hat', price: 20, image: 'https://butterfieldcookies.com.au/cdn/shop/files/butterefieldhat2.jpg?v=1764301783&width=600' },
  { id: 'merch-chunky-hoodie', name: 'Chunky Hoodie', price: 80, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldHoodiesBack.png?v=1751264789&width=600' },
  { id: 'merch-sugar-crew-tee', name: 'Sugar Crew Tee', price: 40, image: 'https://butterfieldcookies.com.au/cdn/shop/files/SugarCrewTeam2.jpg?v=1751264285&width=600' },
];

const PRODUCT_IMAGES: Record<string, string> = {
  'Choc Chip Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Pistachio Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Pistachio_2880x2304_22fcddc2-bd6f-48b2-b5c0-cfe6528a14b5.jpg?v=1764302160&width=600',
  'Biscoff': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Biscoff_2880x2304_c0c0d24b-bd23-4dbf-b563-82b0d49eeb65.jpg?v=1764302195&width=600',
  'M&Ms Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_MAndMs.jpg?v=1764302008&width=600',
  'Red Velvet Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_RedValvet_2880x2304_1af322bc-b56c-4635-8477-309d188fe6dd.jpg?v=1764302309&width=600',
  'Almond Croissant Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_AlmondCroissantCookie_2880x2304_ad98ea84-f045-47a1-8af7-e6b6e79fa74d.jpg?v=1771549363&width=600',
  'Bueno Cookie': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
  'Classic Choc Chip': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Double Chocolate': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
  'Cookie & Cream Sandwich': 'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
};

function getPrice(p: ApiProduct): number { return (p.prices?.[0]?.unit_amount ?? 0) / 100; }

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

function getTags(p: ApiProduct): string[] {
  const raw = p as any;
  const dietary = parseArr(raw.dietaryTags ?? p.metadata?.dietaryTags);
  if (dietary.length > 0) return dietary.slice(0, 3);
  const tags = parseArr(raw.tags ?? p.metadata?.tags);
  if (tags.length > 0) return tags.slice(0, 3);
  return getPalette(p.metadata?.category).defaultTags.slice(0, 3);
}

function HomeTile({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const raw = product as any;
  const priceCents = raw.priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
  const saleCents  = raw.salePriceCents;
  const price      = (saleCents ?? priceCents) / 100;
  const palette    = getPalette(product.metadata?.category);
  const available  = product.metadata?.available !== 'false';
  const isSoldOut  = !available || raw.isSoldOut;
  const isNew      = product.metadata?.isNew === 'true';
  const isLimited  = product.metadata?.isLimitedDrop === 'true' || raw.isLimitedDrop;
  const imageUrl   = product.images?.[0] ?? PRODUCT_IMAGES[product.name] ?? null;
  const tags       = getTags(product);

  return (
    <Pressable
      onPress={() => { if (available) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[styles.tile, { opacity: isSoldOut ? 0.72 : 1 }]}
    >
      <View style={[styles.tileTop, { backgroundColor: imageUrl ? '#F0EDE8' : palette.bg }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        ) : (
          <Text style={styles.tileEmoji}>{palette.emoji}</Text>
        )}

        {/* Badge row (top-left) */}
        <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 }}>
          {isNew    && <View style={[styles.newBadge, { backgroundColor: '#1C1C1E' }]}><Text style={[styles.newBadgeText, { fontFamily: 'Inter_700Bold' }]}>NEW</Text></View>}
          {isLimited&& <View style={[styles.newBadge, { backgroundColor: '#F40009' }]}><Text style={[styles.newBadgeText, { fontFamily: 'Inter_700Bold' }]}>LIMITED</Text></View>}
        </View>

        {/* Price (top-right) */}
        <View style={styles.priceBadge}>
          {saleCents ? <Text style={[{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#1C1C1E', textDecorationLine: 'line-through' }]}>${(priceCents/100).toFixed(0)}</Text> : null}
          <Text style={[styles.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${price.toFixed(0)}</Text>
        </View>

        {isSoldOut && (
          <View style={styles.soldOut}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Sold Out</Text>
          </View>
        )}
        <View style={[styles.bannerStrip, { backgroundColor: imageUrl ? 'rgba(0,0,0,0.45)' : palette.banner }]}>
          <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
            In-store Pickup · Merrylands
          </Text>
        </View>
      </View>
      <View style={styles.tileBottom}>
        <View style={styles.tileNameRow}>
          <Text style={[styles.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[styles.orderNow, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>↗</Text>
        </View>
        <View style={styles.tagsRow}>
          {tags.map((tag) => {
            const icon = DIETARY_ICONS[tag];
            return (
              <View key={tag} style={[styles.tagChip, { backgroundColor: `${palette.bg}55` }]}>
                {icon ? <Text style={{ fontSize: 8 }}>{icon}</Text> : null}
                <Text style={[styles.tagText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}

function MerchTile({ item, onPress }: { item: typeof MERCH[number]; onPress: () => void }) {
  const palette = getPalette('merch');
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={styles.merchTile}>
      <View style={styles.merchTileTop}>
        <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        <View style={styles.priceBadge}>
          <Text style={[styles.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${item.price}</Text>
        </View>
        <View style={[styles.bannerStrip, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
            In-store Pickup · Merrylands
          </Text>
        </View>
      </View>
      <View style={styles.tileBottom}>
        <View style={styles.tileNameRow}>
          <Text style={[styles.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.orderNow, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>↗</Text>
        </View>
        <View style={styles.tagsRow}>
          {['Branded', 'Limited', 'Exclusive'].map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: `${palette.bg}55` }]}>
              <Text style={[styles.tagText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
            </View>
          ))}
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
  const { data: storeStatusData } = useQuery({
    queryKey: ['store-status'],
    queryFn: () => api.misc.storeStatus(),
    refetchInterval: 60000,
    retry: 1,
  });

  const products = productsData?.data ?? [];
  const loyaltyPoints = loyaltyData?.data?.loyaltyPoints ?? 0;
  const loyaltyTier = loyaltyData?.data?.loyaltyTier ?? 'bronze';

  const popular = products.filter((p) => p.metadata?.popular === 'true');
  const featured = products.filter((p) => activeCategory === 'all' ? true : p.metadata?.category === activeCategory);

  const handleTilePress = useCallback((p: ApiProduct) => {
    setSelectedProduct(p);
    router.push('/product');
  }, []);

  const handleMerchPress = useCallback((item: typeof MERCH[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct({
      id: item.id,
      name: item.name,
      description: 'Butterfield Cookies branded merchandise. Available in-store only.',
      images: [item.image],
      prices: [{ id: `price-${item.id}`, unit_amount: item.price * 100, currency: 'aud' }] as any,
      metadata: { category: 'merch', available: 'true' },
    } as any);
    router.push('/product');
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const storeStatus = storeStatusData?.data;
  const open = storeStatus?.isOpen ?? false;
  const storeHint = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt ? `Opens ${storeStatus.opensAt}` : 'Closed');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      {/* Header */}
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { fontFamily: 'Inter_400Regular' }]}>{greeting},</Text>
            <Text style={[styles.name, { fontFamily: 'Inter_700Bold' }]}>{firstName} 👋</Text>
          </View>
          {totalItems > 0 && (
            <Pressable onPress={() => router.push('/(customer)/cart')} style={[styles.cartBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Feather name="shopping-bag" size={16} color="#fff" />
              <Text style={[styles.cartBadgeText, { fontFamily: 'Inter_700Bold' }]}>{totalItems}</Text>
            </Pressable>
          )}
        </View>
        <View style={[styles.loyaltyChip, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Feather name="star" size={14} color="#FFE4A0" />
          <Text style={[styles.loyaltyText, { fontFamily: 'Inter_700Bold' }]}>{loyaltyPoints} pts</Text>
          <Text style={[styles.loyaltyLabel, { fontFamily: 'Inter_400Regular' }]}>· {loyaltyTier.charAt(0).toUpperCase() + loyaltyTier.slice(1)} Member</Text>
        </View>
      </LinearGradient>

      {/* Promo banner */}
      <View style={styles.promoSection}>
        <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.promoBanner, { borderRadius: colors.radius }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.promoContent}>
            <Text style={[styles.promoTag, { fontFamily: 'Inter_600SemiBold' }]}>🍪 DAILY SPECIAL</Text>
            <Text style={[styles.promoTitle, { fontFamily: 'Inter_700Bold' }]}>Cookie & Cream Sandwich</Text>
            <Text style={[styles.promoSub, { fontFamily: 'Inter_400Regular' }]}>Two warm cookies + vanilla cream</Text>
          </View>
          <View style={[styles.promoCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
        </LinearGradient>
      </View>

      {/* Pickup banner + quick actions */}
      <View style={styles.quickSection}>
        <Pressable
          style={[styles.pickupRow, { backgroundColor: colors.card, borderRadius: colors.radius }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/store'); }}
        >
          <View style={styles.pickupIconWrap}>
            <Feather name="map-pin" size={20} color="#40C0F2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickupLabel, { fontFamily: 'Inter_600SemiBold', color: colors.primary }]}>IN-STORE PICKUP</Text>
            <Text style={[styles.pickupTitle, { fontFamily: 'Inter_700Bold', color: colors.foreground }]} numberOfLines={1}>Butterfield Cookies — Merrylands</Text>
            <View style={styles.openRow}>
              <View style={[styles.openDot, { backgroundColor: open ? '#22C55E' : '#EF4444' }]} />
              <Text style={[styles.openText, { color: open ? '#15803D' : '#DC2626', fontFamily: 'Inter_500Medium' }]}>
                {storeHint}
              </Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        <View style={styles.quickRow}>
          {[
            { label: 'Order cookies', icon: 'package'     , bg: '#E6F4FF', color: '#2A80D2', onPress: () => router.push('/(customer)/menu') },
            { label: 'Coffee Club',   icon: 'coffee'      , bg: '#FFE8E8', color: '#C0392B', onPress: () => router.push('/(customer)/loyalty') },
            { label: 'My order',      icon: 'shopping-bag', bg: '#F5EDE6', color: '#B45309', onPress: () => router.push('/(customer)/cart') },
          ].map(({ label, icon, bg, color, onPress }) => (
            <Pressable
              key={label}
              style={[styles.quickTile, { backgroundColor: colors.card, borderRadius: colors.radius }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
            >
              <View style={[styles.quickIconCircle, { backgroundColor: bg }]}>
                <Feather name={icon as any} size={22} color={color} />
              </View>
              <Text style={[styles.quickTileLabel, { fontFamily: 'Inter_600SemiBold', color: colors.foreground }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Merch */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Merch</Text>
        <FlatList
          data={MERCH}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => <MerchTile item={item} onPress={() => handleMerchPress(item)} />}
        />
      </View>

      {/* Fan Favourites */}
      {popular.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Fan Favourites</Text>
          <FlatList
            data={popular}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            renderItem={({ item: p }) => {
              const pal = getPalette(p.metadata?.category);
              const img = p.images?.[0] ?? PRODUCT_IMAGES[p.name] ?? null;
              return (
                <Pressable onPress={() => handleTilePress(p)} style={[styles.favTile, { backgroundColor: colors.card }]}>
                  <View style={[styles.favTop, { backgroundColor: img ? '#F0EDE8' : pal.bg }]}>
                    {img
                      ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                      : <Text style={{ fontSize: 36 }}>{pal.emoji}</Text>
                    }
                    <View style={[styles.bannerStrip, { backgroundColor: img ? 'rgba(0,0,0,0.4)' : pal.banner }]}>
                      <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>Pickup</Text>
                    </View>
                  </View>
                  <View style={{ padding: 8, gap: 2 }}>
                    <Text style={[styles.favName, { fontFamily: 'Inter_600SemiBold', color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[{ fontFamily: 'Inter_700Bold', color: pal.banner, fontSize: 13 }]}>${getPrice(p).toFixed(2)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {CATEGORIES.map((cat) => {
          const pal = getPalette(cat.id === 'all' ? 'default' : cat.id);
          const active = activeCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => { setActiveCategory(cat.id); Haptics.selectionAsync(); }}
              style={[styles.catPill, { backgroundColor: active ? pal.banner : '#EAEAEA', borderRadius: 20 }]}
            >
              <Text style={[styles.catLabel, { color: active ? '#fff' : '#8E8E93', fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Featured grid */}
      <View style={styles.section}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : featured.length === 0 ? (
          <Text style={[styles.empty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>No products in this category yet.</Text>
        ) : (
          <View style={[styles.grid, { paddingHorizontal: 16 }]}>
            {featured.map((p) => <HomeTile key={p.id} product={p} onPress={() => handleTilePress(p)} />)}
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
  cartBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  cartBadgeText: { color: '#fff', fontSize: 13 },
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

  quickSection: { paddingHorizontal: 20, marginTop: 20, gap: 12 },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pickupIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center' },
  pickupLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  pickupTitle: { fontSize: 15 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  openText: { fontSize: 12 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickTile: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  quickIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickTileLabel: { fontSize: 12, textAlign: 'center' },

  section: { marginTop: 24 },
  sectionTitle: { fontSize: 20, paddingHorizontal: 20, marginBottom: 12 },

  // New tile design
  tile: {
    width: '48%',
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
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  tileEmoji: { fontSize: 48, lineHeight: 58 },
  newBadge: { position: 'absolute', top: 8, left: 8, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 9 },
  priceBadge: { position: 'absolute', top: 8, right: 8 },
  priceBadgeText: { fontSize: 15, color: '#1C1C1E' },
  soldOut: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bannerStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText: { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  tileBottom: { padding: 10, gap: 6, backgroundColor: '#fff' },
  tileNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  tileName: { fontSize: 12, color: '#1C1C1E', flex: 1 },
  orderNow: { fontSize: 13 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  tagText: { fontSize: 9 },

  // Merch tile
  merchTile: {
    width: 148,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  merchTileTop: {
    height: 130,
    position: 'relative',
    overflow: 'hidden',
  },

  // Fan Favourites tile
  favTile: {
    width: 130,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  favTop: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  favName: { fontSize: 12 },

  // Category filter
  catScroll: { marginTop: 24 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8 },
  catLabel: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
});
