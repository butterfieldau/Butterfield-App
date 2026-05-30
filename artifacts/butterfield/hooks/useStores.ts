import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, type StoreSummary as ApiStore } from '@/lib/api';

const STORES_CACHE_KEY = '@butterfield/stores_v1';

/**
 * Fetches the list of stores with a dedicated AsyncStorage cache.
 *
 * Behaviour:
 *  1. On mount, reads the last-known stores response from AsyncStorage.
 *  2. If found, seeds the React Query cache with the cached data (using the
 *     original timestamp so RQ knows how stale it is).
 *  3. Only enables the network query AFTER the seed attempt — guaranteeing
 *     cached data is shown immediately (stale-while-revalidate).
 *  4. refetchOnMount: 'always' ensures a background refresh happens on every
 *     mount even when the cached data is still within staleTime.
 *  5. After every successful network response the fresh data is written back
 *     to AsyncStorage so the next offline open sees real hours, not the
 *     hardcoded FALLBACK_HOURS in StoreInfoSheet.
 */
export function useStores() {
  const queryClient = useQueryClient();
  const seeded = useRef(false);
  const [seedReady, setSeedReady] = useState(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    AsyncStorage.getItem(STORES_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        const { data, updatedAt } = JSON.parse(raw) as {
          data: ApiStore[];
          updatedAt: number;
        };
        if (!queryClient.getQueryData(['stores'])) {
          queryClient.setQueryData<{ data: ApiStore[] }>(
            ['stores'],
            { data },
            { updatedAt },
          );
        }
      })
      .catch(() => {})
      .finally(() => setSeedReady(true));
  }, [queryClient]);

  return useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const result = await api.stores.list();
      AsyncStorage.setItem(
        STORES_CACHE_KEY,
        JSON.stringify({ data: result.data as ApiStore[], updatedAt: Date.now() }),
      ).catch(() => {});
      return result;
    },
    enabled: seedReady,
    staleTime: 120_000,
    refetchOnMount: 'always',
    retry: 1,
  });
}
