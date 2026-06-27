import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useStores } from '@/hooks/useStores';
import { useFavouriteCategory } from '@/hooks/useFavouriteCategory';
import { getTierConfig } from '@/constants/tierConfig';
import { buildGreeting } from '@/lib/greetings';
import { api, type ApiOrder, type ApiProduct, type AuthProfile, type HomeBannerSlide, type LiveContext, type LoyaltyProfile, type LoyaltyReward } from '@/lib/api';
import type { SelectedCartOption } from '@/types';

export type UsualItem = {
  product: ApiProduct;
  variantId?: string;
  variantName?: string;
  basePriceCents: number;
  selectedOptions: SelectedCartOption[];
  quantity: number;
};

export function useHomeScreenData() {
  const { user } = useAuth();

  // Re-evaluate greeting every minute so it updates as hours change
  const [greetingTick, setGreetingTick] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const id = setInterval(() => setGreetingTick(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: productsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.products.list(),
    staleTime: 0,
    retry: 2,
  });
  const { data: loyaltyData, refetch: refetchLoyalty, isRefetching: loyaltyRefreshing } = useQuery({
    queryKey: ['loyalty-profile'],
    queryFn: () => api.loyalty.profile(),
    enabled: !!user,
    retry: 1,
  });
  const { data: rewardsData } = useQuery({
    queryKey: ['loyalty-rewards'],
    queryFn: () => api.loyalty.rewards(),
    enabled: !!user,
    retry: 1,
  });
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    enabled: !!user,
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
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const { data: storesData } = useStores();
  const { data: topSellersData, isError: isTopSellersError, refetch: refetchTopSellers } = useQuery({
    queryKey: ['top-sellers'],
    queryFn: () => api.products.topSellers(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const { data: ordersData, isError: isOrdersError, refetch: refetchOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const products      = productsData?.data ?? [];
  const loyaltyProfile: LoyaltyProfile | null = loyaltyData?.data ?? null;
  const meProfile: AuthProfile | null = meData?.profile ?? null;
  const stores = storesData?.data ?? [];
  const rewards: LoyaltyReward[] = rewardsData?.data ?? [];
  const loyaltyPoints = loyaltyProfile?.loyaltyPoints ?? 0;
  const loyaltyTier   = loyaltyProfile?.loyaltyTier ?? 'blue';
  const stampCount    = loyaltyProfile?.stampCount ?? 0;
  const stampGoal     = loyaltyProfile?.stampGoal ?? 6;
  const banner: HomeBannerSlide[] = bannerData?.data ?? [];
  const preferredStoreId = meProfile?.preferredStoreId ?? loyaltyProfile?.preferredStoreId ?? null;
  const featuredStore = (preferredStoreId
    ? stores.find((store) => store.id === preferredStoreId)
    : null) ?? stores[0] ?? null;
  const topSellers    = topSellersData?.data ?? [];
  const storeStatus = featuredStore
    ? {
        isOpen: featuredStore.openStatus === 'open' || featuredStore.openStatus === 'closing_soon',
        openUntil: featuredStore.todayHours?.closeTime ?? null,
        opensAt: featuredStore.todayHours?.openTime ?? null,
        closesAt: featuredStore.todayHours?.closeTime ?? null,
        manualOverride: false,
      }
    : null;

  // Derive the next trading day's opening time for goodnight messages.
  // Uses Sydney's day-of-week so the transition is timezone-correct.
  const nextOpensAt = useMemo(() => {
    const openingHours = featuredStore?.openingHours ?? [];
    if (openingHours.length === 0) return storeStatus?.opensAt ?? null;
    try {
      const sydneyDayStr = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        weekday: 'long',
      }).format(new Date());
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const todayDow = days.indexOf(sydneyDayStr);
      const nextDow  = todayDow === -1 ? (new Date().getDay() + 1) % 7 : (todayDow + 1) % 7;
      const nextHours = openingHours.find((h) => h.dayOfWeek === nextDow && !h.isClosed);
      return nextHours?.openTime ?? storeStatus?.opensAt ?? null;
    } catch {
      return storeStatus?.opensAt ?? null;
    }
  }, [featuredStore?.openingHours, storeStatus?.opensAt]);
  const open = storeStatus?.isOpen ?? false;
  const liveContext   = (contextData?.data ?? null) as LiveContext | null;
  const freshName     = meData?.user?.name ?? user?.name;
  const firstName     = freshName?.split(' ')[0] ?? 'there';
  const birthday      = meProfile?.birthday ?? loyaltyProfile?.birthday ?? null;
  const tierCfg       = getTierConfig(loyaltyTier, loyaltyProfile?.loyaltyTierSettings);
  const loyaltyCustomerName = loyaltyProfile?.customerName ?? freshName ?? 'Butterfield Member';

  const storeHint = featuredStore?.openLabel
    ?? (open
      ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
      : (storeStatus?.opensAt ? `Opens ${storeStatus.opensAt}` : 'Closed'));

  const favouriteCategory = useFavouriteCategory(products);

  const hasClaimableReward = useMemo(
    () => rewards.some((r) => r.type !== 'tier' && loyaltyPoints >= r.pointsCost),
    [rewards, loyaltyPoints],
  );

  const popular = useMemo(
    () => products.filter((p) => p.metadata?.popular === 'true'),
    [products],
  );

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
          const basePriceCents: number =
            item.basePriceCents ?? item.unitPriceCents ?? (product.prices?.[0]?.unit_amount ?? 0);
          result.push({
            product,
            variantId:       item.variantId ?? undefined,
            variantName:     item.variantName ?? undefined,
            basePriceCents,
            selectedOptions: (item.selectedOptions ?? []) as SelectedCartOption[],
            quantity:        item.quantity ?? 1,
          });
        }
      }
    }
    return result;
  }, [ordersData, products]);

  const greeting = useMemo(() => {
    try {
      return buildGreeting({
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
        closesAt: storeStatus?.closesAt ?? null,
        nextOpensAt,
      });
    } catch {
      return { line1: 'Good day!', line2: 'Fresh cookies and great coffee are waiting.' };
    }
  }, [firstName, loyaltyPoints, hasClaimableReward, birthday, tierCfg.key, stampCount, liveContext, favouriteCategory, storeStatus?.isOpen, storeStatus?.opensAt, storeStatus?.closesAt, nextOpensAt, greetingTick]);

  const serverQrToken    = loyaltyData?.data?.loyaltyQrToken ?? null;
  const [healedQrToken, setHealedQrToken] = useState<string | null>(null);
  const effectiveQrToken = serverQrToken ?? healedQrToken;

  const qrValue = useMemo(() => {
    return loyaltyProfile?.qrPayload
      ?? (effectiveQrToken ? `BUTTERFIELD:LOYALTY:${effectiveQrToken}` : null)
      ?? (loyaltyProfile?.userId && loyaltyProfile?.referralCode
        ? `BUTTERFIELD:${loyaltyProfile.userId}:${loyaltyProfile.referralCode}`
        : null);
  }, [loyaltyProfile?.qrPayload, effectiveQrToken, loyaltyProfile?.userId, loyaltyProfile?.referralCode]);

  React.useEffect(() => {
    if (!loyaltyProfile || qrValue) return;
    api.loyalty.ensureQr()
      .then((res) => {
        if (res.data?.loyaltyQrToken) setHealedQrToken(res.data.loyaltyQrToken);
      })
      .catch(() => {});
  }, [loyaltyProfile, qrValue]);

  return {
    products,
    isLoading,
    refetch,
    isRefetching,
    popular,
    loyaltyPoints,
    loyaltyTier,
    stampCount,
    stampGoal,
    tierCfg,
    hasClaimableReward,
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
    isTopSellersError,
    refetchTopSellers,
    usualItems,
    isOrdersError,
    refetchOrders,
    greeting,
    freshName,
  };
}
