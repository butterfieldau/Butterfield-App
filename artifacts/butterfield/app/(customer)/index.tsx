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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useColors } from '@/hooks/useColors';
import { getPalette } from '@/constants/categoryColors';
import { buildGreeting } from '@/lib/greetings';
import { useFavouriteCategory } from '@/hooks/useFavouriteCategory';
import { useStores } from '@/hooks/useStores';
import { getTierConfig } from '@/constants/tierConfig';
import StoreInfoSheet from '@/components/StoreInfoSheet';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { api, type ApiOrder, type ApiProduct, type HomeBannerConfig, type LiveContext } from '@/lib/api';
import type { SelectedCartOption } from '@/types';
import ProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { setSelectedProduct } from '@/lib/selectedProduct';

const BLUE_TOP = '#1493FF';
const BLUE_BTM = '#3CBBEE';
const CHERRY   = '#D0312D';

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
          <Text style={[s.priceBadgeText, { fontWeight: '700' }]}>${item.price}</Text>
        </View>
        <View style={[s.bannerStrip, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Text style={[s.bannerText, { fontWeight: '500' }]} numberOfLines={1}>In-store Pickup · Merrylands</Text>
        </View>
      </View>
      <View style={s.tileBottom}>
        <View style={s.tileNameRow}>
          <Text style={[s.tileName, { fontWeight: '700' }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.arrow, { color: palette.banner, fontWeight: '500' }]}>↗</Text>
        </View>
        <View style={s.tagsRow}>
          {['Branded', 'Limited'].map((tag) => (
            <View key={tag} style={[s.tagChip, { backgroundColor: `${palette.bg}55` }]}>
              <Text style={[s.tagText, { fontWeight: '500', color: palette.banner }]}>{tag}</Text>
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
  const label = banner?.headlineAccent?.trim() || 'New';
  const title = banner?.headline?.trim() || 'Cookies & Soft Serve';
  const subtext = banner?.subtext?.trim() || 'Available Friday -Sunday only!';
  const btnText = banner?.buttonText?.trim() || 'Order now';

  return (
    <Pressable style={s.heroBanner} onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
      <View style={s.heroImageWrap}>
        {hasImage ? (
          <Image source={{ uri: banner?.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        ) : (
          <LinearGradient colors={['#F4F8FC', '#E8EFF6']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
      </View>
      <LinearGradient colors={[BLUE_TOP, BLUE_BTM]} style={s.heroFooter} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.heroCopy}>
          <Text style={[s.heroLabel, { fontWeight: '600' }]} numberOfLines={1}>{label}</Text>
          <Text style={[s.heroHeadline, { fontWeight: '800' }]} numberOfLines={2}>{title}</Text>
          <Text style={[s.heroSubtext, { fontWeight: '500' }]} numberOfLines={2}>{subtext}</Text>
        </View>
        <Pressable style={s.heroBtn} onPress={onPress}>
          <Text style={[s.heroBtnText, { fontWeight: '700' }]}>{btnText}</Text>
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}

// ── Feature tiles ─────────────────────────────────────────────────────────────
function FeatureShortcutTile({
  title,
  titleColor,
  colors,
  imageSource,
  onPress,
  imageStyle,
  titleStyle,
  showArrow = false,
}: {
  title: string;
  titleColor: string;
  colors: [string, string, ...string[]];
  imageSource: any;
  onPress: () => void;
  imageStyle?: any;
  titleStyle?: any;
  showArrow?: boolean;
}) {
  return (
    <Pressable
      style={s.featureTile}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.featureTileBg}
      >
        <View style={s.featureTileImageWrap}>
          <Image source={imageSource} style={[s.featureTileImage, imageStyle]} contentFit="contain" />
        </View>
        <View style={s.featureTileFooter}>
          <Text
            style={[
              s.featureTileTitle,
              { color: titleColor, fontWeight: '700' },
              titleStyle,
            ]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {showArrow && <Feather name="arrow-right" size={18} color="#1C1C1E" />}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CustomerHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { totalItems, addItemToCart } = useCart();
  const [activeCategory, setActiveCategory] = useState('all');
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const { data: productsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    retry: 2,
  });
  const { data: loyaltyData, refetch: refetchLoyalty, isRefetching: loyaltyRefreshing } = useQuery({
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
    staleTime: 30 * 60 * 1000, // 30 minutes — matches server cache
    retry: 1,
  });
  const { data: storesData } = useStores();
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
  const stampCount     = loyaltyData?.data?.coffeeStampCount ?? loyaltyData?.data?.stampCount ?? 0;
  const rewards        = rewardsData?.data ?? [];
  const banner         = bannerData?.data ?? null;
  const featuredStore  = (storesData?.data ?? [])[0] ?? null;
  const topSellers     = topSellersData?.data ?? [];
  const qrToken        = loyaltyData?.data?.loyaltyQrToken ?? null;
  const qrValue        = loyaltyData?.data?.qrPayload
    ?? (qrToken ? `BUTTERFIELD:LOYALTY:${qrToken}` : null)
    ?? (loyaltyData?.data?.userId && loyaltyData?.data?.referralCode
      ? `BUTTERFIELD:${loyaltyData.data.userId}:${loyaltyData.data.referralCode}`
      : null);

  const hasClaimableReward = useMemo(
    () => rewards.some((r: any) => r.type !== 'tier' && loyaltyPoints >= r.pointsCost),
    [rewards, loyaltyPoints],
  );

  const popular  = products.filter((p) => p.metadata?.popular === 'true');
  const featured = products.filter((p) =>
    activeCategory === 'all' ? true : p.metadata?.category === activeCategory,
  );

  type UsualItem = {
    product: ApiProduct;
    variantId?: string;
    variantName?: string;
    basePriceCents: number;
    selectedOptions: SelectedCartOption[];
    quantity: number;
  };

  const usualItems = useMemo<UsualItem[]>(() => {
    const orders: ApiOrder[] = ordersData?.data ?? [];
    if (orders.length === 0 || products.length === 0) return [];
    const productMap = new Map(products.map((p) => [p.id, p]));
    const seen = new Set<string>();
    const result: UsualItem[] = [];
    const sorted = [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    for (const order of sorted) {
      if (result.length >= 3) break;
      for (const item of (order.items ?? [])) {
        if (result.length >= 3) break;
        const pid = item.productId as string | undefined;
        if (!pid || seen.has(pid)) continue;
        const product = productMap.get(pid);
        if (product) {
          seen.add(pid);
          const raw = item as any;
          // Derive base price: prefer saved basePriceCents, fall back to product price
          const basePriceCents: number =
            raw.basePriceCents ?? raw.unitPriceCents ?? (product.prices?.[0]?.unit_amount ?? 0);
          result.push({
            product,
            variantId:       raw.variantId,
            variantName:     raw.variantName,
            basePriceCents,
            selectedOptions: (raw.selectedOptions ?? []) as SelectedCartOption[],
            quantity:        raw.quantity ?? 1,
          });
        }
      }
    }
    return result;
  }, [ordersData, products]);

  const freshName = (meData?.user as any)?.name ?? user?.name;
  const firstName = freshName?.split(' ')[0] ?? 'there';
  const birthday  = (loyaltyData?.data as any)?.birthday ?? null;

  // Use the server-stored tier as the single source of truth.
  // The server recomputes and persists the correct tier on every profile fetch.
  const tierCfg = getTierConfig(loyaltyTier);

  const liveContext = (contextData?.data ?? null) as LiveContext | null;

  const favouriteCategory = useFavouriteCategory(products);

  const storeStatus = storeStatusData?.data;
  const open = storeStatus?.isOpen ?? false;

  const greeting = useMemo(() => buildGreeting({
    firstName,
    loyaltyPoints,
    hasClaimableReward,
    birthday,
    loyaltyTier: tierCfg.key,
    stampCount,
    liveContext,
    favouriteCategory,
    isOpen: storeStatus?.isOpen ?? true,
    opensAt: storeStatus?.opensAt ?? null,
  }), [firstName, loyaltyPoints, hasClaimableReward, birthday, tierCfg.key, stampCount, liveContext, favouriteCategory, storeStatus?.isOpen, storeStatus?.opensAt]);
  const storeHint = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt   ? `Opens ${storeStatus.opensAt}`         : 'Closed');

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
    if (!routeKey) {
      router.push('/(customer)/menu');
      return;
    }
    if (routeKey.startsWith('product:')) {
      const productId = routeKey.replace('product:', '').trim();
      if (productId) {
        router.push({ pathname: '/product', params: { id: productId } } as any);
        return;
      }
    }
    if (routeKey.startsWith('category:')) {
      const category = routeKey.replace('category:', '').trim();
      router.push({ pathname: '/(customer)/menu', params: category ? { category } : undefined } as any);
      return;
    }
    const route = BANNER_ROUTES[routeKey] ?? `/(customer)/${routeKey}`;
    router.push(route as any);
  }, [banner]);

  React.useEffect(() => {
    if (showQR && !qrValue && !loyaltyRefreshing) {
      refetchLoyalty();
    }
  }, [loyaltyRefreshing, qrValue, refetchLoyalty, showQR]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StoreInfoSheet
        visible={storeSheetVisible}
        store={featuredStore}
        onClose={() => setStoreSheetVisible(false)}
      />
      <OfflineBanner />

      {/* ── QR CODE MODAL ──────────────────────────────────────────────── */}
      <CustomerQrModal
        visible={showQR}
        onClose={() => setShowQR(false)}
        qrValue={qrValue}
        customerName={loyaltyData?.data?.customerName ?? freshName ?? 'Butterfield Member'}
        helperText="Show this to staff at Butterfield to collect coffee stamps."
        statusText={stampCount >= 6 ? 'Free coffee ready to claim at the counter.' : `${stampCount} of 6 coffee stamps collected.`}
        isLoading={loyaltyRefreshing && !qrValue}
        onRetry={() => { void refetchLoyalty(); }}
      />

      {/* ── FROZEN BLUE HEADER ─────────────────────────────────────────── */}
      <LinearGradient colors={[BLUE_TOP, BLUE_BTM]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.frozenHeader, { paddingTop: insets.top + 10 }]}>
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

      {/* ── SCROLLABLE CONTENT ─────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: 130 }}
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

        {/* ── 3 Perfect square quick action tiles ────────────────────────── */}
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
              <Text style={[s.usualSub, { color: colors.mutedForeground, fontWeight: '400' }]}>
                1 tap to add
              </Text>
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
                const optTotal = (selectedOptions ?? []).reduce((s, o) => s + (o.priceAdjustmentCents ?? 0), 0);
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
                        productId:       p.id,
                        productName:     p.name,
                        variantId,
                        variantName,
                        basePriceCents,
                        selectedOptions: selectedOptions ?? [],
                        quantity,
                        imageUrl:        p.images?.[0],
                        category:        (p as any).metadata?.category,
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
                      <Text style={[s.usualName, { color: colors.foreground, fontWeight: '600' }]} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {optSummary ? (
                        <Text style={[s.usualOpts, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {optSummary}
                        </Text>
                      ) : null}
                      <Text style={[s.usualPrice, { color: pal.banner, fontWeight: '700' }]}>
                        ${(unitCents / 100).toFixed(2)}
                      </Text>
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
                      <View style={[s.bannerStrip, { backgroundColor: img ? 'rgba(0,0,0,0.4)' : pal.banner }]}>
                        <Text style={[s.bannerText, { fontWeight: '500' }]}>Pickup</Text>
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

        {/* Merch — moved to bottom */}
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
  // ── Frozen header ───────────────────────────────────────────────────────────
  frozenHeader: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 14,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  greetLine1:   { color: '#fff', fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  greetLine2:   { color: 'rgba(255,255,255,0.92)', fontSize: 16, lineHeight: 22, marginTop: 4 },
  loyaltyChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, flexShrink: 0 },
  loyaltyPts:   { color: '#fff', fontSize: 13 },
  loyaltyMember:{ color: '#fff', fontSize: 11, letterSpacing: 0.5 },
  tierDivider:  { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.4)' },

  // ── Hero banner ─────────────────────────────────────────────────────────────
  heroBanner:      { borderRadius: 24, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  heroImageWrap:   { width: '100%', aspectRatio: 1.06, backgroundColor: '#EDF5FB' },
  heroFooter:      { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroCopy:        { flex: 1, gap: 3 },
  heroLabel:       { color: 'rgba(255,255,255,0.94)', fontSize: 16, letterSpacing: 0.2 },
  heroHeadline:    { color: '#fff', fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  heroSubtext:     { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18 },
  heroBtn:         { backgroundColor: CHERRY, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 22, alignSelf: 'flex-end', minWidth: 126, alignItems: 'center' },
  heroBtnText:     { color: '#fff', fontSize: 14 },

  // ── Store pickup ────────────────────────────────────────────────────────────
  pickupRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  pickupIconWrap:{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6F4FF', alignItems: 'center', justifyContent: 'center' },
  pickupLabel:   { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  pickupTitle:   { fontSize: 15 },
  openDot:       { width: 7, height: 7, borderRadius: 4 },
  openText:      { fontSize: 12 },

  // ── Feature shortcut tiles ──────────────────────────────────────────────────
  quickRail:        { paddingHorizontal: 16, gap: 12, marginTop: 18, flexDirection: 'row' },
  featureTile:      { flex: 1, aspectRatio: 0.94, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  featureTileBg:    { flex: 1, paddingHorizontal: 10, paddingTop: 12, paddingBottom: 18, overflow: 'hidden', justifyContent: 'space-between', alignItems: 'center' },
  featureTileImageWrap: { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center' },
  featureTileTitle: { fontSize: 13, lineHeight: 16, letterSpacing: -0.2, textAlign: 'center' },
  featureTileFooter: { width: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  featureTileImage: { width: '100%', height: '100%' },
  cookiesTileTitle: { fontSize: 15, lineHeight: 18, textAlign: 'center' },
  cookiesTileImage: { width: '88%', height: '88%', alignSelf: 'center', transform: [{ translateY: 2 }] },
  rewardsTileTitle: { fontSize: 15, lineHeight: 18, textAlign: 'center' },
  rewardsTileImage: { width: '74%', height: '74%', alignSelf: 'center' },
  skipTileTitle:    { fontSize: 15, lineHeight: 18, textAlign: 'center' },
  skipTileImage:    { width: '78%', height: '78%', alignSelf: 'center' },

  // ── Shared tile parts ───────────────────────────────────────────────────────
  section:       { marginTop: 26 },
  sectionTitle:  { fontSize: 22, paddingHorizontal: 16, marginBottom: 12 },
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

  usualHeader:   { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  usualSub:      { fontSize: 13 },
  usualCard: {
    width: 200, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  usualImgWrap:  { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usualInfo:     { flex: 1, gap: 2 },
  usualName:     { fontSize: 13, lineHeight: 17 },
  usualOpts:     { fontSize: 11, lineHeight: 14, fontWeight: '400' },
  usualPrice:    { fontSize: 13 },
  usualAddBtn:   { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // ── QR button (round, white) ─────────────────────────────────────────────
  qrBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },

  // ── QR modal ─────────────────────────────────────────────────────────────
  qrSheetContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  qrCard: {
    alignItems: 'center',
    gap: 10,
  },
  qrHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E0E0E5', marginBottom: 4 },
  qrTitle:    { fontSize: 22, color: '#083B57', textAlign: 'center', fontWeight: '800', letterSpacing: -0.2 },
  qrSub:      { fontSize: 13, color: 'rgba(8,59,87,0.76)', textAlign: 'center', lineHeight: 18 },
  qrBox: {
    width: 252, height: 252, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E8E8ED',
    marginVertical: 4,
  },
  qrFallback: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', gap: 10 },
  qrFallbackText: { fontSize: 13, color: '#3C3C43', textAlign: 'center' },
  qrStampsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  qrStampDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  qrStampLabel: { fontSize: 13, color: '#3C3C43', textAlign: 'center' },
  qrCode:     { fontSize: 13, color: 'rgba(8,59,87,0.72)', letterSpacing: 1.5, marginTop: 2 },
  qrCloseBtn: {
    marginTop: 6, width: '100%', paddingVertical: 14,
    borderRadius: 16, alignItems: 'center',
  },
});
