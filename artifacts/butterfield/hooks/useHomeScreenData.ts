import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useStores } from '@/hooks/useStores';
import { useFavouriteCategory } from '@/hooks/useFavouriteCategory';
import { getTierConfig } from '@/constants/tierConfig';
import { buildGreeting } from '@/lib/greetings';
import { api, type ApiOrder, type ApiProduct, type LiveContext } from '@/lib/api';
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
  const { data: storeStatusData } = useQuery({
    queryKey: ['store-status'],
    queryFn: () => api.misc.storeStatus(),
    refetchInterval: 60000,
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
  const { data: topSellersData } = useQuery({
    queryKey: ['top-sellers'],
    queryFn: () => api.products.topSellers(),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const products      = productsData?.data ?? [];
  const loyaltyPoints = loyaltyData?.data?.loyaltyPoints ?? 0;
  const loyaltyTier   = loyaltyData?.data?.loyaltyTier ?? 'blue';
  const stampCount    = loyaltyData?.data?.coffeeStampCount ?? loyaltyData?.data?.stampCount ?? 0;
  const rewards       = rewardsData?.data ?? [];
  const banner        = bannerData?.data ?? null;
  const featuredStore = (storesData?.data ?? [])[0] ?? null;
  const topSellers    = topSellersData?.data ?? [];
  const storeStatus   = storeStatusData?.data;
  const open          = storeStatus?.isOpen ?? false;
  const liveContext   = (contextData?.data ?? null) as LiveContext | null;
  const freshName     = (meData?.user as any)?.name ?? user?.name;
  const firstName     = freshName?.split(' ')[0] ?? 'there';
  const birthday      = (loyaltyData?.data as any)?.birthday ?? null;
  const tierCfg       = getTierConfig(loyaltyTier);
  const loyaltyCustomerName = loyaltyData?.data?.customerName ?? freshName ?? 'Butterfield Member';

  const storeHint = open
    ? (storeStatus?.openUntil ? `Open until ${storeStatus.openUntil}` : 'Open now')
    : (storeStatus?.opensAt   ? `Opens ${storeStatus.opensAt}`         : 'Closed');

  const favouriteCategory = useFavouriteCategory(products);

  const hasClaimableReward = useMemo(
    () => rewards.some((r: any) => r.type !== 'tier' && loyaltyPoints >= r.pointsCost),
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
          const raw = item as any;
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
      });
    } catch {
      return { line1: 'Good day!', line2: 'Fresh cookies and great coffee are waiting.' };
    }
  }, [firstName, loyaltyPoints, hasClaimableReward, birthday, tierCfg.key, stampCount, liveContext, favouriteCategory, storeStatus?.isOpen, storeStatus?.opensAt, greetingTick]);

  const serverQrToken    = loyaltyData?.data?.loyaltyQrToken ?? null;
  const [healedQrToken, setHealedQrToken] = useState<string | null>(null);
  const effectiveQrToken = serverQrToken ?? healedQrToken;

  const qrValue = useMemo(() => {
    return loyaltyData?.data?.qrPayload
      ?? (effectiveQrToken ? `BUTTERFIELD:LOYALTY:${effectiveQrToken}` : null)
      ?? (loyaltyData?.data?.userId && loyaltyData?.data?.referralCode
        ? `BUTTERFIELD:${loyaltyData.data.userId}:${loyaltyData.data.referralCode}`
        : null);
  }, [loyaltyData?.data?.qrPayload, effectiveQrToken, loyaltyData?.data?.userId, loyaltyData?.data?.referralCode]);

  React.useEffect(() => {
    const loyaltyProfile = loyaltyData?.data;
    if (!loyaltyProfile || qrValue) return;
    api.loyalty.ensureQr()
      .then((res) => {
        if (res.data?.loyaltyQrToken) setHealedQrToken(res.data.loyaltyQrToken);
      })
      .catch(() => {});
  }, [loyaltyData?.data?.userId, qrValue]);

  return {
    products,
    isLoading,
    refetch,
    isRefetching,
    popular,
    loyaltyPoints,
    loyaltyTier,
    stampCount,
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
    usualItems,
    greeting,
    freshName,
  };
}
