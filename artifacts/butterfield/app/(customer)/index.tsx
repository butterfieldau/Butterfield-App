import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { useScrollToTopCompat as useScrollToTop } from '@/hooks/useScrollToTopCompat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
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
import StoreInfoSheet from '@/components/StoreInfoSheet';
import { CustomerQrModal } from '@/components/CustomerQrModal';
import { api, type ApiProduct } from '@/lib/api';
import ProductTile, { PRODUCT_IMAGES } from '@/components/ProductTile';
import OfflineBanner from '@/components/OfflineBanner';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';
import { setSelectedProduct } from '@/lib/selectedProduct';
import { setPreselectedOptions } from '@/lib/preselectedOptions';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import BannerPicksCarousel from '@/components/BannerPicksCarousel';
import { SvgXml } from 'react-native-svg';
import { EARN_POINTS_SVG, BIRTHDAY_TREAT_SVG } from '@/constants/benefit-icons';
import { CoffeeStampIcon } from '@/components/CoffeeStampIcon';

const HERO_TOP = '#0C1428';
const HERO_BTM = '#162040';
const BLUE     = '#40C0F2';

const GUEST_BENEFITS: { key: string; title: string; desc: string; renderIcon: () => React.ReactNode }[] = [
  {
    key: 'earn',
    title: 'Earn points',
    desc: 'Every order builds your balance',
    renderIcon: () => <SvgXml xml={EARN_POINTS_SVG} width={36} height={36} />,
  },
  {
    key: 'coffee',
    title: 'Free coffee',
    desc: 'Stamp card rewards on us',
    renderIcon: () => <CoffeeStampIcon size={36} color={BLUE} />,
  },
  {
    key: 'birthday',
    title: 'Birthday treat',
    desc: 'A gift every year, just for you',
    renderIcon: () => <SvgXml xml={BIRTHDAY_TREAT_SVG} width={36} height={36} />,
  },
];

export default function CustomerHome() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  const { addItemToCart } = useCart();
  const { user } = useAuth();
  const [storeSheetVisible, setStoreSheetVisible] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [loginTarget, setLoginTarget] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { StatusBar.setBarStyle('dark-content', true); }, []));

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const hPad = isTablet ? 20 : 16;

  const {
    products,
    refetch,
    topSellers,
    usualItems,
    loyaltyPoints,
    stampCount,
    tierCfg,
    loyaltyCustomerName,
    refetchLoyalty,
    loyaltyRefreshing,
    qrValue,
    open,
    storeHint,
    featuredStore,
    greeting,
  } = useHomeScreenData();

  const { data: bannerData } = useQuery({
    queryKey: ['home-banner'],
    queryFn: () => api.misc.homeBanner(),
    staleTime: 5 * 60_000,
  });
  const bannerSlides = bannerData?.data ?? [];

  const { refreshing, onRefresh } = useRefreshControl(refetch, refetchLoyalty);
  const qc = useQueryClient();

  const handleTilePress = useCallback((p: ApiProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    qc.prefetchQuery({ queryKey: ['product-detail-route', p.id], queryFn: () => api.products.get(p.id), staleTime: 60_000 });
    setSelectedProduct(p);
    router.push({ pathname: '/product', params: { id: p.id } } as any);
  }, [qc]);

  const handleUsualPress = useCallback((u: typeof usualItems[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    qc.prefetchQuery({ queryKey: ['product-detail-route', u.product.id], queryFn: () => api.products.get(u.product.id), staleTime: 60_000 });
    setSelectedProduct(u.product);
    setPreselectedOptions({ selectedOptions: u.selectedOptions ?? [], quantity: u.quantity ?? 1 });
    router.push({ pathname: '/product', params: { id: u.product.id } } as any);
  }, [qc]);

  const handleAddToCart = useCallback((p: ApiProduct) => {
    const raw = p as any;
    addItemToCart({
      productId: p.id, productName: p.name,
      variantId: undefined, variantName: undefined,
      basePriceCents: raw.priceCents ?? p.prices?.[0]?.unit_amount ?? 0,
      selectedOptions: [], quantity: 1,
      imageUrl: p.images?.[0] ?? PRODUCT_IMAGES[p.name],
      category: p.metadata?.category,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addItemToCart]);

  const spotlightItems = topSellers.length > 0 ? topSellers : products.slice(0, 10);
  const tileWidth = isTablet ? 190 : 158;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="dark-content" />
      <OfflineBanner />
      <StoreInfoSheet visible={storeSheetVisible} store={featuredStore} onClose={() => setStoreSheetVisible(false)} />
      <LoginRequiredModal visible={!!loginTarget} redirectTo={loginTarget ?? undefined} onCancel={() => setLoginTarget(null)} />
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

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        {/* ── EDITORIAL HERO ── */}
        <View style={[s.heroCard, { marginHorizontal: hPad, marginTop: insets.top + 12, paddingTop: 22 }]}>
          <LinearGradient colors={[HERO_TOP, HERO_BTM]} style={StyleSheet.absoluteFill} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} />
          {/* Subtle texture ring */}
          <View style={s.heroRing} />

          {/* Top row */}
          <View style={s.heroTopRow}>
            <Image source={require('@/assets/images/logo-blue.png')} style={{ width: 112, height: 34 }} contentFit="contain" />
            <Pressable
              style={s.qrBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (!user) { setLoginTarget('/(customer)/loyalty'); return; } setShowQR(true); }}
              hitSlop={8}
            >
              <Feather name="grid" size={15} color={BLUE} />
            </Pressable>
          </View>

          {/* Greeting */}
          <Text style={s.heroGreetMain} numberOfLines={2}>{greeting.line1}</Text>
          <Text style={s.heroGreetSub} numberOfLines={1}>{greeting.line2}</Text>

          {/* Loyalty chip */}
          <Pressable
            onPress={() => { if (!user) { setLoginTarget('/(customer)/loyalty'); return; } router.push('/(customer)/loyalty'); }}
            style={{ alignSelf: 'flex-start', marginBottom: 20 }}
          >
            <LinearGradient colors={tierCfg.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.loyaltyChip}>
              <Feather name="star" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={s.loyaltyPts}>{loyaltyPoints.toLocaleString()} pts</Text>
              <View style={s.tierDivider} />
              <Text style={s.loyaltyTier}>{tierCfg.label.toUpperCase()}</Text>
            </LinearGradient>
          </Pressable>

          {/* Order Now CTA */}
          <Pressable
            style={s.orderNowBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/menu'); }}
          >
            <Text style={s.orderNowText}>Order Now</Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* ── JOIN BUTTERFIELD (guest only) ── */}
        {!user && (
          <View style={{ marginTop: 28 }}>
            <View style={[s.sectionHead, { paddingHorizontal: hPad }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>Join Butterfield</Text>
                <Text style={[s.sectionMeta, { color: colors.mutedForeground, marginTop: 2 }]}>Free rewards with every order</Text>
              </View>
            </View>
            <FlatList
              data={GUEST_BENEFITS}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(b) => b.key}
              contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
              renderItem={({ item: b }) => (
                <Pressable
                  style={[s.benefitCard, { backgroundColor: colors.card }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setLoginTarget('/(customer)/loyalty');
                  }}
                  android_ripple={{ color: 'rgba(64,192,242,0.08)' }}
                >
                  <View style={s.benefitIconArea}>
                    {b.renderIcon()}
                  </View>
                  <Text style={[s.benefitTitle, { color: colors.foreground }]}>{b.title}</Text>
                  <Text style={[s.benefitDesc, { color: colors.mutedForeground }]}>{b.desc}</Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* ── YOUR USUAL ── */}
        {usualItems.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <View style={[s.sectionHead, { paddingHorizontal: hPad }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Your usual</Text>
              <Text style={[s.sectionMeta, { color: colors.mutedForeground }]}>1 tap to add</Text>
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
                const optSummary = [variantName, ...(selectedOptions ?? []).map(o => o.textValue ?? o.optionName).filter(Boolean)].filter(Boolean).join(' · ');
                return (
                  <Pressable
                    style={[s.usualCard, { backgroundColor: colors.card, width: isTablet ? 260 : 215 }]}
                    onPress={() => handleUsualPress(u)}
                    android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                  >
                    <View style={[s.usualImg, { backgroundColor: img ? '#F0EDE8' : pal.bg }]}>
                      {img
                        ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                        : <Text style={{ fontSize: 26 }}>{pal.emoji}</Text>}
                    </View>
                    <View style={s.usualInfo}>
                      <Text style={[s.usualName, { color: colors.foreground }]} numberOfLines={1}>{p.name}</Text>
                      {optSummary ? <Text style={[s.usualOpts, { color: colors.mutedForeground }]} numberOfLines={1}>{optSummary}</Text> : null}
                      <Text style={[s.usualPrice, { color: pal.banner }]}>${((basePriceCents + optTotal) / 100).toFixed(2)}</Text>
                    </View>
                    <Pressable
                      style={s.usualAddBtn}
                      hitSlop={8}
                      onPress={(e) => {
                        e.stopPropagation();
                        addItemToCart({ productId: p.id, productName: p.name, variantId, variantName, basePriceCents, selectedOptions: selectedOptions ?? [], quantity, imageUrl: p.images?.[0], category: (p as any).metadata?.category });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }}
                    >
                      <Feather name="plus" size={15} color="#fff" />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* ── TODAY'S PICKS ── */}
        {spotlightItems.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <View style={[s.sectionHead, { paddingHorizontal: hPad }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>Today's Picks</Text>
              <Pressable hitSlop={8} onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/menu'); }}>
                <Text style={[s.viewAll, { color: BLUE }]}>See all</Text>
              </Pressable>
            </View>
            <FlatList
              data={spotlightItems.slice(0, 10)}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
              renderItem={({ item: p }) => (
                <View style={{ width: tileWidth }}>
                  <ProductTile product={p} onPress={() => handleTilePress(p)} onAddToCart={() => handleAddToCart(p)} />
                </View>
              )}
            />
          </View>
        )}

        {/* ── THE DROP ── */}
        {bannerSlides.length > 0 && (
          <View style={{ marginTop: 28, marginBottom: 8 }}>
            <View style={[s.sectionHead, { paddingHorizontal: hPad }]}>
              <Text style={[s.sectionTitle, { color: colors.foreground }]}>The Drop</Text>
              <Pressable hitSlop={8} onPress={() => { Haptics.selectionAsync(); router.push('/(customer)/menu'); }}>
                <Text style={[s.viewAll, { color: BLUE }]}>See all</Text>
              </Pressable>
            </View>
            <BannerPicksCarousel slides={bannerSlides} hPad={hPad} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  heroRing: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: 'rgba(64,192,242,0.08)',
    right: -80,
    top: -80,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  qrBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  heroGreetMain: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroGreetSub: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    marginBottom: 18,
  },
  loyaltyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  loyaltyPts:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  tierDivider: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.35)' },
  loyaltyTier: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  orderNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BLUE,
    borderRadius: 16,
    paddingVertical: 16,
  },
  orderNowText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, flex: 1 },
  sectionMeta:  { fontSize: 13, fontWeight: '400' },
  viewAll:      { fontSize: 14, fontWeight: '600' },
  usualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  usualImg:   { width: 52, height: 52, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  usualInfo:  { flex: 1, gap: 2 },
  usualName:  { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  usualOpts:  { fontSize: 11, fontWeight: '400' },
  usualPrice: { fontSize: 13, fontWeight: '700' },
  usualAddBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#D20001', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  benefitCard: {
    width: 140,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  benefitIconArea: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  benefitTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2, textAlign: 'center', marginBottom: 4 },
  benefitDesc:  { fontSize: 12, fontWeight: '400', textAlign: 'center', lineHeight: 16 },
});
