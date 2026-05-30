import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ApiOrder, type ApiOrderItem } from '@/lib/api';

export interface NewOrderInfo {
  id: string;
  totalCents: number;
  items: ApiOrderItem[];
  type: string;
  createdAt: string;
}

export function useOrderNotifications(
  onNewOrders: (orders: NewOrderInfo[]) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const seenIds = useRef<Set<string>>(new Set());
  const isFirstFetch = useRef(true);

  useQuery({
    queryKey: ['staff-orders-notify'],
    enabled,
    queryFn: async () => {
      const res = await api.staff.allOrders();
      const orders: ApiOrder[] = res.data ?? [];

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
    refetchInterval: enabled ? 20000 : false,
    retry: 1,
  });
}
