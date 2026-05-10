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
import { buildGreeting } from '@/lib/greetings';
import { api, type ApiProduct, type HomeBannerConfig } from '@/lib/api';

const { width: SCREEN_W } = Dimensions.get('window');
const TILE_SIZE = Math.floor((SCREEN_W - 40 - 24) / 3); // 3 tiles, 20px pad each side, 12px total gap

const BLUE_TOP = '#40C0F2';
const BLUE_BTM = '#2AA8DC';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'sandwiches', label: 'Food' },
  { id: 'bundles', label: 'Bundles' },
];

const MERCH = [
  { id: 'merch-retro-shirt',   name: 'Retro Shirt',   price: 50, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldNEWTEE.jpg?v=1766964759&width=600' },
  { id: 'merch-bucket-hat',    name: 'Bucket Hat',    price: 20, image: 'https://butterfieldcookies.com.au/cdn/shop/files/butterefieldhat2.jpg?v=1764301783&width=600' },
  { id: 'merch-chunky-hoodie', name: 'Chunky Hoodie', price: 80, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldHoodiesBack.png?v=1751264789&width=600' },
  { id: 'merch-sugar-crew-tee',name: 'Sugar Crew Tee',price: 40, image: 'https://butterfieldcookies.com.au/cdn/shop/files/SugarCrewTeam2.jpg?v=1751264285&width=600' },
];

const PRODUCT_IMAGES: Record<string, string> = {
  'Choc Chip Cookie':      'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Pistachio Cookie':      'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Pistachio_2880x2304_22fcddc2-bd6f-48b2-b5c0-cfe6528a14b5.jpg?v=1764302160&width=600',
  'Biscoff':               'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Biscoff_2880x2304_c0c0d24b-bd23-4dbf-b563-82b0d49eeb65.jpg?v=1764302195&width=600',
  'M&Ms Cookie':           'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_MAndMs.jpg?v=1764302008&width=600',
  'Red Velvet Cookie':     'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_RedValvet_2880x2304_1af322bc-b56c-4635-8477-309d188fe6dd.jpg?v=1764302309&width=600',
  'Almond Croissant Cookie':'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_AlmondCroissantCookie_2880x2304_ad98ea84-f045-47a1-8af7-e6b6e79fa74d.jpg?v=1771549363&width=600',
  'Bueno Cookie':          'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
};

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

// ── Product tile ──────────────────────────────────────────────────────────────
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
      style={[s.tile, { opacity: isSoldOut ? 0.72 : 1 }]}
    >
      <View style={[s.tileTop, { backgroundColor: imageUrl ? '#F0EDE8' : palette.bg }]}>
        {imageUrl
          ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
          : <Text style={s.tileEmoji}>{palette.emoji}</Text>
        }
        <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 }}>
          {isNew    && <View style={[s.badge, { backgroundColor: '#1C1C1E' }]}><Text style={[s.badgeText, { fontFamily: 'Inter_700Bold' }]}>NEW</Text></View>}
          {isLimited&& <View style={[s.badge, { backgroundColor: '#F40009' }]}><Text style={[s.badgeText, { fontFamily: 'Inter_700Bold' }]}>LIMITED</Text></View>}
        </View>
        <View style={s.priceBadge}>
          {saleCents ? <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#1C1C1E', textDecorationLine: 'line-through' }}>${(priceCents / 100).toFixed(0)}</Text> : null}
          <Text style={[s.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${price.toFixed(0)}</Text>
        </View>
        {isSoldOut && <View style={s.soldOut}><Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Sold Out</Text></View>}
        <View style={[s.bannerStrip, { backgroundColor: imageUrl ? 'rgba(0,0,0,0.45)' : palette.banner }]}>
          <Text style={[s.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>In-store Pickup · Merrylands</Text>
        </View>
      </View>
      <View style={s.tileBottom}>
        <View style={s.tileNameRow}>
          <Text style={[s.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[s.arrow, { color: palette.banner, fontFamily: 'Inter_500Medium' }]}>↗</Text>
        </View>
        <View style={s.tagsRow}>
          {tags.map((tag) => {
            const icon = DIETARY_ICONS[tag];
            return (
              <View key={tag} style={[s.tagChip, { backgroundColor: `${palette.bg}55` }]}>
                {icon ? <Text style={{ fontSize: 8 }}>{icon}</Text> : null}
                <Text style={[s.tagText, { fontFamily: 'Inter_500Medium', color: palette.banner }]}>{tag}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
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

  const products       = productsData?.data ?? [];
  const loyaltyPoints  = loyaltyData?.data?.loyaltyPoints ?? 0;
  const loyaltyTier    = loyaltyData?.data?.loyaltyTier ?? 'bronze';
  const stampCount     = loyaltyData?.data?.stampCount ?? 0;
  const rewards        = rewardsData?.data ?? [];
  const banner         = bannerData?.data ?? null;

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

  const greeting = useMemo(() => buildGreeting({
    firstName,
    loyaltyPoints,
    hasClaimableReward,
    birthday,
    loyaltyTier,
    stampCount,
  }), [firstName, loyaltyPoints, hasClaimableReward, birthday, loyaltyTier]);

  const storeStatus = storeStatusData?.data;
  const open = storeStatus?.isOpen ?? false;
  const storeHint = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt   ? `Opens ${storeStatus.opensAt}`         : 'Closed');

  const handleTilePress = useCallback((p: ApiProduct) => {
    setSelectedProduct(p);
    router.push('/product');
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
    router.push('/product');
  }, []);

  const handleBannerPress = useCallback(() => {
    if (!banner?.buttonRoute) {
      router.push('/(customer)/menu');
      return;
    }
    const route = BANNER_ROUTES[banner.buttonRoute] ?? `/(customer)/${banner.buttonRoute}`;
    router.push(route as any);
  }, [banner]);

  const tierLabel = loyaltyTier.charAt(0).toUpperCase() + loyaltyTier.slice(1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── FROZEN BLUE HEADER ─────────────────────────────────────────── */}
      <View style={[s.frozenHeader, { paddingTop: insets.top + 6 }]}>
        {/* Brand script wordmark */}
        <Text style={[s.wordmark, { fontFamily: 'DancingScript_700Bold' }]}>Butterfield</Text>

        {/* Greeting + Loyalty chip in one row */}
        <View style={s.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.greetLine1, { fontFamily: 'Inter_700Bold' }]}>{greeting.line1}</Text>
            <Text style={[s.greetLine2, { fontFamily: 'Inter_400Regular' }]}>{greeting.line2}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={s.loyaltyChip}>
              <Feather name="star" size={12} color="#FFE4A0" />
              <Text style={[s.loyaltyPts, { fontFamily: 'Inter_700Bold' }]}>{loyaltyPoints} pts</Text>
              <Text style={[s.loyaltyMember, { fontFamily: 'Inter_400Regular' }]}>· {tierLabel} Member</Text>
            </View>
            {totalItems > 0 && (
              <Pressable
                onPress={() => router.push('/(customer)/cart')}
                style={s.cartBadge}
              >
                <Feather name="shopping-bag" size={14} color="#fff" />
                <Text style={[s.cartCount, { fontFamily: 'Inter_700Bold' }]}>{totalItems}</Text>
              </Pressable>
            )}
          </View>
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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(customer)/stores'); }}
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
            label="Coffee Club"
            featherIcon="coffee"
            bg="#FFE6E6"
            iconColor="#D14444"
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

        {/* Merch */}
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

        {/* Category filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.catScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {CATEGORIES.map((cat) => {
            const pal    = getPalette(cat.id === 'all' ? 'default' : cat.id);
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => { setActiveCategory(cat.id); Haptics.selectionAsync(); }}
                style={[s.catPill, { backgroundColor: active ? pal.banner : '#EAEAEA' }]}
              >
                <Text style={[s.catLabel, { color: active ? '#fff' : '#8E8E93', fontFamily: active ? 'Inter_700Bold' : 'Inter_500Medium' }]}>
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
              {featured.map((p) => <HomeTile key={p.id} product={p} onPress={() => handleTilePress(p)} />)}
            </View>
          )}
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
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  wordmark:     { color: '#fff', fontSize: 36, textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 },
  greetingRow:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  greetLine1:   { color: '#fff', fontSize: 20, lineHeight: 26 },
  greetLine2:   { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 20, marginTop: 2 },
  cartBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16 },
  cartCount:    { color: '#fff', fontSize: 12 },
  loyaltyChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  loyaltyPts:   { color: '#FFE4A0', fontSize: 13 },
  loyaltyMember:{ color: 'rgba(255,255,255,0.82)', fontSize: 12 },

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
  catPill:       { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  catLabel:      { fontSize: 13 },
  empty:         { textAlign: 'center', marginTop: 40, fontSize: 14 },

  tile:          { width: '48%', backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  tileTop:       { height: 140, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  tileEmoji:     { fontSize: 48, lineHeight: 58 },
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:     { color: '#fff', fontSize: 9 },
  priceBadge:    { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceBadgeText:{ fontSize: 16, color: '#1C1C1E' },
  soldOut:       { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bannerStrip:   { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText:    { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  tileBottom:    { padding: 10, gap: 5, backgroundColor: '#fff' },
  tileNameRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  tileName:      { fontSize: 13, color: '#1C1C1E', flex: 1 },
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
