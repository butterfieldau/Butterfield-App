import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import { getPalette } from '@/constants/categoryColors';
import { HeroBanner } from '@/components/home/HeroBanner';
import { FeatureShortcutTile } from '@/components/home/FeatureShortcutTile';
import { MerchTile } from '@/components/home/MerchTile';
import StoreInfoSheet from '@/components/StoreInfoSheet';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';

const SLUG_ICON_MAP: Record<string, string> = {
  cookies:        'star',
  coffee:         'coffee',
  matcha:         'droplet',
  tea:            'sun',
  'cold-drinks':  'wind',
  cold:           'wind',
  drinks:         'droplet',
  desserts:       'heart',
  'soft-serve':   'feather',
  sandwiches:     'layers',
  food:           'layers',
  pastries:       'sun',
  specials:       'zap',
  seasonal:       'gift',
  merch:          'shopping-bag',
  bundles:        'gift',
  wholesale:      'truck',
};
function categoryIcon(slug: string): string {
  return SLUG_ICON_MAP[slug] ?? 'tag';
}
import ProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { setSelectedProduct } from '@/lib/selectedProduct';

const BLUE_TOP = '#1493FF';
const BLUE_BTM = '#3CBBEE';
const CHERRY   = '#D0312D';


const MERCH = [
  { id: 'merch-retro-shirt',    name: 'Retro Shirt',    price: 50, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldNEWTEE.jpg?v=1766964759&width=600' },
  { id: 'merch-bucket-hat',     name: 'Bucket Hat',     price: 20, image: 'https://butterfieldcookies.com.au/cdn/shop/files/butterefieldhat2.jpg?v=1764301783&width=600' },
  { id: 'merch-chunky-hoodie',  name: 'Chunky Hoodie',  price: 80, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldHoodiesBack.png?v=1751264789&width=600' },
  { id: 'merch-sugar-crew-tee', name: 'Sugar Crew Tee', price: 40, image: 'https://butterfieldcookies.com.au/cdn/shop/files/SugarCrewTeam2.jpg?v=1751264285&width=600' },
];

const BANNER_ROUTES: Record<string, string> = {
  menu:    '/(customer)/menu',
  loyalty: '/(customer)/loyalty',
  stores:  '/(customer)/stores',
  cart:    '/(customer)/cart',
  rewards: '/(customer)/loyalty',
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItemToCart } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const {
    products,
    isLoading,
    refetch,
    isRefetching,
    popular,
    loyaltyPoints,
    stampCount,
    tierCfg,
    loyaltyCustomerName,
    refetchLoyalty,
    loyaltyRefreshing,
    qrValue,
    storeStatus,
    open,
    storeHint,
    featuredStore,
    banner,
    topSellers,
    usualItems,
    greeting,
  } = useHomeScreenData();

  const { data: categoriesData } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.products.categories(),
    staleTime: 5 * 60 * 1000,
  });

  const displayCategories = useMemo(() => {
    const all = { id: 'all', label: 'All', icon: 'grid' };
    const remote = (categoriesData?.data ?? []).map((c: any) => ({
      id: c.slug,
      label: c.name,
      icon: categoryIcon(c.slug),
    }));
    return [all, ...remote];
  }, [categoriesData]);

  const featured = useMemo(
    () => products.filter((p) =>
      activeCategory === 'all' ? true : p.metadata?.category === activeCategory,
    ),
    [products, activeCategory],
  );

  const handleTilePress = useCallback((p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(p);
    router.push({ pathname: '/product', params: { id: p.id } } as any);
  }, []);

  const handleMerchPress = useCallback((item: typeof MERCH[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct({
      id: item.id, name: item.name,
      description: 'Butterfield Cookies branded merchandise. Available in-store only.',
      images: [item.image],
      prices: [{ id: `price-${item.id}`, unit_amount: item.price * 100, currency: 'aud' }] as any,
      metadata: { category: 'merch', available: 'true' },
    } as any);
    router.push({ pathname: '/product', params: { id: item.id } } as any);
  }, []);

  const handleBannerPress = useCallback(() => {
    if (banner?.buttonUrl) {
      Linking.openURL(banner.buttonUrl).catch(() => {});
      return;
    }
    const routeKey = banner?.buttonRoute?.trim();
    if (!routeKey) { router.push('/(customer)/menu'); return; }
    if (routeKey.startsWith('product:')) {
      const productId = routeKey.replace('product:', '').trim();
      if (productId) { router.push({ pathname: '/product', params: { id: productId } } as any); return; }
    }
    if (routeKey.startsWith('category:')) {
      const category = routeKey.replace('category:', '').trim();
      router.push({ pathname: '/(customer)/menu', params: category ? { category } : undefined } as any);
      return;
    }
    router.push((BANNER_ROUTES[routeKey] ?? `/(customer)/${routeKey}`) as any);
  }, [banner]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StoreInfoSheet
        visible={storeSheetVisible}
        store={featuredStore}
        onClose={() => setStoreSheetVisible(false)}
      />
      <OfflineBanner />

      <CustomerQrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        qrValue={qrValue}
        customerName={loyaltyCustomerName}
        helperText="Show this to staff at Butterfield to collect coffee stamps."
        statusText={stampCount >= 6 ? 'Free coffee ready to claim at the counter.' : `${stampCount} of 6 coffee stamps collected.`}
        isLoading={loyaltyRefreshing && !qrValue}
        onRetry={() => { void refetchLoyalty(); }}
      />

      {/* ── FROZEN BLUE HEADER ──────────────────────────────────────────── */}
      <LinearGradient colors={[BLUE_TOP, BLUE_BTM]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.frozenHeader, { paddingTop: insets.top + 14 }]}>
        <View style={s.headerTopRow}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={{ width: 118, height: 36 }}
            contentFit="contain"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LinearGradient
              colors={tierCfg.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.loyaltyChip}
            >
              <Feather name="star" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={[s.loyaltyPts, { fontWeight: '700' }]}>{loyaltyPoints.toLocaleString()} pts</Text>
              <View style={s.tierDivider} />
              <Text style={[s.loyaltyMember, { fontWeight: '700' }]}>{tierCfg.label.toUpperCase()}</Text>
            </LinearGradient>
            <Pressable
              style={s.qrBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQR(true); }}
              hitSlop={6}
            >
              <Feather name="grid" size={16} color={BLUE_TOP} />
            </Pressable>
          </View>
        </View>
        <View>
          <Text style={[s.greetLine1, { fontWeight: '800' }]} numberOfLines={2}>{greeting.line1}</Text>
          <Text style={[s.greetLine2, { fontWeight: '500' }]} numberOfLines={2}>{greeting.line2}</Text>
        </View>
      </LinearGradient>

      {/* ── SCROLLABLE CONTENT ──────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE_TOP} />}
      >
        {/* Hero banner */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, marginTop: -2 }}>
          <HeroBanner banner={banner} onPress={handleBannerPress} />
        </View>

        {/* Store pickup row */}
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Pressable
            style={[s.pickupRow, { backgroundColor: colors.card }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStoreSheetVisible(true); }}
          >
            <View style={s.pickupIconWrap}>
              <Feather name="map-pin" size={20} color={BLUE_TOP} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.pickupLabel, { fontWeight: '600', color: BLUE_TOP }]}>IN-STORE PICKUP</Text>
              <Text style={[s.pickupTitle, { fontWeight: '700', color: colors.foreground }]} numberOfLines={1}>
                Butterfield Cookies — Merrylands
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <View style={[s.openDot, { backgroundColor: open ? '#22C55E' : '#EF4444' }]} />
                <Text style={[s.openText, { color: open ? '#15803D' : '#DC2626', fontWeight: '500' }]}>
                  {storeHint}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Quick action tiles */}
        <View style={s.quickRail}>
          <FeatureShortcutTile
            title="Cookies"
            titleColor="#111827"
            colors={['#FFFFFF', '#E9E9E9']}
            imageSource={require('@/assets/images/home-character.png')}
            imageStyle={s.cookiesTileImage}
            titleStyle={s.cookiesTileTitle}
            onPress={() => router.push('/(customer)/menu')}
          />
          <FeatureShortcutTile
            title="Rewards club"
            titleColor="#111827"
            colors={['#FFCBFF', '#FA9E9E']}
            imageSource={require('@/assets/images/butterfield-app-gems.png')}
            imageStyle={s.rewardsTileImage}
            titleStyle={s.rewardsTileTitle}
            onPress={() => router.push('/(customer)/loyalty')}
          />
          <FeatureShortcutTile
            title="Skip the queue"
            titleColor="#111827"
            colors={['#D0E5F3', '#8AC5E4']}
            imageSource={require('@/assets/images/coffee-tray-skip.png')}
            imageStyle={s.skipTileImage}
            titleStyle={s.skipTileTitle}
            onPress={() => router.push({ pathname: '/(customer)/menu', params: { category: 'coffee', skipQueue: '1' } })}
            showArrow
          />
        </View>

        {/* Your usual */}
        {usualItems.length > 0 && (
          <View style={s.section}>
            <View style={s.usualHeader}>
              <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', marginBottom: 0 }]}>Your usual</Text>
              <Text style={[s.usualSub, { color: colors.mutedForeground, fontWeight: '400' }]}>1 tap to add</Text>
            </View>
            <FlatList
              data={usualItems}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u) => u.product.id}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              renderItem={({ item: u }) => {
                const { product: p, variantId, variantName, basePriceCents, selectedOptions, quantity } = u;
                const pal = getPalette(p.metadata?.category);
                const img = p.images?.[0] ?? PRODUCT_IMAGES[p.name] ?? null;
                const optTotal = (selectedOptions ?? []).reduce((sum, o) => sum + (o.priceAdjustmentCents ?? 0), 0);
                const unitCents = basePriceCents + optTotal;
                const optSummary = [
                  variantName,
                  ...(selectedOptions ?? []).map(o => o.textValue ?? o.optionName).filter(Boolean),
                ].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    style={[s.usualCard, { backgroundColor: colors.card }]}
                    onPress={() => {
                      addItemToCart({
                        productId: p.id, productName: p.name,
                        variantId, variantName, basePriceCents,
                        selectedOptions: selectedOptions ?? [],
                        quantity, imageUrl: p.images?.[0],
                        category: (p as any).metadata?.category,
                      });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                    android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                  >
                    <View style={[s.usualImgWrap, { backgroundColor: img ? '#F0EDE8' : pal.bg }]}>
                      {img
                        ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                        : <Text style={{ fontSize: 30 }}>{pal.emoji}</Text>
                      }
                    </View>
                    <View style={s.usualInfo}>
                      <Text style={[s.usualName, { color: colors.foreground, fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
                      {optSummary ? (
                        <Text style={[s.usualOpts, { color: colors.mutedForeground }]} numberOfLines={1}>{optSummary}</Text>
                      ) : null}
                      <Text style={[s.usualPrice, { color: pal.banner, fontWeight: '700' }]}>${(unitCents / 100).toFixed(2)}</Text>
                    </View>
                    <View style={[s.usualAddBtn, { backgroundColor: CHERRY }]}>
                      <Feather name="plus" size={16} color="#fff" />
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* Top Sellers */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700' }]}>Top Sellers</Text>
          <FlatList
            data={topSellers.length > 0 ? topSellers : (popular.length > 0 ? popular : products.slice(0, 6))}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item: p }) => (
              <View style={{ width: 160 }}>
                <ProductTile product={p} onPress={() => handleTilePress(p)} />
              </View>
            )}
          />
        </View>

        {/* Fan Favourites */}
        {popular.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700' }]}>Fan Favourites</Text>
            <FlatList
              data={popular}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              renderItem={({ item: p }) => {
                const pal = getPalette(p.metadata?.category);
                const img = p.images?.[0] ?? PRODUCT_IMAGES[p.name] ?? null;
                return (
                  <Pressable onPress={() => handleTilePress(p)} style={[s.favTile, { backgroundColor: colors.card }]}>
                    <View style={[s.favTop, { backgroundColor: img ? '#F0EDE8' : pal.bg }]}>
                      {img
                        ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                        : <Text style={{ fontSize: 36 }}>{pal.emoji}</Text>
                      }
                      <View style={[s.favBannerStrip, { backgroundColor: img ? 'rgba(0,0,0,0.4)' : pal.banner }]}>
                        <Text style={[s.favBannerText, { fontWeight: '500' }]}>Pickup</Text>
                      </View>
                    </View>
                    <View style={{ padding: 8, gap: 2 }}>
                      <Text style={[s.favName, { fontWeight: '600', color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontWeight: '700', color: pal.banner, fontSize: 13 }}>
                        ${((p.prices?.[0]?.unit_amount ?? 0) / 100).toFixed(2)}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* Category carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.catScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        >
          {displayCategories.map((cat) => {
            const pal    = getPalette(cat.id === 'all' ? 'default' : cat.id);
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => { setActiveCategory(cat.id); Haptics.selectionAsync(); }}
                style={[s.catTile, { borderColor: active ? pal.banner : '#E8E8ED', backgroundColor: active ? `${pal.banner}0F` : '#fff' }]}
              >
                <View style={[s.catIconWrap, { backgroundColor: active ? pal.banner : '#F2F2F7' }]}>
                  <Feather name={cat.icon as any} size={18} color={active ? '#fff' : '#636366'} />
                </View>
                <Text style={[s.catTileLabel, { color: active ? pal.banner : '#3C3C43', fontWeight: active ? '700' : '500' }]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Featured grid */}
        <View style={s.section}>
          {isLoading ? (
            <ActivityIndicator color={BLUE_TOP} style={{ marginTop: 40 }} />
          ) : featured.length === 0 ? (
            <Text style={[s.empty, { color: colors.mutedForeground, fontWeight: '400' }]}>
              No products in this category yet.
            </Text>
          ) : (
            <View style={[s.grid, { paddingHorizontal: 16 }]}>
              {featured.map((p) => (
                <View key={p.id} style={{ width: '48%' }}>
                  <ProductTile product={p} onPress={() => handleTilePress(p)} />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Merch */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700' }]}>Merch</Text>
          <FlatList
            data={MERCH}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => <MerchTile item={item} onPress={() => handleMerchPress(item)} />}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Frozen header ──────────────────────────────────────────────────────────
  frozenHeader:  { paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 16 },
  headerTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetLine1:    { color: '#fff', fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  greetLine2:    { color: 'rgba(255,255,255,0.92)', fontSize: 16, lineHeight: 22, marginTop: 4 },
  loyaltyChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexShrink: 0 },
  loyaltyPts:    { color: '#fff', fontSize: 13 },
  loyaltyMember: { color: '#fff', fontSize: 11, letterSpacing: 0.5 },
  tierDivider:   { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.4)' },
  qrBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },

  // ── Store pickup row ───────────────────────────────────────────────────────
  pickupRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pickupIconWrap:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center' },
  pickupLabel:   { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  pickupTitle:   { fontSize: 15 },
  openDot:       { width: 7, height: 7, borderRadius: 4 },
  openText:      { fontSize: 12 },

  // ── Quick action rail ──────────────────────────────────────────────────────
  quickRail:         { paddingHorizontal: 16, gap: 10, marginTop: 20, flexDirection: 'row' },
  cookiesTileTitle:  { fontSize: 14, lineHeight: 17, textAlign: 'center' },
  cookiesTileImage:  { width: '90%', height: '90%', alignSelf: 'center', transform: [{ translateY: 2 }] },
  rewardsTileTitle:  { fontSize: 14, lineHeight: 17, textAlign: 'center' },
  rewardsTileImage:  { width: '78%', height: '78%', alignSelf: 'center' },
  skipTileTitle:     { fontSize: 14, lineHeight: 17, textAlign: 'left' },
  skipTileImage:     { width: '76%', height: '76%', alignSelf: 'center' },

  // ── Your usual ─────────────────────────────────────────────────────────────
  usualHeader:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  usualSub:     { fontSize: 13 },
  usualCard:    { width: 200, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  usualImgWrap: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usualInfo:    { flex: 1, gap: 2 },
  usualName:    { fontSize: 13, lineHeight: 17 },
  usualOpts:    { fontSize: 11, lineHeight: 14, fontWeight: '400' },
  usualPrice:   { fontSize: 13 },
  usualAddBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // ── Fan Favourites ─────────────────────────────────────────────────────────
  favTile:       { width: 140, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  favTop:        { height: 110, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  favName:       { fontSize: 12 },
  favBannerStrip:{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  favBannerText: { fontSize: 9, color: '#fff', letterSpacing: 0.2 },

  // ── Category carousel ──────────────────────────────────────────────────────
  catScroll:    { marginTop: 28 },
  catTile:      { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, minWidth: 72 },
  catIconWrap:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catTileLabel: { fontSize: 12, textAlign: 'center' },

  // ── Featured grid & shared ─────────────────────────────────────────────────
  section:      { marginTop: 30 },
  sectionTitle: { fontSize: 22, paddingHorizontal: 16, marginBottom: 14 },
  empty:        { textAlign: 'center', marginTop: 40, fontSize: 14 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
