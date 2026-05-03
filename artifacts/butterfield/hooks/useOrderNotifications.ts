import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface NewOrderInfo {
  id: string;
  totalCents: number;
  items: { productName: string; quantity: number }[];
  type: string;
  createdAt: string;
}

export function useOrderNotifications(onNewOrders: (orders: NewOrderInfo[]) => void) {
  const seenIds = useRef<Set<string>>(new Set());
  const isFirstFetch = useRef(true);

  useQuery({
    queryKey: ['staff-orders-notify'],
    queryFn: async () => {
      const res = await api.staff.allOrders();
      const orders: any[] = res.data ?? [];

      const incoming = orders.filter(
        (o) => o.status === 'received' && !seenIds.current.has(o.id)
      );

      orders.forEach((o) => seenIds.current.add(o.id));

      if (!isFirstFetch.current && incoming.length > 0) {
        onNewOrders(
          incoming.map((o) => ({
            id: o.id,
            totalCents: o.totalCents ?? 0,
            items: Array.isArray(o.items) ? o.items : [],
            type: o.type ?? 'pickup',
            createdAt: o.createdAt,
          }))
        );
      }

      isFirstFetch.current = false;
      return orders;
    },
    refetchInterval: 20000,
    retry: 1,
  });
}
