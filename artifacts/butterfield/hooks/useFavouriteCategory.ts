import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiProduct } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const MIN_DOMINANCE = 0.4;
const ORDERS_WINDOW = 10;

export function useFavouriteCategory(products: ApiProduct[]): string | null {
  const { user } = useAuth();
  const { data: ordersData } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.orders.list(),
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const orders = ordersData?.data ?? [];
    if (orders.length === 0) return null;

    const productCategoryMap: Record<string, string> = {};
    for (const p of products) {
      const cat = p.metadata?.category;
      if (cat) productCategoryMap[p.id] = cat;
    }

    const recent = orders.slice(0, ORDERS_WINDOW);
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
    return topCount / total >= MIN_DOMINANCE ? topCat : null;
  }, [ordersData, products]);
}
