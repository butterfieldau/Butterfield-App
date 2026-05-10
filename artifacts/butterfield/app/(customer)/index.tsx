import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { getPalette } from '@/constants/categoryColors';
import { buildGreeting } from '@/lib/greetings';
import { getTierConfig } from '@/constants/tierConfig';
import StoreInfoSheet from '@/components/StoreInfoSheet';
import { api, type ApiProduct, type HomeBannerConfig, type LiveContext } from '@/lib/api';
import ProductCustomizerSheet from '@/components/ProductCustomizerSheet';
import ProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_SIZE = Math.floor((SCREEN_W - 40 - 24) / 3);

const BLUE_TOP = '#40C0F2';
const BLUE_BTM = '#2AA8DC';

const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all',        label: 'All',      icon: 'grid'    },
  { id: 'cookies',    label: 'Cookies',  icon: 'star'    },
  { id: 'coffee',     label: 'Coffee',   icon: 'coffee'  },
  { id: 'desserts',   label: 'Desserts', icon: 'heart'   },
  { id: 'sandwiches', label: 'Food',     icon: 'layers'  },
  { id: 'bundles',    label: 'Bundles',  icon: 'gift'    },
];

const MERCH = [
  { id: 'merch-retro-shirt',   name: 'Retro Shirt',   price: 50, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldNEWTEE.jpg?v=1766964759&width=600' },
  { id: 'merch-bucket-hat',    name: 'Bucket Hat',    price: 20, image: 'https://butterfieldcookies.com.au/cdn/shop/files/butterefieldhat2.jpg?v=1764301783&width=600' },
  { id: 'merch-chunky-hoodie', name: 'Chunky Hoodie', price: 80, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldHoodiesBack.png?v=1751264789&width=600' },
  { id: 'merch-sugar-crew-tee',name: 'Sugar Crew Tee',price: 40, image: 'https://butterfieldcookies.com.au/cdn/shop/files/SugarCrewTeam2.jpg?v=1751264285&width=600' },
];


const BANNER_ROUTES: Record<string, string> = {
  menu:    '/(customer)/menu',
  loyalty: '/(customer)/loyalty',
  stores:  '/(customer)/stores',
  cart:    '/(customer)/cart',
  rewards: '/(customer)/loyalty',
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

function getTags(p: ApiProduct): string[] {
  const raw = p as any;
  const dietary = parseArr(raw.dietaryTags ?? p.metadata?.dietaryTags);
  if (dietary.length > 0) return dietary.slice(0, 3);
  const tags = parseArr(raw.tags ?? p.metadata?.tags);
  if (tags.length > 0) return tags.slice(0, 3);
  return getPalette(p.metadata?.category).defaultTags.slice(0, 3);
}

// ── Merch tile ────────────────────────────────────────────────────────────────
function MerchTile({ item, onPress }: { item: typeof MERCH[number]; onPress: () => void }) {
  const palette = getPalette('merch');
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={s.merchTile}>
      <View style={s.merchTileTop}>
        <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        <View style={s.priceBadge}>
          <Text style={[s.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${item.price}</Text>
        </View>
        <View style={[s.bannerStrip, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Text style={[s.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>In-store Pickup · Merrylands</Text>
        </View>
      </View>
      <View style={s.tileBottom}>
        <View style={s.tileNameRow}>
          <Text style={[s.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.arrow, { color: palette.banner, fontFamily: 'Inter_500Medium' }]}>↗</Text>
        </View>
        <View style={s.tagsRow}>
          {['Branded', 'Limited'].map((tag) => (
            <View key={tag} style={[s.tagChip, { backgroundColor: `${palette.bg}55` }]}>
              <Text style={[s.tagText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

// ── Hero banner ───────────────────────────────────────────────────────────────
function HeroBanner({ banner, onPress }: { banner: HomeBannerConfig | null; onPress: () => void }) {
  const hasImage = !!banner?.imageUrl;

  if (!banner) {
    return (
      <LinearGradient colors={[BLUE_TOP, BLUE_BTM]} style={s.fallbackBanner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.fallbackContent}>
          <Text style={[s.fallbackTag, { fontFamily: 'Inter_600SemiBold' }]}>🍪 DAILY SPECIAL</Text>
          <Text style={[s.fallbackTitle, { fontFamily: 'Inter_700Bold' }]}>Cookie & Cream Sandwich</Text>
          <Text style={[s.fallbackSub, { fontFamily: 'Inter_400Regular' }]}>Two warm cookies + vanilla cream</Text>
        </View>
        <View style={s.fallbackCircle} />
      </LinearGradient>
    );
  }

  const headline = banner.headline ?? '';
  const accent   = banner.headlineAccent ?? '';
  const subtext  = banner.subtext ?? '';
  const btnText  = banner.buttonText ?? 'Order Now';

  const headlineParts = accent && headline.includes(accent)
    ? headline.split(accent)
    : null;

  return (
    <Pressable style={s.heroBanner} onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
      {hasImage && (
        <Image source={{ uri: banner.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      )}
      {!hasImage && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1A0F07' }]} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]} />

      <View style={s.heroBannerInner}>
        <View style={{ flex: 1, gap: 6 }}>
          {headline ? (
            <Text style={[s.heroHeadline, { fontFamily: 'Inter_700Bold' }]}>
              {headlineParts ? (
                <>
                  <Text style={{ color: '#F59E0B' }}>{accent}</Text>
                  {headlineParts[1]}
                </>
              ) : headline}
            </Text>
          ) : null}
          {subtext ? (
            <Text style={[s.heroSubtext, { fontFamily: 'Inter_400Regular' }]}>{subtext}</Text>
          ) : null}
        </View>
        <Pressable style={s.heroBtn} onPress={onPress}>
          <Text style={[s.heroBtnText, { fontFamily: 'Inter_600SemiBold' }]}>{btnText}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ── Quick action tile ──────────────────────────────────────────────────────────
function QuickTile({
  label, emoji, bg, iconColor, featherIcon, onPress, hasArrow,
}: {
  label: string; emoji?: string; bg: string; iconColor: string;
  featherIcon: string; onPress: () => void; hasArrow?: boolean;
}) {
  return (
    <Pressable
      style={[s.quickTile, { width: TILE_SIZE, height: TILE_SIZE, backgroundColor: '#fff' }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <View style={[s.quickIconCircle, { backgroundColor: bg }]}>
        <Feather name={featherIcon as any} size={24} color={iconColor} />
      </View>
      <View style={s.quickLabelRow}>
        <Text style={[s.quickTileLabel, { fontFamily: 'Inter_700Bold', color: '#1C1C1E' }]} numberOfLines={2}>{label}</Text>
        {hasArrow && <Feather name="arrow-right" size={14} color="#8E8E93" />}
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');
  const [customizerProduct, setCustomizerProduct] = useState<ApiProduct | null>(null);
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);

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
  const { data: rewardsData } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.loyalty.rewards(),
    retry: 1,
  });
  const { data: storeStatusData } = useQuery({
    queryKey: ['store-status'],
    queryFn: () => api.misc.storeStatus(),
    refetchInterval: 60000,
    retry: 1,
  });
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    retry: 1,
  });
  const { data: bannerData } = useQuery({
    queryKey: ['home-banner'],
    queryFn: () => api.misc.homeBanner(),
    staleTime: 120000,
    retry: 1,
  });
  const { data: contextData } = useQuery({
    queryKey: ['live-context'],
    queryFn: () => api.misc.context(),
    staleTime: 4 * 60 * 60 * 1000,
    retry: 1,
  });
  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => api.stores.list(),
    staleTime: 120000,
    retry: 1,
  });
  const { data: topSellersData } = useQuery({
    queryKey: ['top-sellers'],
    queryFn: () => api.products.topSellers(),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const products       = productsData?.data ?? [];
  const loyaltyPoints  = loyaltyData?.data?.loyaltyPoints ?? 0;
  const loyaltyTier    = loyaltyData?.data?.loyaltyTier ?? 'bronze';
  const stampCount     = loyaltyData?.data?.stampCount ?? 0;
  const rewards        = rewardsData?.data ?? [];
  const banner         = bannerData?.data ?? null;
  const featuredStore  = (storesData?.data ?? [])[0] ?? null;
  const topSellers     = topSellersData?.data ?? [];

  const hasClaimableReward = useMemo(
    () => rewards.some((r: any) => r.type !== 'tier' && loyaltyPoints >= r.pointsCost),
    [rewards, loyaltyPoints],
  );

  const popular  = products.filter((p) => p.metadata?.popular === 'true');
  const featured = products.filter((p) =>
    activeCategory === 'all' ? true : p.metadata?.category === activeCategory,
  );

  const freshName = (meData?.user as any)?.name ?? user?.name;
  const firstName = freshName?.split(' ')[0] ?? 'there';
  const birthday  = (loyaltyData?.data as any)?.birthday ?? null;

  // Use the server-stored tier as the single source of truth.
  // The server recomputes and persists the correct tier on every profile fetch.
  const tierCfg = getTierConfig(loyaltyTier);

  const liveContext = (contextData?.data ?? null) as LiveContext | null;

  const favouriteCategory = useMemo(() => {
    const orders = ordersData?.data ?? [];
    if (orders.length === 0) return null;
    const productCategoryMap: Record<string, string> = {};
    for (const p of products) {
      const cat = p.metadata?.category;
      if (cat) productCategoryMap[p.id] = cat;
    }
    const recent = orders.slice(0, 10);
    const counts: Record<string, number> = {};
    for (const order of recent) {
      for (const item of (order.items ?? [])) {
        const cat =
          item.category ??
          item.metadata?.category ??
          (item.productId ? productCategoryMap[item.productId] : undefined);
        if (cat && cat !== 'merch') {
          counts[cat] = (counts[cat] ?? 0) + (item.quantity ?? 1);
        }
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const [topCat, topCount] = entries.sort(([, a], [, b]) => b - a)[0];
    return topCount / total >= 0.4 ? topCat : null;
  }, [ordersData, products]);

  const greeting = useMemo(() => buildGreeting({
    firstName,
    loyaltyPoints,
    hasClaimableReward,
    birthday,
    loyaltyTier: tierCfg.key,
    stampCount,
    liveContext,
    favouriteCategory,
  }), [firstName, loyaltyPoints, hasClaimableReward, birthday, tierCfg.key, stampCount, liveContext, favouriteCategory]);

  const storeStatus = storeStatusData?.data;
  const open = storeStatus?.isOpen ?? false;
  const storeHint = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt   ? `Opens ${storeStatus.opensAt}`         : 'Closed');

  const handleTilePress = useCallback((p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCustomizerProduct(p);
  }, []);

  const handleMerchPress = useCallback((item: typeof MERCH[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCustomizerProduct({
      id: item.id, name: item.name,
      description: 'Butterfield Cookies branded merchandise. Available in-store only.',
      images: [item.image],
      prices: [{ id: `price-${item.id}`, unit_amount: item.price * 100, currency: 'aud' }] as any,
      metadata: { category: 'merch', available: 'true' },
    } as any);
  }, []);

  const handleBannerPress = useCallback(() => {
    if (banner?.buttonUrl) {
      Linking.openURL(banner.buttonUrl).catch(() => {});
      return;
    }
    if (!banner?.buttonRoute) {
      router.push('/(customer)/menu');
      return;
    }
    const route = BANNER_ROUTES[banner.buttonRoute] ?? `/(customer)/${banner.buttonRoute}`;
    router.push(route as any);
  }, [banner]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ProductCustomizerSheet
        product={customizerProduct}
        visible={!!customizerProduct}
        onClose={() => setCustomizerProduct(null)}
      />
      <StoreInfoSheet
        visible={storeSheetVisible}
        store={featuredStore}
        onClose={() => setStoreSheetVisible(false)}
      />
      <OfflineBanner />
      {/* ── FROZEN BLUE HEADER ─────────────────────────────────────────── */}
      <View style={[s.frozenHeader, { paddingTop: insets.top + 10 }]}>
        {/* Row 1: logo left + loyalty chip right */}
        <View style={s.headerTopRow}>
          <Image
            source={require('@/assets/images/logo-white.png')}
            style={{ width: 110, height: 34 }}
            contentFit="contain"
          />
          <LinearGradient
            colors={tierCfg.gradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.loyaltyChip}
          >
            <Feather name="star" size={11} color="rgba(255,255,255,0.9)" />
            <Text style={[s.loyaltyPts, { fontFamily: 'Inter_700Bold' }]}>{loyaltyPoints.toLocaleString()} pts</Text>
            <View style={s.tierDivider} />
            <Text style={[s.loyaltyMember, { fontFamily: 'Inter_700Bold' }]}>{tierCfg.label.toUpperCase()}</Text>
          </LinearGradient>
        </View>

        {/* Row 2: greeting full width — no chip squeezing it */}
        <View>
          <Text style={[s.greetLine1, { fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>{greeting.line1}</Text>
          <Text style={[s.greetLine2, { fontFamily: 'Inter_400Regular' }]} numberOfLines={2}>{greeting.line2}</Text>
        </View>
      </View>

      {/* ── SCROLLABLE CONTENT ─────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE_TOP} />}
      >
        {/* Hero banner */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
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
              <Text style={[s.pickupLabel, { fontFamily: 'Inter_600SemiBold', color: BLUE_TOP }]}>IN-STORE PICKUP</Text>
              <Text style={[s.pickupTitle, { fontFamily: 'Inter_700Bold', color: colors.foreground }]} numberOfLines={1}>
                Butterfield Cookies — Merrylands
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <View style={[s.openDot, { backgroundColor: open ? '#22C55E' : '#EF4444' }]} />
                <Text style={[s.openText, { color: open ? '#15803D' : '#DC2626', fontFamily: 'Inter_500Medium' }]}>
                  {storeHint}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* ── 3 Perfect square quick action tiles ────────────────────────── */}
        <View style={s.quickSection}>
          <QuickTile
            label="Order cookies"
            featherIcon="package"
            bg="#E6F0FF"
            iconColor="#2A7BD2"
            onPress={() => router.push('/(customer)/menu')}
          />
          <QuickTile
            label="Rewards Club"
            featherIcon="star"
            bg="#FFF7E0"
            iconColor="#C07800"
            onPress={() => router.push('/(customer)/loyalty')}
          />
          <QuickTile
            label="Skip the queue"
            featherIcon="zap"
            bg="#FFF3E0"
            iconColor="#E07B00"
            onPress={() => router.push({ pathname: '/(customer)/menu', params: { category: 'coffee', skipQueue: '1' } })}
            hasArrow
          />
        </View>

        {/* Top Sellers */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Top Sellers</Text>
          {topSellers.length > 0 ? (
            <FlatList
              data={topSellers}
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
          ) : (
            <FlatList
              data={popular.length > 0 ? popular : products.slice(0, 6)}
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
          )}
        </View>

        {/* Fan Favourites */}
        {popular.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Fan Favourites</Text>
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
                      <View style={[s.bannerStrip, { backgroundColor: img ? 'rgba(0,0,0,0.4)' : pal.banner }]}>
                        <Text style={[s.bannerText, { fontFamily: 'Inter_500Medium' }]}>Pickup</Text>
                      </View>
                    </View>
                    <View style={{ padding: 8, gap: 2 }}>
                      <Text style={[s.favName, { fontFamily: 'Inter_600SemiBold', color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ fontFamily: 'Inter_700Bold', color: pal.banner, fontSize: 13 }}>
                        ${((p.prices?.[0]?.unit_amount ?? 0) / 100).toFixed(2)}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* Category carousel — Uber Eats style icon tiles */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.catScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        >
          {CATEGORIES.map((cat) => {
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
                <Text style={[s.catTileLabel, { color: active ? pal.banner : '#3C3C43', fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
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
            <Text style={[s.empty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
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

        {/* Merch — moved to bottom */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Merch</Text>
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
  // ── Frozen header ───────────────────────────────────────────────────────────
  frozenHeader: {
    backgroundColor: BLUE_TOP,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 14,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  greetLine1:   { color: '#fff', fontSize: 18, lineHeight: 24 },
  greetLine2:   { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18, marginTop: 1 },
  loyaltyChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexShrink: 0 },
  loyaltyPts:   { color: '#fff', fontSize: 13 },
  loyaltyMember:{ color: '#fff', fontSize: 11, letterSpacing: 0.5 },
  tierDivider:  { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.4)' },

  // ── Hero banner ─────────────────────────────────────────────────────────────
  heroBanner:      { height: 180, borderRadius: 18, overflow: 'hidden' },
  heroBannerInner: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', padding: 18, gap: 12 },
  heroHeadline:    { color: '#fff', fontSize: 22, lineHeight: 28 },
  heroSubtext:     { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18, marginTop: 2 },
  heroBtn:         { backgroundColor: '#C4793A', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 24, alignSelf: 'flex-end' },
  heroBtnText:     { color: '#fff', fontSize: 14 },

  fallbackBanner:  { height: 120, borderRadius: 18, padding: 18, overflow: 'hidden', justifyContent: 'center' },
  fallbackContent: { gap: 3, zIndex: 1 },
  fallbackTag:     { color: 'rgba(255,255,255,0.85)', fontSize: 11, letterSpacing: 0.8 },
  fallbackTitle:   { color: '#fff', fontSize: 18 },
  fallbackSub:     { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  fallbackCircle:  { position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.12)' },

  // ── Store pickup ────────────────────────────────────────────────────────────
  pickupRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pickupIconWrap:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center' },
  pickupLabel:   { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  pickupTitle:   { fontSize: 15 },
  openDot:       { width: 7, height: 7, borderRadius: 4 },
  openText:      { fontSize: 12 },

  // ── Quick action tiles (perfect squares) ────────────────────────────────────
  quickSection:  { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16, marginTop: 14 },
  quickTile:     { borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  quickIconCircle:{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  quickTileLabel:{ fontSize: 12, textAlign: 'center', lineHeight: 16 },

  // ── Shared tile parts ───────────────────────────────────────────────────────
  section:       { marginTop: 24 },
  sectionTitle:  { fontSize: 20, paddingHorizontal: 16, marginBottom: 12 },
  catScroll:     { marginTop: 24 },
  catTile:       { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, minWidth: 72 },
  catIconWrap:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catTileLabel:  { fontSize: 12, textAlign: 'center' },
  empty:         { textAlign: 'center', marginTop: 40, fontSize: 14 },

  tile:          { width: '48%', backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  tileImg:       { height: 150, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  tileEmoji:     { fontSize: 44, lineHeight: 54 },
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:     { color: '#fff', fontSize: 9 },
  soldOut:       { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  tileInfo:      { padding: 10, gap: 4, backgroundColor: '#fff' },
  tileName:      { fontSize: 13, color: '#1C1C1E', flex: 1 },
  tileDesc:      { fontSize: 11, color: '#8E8E93', lineHeight: 15 },
  tilePriceRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  tilePrice:     { fontSize: 15, color: '#1C1C1E' },
  tileAddBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },

  // ── Legacy styles still used by MerchTile / FavTile ─────────────────────────
  priceBadge:    { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceBadgeText:{ fontSize: 16, color: '#1C1C1E' },
  bannerStrip:   { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText:    { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  tileBottom:    { padding: 10, gap: 5, backgroundColor: '#fff' },
  tileNameRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  arrow:         { fontSize: 13 },
  tagsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagChip:       { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  tagText:       { fontSize: 9 },

  merchTile:     { width: 150, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  merchTileTop:  { height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },

  favTile:       { width: 140, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  favTop:        { height: 110, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  favName:       { fontSize: 12 },

  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
