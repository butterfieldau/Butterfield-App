import { useState, useCallback, useRef } from 'react';

type Refreshable = () => void | Promise<unknown>;

export function useRefreshControl(...refetchFns: Refreshable[]) {
  const [refreshing, setRefreshing] = useState(false);
  const refetchRef = useRef(refetchFns);
  refetchRef.current = refetchFns;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchRef.current.map((fn) => Promise.resolve(fn())));
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { refreshing, onRefresh };
}
