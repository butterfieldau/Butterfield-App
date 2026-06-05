import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { useHomeScreenData } from '@/hooks/useHomeScreenData';
import { getPalette } from '@/constants/categoryColors';
import { HeroBanner } from '@/components/home/HeroBanner';
import { FeatureShortcutTile } from '@/components/home/FeatureShortcutTile';
import StoreInfoSheet from '@/components/StoreInfoSheet';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { api, type ApiProduct } from '@/lib/api';
import ProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { setPreselectedOptions } from '@/lib/preselectedOptions';
import { useRefreshControl } from '@/hooks/useRefreshControl';

const BLUE_TOP = '#1493FF';
const BLUE_BTM = '#3CBBEE';
const CHERRY   = '#D0312D';

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
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { addItemToCart } = useCart();
  const { user } = useAuth();
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  // ── Responsive layout ──────────────────────────────────────────────────────
  const { width, height } = useWindowDimensions();
  const isTablet    = width >= 768;
  const isLandscape = isTablet && width > height;
  const hPad        = isTablet ? (isLandscape ? 24 : 22) : 16;
  const productTileW  = isTablet ? (isLandscape ? 210 : 190) : 160;
  const favTileW      = isTablet ? (isLandscape ? 170 : 156) : 140;
  const browseCardW   = isTablet ? (isLandscape ? 170 : 156) : 140;
  const usualCardW    = isTablet ? 270 : 200;
  // Portrait tablet gets extra vertical breathing room between sections
  const sectionGap    = isTablet && !isLandscape ? 42 : isTablet ? 36 : 30;
  const sectionTitleSize = isTablet ? 24 : 22;
  // Left column width on landscape iPad (hero + tiles)
  const LEFT_COL_W = isLandscape ? Math.min(width * 0.44, 430) : 0;

  const {
    products,
    isLoading,
    refetch,
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

  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchLoyalty);
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.products.categories(),
    staleTime: 0,
  });

  const homeCats = useMemo(() => {
    const backendCats: any[] = categoriesData?.data ?? [];
    const onHome = backendCats.filter(c => c.showOnHome);
    const source = onHome.length > 0 ? onHome : backendCats;
    return source
      .slice()
      .sort((a, b) => (a.homeOrder ?? a.sortOrder ?? 0) - (b.homeOrder ?? b.sortOrder ?? 0))
      .map(c => ({ id: c.slug as string, label: c.name as string }));
  }, [categoriesData]);

  const browseCats = useMemo(() => {
    const backendCats: any[] = categoriesData?.data ?? [];
    return backendCats.map(c => ({
      id: c.id as string,
      slug: c.slug as string,
      label: c.name as string,
      imageUrl: c.imageUrl as string | null,
    }));
  }, [categoriesData]);

  const handleTilePress = useCallback((p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(p);
    router.push({ pathname: '/product', params: { id: p.id } } as any);
  }, []);

  const handleUsualPress = useCallback((u: typeof usualItems[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedProduct(u.product);
    setPreselectedOptions({
      selectedOptions: u.selectedOptions ?? [],
      quantity: u.quantity ?? 1,
    });
    router.push({ pathname: '/product', params: { id: u.product.id } } as any);
  }, [usualItems]);

  const handleAddToCart = useCallback((p: ApiProduct) => {
    const raw = p as any;
    const priceCents = raw.priceCents ?? p.prices?.[0]?.unit_amount ?? 0;
    addItemToCart({
      productId: p.id,
      productName: p.name,
      variantId: undefined,
      variantName: undefined,
      basePriceCents: priceCents,
      selectedOptions: [],
      quantity: 1,
      imageUrl: p.images?.[0] ?? PRODUCT_IMAGES[p.name],
      category: p.metadata?.category,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addItemToCart]);

  const handleBannerPress = useCallback(() => {
    if (banner?.buttonUrl) {
      Linking.openURL(banner.buttonUrl).catch(() => {});
      return;
    }
    const routeKey = banner?.buttonRoute?.trim();
    if (!routeKey) { router.push('/(customer)/menu'); return; }
    if (!user && ['loyalty', 'rewards', 'cart'].includes(routeKey)) {
      setLoginTarget(routeKey === 'cart' ? '/(customer)/cart' : '/(customer)/loyalty');
      return;
    }
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

  // ── Reusable section renderers ─────────────────────────────────────────────
  const heroBannerSection = (
    <View style={{ paddingHorizontal: hPad, paddingTop: isTablet ? 18 : 12, marginTop: -2 }}>
      <HeroBanner banner={banner} onPress={handleBannerPress} />
    </View>
  );

  const storePickupSection = (
    <View style={{ paddingHorizontal: hPad, marginTop: isTablet ? 20 : 14 }}>
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
            {featuredStore?.name ?? 'Select your store'}
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
  );

  const quickTilesSection = (
    <View style={[s.quickRail, {
      paddingHorizontal: hPad,
      marginTop: isTablet ? 18 : 20,
      height: isTablet ? (isLandscape ? 176 : 156) : undefined,
    }]}>
      <FeatureShortcutTile
        title="Cookies"
        titleColor="#111827"
        colors={['#FFFFFF', '#E9E9E9']}
        imageSource={require('@/assets/images/home-character.png')}
        imageStyle={s.cookiesTileImage}
        titleStyle={[s.cookiesTileTitle, isTablet && { fontSize: 16 }]}
        onPress={() => router.push('/(customer)/menu')}
      />
      <FeatureShortcutTile
        title="Rewards club"
        titleColor="#111827"
        colors={['#FFCBFF', '#FA9E9E']}
        imageSource={require('@/assets/images/butterfield-app-gems.png')}
        imageStyle={s.rewardsTileImage}
        titleStyle={[s.rewardsTileTitle, isTablet && { fontSize: 16 }]}
        onPress={() => {
          if (!user) { setLoginTarget('/(customer)/loyalty'); return; }
          router.push('/(customer)/loyalty');
        }}
      />
      <FeatureShortcutTile
        title="Skip the queue"
        titleColor="#111827"
        colors={['#D0E5F3', '#8AC5E4']}
        imageSource={require('@/assets/images/coffee-tray-skip.png')}
        imageStyle={s.skipTileImage}
        titleStyle={[s.skipTileTitle, isTablet && { fontSize: 16 }]}
        onPress={() => router.push({ pathname: '/(customer)/menu', params: { category: 'coffee', skipQueue: '1' } })}
        showArrow
      />
    </View>
  );

  const usualSection = usualItems.length > 0 ? (
    <View style={{ marginTop: sectionGap }}>
      <View style={[s.usualHeader, { paddingHorizontal: hPad }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', marginBottom: 0, paddingHorizontal: 0, fontSize: sectionTitleSize }]}>Your usual</Text>
        <Text style={[s.usualSub, { color: colors.mutedForeground, fontWeight: '400' }]}>1 tap to add</Text>
      </View>
      <FlatList
        data={usualItems}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u) => u.product.id}
        contentContainerStyle={{ paddingHorizontal: hPad, gap: 10 }}
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
              style={[s.usualCard, { backgroundColor: colors.card, width: usualCardW }]}
              onPress={() => handleUsualPress(u)}
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
              <Pressable
                style={[s.usualAddBtn, { backgroundColor: CHERRY }]}
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  addItemToCart({
                    productId: p.id, productName: p.name,
                    variantId, variantName, basePriceCents,
                    selectedOptions: selectedOptions ?? [],
                    quantity, imageUrl: p.images?.[0],
                    category: (p as any).metadata?.category,
                  });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              >
                <Feather name="plus" size={16} color="#fff" />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  ) : null;

  const topSellersSection = (
    <View style={{ marginTop: sectionGap }}>
      <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', paddingHorizontal: hPad, fontSize: sectionTitleSize }]}>Top Sellers</Text>
      <FlatList
        data={topSellers.length > 0 ? topSellers : (popular.length > 0 ? popular : products.slice(0, 6))}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
        renderItem={({ item: p }) => (
          <View style={{ width: productTileW }}>
            <ProductTile product={p} onPress={() => handleTilePress(p)} onAddToCart={() => handleAddToCart(p)} />
          </View>
        )}
      />
    </View>
  );

  const fanFavSection = popular.length > 0 ? (
    <View style={{ marginTop: sectionGap }}>
      <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', paddingHorizontal: hPad, fontSize: sectionTitleSize }]}>Fan Favourites</Text>
      <FlatList
        data={popular}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
        renderItem={({ item: p }) => {
          const pal = getPalette((p as any).metadata?.category);
          const img = (p as any).images?.[0] ?? PRODUCT_IMAGES[p.name] ?? null;
          return (
            <Pressable onPress={() => handleTilePress(p)} style={[s.favTile, { backgroundColor: colors.card, width: favTileW }]}>
              <View style={[s.favTop, { backgroundColor: img ? '#F0EDE8' : pal.bg, height: isTablet ? 130 : 110 }]}>
                {img
                  ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                  : <Text style={{ fontSize: 36 }}>{pal.emoji}</Text>}
                <View style={[s.favBannerStrip, { backgroundColor: img ? 'rgba(0,0,0,0.4)' : pal.banner }]}>
                  <Text style={[s.favBannerText, { fontWeight: '500' }]}>Pickup</Text>
                </View>
              </View>
              <View style={{ padding: isTablet ? 10 : 8, gap: 2 }}>
                <Text style={[s.favName, { fontWeight: '600', color: colors.foreground, fontSize: isTablet ? 13 : 12 }]} numberOfLines={1}>{p.name}</Text>
                <Text style={{ fontWeight: '700', color: pal.banner, fontSize: isTablet ? 14 : 13 }}>
                  ${((p.prices?.[0]?.unit_amount ?? 0) / 100).toFixed(2)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  ) : null;

  const catProductSections = isLoading ? (
    <ActivityIndicator color={BLUE_TOP} style={{ marginTop: 40 }} />
  ) : (
    <>
      {homeCats.map((cat) => {
        const catItems = products
          .filter((p) => (p as any).metadata?.category === cat.id)
          .slice(0, 8);
        if (catItems.length === 0) return null;
        return (
          <View key={cat.id} style={{ marginTop: sectionGap }}>
            <View style={[s.catRowHeader, { paddingHorizontal: hPad }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', paddingHorizontal: 0, marginBottom: 0, fontSize: sectionTitleSize }]}>
                {cat.label}
              </Text>
              <Pressable
                hitSlop={8}
                onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(customer)/menu', params: { category: cat.id } } as any); }}
              >
                <Text style={[s.viewMoreLink, { color: BLUE_TOP }]}>View more</Text>
              </Pressable>
            </View>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={catItems}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
              renderItem={({ item: p }) => (
                <View style={{ width: productTileW }}>
                  <ProductTile product={p} onPress={() => handleTilePress(p)} onAddToCart={() => handleAddToCart(p)} />
                </View>
              )}
            />
          </View>
        );
      })}
    </>
  );

  const browseCatSection = browseCats.length > 0 ? (
    <View style={{ marginTop: sectionGap }}>
      <View style={[s.catRowHeader, { paddingHorizontal: hPad }]}>
        <Text style={[s.sectionTitle, { color: colors.foreground, fontWeight: '700', paddingHorizontal: 0, marginBottom: 0, fontSize: sectionTitleSize }]}>
          Browse Categories
        </Text>
        <Pressable hitSlop={8} onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/menu'); }}>
          <Text style={[s.viewMoreLink, { color: BLUE_TOP }]}>See all</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={browseCats}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
        renderItem={({ item: c }) => {
          const pal = getPalette(c.slug);
          const imgUrl = c.imageUrl
            ? (c.imageUrl.startsWith('http') ? c.imageUrl : `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ''}${c.imageUrl}`)
            : null;
          return (
            <Pressable
              key={c.id}
              onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/(customer)/menu', params: { category: c.slug } } as any); }}
              style={[s.browseCard, { backgroundColor: imgUrl ? '#1a1a2e' : pal.bg, width: browseCardW, height: isTablet ? 118 : 100 }]}
            >
              {imgUrl ? (
                <Image
                  source={{ uri: imgUrl }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 }}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
              <View style={s.browseOverlay}>
                <Text style={[s.browseLabel, { fontWeight: '700', fontSize: isTablet ? 15 : 14 }]} numberOfLines={2}>{c.label}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StoreInfoSheet
        visible={storeSheetVisible}
        store={featuredStore}
        onClose={() => setStoreSheetVisible(false)}
      />
      <LoginRequiredModal
        visible={!!loginTarget}
        redirectTo={loginTarget ?? undefined}
        onCancel={() => setLoginTarget(null)}
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
      <LinearGradient
        colors={[BLUE_TOP, BLUE_BTM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.frozenHeader, {
          paddingTop: insets.top + (isTablet ? 18 : 14),
          paddingHorizontal: hPad,
        }]}
      >
        {isLandscape ? (
          /* Landscape iPad: greeting on left, logo + loyalty on right */
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.greetLine1, { fontWeight: '800', fontSize: 28 }]} numberOfLines={1}>{greeting.line1}</Text>
              <Text style={[s.greetLine2, { fontWeight: '500', fontSize: 17 }]} numberOfLines={1}>{greeting.line2}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image
                source={require('@/assets/images/logo-white.png')}
                style={{ width: 118, height: 36 }}
                contentFit="contain"
              />
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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (!user) { setLoginTarget('/(customer)/loyalty'); return; }
                  setShowQR(true);
                }}
                hitSlop={6}
              >
                <Feather name="grid" size={16} color={BLUE_TOP} />
              </Pressable>
            </View>
          </View>
        ) : (
          /* Portrait (phone + iPad portrait): stacked header */
          <>
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
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!user) { setLoginTarget('/(customer)/loyalty'); return; }
                    setShowQR(true);
                  }}
                  hitSlop={6}
                >
                  <Feather name="grid" size={16} color={BLUE_TOP} />
                </Pressable>
              </View>
            </View>
            <View>
              <Text style={[s.greetLine1, { fontWeight: '800', fontSize: isTablet ? 28 : 24 }]} numberOfLines={2}>{greeting.line1}</Text>
              <Text style={[s.greetLine2, { fontWeight: '500', fontSize: isTablet ? 17 : 16 }]} numberOfLines={2}>{greeting.line2}</Text>
            </View>
          </>
        )}
      </LinearGradient>

      {/* ── SCROLLABLE CONTENT ──────────────────────────────────────────── */}
      {isLandscape ? (
        /* ── iPad LANDSCAPE: two columns, each with independent scroll ── */
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left column — hero + store + tiles + usual, scrolls on its own */}
          <ScrollView
            style={{ width: LEFT_COL_W, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(0,0,0,0.1)' }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          >
            {heroBannerSection}
            {storePickupSection}
            {quickTilesSection}
            {usualSection}
          </ScrollView>
          {/* Right column — product sections, scrolls independently */}
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE_TOP} />}
          >
            {topSellersSection}
            {fanFavSection}
            {catProductSections}
            {browseCatSection}
          </ScrollView>
        </View>
      ) : (
        /* ── Phone + iPad Portrait: single column ───────────────────── */
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE_TOP} />}
        >
          {heroBannerSection}
          {storePickupSection}
          {quickTilesSection}
          {usualSection}
          {topSellersSection}
          {fanFavSection}
          {catProductSections}
          {browseCatSection}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  // ── Frozen header ──────────────────────────────────────────────────────────
  frozenHeader:  { paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 16 },
  headerTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetLine1:    { color: '#fff', lineHeight: 32, letterSpacing: -0.4 },
  greetLine2:    { color: 'rgba(255,255,255,0.92)', lineHeight: 22, marginTop: 4 },
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
  quickRail:         { gap: 10, flexDirection: 'row' },
  cookiesTileTitle:  { fontSize: 14, lineHeight: 17, textAlign: 'center' },
  cookiesTileImage:  { width: '90%', height: '90%', alignSelf: 'center', transform: [{ translateY: 2 }] },
  rewardsTileTitle:  { fontSize: 14, lineHeight: 17, textAlign: 'center' },
  rewardsTileImage:  { width: '78%', height: '78%', alignSelf: 'center' },
  skipTileTitle:     { fontSize: 14, lineHeight: 17, textAlign: 'left' },
  skipTileImage:     { width: '76%', height: '76%', alignSelf: 'center' },
  // ── Your usual ─────────────────────────────────────────────────────────────
  usualHeader:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  usualSub:     { fontSize: 13 },
  usualCard:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  usualImgWrap: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usualInfo:    { flex: 1, gap: 2 },
  usualName:    { fontSize: 13, lineHeight: 17 },
  usualOpts:    { fontSize: 11, lineHeight: 14, fontWeight: '400' },
  usualPrice:   { fontSize: 13 },
  usualAddBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // ── Fan Favourites ─────────────────────────────────────────────────────────
  favTile:       { borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  favTop:        { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' },
  favName:       { fontSize: 12 },
  favBannerStrip:{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8, alignItems: 'center' },
  favBannerText: { fontSize: 9, color: '#fff', letterSpacing: 0.2 },
  // ── Category rows & shared ─────────────────────────────────────────────────
  sectionTitle:  { fontSize: 22, marginBottom: 14 },
  catRowHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  viewMoreLink:  { fontSize: 14, fontWeight: '600' },
  empty:         { textAlign: 'center', marginTop: 40, fontSize: 14 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // ── Browse Categories strip ────────────────────────────────────────────────
  browseCard:    { borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  browseOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.38)' },
  browseLabel:   { color: '#fff', lineHeight: 18 },
});
