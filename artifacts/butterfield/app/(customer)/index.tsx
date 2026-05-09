import { Feather } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
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

const MERCH = [
  { id: 'merch-retro-shirt',    name: 'Retro Shirt',   price: 50, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldNEWTEE.jpg?v=1766964759&width=600' },
  { id: 'merch-bucket-hat',     name: 'Bucket Hat',    price: 20, image: 'https://butterfieldcookies.com.au/cdn/shop/files/butterefieldhat2.jpg?v=1764301783&width=600' },
  { id: 'merch-chunky-hoodie',  name: 'Chunky Hoodie', price: 80, image: 'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldHoodiesBack.png?v=1751264789&width=600' },
  { id: 'merch-sugar-crew-tee', name: 'Sugar Crew Tee',price: 40, image: 'https://butterfieldcookies.com.au/cdn/shop/files/SugarCrewTeam2.jpg?v=1751264285&width=600' },
];

const PRODUCT_IMAGES: Record<string, string> = {
  'Choc Chip Cookie':       'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Pistachio Cookie':       'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Pistachio_2880x2304_22fcddc2-bd6f-48b2-b5c0-cfe6528a14b5.jpg?v=1764302160&width=600',
  'Biscoff':                'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Biscoff_2880x2304_c0c0d24b-bd23-4dbf-b563-82b0d49eeb65.jpg?v=1764302195&width=600',
  'M&Ms Cookie':            'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_MAndMs.jpg?v=1764302008&width=600',
  'Red Velvet Cookie':      'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_RedValvet_2880x2304_1af322bc-b56c-4635-8477-309d188fe6dd.jpg?v=1764302309&width=600',
  'Almond Croissant Cookie':'https://butterfieldcookies.com.au/cdn/shop/files/ButterfieldCookies_AlmondCroissantCookie_2880x2304_ad98ea84-f045-47a1-8af7-e6b6e79fa74d.jpg?v=1771549363&width=600',
  'Bueno Cookie':           'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
  'Classic Choc Chip':      'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_ChocChip_2880x2304_0fb8e9b6-eb1d-4afe-97f5-0fca062170a8.jpg?v=1764302334&width=600',
  'Double Chocolate':       'https://butterfieldcookies.com.au/cdn/shop/files/Butterfield_Bueno_2880x2304_3b3d438c-63c9-41ae-82bc-92da907cf7ce.jpg?v=1764301910&width=600',
};

function darkenHex(hex: string, amount: number): string {
  try {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - amount);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - amount);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch { return '#2AA8DC'; }
}

function ProductScrollTile({ product, onPress }: { product: ApiProduct; onPress: () => void }) {
  const raw = product as any;
  const priceCents = raw.priceCents ?? product.prices?.[0]?.unit_amount ?? 0;
  const saleCents  = raw.salePriceCents;
  const price      = (saleCents ?? priceCents) / 100;
  const palette    = getPalette(product.metadata?.category);
  const available  = product.metadata?.available !== 'false';
  const isSoldOut  = !available || raw.isSoldOut;
  const isNew      = product.metadata?.isNew === 'true';
  const imageUrl   = product.images?.[0] ?? PRODUCT_IMAGES[product.name] ?? null;

  return (
    <Pressable
      onPress={() => { if (!isSoldOut) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[styles.scrollTile, { opacity: isSoldOut ? 0.72 : 1 }]}
    >
      <View style={[styles.scrollTileImg, { backgroundColor: imageUrl ? '#F0EDE8' : palette.bg }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        ) : (
          <Text style={{ fontSize: 32 }}>{palette.emoji}</Text>
        )}
        {isNew && (
          <View style={[styles.badge, { backgroundColor: '#1C1C1E', position: 'absolute', top: 6, left: 6 }]}>
            <Text style={[styles.badgeText, { fontFamily: 'Inter_700Bold' }]}>NEW</Text>
          </View>
        )}
        <View style={styles.priceBadge}>
          <Text style={[styles.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${price.toFixed(0)}</Text>
        </View>
        {isSoldOut && (
          <View style={styles.soldOut}>
            <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Sold Out</Text>
          </View>
        )}
        <View style={[styles.bannerStrip, { backgroundColor: imageUrl ? 'rgba(0,0,0,0.45)' : palette.banner }]}>
          <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>Pickup · Merrylands</Text>
        </View>
      </View>
      <View style={{ padding: 8, gap: 2 }}>
        <Text style={[styles.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{product.name}</Text>
        <Text style={{ fontFamily: 'Inter_500Medium', color: palette.banner, fontSize: 11 }}>↗ Add to order</Text>
      </View>
    </Pressable>
  );
}

function MerchScrollTile({ item, onPress }: { item: typeof MERCH[number]; onPress: () => void }) {
  const palette = getPalette('merch');
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={styles.scrollTile}>
      <View style={[styles.scrollTileImg, { backgroundColor: '#F0EDE8' }]}>
        <Image source={{ uri: item.image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
        <View style={styles.priceBadge}>
          <Text style={[styles.priceBadgeText, { fontFamily: 'Inter_700Bold' }]}>${item.price}</Text>
        </View>
        <View style={[styles.bannerStrip, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Text style={[styles.bannerText, { fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>In-store Pickup</Text>
        </View>
      </View>
      <View style={{ padding: 8, gap: 2 }}>
        <Text style={[styles.tileName, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{item.name}</Text>
        <Text style={{ fontFamily: 'Inter_500Medium', color: palette.banner, fontSize: 11 }}>↗ View item</Text>
      </View>
    </Pressable>
  );
}

function SpecialCard({ special }: { special: any }) {
  return (
    <View style={styles.specialCard}>
      {special.imageUrl ? (
        <Image source={{ uri: special.imageUrl }} style={styles.specialImg} contentFit="cover" transition={300} />
      ) : null}
      <View style={styles.specialBody}>
        {special.badgeText ? (
          <View style={styles.specialBadge}>
            <Text style={[styles.specialBadgeText, { fontFamily: 'Inter_700Bold' }]}>{special.badgeText}</Text>
          </View>
        ) : null}
        <Text style={[styles.specialTitle, { fontFamily: 'Inter_700Bold' }]}>{special.title}</Text>
        {special.subtitle ? (
          <Text style={[styles.specialSub, { fontFamily: 'Inter_400Regular' }]}>{special.subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

export default function CustomerHome() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { user }            = useAuth();
  const { totalItems }      = useCart();

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
  const { data: homeData } = useQuery({
    queryKey: ['home-content'],
    queryFn: () => api.misc.homeContent(),
    refetchInterval: 300000,
    staleTime: 60000,
    retry: 1,
  });

  const products        = productsData?.data ?? [];
  const loyaltyPoints   = loyaltyData?.data?.loyaltyPoints ?? 0;
  const stampCount      = loyaltyData?.data?.stampCount ?? 0;
  const stampsInCycle   = stampCount % 10;
  const stampsLeft      = stampsInCycle === 0 && stampCount > 0 ? 0 : 10 - stampsInCycle;

  const homeContent     = homeData?.data;
  const hero            = homeContent?.hero;
  const promo           = homeContent?.promo;
  const specials: any[] = homeContent?.specials ?? [];

  const heroBgColor = (hero?.bgColor?.trim() && hero.bgColor.trim().startsWith('#')) ? hero.bgColor.trim() : '#40C0F2';
  const heroBgDark  = darkenHex(heroBgColor, 45);

  const cookieProducts = products.filter((p) => p.metadata?.category === 'cookies');

  const storeStatus = storeStatusData?.data;
  const open        = storeStatus?.isOpen ?? false;
  const storeHint   = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt   ? `Opens ${storeStatus.opensAt}`       : 'Closed');

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const handleProductPress = useCallback((p: ApiProduct) => {
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

  const handleHeroBtn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const link = hero?.buttonLink ?? 'menu';
    const routes: Record<string, string> = {
      menu:    '/(customer)/menu',
      loyalty: '/(customer)/loyalty',
      cart:    '/(customer)/cart',
      orders:  '/(customer)/orders',
    };
    router.push((routes[link] ?? `/(customer)/${link}`) as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >

      {/* ─────────────── HERO / CAMPAIGN BANNER ─────────────── */}
      <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
        <LinearGradient
          colors={[heroBgColor, heroBgDark]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        {hero?.imageUrl ? (
          <Image
            source={{ uri: hero.imageUrl }}
            style={[StyleSheet.absoluteFill, { opacity: 0.28 }]}
            contentFit="cover"
          />
        ) : null}

        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={[styles.heroGreeting, { fontFamily: 'Inter_400Regular' }]}>{greeting},</Text>
              <Text style={[styles.heroName, { fontFamily: 'Inter_700Bold' }]}>{firstName}</Text>
            </View>
            {totalItems > 0 && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(customer)/cart'); }}
                style={styles.cartBadge}
              >
                <Feather name="shopping-bag" size={16} color="#fff" />
                <Text style={[styles.cartBadgeText, { fontFamily: 'Inter_700Bold' }]}>{totalItems}</Text>
              </Pressable>
            )}
          </View>

          {hero?.campaignTag ? (
            <Text style={[styles.campaignTag, { fontFamily: 'Inter_600SemiBold' }]}>{hero.campaignTag}</Text>
          ) : null}
          <Text style={[styles.campaignTitle, { fontFamily: 'Inter_700Bold' }]}>
            {hero?.campaignTitle ?? 'Fresh from the oven'}
          </Text>
          {hero?.campaignSubtitle ? (
            <Text style={[styles.campaignSub, { fontFamily: 'Inter_400Regular' }]}>{hero.campaignSubtitle}</Text>
          ) : null}
          {hero?.buttonText ? (
            <Pressable onPress={handleHeroBtn} style={styles.heroBtn}>
              <Text style={[styles.heroBtnText, { fontFamily: 'Inter_700Bold' }]}>{hero.buttonText}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ─────────────── POINTS / STATUS / QR BAR ─────────────── */}
      <View style={styles.loyaltyBarWrap}>
        <View style={styles.loyaltyBar}>
          <View style={styles.loyaltyCol}>
            <Text style={[styles.loyaltyLabel, { fontFamily: 'Inter_400Regular' }]}>Points</Text>
            <Text style={[styles.loyaltyVal, { fontFamily: 'Inter_700Bold' }]}>{loyaltyPoints.toLocaleString()}</Text>
          </View>
          <View style={styles.loyaltyDivider} />
          <View style={[styles.loyaltyCol, { flex: 1.6 }]}>
            <Text style={[styles.loyaltyLabel, { fontFamily: 'Inter_400Regular' }]}>Status</Text>
            <Text style={[styles.loyaltyVal, { fontFamily: 'Inter_700Bold' }]} numberOfLines={1} adjustsFontSizeToFit>
              {stampsLeft === 0 ? '☕ Free coffee!' : `${stampsLeft} to free ☕`}
            </Text>
          </View>
          <Pressable
            style={styles.qrBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(customer)/loyalty'); }}
            accessibilityLabel="Open QR code and rewards profile"
          >
            <MaterialCommunityIcons name="qrcode-scan" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* ─────────────── PROMO SECTION ─────────────── */}
      {(promo?.imageUrl || promo?.title) ? (
        <View style={[styles.promoCard, { borderRadius: 18 }]}>
          {promo?.imageUrl ? (
            <Image source={{ uri: promo.imageUrl }} style={styles.promoImg} contentFit="cover" transition={300} />
          ) : null}
          <View style={styles.promoTextWrap}>
            {promo?.title ? (
              <Text style={[styles.promoTitle, { fontFamily: 'Inter_700Bold' }]}>{promo.title}</Text>
            ) : null}
            {promo?.subtitle ? (
              <Text style={[styles.promoSub, { fontFamily: 'Inter_400Regular' }]}>{promo.subtitle}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ─────────────── STORE STATUS + QUICK ACTIONS ─────────────── */}
      <View style={styles.quickSection}>
        <Pressable
          style={[styles.pickupRow, { backgroundColor: colors.card, borderRadius: 16 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <View style={styles.pickupIconWrap}>
            <Feather name="map-pin" size={20} color="#40C0F2" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickupLabel, { fontFamily: 'Inter_600SemiBold', color: colors.primary }]}>IN-STORE PICKUP</Text>
            <Text style={[styles.pickupTitle, { fontFamily: 'Inter_700Bold', color: colors.foreground }]} numberOfLines={1}>
              Butterfield Cookies — Merrylands
            </Text>
            <View style={styles.openRow}>
              <View style={[styles.openDot, { backgroundColor: open ? '#22C55E' : '#EF4444' }]} />
              <Text style={[styles.openText, { color: open ? '#15803D' : '#DC2626', fontFamily: 'Inter_500Medium' }]}>{storeHint}</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>

        <View style={styles.quickRow}>
          {[
            { label: 'Order cookies', icon: 'package',      bg: '#E6F4FF', color: '#2A80D2', onPress: () => router.push('/(customer)/menu') },
            { label: 'Coffee Club',   icon: 'coffee',       bg: '#FFE8E8', color: '#C0392B', onPress: () => router.push('/(customer)/loyalty') },
            { label: 'My order',      icon: 'shopping-bag', bg: '#F5EDE6', color: '#B45309', onPress: () => router.push('/(customer)/cart') },
          ].map(({ label, icon, bg, color, onPress }) => (
            <Pressable
              key={label}
              style={[styles.quickTile, { backgroundColor: colors.card, borderRadius: 16 }]}
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

      {/* ─────────────── COOKIES ─────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>🍪 Cookies</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20, marginBottom: 10 }} />
        ) : cookieProducts.length > 0 ? (
          <FlatList
            data={cookieProducts}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            renderItem={({ item: p }) => (
              <ProductScrollTile product={p} onPress={() => handleProductPress(p)} />
            )}
          />
        ) : (
          <Text style={[styles.empty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular', paddingHorizontal: 20 }]}>
            No cookies in stock right now.
          </Text>
        )}
      </View>

      {/* ─────────────── MERCH ─────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>👕 Merch</Text>
        <FlatList
          data={MERCH}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => <MerchScrollTile item={item} onPress={() => handleMerchPress(item)} />}
        />
      </View>

      {/* ─────────────── SPECIALS ─────────────── */}
      {specials.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>🔥 Today's Specials</Text>
          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            {specials.map((s: any) => <SpecialCard key={s.id} special={s} />)}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /* ─── Hero ─── */
  hero: {
    paddingBottom: 28,
    overflow: 'hidden',
    minHeight: 210,
  },
  heroContent: {
    paddingHorizontal: 22,
    gap: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  heroGreeting: { color: 'rgba(255,255,255,0.78)', fontSize: 14 },
  heroName:     { color: '#fff', fontSize: 26 },
  cartBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  cartBadgeText: { color: '#fff', fontSize: 13 },
  campaignTag:  { color: 'rgba(255,255,255,0.82)', fontSize: 11, letterSpacing: 1.2, marginTop: 4 },
  campaignTitle:{ color: '#fff', fontSize: 22, lineHeight: 28 },
  campaignSub:  { color: 'rgba(255,255,255,0.74)', fontSize: 13, lineHeight: 18 },
  heroBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  heroBtnText: { color: '#fff', fontSize: 14 },

  /* ─── Loyalty bar ─── */
  loyaltyBarWrap: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  loyaltyBar: {
    backgroundColor: '#fff',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 5,
    overflow: 'hidden',
  },
  loyaltyCol: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 3,
  },
  loyaltyLabel: {
    fontSize: 11,
    color: '#8E8E93',
    letterSpacing: 0.3,
  },
  loyaltyVal: {
    fontSize: 18,
    color: '#1C1C1E',
  },
  loyaltyDivider: {
    width: 1,
    backgroundColor: '#EBEBEB',
    marginVertical: 12,
  },
  qrBtn: {
    width: 64,
    backgroundColor: '#40C0F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ─── Promo card ─── */
  promoCard: {
    marginHorizontal: 20,
    marginTop: 22,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  promoImg: {
    width: '100%',
    height: 180,
    backgroundColor: '#F0EDE8',
  },
  promoTextWrap: {
    padding: 16,
    gap: 5,
  },
  promoTitle: { fontSize: 17, color: '#1C1C1E', lineHeight: 23 },
  promoSub:   { fontSize: 13, color: '#6B7280', lineHeight: 19 },

  /* ─── Quick section ─── */
  quickSection: { paddingHorizontal: 20, marginTop: 22, gap: 12 },
  pickupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  pickupIconWrap: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6F4FF',
    alignItems: 'center', justifyContent: 'center',
  },
  pickupLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 2 },
  pickupTitle: { fontSize: 15 },
  openRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  openDot:     { width: 7, height: 7, borderRadius: 4 },
  openText:    { fontSize: 12 },
  quickRow:    { flexDirection: 'row', gap: 10 },
  quickTile: {
    flex: 1, alignItems: 'center', paddingVertical: 16, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  quickIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  quickTileLabel:  { fontSize: 12, textAlign: 'center' },

  /* ─── Section ─── */
  section:      { marginTop: 28 },
  sectionTitle: { fontSize: 20, paddingHorizontal: 20, marginBottom: 12 },
  empty:        { fontSize: 14, marginTop: 8, marginBottom: 8 },

  /* ─── Scroll tile (cookies + merch) ─── */
  scrollTile: {
    width: 158,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  scrollTileImg: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F0EDE8',
  },
  badge:         { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:     { color: '#fff', fontSize: 9 },
  priceBadge:    { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  priceBadgeText:{ fontSize: 14, color: '#1C1C1E' },
  soldOut:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bannerStrip:   { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  bannerText:    { color: '#fff', fontSize: 10 },
  tileName:      { fontSize: 14, color: '#1C1C1E' },

  /* ─── Special card ─── */
  specialCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  specialImg: {
    width: '100%',
    height: 160,
    backgroundColor: '#F5F0EB',
  },
  specialBody:    { padding: 14, gap: 5 },
  specialBadge:   { alignSelf: 'flex-start', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginBottom: 2 },
  specialBadgeText:{ fontSize: 10, color: '#B45309', letterSpacing: 0.8 },
  specialTitle:   { fontSize: 16, color: '#1C1C1E', lineHeight: 22 },
  specialSub:     { fontSize: 13, color: '#6B7280', lineHeight: 19 },
});
